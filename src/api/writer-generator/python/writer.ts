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
import { sortAsDeclarationSequence, type TypeSchemaIndex } from "@root/typeschema/utils";
import {
    type CanonicalUrl,
    type ChoiceFieldInstance,
    type EnumDefinition,
    type Field,
    isNestedIdentifier,
    isNestedTypeSchema,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isResourceIdentifier,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type NestedTypeSchema,
    type RegularField,
    type SnapshotProfileTypeSchema,
    type SpecializationTypeSchema,
    type TypeIdentifier,
} from "@typeschema/types.ts";
import { resolveGeneratorAsset } from "../assets";
import { pyReferenceFamilyName, pyReferenceTypeParam } from "./naming-utils";
import { collectProfileClassNames, generateProfileModule, generateProfilesInit } from "./profile";
import { pyProfileModuleName } from "./profile-naming";

export const resolvePyAssets = (fn: string) => resolveGeneratorAsset(import.meta.url, "python", fn);

type StringFormatKey = "snake_case" | "PascalCase" | "camelCase";

const AVAILABLE_STRING_FORMATS: Record<StringFormatKey, (str: string) => string> = {
    snake_case: snakeCase,
    PascalCase: pascalCase,
    camelCase: camelCase,
};

const MAX_IMPORT_LINE_LENGTH = 100;

/** String-bound generics; a rewrite receives the field's own type name. */
const GENERIC_FIELD_REWRITES: Record<string, Record<string, (fieldType: string) => string>> = {
    Coding: { code: () => "T" },
    CodeableConcept: { coding: (fieldType) => `${fieldType}[T]` },
    Reference: { type: () => "T" },
};

const leafOf = (path: string[]): string => path[path.length - 1] ?? "";

const collectResourceGenericTypeVars = (
    schema: SpecializationTypeSchema,
): { typeVar: string; constraint: TypeIdentifier }[] => {
    const all: Record<string, TypeIdentifier> = {};
    const addParams = (s: SpecializationTypeSchema | NestedTypeSchema) => {
        for (const p of s.generic?.params ?? []) {
            if (!Object.hasOwn(all, p.typeVar)) all[p.typeVar] = p.constraint;
        }
    };
    addParams(schema);
    for (const nested of schema.nested ?? []) addParams(nested);
    return Object.entries(all)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([typeVar, constraint]) => ({ typeVar, constraint }));
};

const pyEnumType = (typing: SectionHandle<never, string>, enumDef: EnumDefinition): string => {
    const values = enumDef.values.map((e) => `"${e}"`).join(", ");
    const literal = typing.use("Literal");
    return enumDef.isOpen ? `${literal}[${values}] | str` : `${literal}[${values}]`;
};

/** Import sections of a type module (`base.py` or a resource module): one per library module, plus `types` for FHIR types. */
type TypeModuleImports = {
    pydantic: SectionHandle<never, string>;
    typing: SectionHandle<never, string>;
    typingExtensions: SectionHandle<never, string>;
    fhirpy: SectionHandle<never, string>;
    types: SectionHandle<never, TypeIdentifier>;
    preprocessor: SectionHandle<never, string>;
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

interface FieldInfo {
    name: string;
    type: string;
    defaultValue: string;
    /** Trailing `# <Family>` when a family target widened the annotation away. */
    comment?: string;
}

type TypeSchemaPackage = {
    resources: SpecializationTypeSchema[];
    complexTypes: SpecializationTypeSchema[];
    profiles: SnapshotProfileTypeSchema[];
};

type TypeSchemaPackages = Record<string, TypeSchemaPackage>;

export class Python extends SectionWriter<PythonGeneratorOptions> {
    readonly nameFormatFunction: (name: string) => string;
    private tsIndex: TypeSchemaIndex | undefined;
    private readonly forFhirpyClient: boolean;
    private readonly fieldFormat: StringFormatKey;
    constructor(options: PythonGeneratorOptions) {
        super({ ...options, resolveAssets: options.resolveAssets ?? resolvePyAssets });
        this.nameFormatFunction = this.getFieldFormatFunction(options.fieldFormat);
        this.forFhirpyClient = this.resolveClient(options);
        this.fieldFormat = options.fieldFormat;
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
        const packages = this.collectPackages(tsIndex);
        const hasProfiles = Object.values(packages).some(({ profiles }) => profiles.length > 0);
        this.cd("/", () => {
            this.cat("__init__.py", () => this.generateRootInit(packages));
            if (this.forFhirpyClient) {
                const asset =
                    this.fieldFormat === "camelCase" ? "fhirpy_base_model_camel_case.py" : "fhirpy_base_model.py";
                this.copyAssets(resolvePyAssets(asset), "fhirpy_base_model.py");
            }
            if (hasProfiles) {
                this.copyAssets(resolvePyAssets("profile_helpers.py"), "profile_helpers.py");
            }
            this.copyAssets(resolvePyAssets("requirements.txt"), "requirements.txt");
            for (const [packageName, packageTypes] of Object.entries(packages)) {
                this.cd(snakeCase(packageName), () => {
                    const { complexTypes, resources, profiles } = packageTypes;
                    const hasComplexTypes = complexTypes.length > 0;
                    const hasResources = resources.length > 0;
                    const hasProfiles = profiles.length > 0;
                    const needsResourcePreprocessor = resources.some(
                        (schema) => collectResourceGenericTypeVars(schema).length > 0,
                    );
                    if (hasComplexTypes) {
                        this.cat("base.py", () => this.generateBasePy(packageName, complexTypes));
                    }
                    if (hasResources || hasProfiles) {
                        this.cat("__init__.py", () => this.generatePackageInit(packageName, packageTypes));
                    }
                    if (needsResourcePreprocessor) {
                        this.copyAssets(resolvePyAssets("resource_preprocessor.py"), "resource_preprocessor.py");
                    }
                    for (const schema of resources) {
                        this.cat(`${snakeCase(schema.identifier.name)}.py`, () => {
                            this.generateResourceModule(schema);
                        });
                    }
                    if (hasProfiles) {
                        this.cd("profiles", () => {
                            for (const profile of profiles) {
                                const moduleName = pyProfileModuleName(tsIndex, profile);
                                this.cat(`${moduleName}.py`, () => generateProfileModule(this, tsIndex, profile));
                            }
                            this.cat("__init__.py", () => generateProfilesInit(this, tsIndex, profiles));
                        });
                    }
                });
            }
        });
    }

    private generateRootInit(packages: TypeSchemaPackages): void {
        this.generateDisclaimer();
        const models = this.collectAndImportAllModels(packages);
        this.generateModelRebuilds(models);
        this.importProfileRegistrations(packages);
    }

    private collectPackages(tsIndex: TypeSchemaIndex): TypeSchemaPackages {
        const packages: TypeSchemaPackages = {};
        const packageGroup = (name: string) => (packages[name] ??= { resources: [], complexTypes: [], profiles: [] });
        for (const schema of tsIndex.collectResources()) packageGroup(schema.identifier.package).resources.push(schema);
        for (const schema of tsIndex.collectComplexTypes())
            packageGroup(schema.identifier.package).complexTypes.push(schema);
        if (this.opts.generateProfile) {
            for (const profile of tsIndex.collectSnapshotProfiles())
                packageGroup(profile.identifier.package).profiles.push(profile);
        }
        return packages;
    }

    private collectAndImportAllModels(packages: TypeSchemaPackages): string[] {
        const models: string[] = [];
        for (const [packageName, { complexTypes, resources }] of Object.entries(packages)) {
            if (resources.length === 0) continue;
            const fullPyPackageName = pyFhirPackageByName(this.opts.rootPackageName, packageName);
            models.push(...this.importComplexTypes(fullPyPackageName, complexTypes));
            models.push(...this.importResources(fullPyPackageName, false, resources));
        }
        this.line();
        return models;
    }

    private generateModelRebuilds(models: string[]): void {
        for (const modelName of models.sort()) {
            this.line(`${modelName}.model_rebuild()`);
        }
    }

    private importProfileRegistrations(packages: TypeSchemaPackages): void {
        const packageNames = Object.entries(packages)
            .filter(([, { profiles }]) => profiles.length > 0)
            .map(([name]) => name);
        if (packageNames.length === 0) return;
        this.line();
        for (const packageName of packageNames) {
            const profilesPackage = `${pyFhirPackageByName(this.opts.rootPackageName, packageName)}.profiles`;
            this.line(`import ${profilesPackage}  # noqa: F401`);
        }
    }

    private generateBasePy(packageName: string, packageComplexTypes: SpecializationTypeSchema[]): void {
        const hasGenericTypes = packageComplexTypes.some((s) => s.identifier.name in GENERIC_FIELD_REWRITES);
        this.generateDisclaimer();
        const pyFhirPackage = pyFhirPackageByName(this.opts.rootPackageName, packageName);
        const imports = this.typeModuleImports(packageName, `${pyFhirPackage}.base`);
        if (hasGenericTypes) {
            // Covariant: the parameter says what a value holds, and callers
            // hand these models on to code that asks for the wider type.
            // Invariant, a precisely-typed `Reference[Literal["Patient"]]`
            // cannot be passed where a plain `Reference` is expected, which
            // makes the narrower annotation a liability rather than a gain.
            // Unsound in principle for a mutable attribute; accepted because
            // the generated models are data carriers.
            this.line(`T = ${imports.typingExtensions.use("TypeVar")}('T', bound=str, default=str, covariant=True)`);
            this.line();
        }
        const sortedTypes = [...packageComplexTypes].sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
        for (const schema of sortAsDeclarationSequence(sortedTypes)) {
            this.generateNestedTypes(imports, schema);
            this.line();
            this.generateType(imports, schema);
        }
        this.line();
    }

    private generatePackageInit(packageName: string, { complexTypes, resources, profiles }: TypeSchemaPackage): void {
        this.generateDisclaimer();
        const pyPackageName = pyFhirPackageByName(this.opts.rootPackageName, packageName);
        const profileNames = collectProfileClassNames(profiles);
        if (resources.length > 0) this.importComplexTypes(pyPackageName, complexTypes);
        const resourceNames = this.importResources(pyPackageName, true, resources);
        this.importPackageProfiles(profileNames);
        this.line();
        this.generateExportsDeclaration(resources.length > 0 ? complexTypes : undefined, [
            ...resourceNames,
            ...profileNames,
        ]);
    }

    /** Re-export a package's profile classes from its `__init__.py`, so they are
     *  reachable as `<package>.<ProfileClass>` and not only by module path.
     *  Explicit, so strict mypy (`no_implicit_reexport`) sees the names. */
    private importPackageProfiles(profileNames: string[]): void {
        if (profileNames.length === 0) return;
        this.pyImportFrom(".profiles", ...profileNames);
    }

    private importComplexTypes(fullPyPackageName: string, packageComplexTypes?: SpecializationTypeSchema[]): string[] {
        if (!packageComplexTypes || packageComplexTypes.length === 0) return [];

        const baseTypes = packageComplexTypes.map((t) => t.identifier.name).sort();
        this.pyImportFrom(`${fullPyPackageName}.base`, ...baseTypes);
        this.line();

        return baseTypes;
    }

    private buildImportLine(entities: string[], start: number, maxLen: number): { line: string; next: number } {
        let line = "";
        let i = start;
        while (i < entities.length && line.length < maxLen) {
            if (line.length > 0) line += ", ";
            line += entities[i];
            i++;
        }
        if (i < entities.length) line += ", \\";
        return { line, next: i };
    }

    private importResources(
        fullPyPackageName: string,
        importEmptyResources: boolean,
        packageResources?: SpecializationTypeSchema[],
    ): string[] {
        if (!packageResources || packageResources.length === 0) return [];
        const allResourceNames: string[] = [];

        for (const resource of packageResources) {
            const names = this.importOneResource(resource, fullPyPackageName);
            if (!importEmptyResources && !resource.fields) continue;
            allResourceNames.push(...names);
        }

        return allResourceNames;
    }

    private importOneResource(resource: SpecializationTypeSchema, fullPyPackageName: string): string[] {
        const moduleName = `${fullPyPackageName}.${snakeCase(resource.identifier.name)}`;
        const importNames = this.collectResourceImportNames(resource);

        this.pyImportFrom(moduleName, ...importNames);

        return [...importNames];
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

        this.generateDisclaimer();
        const module = pyPackage(this.opts.rootPackageName, schema.identifier);
        const imports = this.typeModuleImports(schema.identifier.package, module);
        if (typeVars.length > 0) {
            this.line();
            for (const { typeVar, constraint } of typeVars) {
                // Covariant for the same reason as the base `T`: a
                // `BundleEntry[Patient]` is usable as a `BundleEntry[Resource]`.
                const bound = imports.types.use(constraint);
                this.line(
                    `${typeVar} = ${imports.typingExtensions.use("TypeVar")}('${typeVar}', bound=${bound}, default=${bound}, covariant=True)`,
                );
            }
        }
        this.line();
        this.generateNestedTypes(imports, schema);
        this.line();
        this.generateType(imports, schema);
    }

    /** `from __future__` stays first; each section below imports only the names its module's code uses. */
    private typeModuleImports(packageName: string, module: string): TypeModuleImports {
        this.line("from __future__ import annotations");
        const pydantic = this.moduleImports("pydantic");
        // `List` is a FHIR resource class too, so the typing alias keeps them apart.
        const typing = this.moduleImports("typing", (name) => (name === "List" ? "PyList" : name));
        const typingExtensions = this.moduleImports("typing_extensions");
        const fhirpy = this.moduleImports(`${this.opts.rootPackageName}.fhirpy_base_model`);
        this.line();
        const types = this.section<never, TypeIdentifier>({
            name: deriveResourceName,
            render: (_definitions, usages) => {
                const byModule: Record<string, string[]> = {};
                for (const { key, local } of usages) {
                    const from = pyPackage(this.opts.rootPackageName, key);
                    // Types declared in this module are written by name.
                    if (from === module) continue;
                    const name = deriveResourceName(key);
                    (byModule[from] ??= []).push(name === local ? name : `${name} as ${local}`);
                }
                for (const [from, names] of Object.entries(byModule).sort(([a], [b]) => a.localeCompare(b)))
                    this.pyImportFrom(from, ...names.sort());
            },
        });
        const pyFhirPackage = pyFhirPackageByName(this.opts.rootPackageName, packageName);
        const preprocessor = this.moduleImports(`${pyFhirPackage}.resource_preprocessor`);
        return { pydantic, typing, typingExtensions, fhirpy, types, preprocessor };
    }

    /** One `from <module> import ...` line naming the symbols used from `module`. */
    private moduleImports(module: string, name = (key: string) => key): SectionHandle<never, string> {
        return this.section<never, string>({
            name,
            render: (_definitions, usages) => {
                if (usages.length === 0) return;
                const names = usages.map(({ key, local }) => (key === local ? key : `${key} as ${local}`));
                this.pyImportFrom(module, ...names.sort());
            },
        });
    }

    private generateType(imports: TypeModuleImports, schema: SpecializationTypeSchema | NestedTypeSchema): void {
        const className = deriveResourceName(schema.identifier);
        const superClasses = this.getSuperClasses(imports, schema);

        this.line(`class ${className}(${superClasses.join(", ")}):`);
        this.indentBlock(() => {
            this.generateClassBody(imports, schema);
        });
        this.line();
    }

    private getSuperClasses(imports: TypeModuleImports, schema: SpecializationTypeSchema | NestedTypeSchema): string[] {
        const bases: string[] = [];
        if (schema.base) bases.push(imports.types.use(schema.base));
        bases.push(...this.injectSuperClasses(imports, schema.identifier.url));
        // A schema with no base and no injected root still gets a pydantic body,
        // so without a model root every Field(...) and the model_config would be
        // inert class attributes. Reached by a logical model specializing a root
        // the package does not ship — R4's virtual `Base`, say, which leaves the
        // schema rootless — and by anything else that resolves to no parent.
        if (bases.length === 0)
            bases.push(
                this.forFhirpyClient ? imports.fhirpy.use("FhirpyBaseModel") : imports.pydantic.use("BaseModel"),
            );
        if (schema.identifier.name in GENERIC_FIELD_REWRITES) bases.push(`${imports.typing.use("Generic")}[T]`);
        const params = schema.generic?.params ?? [];
        if (params.length > 0) {
            const typeVars = params.map((p) => p.typeVar).join(", ");
            bases.push(`${imports.typing.use("Generic")}[${typeVars}]`);
        }
        return bases;
    }

    private generateClassBody(imports: TypeModuleImports, schema: SpecializationTypeSchema | NestedTypeSchema): void {
        this.generateModelConfig(imports);

        if (!schema.fields) {
            this.line("pass");
            return;
        }

        if (isResourceTypeSchema(schema)) {
            this.generateResourceTypeField(imports, schema);
        }

        this.generateFields(imports, schema);

        if (this.opts.generateProfile && schema.identifier.name === "Extension") {
            this.generateExtensionEqualityMethods();
        }

        if (isResourceTypeSchema(schema)) {
            this.generateResourceMethods(imports, schema);
        }

        if ((schema.generic?.params?.length ?? 0) > 0) {
            this.generateResourcePreprocessorMethod(imports, schema);
        }
    }

    private generateResourcePreprocessorMethod(
        imports: TypeModuleImports,
        schema: SpecializationTypeSchema | NestedTypeSchema,
    ): void {
        const pyFhirPackage = pyFhirPackageByName(this.opts.rootPackageName, schema.identifier.package);
        const any = imports.typing.use("Any");
        this.line();
        this.line(`@${imports.pydantic.use("model_validator")}(mode='before')`);
        this.line("@classmethod");
        this.line(`def _preprocess_resources(cls, data: ${any}) -> ${any}:`);
        this.line("    if isinstance(data, dict):");
        this.line(`        return ${imports.preprocessor.use("preprocess_resource_fields")}(data, "${pyFhirPackage}")`);
        this.line("    return data");
    }

    private generateModelConfig(imports: TypeModuleImports): void {
        const extraMode = this.opts.allowExtraFields ? "allow" : "forbid";
        this.line(
            `model_config = ${imports.pydantic.use("ConfigDict")}(validate_by_name=True, serialize_by_alias=True, extra="${extraMode}")`,
        );
    }

    private generateResourceTypeField(imports: TypeModuleImports, schema: SpecializationTypeSchema): void {
        // Type as `str`; the value is validated on the pydantic side via `pattern`.
        const hasChildren = (schema.typeFamily?.resources?.length ?? 0) > 0;
        this.line(`${this.nameFormatFunction("resourceType")}: str = ${imports.pydantic.use("Field")}(`);
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

    private generateFields(imports: TypeModuleImports, schema: SpecializationTypeSchema | NestedTypeSchema): void {
        const sortedFields = Object.entries(schema.fields ?? []).sort(([a], [b]) => a.localeCompare(b));
        let elementType: string | undefined;
        if (this.shouldAddPrimitiveExtensions(schema)) {
            assert(this.tsIndex !== undefined);
            const elementUrl = "http://hl7.org/fhir/StructureDefinition/Element" as CanonicalUrl;
            const element = this.tsIndex.resolveByUrl(schema.identifier.package, elementUrl);
            if (!element) throw new Error(`'${elementUrl}' not found for ${schema.identifier.package}.`);
            elementType = imports.types.use(element.identifier);
        }

        for (const [fieldName, field] of sortedFields) {
            if (!isNotChoiceDeclarationField(field)) continue;

            const fieldInfo = this.buildFieldInfo(imports, fieldName, field, schema);
            this.line(`${fieldInfo.name}: ${fieldInfo.type}${fieldInfo.defaultValue}${fieldInfo.comment ?? ""}`);

            if (elementType && isPrimitiveIdentifier(field.type)) {
                this.addPrimitiveExtensionField(imports, fieldName, field.array ?? false, elementType);
            }
        }
    }

    private shouldAddPrimitiveExtensions(schema: SpecializationTypeSchema | NestedTypeSchema): boolean {
        if (!this.opts.primitiveTypeExtension) return false;
        if (!isSpecializationTypeSchema(schema)) return false;
        for (const field of Object.values(schema.fields ?? {})) {
            if (!isNotChoiceDeclarationField(field)) continue;
            if (isPrimitiveIdentifier(field.type)) return true;
        }
        return false;
    }

    private addPrimitiveExtensionField(
        imports: TypeModuleImports,
        fieldName: string,
        isArray: boolean,
        elementType: string,
    ): void {
        const pyFieldName = this.nameFormatFunction(`${fieldName}Extension`);
        const alias = `_${fieldName}`;
        const typeExpr = isArray
            ? `${imports.typing.use("List")}[${elementType} | None] | None`
            : `${elementType} | None`;
        const aliasSpec = `alias="${alias}", serialization_alias="${alias}"`;
        this.line(`${pyFieldName}: ${typeExpr} = ${imports.pydantic.use("Field")}(None, ${aliasSpec})`);
    }

    private buildFieldInfo(
        imports: TypeModuleImports,
        fieldName: string,
        field: RegularField | ChoiceFieldInstance,
        schema: SpecializationTypeSchema | NestedTypeSchema,
    ): FieldInfo {
        const pyFieldName = fixReservedWords(this.nameFormatFunction(fieldName));
        const fieldType = this.determineFieldType(imports, field, fieldName, schema);
        const defaultValue = this.getFieldDefaultValue(imports, field, fieldName);
        const family = this.tsIndex ? pyReferenceFamilyName(field, this.tsIndex) : undefined;

        return {
            name: pyFieldName,
            type: fieldType,
            defaultValue: defaultValue,
            comment: family ? `  # ${family}` : undefined,
        };
    }

    private determineFieldType(
        imports: TypeModuleImports,
        field: RegularField | ChoiceFieldInstance,
        fieldName: string,
        schema: SpecializationTypeSchema | NestedTypeSchema,
    ): string {
        const schemaName = schema.identifier.name;
        let fieldType = this.getBaseFieldType(imports, field);

        // String-bound generics (Coding.code → T, CodeableConcept.coding → Coding[T])
        const rewrite = GENERIC_FIELD_REWRITES[schemaName]?.[fieldName];
        if (rewrite) {
            fieldType = rewrite(fieldType);
            if (field.array) fieldType = `${imports.typing.use("List")}[${fieldType}]`;
            if (!field.required) fieldType = `${fieldType} | None`;
            return fieldType;
        }

        // Resource-bound generics: field IS the param (direct introduce)
        const params = schema.generic?.params ?? [];
        const directParam = params.find((p) => leafOf(p.path) === fieldName);
        if (directParam) {
            fieldType = directParam.typeVar;
            if (field.array) fieldType = `${imports.typing.use("List")}[${fieldType}]`;
            if (!field.required) fieldType = `${fieldType} | None`;
            return fieldType;
        }

        // Resource-bound generics: field's type is itself a generic schema (passthrough)
        if (params.length > 0) {
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

        if (field.enum) {
            const baseTypeName = field.type.name;
            if (baseTypeName in GENERIC_FIELD_REWRITES) {
                fieldType = `${fieldType}[${pyEnumType(imports.typing, field.enum)}]`;
            } else if (!field.enum.isOpen) {
                const s: string = field.enum.values.map((e: string) => `"${e}"`).join(", ");
                fieldType = `${imports.typing.use("Literal")}[${s}]`;
            }
        }

        // `fieldType` holds an import marker here, so test the identifier.
        const isReference = !isPrimitiveIdentifier(field.type) && field.type.name === "Reference";
        if (isReference && !field.enum && field.reference) {
            assert(this.tsIndex !== undefined);
            const typeParam = pyReferenceTypeParam(imports.typing, field, this.tsIndex);
            if (typeParam) fieldType = `${fieldType}[${typeParam}]`;
        }

        if (field.array) {
            fieldType = `${imports.typing.use("List")}[${fieldType}]`;
        }

        if (!field.required) {
            fieldType = `${fieldType} | None`;
        }

        return fieldType;
    }

    private getBaseFieldType(imports: TypeModuleImports, field: Field): string {
        if (!isNotChoiceDeclarationField(field)) return "";
        if (isResourceIdentifier(field.type)) return `${field.type.name}Family`;
        if (isNestedIdentifier(field.type)) return deriveResourceName(field.type);
        if (isPrimitiveIdentifier(field.type)) {
            const type = PRIMITIVE_TYPE_MAP[field.type.name] ?? "str";
            return type === "PositiveInt" ? imports.pydantic.use(type) : type;
        }
        return imports.types.use(field.type);
    }

    private getFieldDefaultValue(imports: TypeModuleImports, field: Field, fieldName: string): string {
        const aliasSpec = `alias="${fieldName}", serialization_alias="${fieldName}"`;
        if (!field.required) return ` = ${imports.pydantic.use("Field")}(None, ${aliasSpec})`;
        return ` = ${imports.pydantic.use("Field")}(${aliasSpec})`;
    }

    private generateResourceMethods(imports: TypeModuleImports, _schema: SpecializationTypeSchema): void {
        this.line();
        this.line(`def model_post_init(self, __context: ${imports.typing.use("Any")}) -> None:`);
        this.line(`    self.__pydantic_fields_set__.add("${this.nameFormatFunction("resourceType")}")`);
        this.line();
        this.line("def to_json(self, indent: int | None = None) -> str:");
        this.line("    return self.model_dump_json(exclude_unset=True, exclude_none=True, indent=indent)");
        this.line();
        this.line("@classmethod");
        this.line(`def from_json(cls, json: str) -> ${imports.typingExtensions.use("Self")}:`);
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

    private generateNestedTypes(imports: TypeModuleImports, schema: SpecializationTypeSchema): void {
        if (!schema.nested) return;

        this.line();
        for (const subtype of schema.nested) {
            this.generateType(imports, subtype);
        }
    }

    pyImportFrom(pyPackage: string, ...entities: string[]): void {
        const oneLine = `from ${pyPackage} import ${entities.join(", ")}`;

        if (this.shouldUseSingleLineImport(oneLine, entities)) {
            this.line(oneLine);
        } else {
            this.writeMultiLineImport(pyPackage, entities);
        }
    }

    private shouldUseSingleLineImport(oneLine: string, entities: string[]): boolean {
        return oneLine.length <= MAX_IMPORT_LINE_LENGTH || entities.length === 1;
    }

    private writeMultiLineImport(pyPackage: string, entities: string[]): void {
        this.line(`from ${pyPackage} import (`);
        this.indentBlock(() => {
            let i = 0;
            while (i < entities.length) {
                const { line, next } = this.buildImportLine(entities, i, MAX_IMPORT_LINE_LENGTH);
                this.line(line);
                i = next;
            }
        });
        this.line(")");
    }

    private getFieldFormatFunction(format: StringFormatKey): (name: string) => string {
        if (!AVAILABLE_STRING_FORMATS[format]) {
            this.logger()?.warn(`Unknown field format '${format}'. Defaulting to SnakeCase.`);
            this.logger()?.warn(`Supported formats: ${Object.keys(AVAILABLE_STRING_FORMATS).join(", ")}`);
            return snakeCase;
        }
        return AVAILABLE_STRING_FORMATS[format];
    }

    private injectSuperClasses(imports: TypeModuleImports, url: string): string[] {
        const name = canonicalToName(url);
        if (name === "resource")
            return [this.forFhirpyClient ? imports.fhirpy.use("FhirpyBaseModel") : imports.pydantic.use("BaseModel")];
        if (name === "element") return [imports.pydantic.use("BaseModel")];
        return [];
    }
}
