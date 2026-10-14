import assert from "node:assert";
import {
    canonicalToName,
    deriveResourceName,
    fixReservedWords,
    PRIMITIVE_TYPE_MAP,
    pyFhirPackageByName,
    pyPackage,
} from "@root/api/writer-generator/python/naming-utils.ts";
import { type SectionHandle, SectionWriter } from "@root/api/writer-generator/section-writer";
import { camelCase, pascalCase, snakeCase } from "@root/api/writer-generator/utils";
import type { WriterOptions } from "@root/api/writer-generator/writer.ts";
import { groupByPackages, sortAsDeclarationSequence, type TypeSchemaIndex } from "@root/typeschema/utils";
import {
    type CanonicalUrl,
    type EnumDefinition,
    type Field,
    isNestedTypeSchema,
    isPrimitiveIdentifier,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type NestedTypeSchema,
    type SnapshotProfileTypeSchema,
    type SpecializationTypeSchema,
    type TypeIdentifier,
} from "@typeschema/types.ts";
import { resolveGeneratorAsset } from "../assets";
import { pyReferenceFamilyName, pyReferenceTypeParam } from "./naming-utils";
import { collectProfileClassNames, generateNewProfiles } from "./profile";

export const resolvePyAssets = (fn: string) => resolveGeneratorAsset(import.meta.url, "python", fn);

type StringFormatKey = "snake_case" | "PascalCase" | "camelCase";

const AVAILABLE_STRING_FORMATS: Record<StringFormatKey, (str: string) => string> = {
    snake_case: snakeCase,
    PascalCase: pascalCase,
    camelCase: camelCase,
};

const MAX_IMPORT_LINE_LENGTH = 88;
const LEADING_NEWLINES = /^\n+/;

type PythonImport = { module: string; entity: string };
export type PythonImports = {
    use: (module: string, entity: string) => string;
    force: (module: string, entity: string) => void;
    from: (module: string, ...entities: string[]) => void;
};

const GENERIC_FIELD_REWRITES: Record<string, Record<string, string>> = {
    Coding: { code: "T" },
    CodeableConcept: { coding: "Coding[T]" },
    Reference: { type: "T" },
};

const leafOf = (path: string[]): string => path[path.length - 1] ?? "";

const collectResourceGenericTypeVars = (
    schema: SpecializationTypeSchema,
): Array<{ typeVar: string; constraint: string }> => {
    const all = new Map<string, string>();
    const addParams = (s: SpecializationTypeSchema | NestedTypeSchema) => {
        for (const p of s.generic?.params ?? []) {
            if (!all.has(p.typeVar)) all.set(p.typeVar, p.constraint.name);
        }
    };
    addParams(schema);
    for (const nested of schema.nested ?? []) addParams(nested);
    return Array.from(all.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([typeVar, constraint]) => ({ typeVar, constraint }));
};

const pyEnumType = (enumDef: EnumDefinition): string => {
    const values = enumDef.values.map((e) => `"${e}"`).join(", ");
    return enumDef.isOpen ? `Literal[${values}] | str` : `Literal[${values}]`;
};

export interface PythonGeneratorOptions extends WriterOptions {
    allowExtraFields?: boolean;
    primitiveTypeExtension?: boolean;
    generateProfile?: boolean;
    rootPackageName: string; /// e.g. <rootPackageName>.hl7_fhir_r4_core.Patient.
    fieldFormat: StringFormatKey;
    /**
     * Which client integration to generate into the output models.
     * - `"fhirpy"` — models extend `FhirpyBaseModel` for use with the fhirpy async client (default).
     * - `"none"` — plain Pydantic models with no client-specific code.
     */
    client?: "fhirpy" | "none";
    /**
     * @deprecated Use `client` instead: `fhirpyClient: true` → `client: "fhirpy"`,
     * `fhirpyClient: false` → `client: "none"`.
     */
    fhirpyClient?: boolean;
}

interface ImportGroup {
    [packageName: string]: string[];
}

interface FieldInfo {
    name: string;
    type: string;
    defaultValue: string;
    /** Trailing `# <Family>` when a family target widened the annotation away. */
    comment?: string;
}

type TypeSchemaPackageGroups = {
    groupedResources: Record<string, SpecializationTypeSchema[]>;
    groupedComplexTypes: Record<string, SpecializationTypeSchema[]>;
};

const PROFILE_HELPERS = [
    "_get_key",
    "apply_slice_match",
    "build_resource",
    "ensure_path",
    "ensure_profile",
    "ensure_slice_defaults",
    "extract_complex_extension",
    "get_array_slice",
    "get_array_slices",
    "get_extension_value",
    "is_extension",
    "is_record",
    "matches_value",
    "push_extension",
    "set_array_slice",
    "set_array_slices",
    "strip_match_keys",
    "unwrap_slice_choice",
    "wrap_slice_choice",
    "validate_choice_prohibited",
    "validate_choice_required",
    "validate_enum",
    "validate_excluded",
    "validate_fixed_value",
    "validate_must_support",
    "validate_pattern_value",
    "validate_reference",
    "validate_required",
    "validate_slice_cardinality",
    "validate_slice_fields",
];

export class Python extends SectionWriter<PythonGeneratorOptions> {
    readonly nameFormatFunction: (name: string) => string;
    private tsIndex: TypeSchemaIndex | undefined;
    private readonly forFhirpyClient: boolean;
    private readonly fieldFormat: StringFormatKey;
    private profileHelperImport?: SectionHandle<never, string>;
    private activeImports?: PythonImports;
    private renderingImports = false;
    private activeImportUse?: (name: string) => string;
    private activeImportNames: string[] = [];
    private inImportPreamble = false;
    constructor(options: PythonGeneratorOptions) {
        super({ ...options, resolveAssets: options.resolveAssets ?? resolvePyAssets });
        this.nameFormatFunction = this.getFieldFormatFunction(options.fieldFormat);
        this.forFhirpyClient = this.resolveClient(options);
        this.fieldFormat = options.fieldFormat;
    }

    override cat(fn: string, gen: () => void): void {
        const previous = {
            imports: this.activeImports,
            use: this.activeImportUse,
            names: this.activeImportNames,
            preamble: this.inImportPreamble,
        };
        this.activeImports = undefined;
        this.activeImportUse = undefined;
        this.activeImportNames = [];
        this.inImportPreamble = false;
        try {
            super.cat(fn, gen);
        } finally {
            this.activeImports = previous.imports;
            this.activeImportUse = previous.use;
            this.activeImportNames = previous.names;
            this.inImportPreamble = previous.preamble;
        }
    }

    createImports(): PythonImports {
        const definitions = new Map<string, PythonImport>();
        const forced = new Set<string>();
        const names = new Map<string, string>();
        const handle = this.section<never, string>({
            name: (key) => definitions.get(key)?.entity.split(" as ").at(-1) ?? "",
            render: (_definitions, usages) => {
                this.renderingImports = true;
                try {
                    this.renderImports(usages, definitions, forced);
                } finally {
                    this.renderingImports = false;
                }
            },
        });
        const keyOf = (module: string, entity: string) => JSON.stringify([module, entity]);
        const imports: PythonImports = {
            use: (module, entity) => {
                const key = keyOf(module, entity);
                definitions.set(key, { module, entity });
                names.set(entity.split(" as ").at(-1) ?? entity, key);
                return handle.use(key);
            },
            force: (module, entity) => {
                const key = keyOf(module, entity);
                definitions.set(key, { module, entity });
                forced.add(key);
                this.inImportPreamble = true;
            },
            from: (module, ...entities) => {
                for (const entity of entities) {
                    const key = keyOf(module, entity);
                    definitions.set(key, { module, entity });
                    names.set(entity.split(" as ").at(-1) ?? entity, key);
                    if (module === "__future__") forced.add(key);
                }
                if (entities.length > 0) this.inImportPreamble = true;
                this.activeImportNames = [...names.keys()].sort((a, b) => b.length - a.length);
                this.activeImportUse = (name) => {
                    const key = names.get(name);
                    return key === undefined ? name : handle.use(key);
                };
            },
        };
        this.activeImports = imports;
        this.activeImportNames = [];
        this.inImportPreamble = false;
        this.activeImportUse = undefined;
        return imports;
    }

    profileHelperImports(): SectionHandle<never, string> {
        return this.section<never, string>({
            name: (name) => name,
            render: (_definitions, usages) => {
                const helpers = [...new Set(usages.map((usage) => usage.key))].sort();
                if (helpers.length > 0) {
                    for (const helper of helpers)
                        this.activeImports?.force(`${this.opts.rootPackageName}.profile_helpers`, helper);
                }
            },
        });
    }

    useProfileHelperImports(imports: SectionHandle<never, string>): void {
        this.profileHelperImport = imports;
    }

    clearProfileHelperImports(): void {
        this.profileHelperImport = undefined;
    }

    override write(str: string): void {
        if (!this.renderingImports && !str.includes("\u0000:") && this.inImportPreamble) {
            if (str.trim().length === 0) return;
            this.inImportPreamble = false;
            super.write(str.trimStart().startsWith("class ") ? "\n\n" : "\n");
            str = str.replace(LEADING_NEWLINES, "");
        }
        if (!this.renderingImports && this.activeImportUse && !str.includes("\u0000:")) {
            if (this.activeImportNames.length > 0) {
                const escaped = this.activeImportNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "g");
                str = str.replace(pattern, (name) => this.activeImportUse?.(name) ?? name);
            }
        }
        if (!this.renderingImports && this.profileHelperImport) {
            const pattern = new RegExp(`\\b(${PROFILE_HELPERS.join("|")})\\b`, "g");
            str = str.replace(pattern,
                (helper) => this.profileHelperImport?.use(helper) ?? helper,
            );
        }
        super.write(str);
    }

    private renderImports(
        usages: Array<{ key: string; local: string }>,
        definitions: Map<string, PythonImport>,
        forced: Set<string>,
    ): void {
        const usagesByKey = new Map(usages.map((usage) => [usage.key, usage]));
        const importsByKey = new Map(usages.map(({ key }) => [key, definitions.get(key)]));
        for (const key of forced) importsByKey.set(key, definitions.get(key));
        const imports = [...importsByKey.entries()]
            .filter((entry): entry is [string, PythonImport] => entry[1] !== undefined)
            .map(([key, value]) => {
                const usage = usagesByKey.get(key);
                const remoteName = value.entity.split(" as ")[0] ?? value.entity;
                const localName = usage?.local ?? value.entity.split(" as ").at(-1) ?? remoteName;
                return { ...value, entity: localName === remoteName ? remoteName : `${remoteName} as ${localName}` };
            });
        const groups = [
            imports.filter(({ module }) => module === "__future__"),
            imports.filter(({ module }) => module === "typing"),
            imports.filter(({ module }) => module === "pydantic" || module === "typing_extensions"),
            imports.filter(
                ({ module }) =>
                    module !== "__future__" &&
                    module !== "typing" &&
                    module !== "pydantic" &&
                    module !== "typing_extensions" &&
                    !module.startsWith("."),
            ),
            imports.filter(({ module }) => module.startsWith(".")),
        ];

        let wroteGroup = false;
        for (const group of groups) {
            if (group.length === 0) continue;
            if (wroteGroup) this.line();
            const byModule = new Map<string, string[]>();
            for (const { module, entity } of group) {
                const entities = byModule.get(module) ?? [];
                entities.push(entity);
                byModule.set(module, entities);
            }
            for (const [module, entities] of [...byModule.entries()].sort(([a], [b]) => a.localeCompare(b))) {
                const plain = entities.filter((entity) => !entity.includes(" as ")).sort();
                const aliases = entities.filter((entity) => entity.includes(" as ")).sort();
                if (plain.length > 0) this.renderImportFrom(module, plain);
                for (const alias of aliases) this.renderImportFrom(module, [alias]);
            }
            wroteGroup = true;
        }
    }

    private renderImportFrom(module: string, entities: string[]): void {
        const oneLine = `from ${module} import ${entities.join(", ")}`;
        if (oneLine.length <= MAX_IMPORT_LINE_LENGTH) {
            this.line(oneLine);
            return;
        }
        this.line(`from ${module} import (`);
        this.indentBlock(() => {
            for (const entity of entities) this.line(`${entity},`);
        });
        this.line(")");
    }

    /** Resolve which client integration to emit. `client` wins; `fhirpyClient` is the deprecated fallback; default is fhirpy. */
    private resolveClient(options: PythonGeneratorOptions): boolean {
        if (options.client !== undefined) return options.client === "fhirpy";
        if (options.fhirpyClient !== undefined) {
            this.logger()?.warn('python: `fhirpyClient` is deprecated; use `client: "fhirpy" | "none"` instead.');
            return options.fhirpyClient;
        }
        return true; // default: fhirpy client
    }

    override async generate(tsIndex: TypeSchemaIndex): Promise<void> {
        this.tsIndex = tsIndex;
        const groups: TypeSchemaPackageGroups = {
            groupedComplexTypes: groupByPackages(tsIndex.collectComplexTypes()),
            groupedResources: groupByPackages(tsIndex.collectResources()),
        };
        const profilesByPackage = this.opts.generateProfile ? groupByPackages(tsIndex.collectSnapshotProfiles()) : {};
        this.generateRootPackages(groups, profilesByPackage);
        this.generateSDKPackages(tsIndex, groups, profilesByPackage);
    }

    private generateRootPackages(
        groups: TypeSchemaPackageGroups,
        profilesByPackage: Record<string, SnapshotProfileTypeSchema[]>,
    ): void {
        this.generateRootInitFile(groups);
        if (this.forFhirpyClient) {
            if (this.fieldFormat === "camelCase") {
                this.copyAssets(resolvePyAssets("fhirpy_base_model_camel_case.py"), "fhirpy_base_model.py");
            } else {
                this.copyAssets(resolvePyAssets("fhirpy_base_model.py"), "fhirpy_base_model.py");
            }
        }
        // Shared profile runtime helpers live once at the root package and are
        // imported absolutely (e.g. `from fhir_types.profile_helpers import ...`).
        if (Object.keys(profilesByPackage).length > 0) {
            this.copyAssets(resolvePyAssets("profile_helpers.py"), "profile_helpers.py");
        }
        this.copyAssets(resolvePyAssets("requirements.txt"), "requirements.txt");
    }

    private generateSDKPackages(
        tsIndex: TypeSchemaIndex,
        groups: TypeSchemaPackageGroups,
        profilesByPackage: Record<string, SnapshotProfileTypeSchema[]>,
    ): void {
        this.generateComplexTypesPackages(groups.groupedComplexTypes);
        this.generateResourcePackages(tsIndex, groups, profilesByPackage);
    }

    private generateComplexTypesPackages(groupedComplexTypes: Record<string, SpecializationTypeSchema[]>): void {
        for (const [packageName, packageComplexTypes] of Object.entries(groupedComplexTypes)) {
            this.cd(`/${snakeCase(packageName)}`, () => {
                this.generateBasePy(packageName, packageComplexTypes);
            });
        }
    }

    private generateResourcePackages(
        tsIndex: TypeSchemaIndex,
        groups: TypeSchemaPackageGroups,
        profilesByPackage: Record<string, SnapshotProfileTypeSchema[]>,
    ): void {
        for (const [packageName, packageResources] of Object.entries(groups.groupedResources)) {
            this.cd(`/${snakeCase(packageName)}`, () => {
                const packageProfiles = profilesByPackage[packageName] ?? [];
                this.generateResourcePackageContent(
                    packageName,
                    packageResources,
                    groups.groupedComplexTypes[packageName] || [],
                    collectProfileClassNames(packageProfiles),
                );

                if (packageProfiles.length > 0) {
                    generateNewProfiles(this, tsIndex, packageProfiles);
                }
            });
        }

        // Profile-only packages (e.g. us-core, which constrains r4.core
        // resources but has no resources of its own). Emit their profiles
        // into a sibling package directory.
        for (const [packageName, packageProfiles] of Object.entries(profilesByPackage)) {
            if (groups.groupedResources[packageName]) continue;
            if (!packageProfiles || packageProfiles.length === 0) continue;
            this.cd(`/${snakeCase(packageName)}`, () => {
                generateNewProfiles(this, tsIndex, packageProfiles);
                this.generateProfileOnlyPackageInit(collectProfileClassNames(packageProfiles));
            });
        }
    }

    private generateResourcePackageContent(
        packageName: string,
        packageResources: SpecializationTypeSchema[],
        packageComplexTypes: SpecializationTypeSchema[],
        profileNames: string[] = [],
    ): void {
        const pyPackageName = pyFhirPackageByName(this.opts.rootPackageName, packageName);

        this.generateResourcePackageInit(pyPackageName, packageResources, packageComplexTypes, profileNames);

        const hasAnyResourceGenericParams = packageResources.some((s) => collectResourceGenericTypeVars(s).length > 0);
        if (hasAnyResourceGenericParams) {
            this.copyAssets(resolvePyAssets("resource_preprocessor.py"), "resource_preprocessor.py");
        }

        for (const schema of packageResources) {
            this.generateResourceModule(schema);
        }
    }

    private generateRootInitFile(groups: TypeSchemaPackageGroups): void {
        this.cd("/", () => {
            this.cat("__init__.py", () => {
                this.generateDisclaimer();
                const imports = this.createImports();
                const pydanticModels: string[] = this.collectAndImportAllModels(groups, imports);
                this.line();
                this.generateModelRebuilds(pydanticModels, imports);
            });
        });
    }

    private collectAndImportAllModels(groups: TypeSchemaPackageGroups, imports: PythonImports): string[] {
        const models: string[] = [];

        for (const packageName of Object.keys(groups.groupedResources)) {
            const fullPyPackageName = pyFhirPackageByName(this.opts.rootPackageName, packageName);
            models.push(...this.importComplexTypes(fullPyPackageName, groups.groupedComplexTypes[packageName], imports, true));
            models.push(...this.importResources(fullPyPackageName, false, groups.groupedResources[packageName], imports, true));
        }
        return models;
    }

    private generateModelRebuilds(models: string[], imports: PythonImports): void {
        for (const reference of models.sort((a, b) => a.split("#")[1]!.localeCompare(b.split("#")[1]!))) {
            const [module, name] = reference.split("#");
            this.line(`${imports.use(module!, name!)}.model_rebuild()`);
        }
    }

    private generateBasePy(_packageName: string, packageComplexTypes: SpecializationTypeSchema[]): void {
        this.cat("base.py", () => {
            this.generateDisclaimer();
            const imports = this.createImports();
            this.generateDefaultImports(imports);
            const hasGenericTypes = packageComplexTypes.some((s) => s.identifier.name in GENERIC_FIELD_REWRITES);
            if (hasGenericTypes) {
                this.line();
                // Covariant: the parameter says what a value holds, and callers
                // hand these models on to code that asks for the wider type.
                // Invariant, a precisely-typed `Reference[Literal["Patient"]]`
                // cannot be passed where a plain `Reference` is expected, which
                // makes the narrower annotation a liability rather than a gain.
                // Unsound in principle for a mutable attribute; accepted because
                // the generated models are data carriers.
                this.line("T = TypeVar('T', bound=str, default=str, covariant=True)");
            }
            this.line();
            this.generateComplexTypes(packageComplexTypes, imports);
            this.line();
        });
    }

    private generateComplexTypes(complexTypes: SpecializationTypeSchema[], imports: PythonImports): void {
        for (const schema of sortAsDeclarationSequence(complexTypes)) {
            this.generateNestedTypes(schema, imports);
            this.line();
            this.generateType(schema, imports);
        }
    }

    private generateResourcePackageInit(
        fullPyPackageName: string,
        packageResources: SpecializationTypeSchema[],
        packageComplexTypes?: SpecializationTypeSchema[],
        profileNames: string[] = [],
    ): void {
        this.cat("__init__.py", () => {
            this.generateDisclaimer();
            const imports = this.createImports();
            this.importComplexTypes(fullPyPackageName, packageComplexTypes, imports);
            const allResourceNames = this.importResources(fullPyPackageName, true, packageResources, imports);
            this.importPackageProfiles(profileNames, imports);
            this.line();
            this.generateExportsDeclaration(packageComplexTypes, [...allResourceNames, ...profileNames]);
        });
    }

    /** Re-export a package's profile classes from its `__init__.py`, so they are
     *  reachable as `<package>.<ProfileClass>` and not only by module path.
     *  Explicit, so strict mypy (`no_implicit_reexport`) sees the names. */
    private importPackageProfiles(profileNames: string[], imports: PythonImports): void {
        if (profileNames.length === 0) return;
        for (const name of profileNames) imports.force(".profiles", name);
    }

    /** A package that carries only profiles still needs its own barrel; the
     *  resource-package path never runs for it. */
    private generateProfileOnlyPackageInit(profileNames: string[]): void {
        this.cat("__init__.py", () => {
            this.generateDisclaimer();
            const imports = this.createImports();
            this.importPackageProfiles(profileNames, imports);
            this.line();
            this.squareBlock(["__all__", "="], () => {
                for (const name of profileNames) this.line(`'${name}',`);
            });
        });
    }

    private importComplexTypes(
        fullPyPackageName: string,
        packageComplexTypes: SpecializationTypeSchema[] | undefined,
        imports: PythonImports,
        useInCode = false,
    ): string[] {
        if (!packageComplexTypes || packageComplexTypes.length === 0) return [];

        const baseTypes = packageComplexTypes.map((t) => t.identifier.name).sort();
        const module = `${fullPyPackageName}.base`;
        if (!useInCode) for (const name of baseTypes) imports.force(module, name);
        if (!useInCode) this.line();

        return useInCode ? baseTypes.map((name) => `${module}#${name}`) : baseTypes;
    }

    private importResources(
        fullPyPackageName: string,
        importEmptyResources: boolean,
        packageResources: SpecializationTypeSchema[] | undefined,
        imports: PythonImports,
        useInCode = false,
    ): string[] {
        if (!packageResources || packageResources.length === 0) return [];
        const allResourceNames: string[] = [];

        for (const resource of packageResources) {
            const names = this.importOneResource(resource, fullPyPackageName, imports, useInCode);
            if (!importEmptyResources && !resource.fields) continue;
            allResourceNames.push(...names);
        }

        return allResourceNames;
    }

    private importOneResource(
        resource: SpecializationTypeSchema,
        fullPyPackageName: string,
        imports: PythonImports,
        useInCode: boolean,
    ): string[] {
        const moduleName = `${fullPyPackageName}.${snakeCase(resource.identifier.name)}`;
        const importNames = this.collectResourceImportNames(resource);

        if (!useInCode) for (const name of importNames) imports.force(moduleName, name);
        return useInCode ? importNames.map((name) => `${moduleName}#${name}`) : importNames;
    }

    private collectResourceImportNames(resource: SpecializationTypeSchema): string[] {
        const names = [deriveResourceName(resource.identifier)];

        for (const nested of resource.nested ?? []) {
            const nestedName = deriveResourceName(nested.identifier);
            names.push(nestedName);
        }

        return names;
    }

    private generateExportsDeclaration(
        packageComplexTypes: SpecializationTypeSchema[] | undefined,
        allResourceNames: string[],
    ): void {
        this.squareBlock(["__all__", "="], () => {
            const allExports = [
                ...(packageComplexTypes || []).map((t) => t.identifier.name),
                ...allResourceNames,
            ].sort();

            for (const schemaName of allExports) {
                this.line(`'${schemaName}',`);
            }
        });
    }

    private generateResourceModule(schema: SpecializationTypeSchema): void {
        const typeVars = collectResourceGenericTypeVars(schema);
        const hasResourceGenericParams = typeVars.length > 0;

        this.cat(`${snakeCase(schema.identifier.name)}.py`, () => {
            this.generateDisclaimer();
            const imports = this.createImports();
            this.generateDefaultImports(imports);
            this.generateFhirBaseModelImport(imports);
            this.line();
            this.generateDependenciesImports(schema, imports);
            if (hasResourceGenericParams) {
                const pyFhirPackage = pyFhirPackageByName(this.opts.rootPackageName, schema.identifier.package);
                imports.from(`${pyFhirPackage}.resource_preprocessor`, "preprocess_resource_fields");
                this.line();
                for (const { typeVar, constraint } of typeVars) {
                    // Covariant for the same reason as the base `T`: a
                    // `BundleEntry[Patient]` is usable as a `BundleEntry[Resource]`.
                    this.line(
                        `${typeVar} = TypeVar('${typeVar}', bound=${constraint}, default=${constraint}, covariant=True)`,
                    );
                }
            }
            this.line();
            this.generateNestedTypes(schema, imports);
            this.line();
            this.generateType(schema, imports);
        });
    }

    private generateFhirBaseModelImport(imports: PythonImports): void {
        if (this.forFhirpyClient)
            imports.from(`${this.opts.rootPackageName}.fhirpy_base_model`, "FhirpyBaseModel");
    }

    private generateType(schema: SpecializationTypeSchema | NestedTypeSchema, imports: PythonImports): void {
        const className = deriveResourceName(schema.identifier);
        const superClasses = this.getSuperClasses(schema);

        this.line(`class ${className}(${superClasses.join(", ")}):`);
        this.indentBlock(() => {
            this.generateClassBody(schema, imports);
        });
        this.line();
    }

    private getSuperClasses(schema: SpecializationTypeSchema | NestedTypeSchema): string[] {
        const bases: string[] = [];
        if (schema.base) bases.push(schema.base.name);
        bases.push(...this.injectSuperClasses(schema.identifier.url));
        // A schema with no base and no injected root still gets a pydantic body,
        // so without a model root every Field(...) and the model_config would be
        // inert class attributes. Reached by a logical model specializing a root
        // the package does not ship — R4's virtual `Base`, say, which leaves the
        // schema rootless — and by anything else that resolves to no parent.
        if (bases.length === 0) bases.push(this.forFhirpyClient ? "FhirpyBaseModel" : "BaseModel");
        if (schema.identifier.name in GENERIC_FIELD_REWRITES) bases.push("Generic[T]");
        const params = schema.generic?.params ?? [];
        if (params.length > 0) {
            const typeVars = params.map((p) => p.typeVar).join(", ");
            bases.push(`Generic[${typeVars}]`);
        }
        return bases;
    }

    private generateClassBody(schema: SpecializationTypeSchema | NestedTypeSchema, imports: PythonImports): void {
        this.generateModelConfig();

        if (!schema.fields) {
            this.line("pass");
            return;
        }

        if (isResourceTypeSchema(schema)) {
            this.generateResourceTypeField(schema);
        }

            this.generateFields(schema, imports);

        if (this.opts.generateProfile && schema.identifier.name === "Extension") {
            this.generateExtensionEqualityMethods();
        }

        if (isResourceTypeSchema(schema)) {
            this.generateResourceMethods(schema);
        }

        if ((schema.generic?.params?.length ?? 0) > 0) {
            this.generateResourcePreprocessorMethod(schema);
        }
    }

    private generateResourcePreprocessorMethod(schema: SpecializationTypeSchema | NestedTypeSchema): void {
        const pyFhirPackage = pyFhirPackageByName(this.opts.rootPackageName, schema.identifier.package);
        this.line();
        this.line("@model_validator(mode='before')");
        this.line("@classmethod");
        this.line("def _preprocess_resources(cls, data: Any) -> Any:");
        this.line("    if isinstance(data, dict):");
        this.line(`        return preprocess_resource_fields(data, "${pyFhirPackage}")`);
        this.line("    return data");
    }

    private generateModelConfig(): void {
        const extraMode = this.opts.allowExtraFields ? "allow" : "forbid";
        this.line(`model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True, extra="${extraMode}")`);
    }

    private generateResourceTypeField(schema: SpecializationTypeSchema): void {
        // Type as `str`; the value is validated on the pydantic side via `pattern`.
        const hasChildren = (schema.typeFamily?.resources?.length ?? 0) > 0;
        this.line(`${this.nameFormatFunction("resourceType")}: str = Field(`);
        this.indentBlock(() => {
            // Family/abstract base types (Resource, DomainResource) are subclassed by concrete
            // resources and never instantiated directly. Omitting the default keeps `resourceType`
            // out of the class namespace (see fhirpy_base_model.__pydantic_init_subclass__), so the
            // concrete subclasses don't "shadow" it and trigger Pydantic UserWarnings.
            if (!hasChildren) this.line(`default='${schema.identifier.name}',`);
            this.line(`alias='resourceType',`);
            this.line(`serialization_alias='resourceType',`);
            if (!this.forFhirpyClient) {
                // fhirpy client resource protocol expects the resourceType field not to be frozen
                this.line("frozen=True,");
            }
            this.line(`pattern='${schema.identifier.name}'`);
        });
        this.line(")");
    }

    private generateFields(schema: SpecializationTypeSchema | NestedTypeSchema, imports: PythonImports): void {
        const sortedFields = Object.entries(schema.fields ?? []).sort(([a], [b]) => a.localeCompare(b));
        const withExtensions = this.shouldAddPrimitiveExtensions(schema);

        for (const [fieldName, field] of sortedFields) {
            if ("choices" in field && field.choices) continue;

            const fieldInfo = this.buildFieldInfo(fieldName, field, schema, imports);
            this.line(`${fieldInfo.name}: ${fieldInfo.type}${fieldInfo.defaultValue}${fieldInfo.comment ?? ""}`);

            if (withExtensions && "type" in field && isPrimitiveIdentifier(field.type)) {
                this.addPrimitiveExtensionField(fieldName, field.array ?? false);
            }
        }
    }

    private shouldAddPrimitiveExtensions(schema: SpecializationTypeSchema | NestedTypeSchema): boolean {
        if (!this.opts.primitiveTypeExtension) return false;
        if (!isSpecializationTypeSchema(schema)) return false;
        for (const field of Object.values(schema.fields ?? {})) {
            if ("choices" in field && field.choices) continue;
            if ("type" in field && isPrimitiveIdentifier(field.type)) return true;
        }
        return false;
    }

    private addPrimitiveExtensionField(fieldName: string, isArray: boolean): void {
        const pyFieldName = this.nameFormatFunction(`${fieldName}Extension`);
        const alias = `_${fieldName}`;
        const typeExpr = isArray ? "PyList[Element | None] | None" : "Element | None";
        const aliasSpec = `alias="${alias}", serialization_alias="${alias}"`;
        this.line(`${pyFieldName}: ${typeExpr} = Field(None, ${aliasSpec})`);
    }

    private buildFieldInfo(
        fieldName: string,
        field: Field,
        schema: SpecializationTypeSchema | NestedTypeSchema,
        imports: PythonImports,
    ): FieldInfo {
        const pyFieldName = fixReservedWords(this.nameFormatFunction(fieldName));
        const fieldType = this.determineFieldType(field, fieldName, schema, imports);
        const defaultValue = this.getFieldDefaultValue(field, fieldName);
        const family = this.tsIndex && "reference" in field ? pyReferenceFamilyName(field, this.tsIndex) : undefined;

        return {
            name: pyFieldName,
            type: fieldType,
            defaultValue: defaultValue,
            comment: family ? `  # ${family}` : undefined,
        };
    }

    private determineFieldType(
        field: Field,
        fieldName: string,
        schema: SpecializationTypeSchema | NestedTypeSchema,
        _imports: PythonImports,
    ): string {
        const schemaName = schema.identifier.name;
        let fieldType = field ? this.getBaseFieldType(field) : "";

        // String-bound generics (Coding.code → T, CodeableConcept.coding → Coding[T])
        const rewrite = GENERIC_FIELD_REWRITES[schemaName]?.[fieldName];
        if (rewrite) {
            fieldType = rewrite;
            if (field.array) fieldType = `PyList[${fieldType}]`;
            if (!field.required) fieldType = `${fieldType} | None`;
            return fieldType;
        }

        // Resource-bound generics: field IS the param (direct introduce)
        const params = schema.generic?.params ?? [];
        const directParam = params.find((p) => leafOf(p.path) === fieldName);
        if (directParam) {
            fieldType = directParam.typeVar;
            if (field.array) fieldType = `PyList[${fieldType}]`;
            if (!field.required) fieldType = `${fieldType} | None`;
            return fieldType;
        }

        // Resource-bound generics: field's type is itself a generic schema (passthrough)
        if ("type" in field && field.type && params.length > 0) {
            assert(this.tsIndex !== undefined);
            const target = this.tsIndex.resolveType(field.type);
            if (target && (isNestedTypeSchema(target) || isSpecializationTypeSchema(target))) {
                const nestedParams = target.generic?.params ?? [];
                if (nestedParams.length > 0) {
                    const args = nestedParams.map(
                        (np) => params.find((p) => leafOf(p.path) === leafOf(np.path))?.typeVar ?? np.typeVar,
                    );
                    fieldType = `${fieldType}[${args.join(", ")}]`;
                }
            }
        }

        if ("enum" in field && field.enum) {
            const baseTypeName = "type" in field ? field.type.name : "";
            if (baseTypeName in GENERIC_FIELD_REWRITES) {
                fieldType = `${fieldType}[${pyEnumType(field.enum)}]`;
            } else if (!field.enum.isOpen) {
                const s: string = field.enum.values.map((e: string) => `"${e}"`).join(", ");
                fieldType = `Literal[${s}]`;
            }
        }

        if (fieldType === "Reference" && "reference" in field && field.reference) {
            assert(this.tsIndex !== undefined);
            const typeParam = pyReferenceTypeParam(field, this.tsIndex);
            if (typeParam) fieldType = `Reference[${typeParam}]`;
        }

        if (field.array) {
            fieldType = `PyList[${fieldType}]`;
        }

        if (!field.required) {
            fieldType = `${fieldType} | None`;
        }

        return fieldType;
    }

    private getBaseFieldType(field: Field): string {
        if ("type" in field && field.type.kind === "resource") return `${field.type.name}Family`;

        if ("type" in field && field.type.kind === "nested") return deriveResourceName(field.type);

        if ("type" in field && field.type.kind === "primitive-type")
            return PRIMITIVE_TYPE_MAP[field.type.name] ?? "str";

        return "type" in field ? field.type.name : "";
    }

    private getFieldDefaultValue(field: Field, fieldName: string): string {
        const aliasSpec = `alias="${fieldName}", serialization_alias="${fieldName}"`;

        if (!field.required) {
            return ` = Field(None, ${aliasSpec})`;
        }

        return ` = Field(${aliasSpec})`;
    }

    private generateResourceMethods(_schema: SpecializationTypeSchema): void {
        this.line();
        this.line("def model_post_init(self, __context: Any) -> None:");
        this.line(`    self.__pydantic_fields_set__.add("${this.nameFormatFunction("resourceType")}")`);
        this.line();
        this.line("def to_json(self, indent: int | None = None) -> str:");
        this.line("    return self.model_dump_json(exclude_unset=True, exclude_none=True, indent=indent)");
        this.line();
        this.line("@classmethod");
        this.line("def from_json(cls, json: str) -> Self:");
        this.line("    return cls.model_validate_json(json)");
    }

    private generateExtensionEqualityMethods(): void {
        this.line();
        this.line("def __eq__(self, other: object) -> bool:");
        this.line("    if not isinstance(other, Extension):");
        this.line("        return NotImplemented");
        this.line(
            "    return self.model_dump(by_alias=True, exclude_none=True) == other.model_dump(by_alias=True, exclude_none=True)",
        );
        this.line();
        this.line("def __hash__(self) -> int:");
        this.line("    return hash(self.url)");
    }

    private generateNestedTypes(schema: SpecializationTypeSchema, imports: PythonImports): void {
        if (!schema.nested) return;

        this.line();
        for (const subtype of schema.nested) {
            this.generateType(subtype, imports);
        }
    }

    private generateDefaultImports(imports: PythonImports): void {
        imports.from("__future__", "annotations");
        imports.from("pydantic", "BaseModel", "ConfigDict", "Field", "PositiveInt", "model_validator");
        imports.from("typing", "Any", "Generic", "List as PyList", "Literal");
        imports.from("typing_extensions", "Self", "TypeVar");
    }

    private generateDependenciesImports(schema: SpecializationTypeSchema, imports: PythonImports): void {
        if (!schema.dependencies || schema.dependencies.length === 0) return;

        this.importComplexTypeDependencies(schema.dependencies, imports);
        this.importResourceDependencies(schema.dependencies, imports);
        this.importElementIfNeeded(schema, imports);
    }

    private importElementIfNeeded(schema: SpecializationTypeSchema, imports: PythonImports): void {
        if (!this.shouldAddPrimitiveExtensions(schema)) return;
        if (schema.identifier.name === "Element") return;
        if (schema.dependencies?.find((d) => d.name === "Element")) return;

        assert(this.tsIndex !== undefined);
        const elementUrl = "http://hl7.org/fhir/StructureDefinition/Element" as CanonicalUrl;
        const element = this.tsIndex.resolveByUrl(schema.identifier.package, elementUrl);
        if (!element) return;

        const pyPkg = pyPackage(this.opts.rootPackageName, element.identifier);
        imports.from(pyPkg, "Element");
    }

    private importComplexTypeDependencies(dependencies: TypeIdentifier[], imports: PythonImports): void {
        const complexTypeDeps = dependencies.filter((dep) => dep.kind === "complex-type");
        const depsByPackage = this.groupDependenciesByPackage(complexTypeDeps);

        for (const [pyPackage, names] of Object.entries(depsByPackage)) {
            imports.from(pyPackage, ...names.sort());
        }
    }

    private importResourceDependencies(dependencies: TypeIdentifier[], imports: PythonImports): void {
        const resourceDeps = dependencies.filter((dep) => dep.kind === "resource");

        for (const dep of resourceDeps) {
            imports.from(pyPackage(this.opts.rootPackageName, dep), pascalCase(dep.name));
        }
    }

    private groupDependenciesByPackage(dependencies: TypeIdentifier[]): ImportGroup {
        const grouped: ImportGroup = {};

        for (const dep of dependencies) {
            const pyPkg = pyPackage(this.opts.rootPackageName, dep);
            if (!grouped[pyPkg]) {
                grouped[pyPkg] = [];
            }
            grouped[pyPkg].push(dep.name);
        }

        return grouped;
    }

    private getFieldFormatFunction(format: StringFormatKey): (name: string) => string {
        if (!AVAILABLE_STRING_FORMATS[format]) {
            this.logger()?.warn(`Unknown field format '${format}'. Defaulting to SnakeCase.`);
            this.logger()?.warn(`Supported formats: ${Object.keys(AVAILABLE_STRING_FORMATS).join(", ")}`);
            return snakeCase;
        }
        return AVAILABLE_STRING_FORMATS[format];
    }

    private injectSuperClasses(url: string): string[] {
        const name = canonicalToName(url);
        if (name === "resource") return this.forFhirpyClient ? ["FhirpyBaseModel"] : ["BaseModel"];
        if (name === "element") return ["BaseModel"];
        return [];
    }
}
