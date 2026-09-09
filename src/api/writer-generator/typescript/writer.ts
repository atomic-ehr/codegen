import { pascalCase, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import { extractValueSetConceptsByUrl } from "@root/typeschema/core/binding";
import {
    type CodedTerminologyEntry,
    mkTerminologyEntries,
    type PackageTerminology,
    type TerminologyEntry,
    type TerminologyResource,
    type TerminologyVerification,
} from "@root/typeschema/register";
import {
    type CanonicalUrl,
    type Field,
    isChoiceDeclarationField,
    isComplexTypeIdentifier,
    isLogicalTypeSchema,
    isNestedTypeSchema,
    isPrimitiveIdentifier,
    isResourceTypeSchema,
    isSnapshotProfileTypeSchema,
    isSpecializationTypeSchema,
    type NestedTypeSchema,
    type PackageMeta,
    packageMeta,
    packageMetaToFhir,
    packageMetaToNpm,
    type SnapshotProfileTypeSchema,
    type SpecializationTypeSchema,
    type TypeIdentifier,
    type TypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { resolveGeneratorAsset } from "../assets";
import {
    tsFieldName,
    tsModuleFileName,
    tsModuleName,
    tsNameFromCanonical,
    tsObjectKey,
    tsPackageDir,
    tsProfileModuleFileName,
    tsResourceName,
} from "./name";
import { generateProfileClass, generateProfileImports, generateProfileIndexFile, mkIsFamilyType } from "./profile";
import { resolveFieldTsType } from "./utils";

export const resolveTsAssets = (fn: string) => resolveGeneratorAsset(import.meta.url, "typescript", fn);

const leafOf = (path: string[]): string => path[path.length - 1] ?? "";

// Schemas that the TS writer renders with a hardcoded `<T extends string>` generic — their IR
// `generic.params` (if any, computed via structural propagation) must be ignored at reference sites
// so we don't emit `<T>` args clashing with the hardcoded `T extends string` declaration.
const TS_HARDCODED_GENERIC_NAMES = new Set(["Reference", "Coding", "CodeableConcept"]);
const CODE_SYSTEM_SUFFIX_RE = /CodeSystem$/;
const CHOICE_SUFFIX_RE = /\[x\]/g;
const INVALID_TS_IDENTIFIER_RUN_RE = /[^A-Za-z0-9_$]+/g;
const PACKAGE_PATH_SEPARATOR_RE = /\\/g;
const INVALID_PACKAGE_DIR_RUN_RE = /[^a-z0-9-]+/g;
const PACKAGE_DIR_EDGE_RE = /^-+|-+$/g;
const TS_IDENTIFIER_START_RE = /^[A-Za-z_$]/;

export type TypeScriptOptions = {
    lineWidth?: number;
    /** openResourceTypeSet -- for resource families (Resource, DomainResource) use open set for resourceType field.
     *
     * - when openResourceTypeSet is false: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" }`
     * - when openResourceTypeSet is true: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" | string }`
     */
    openResourceTypeSet: boolean;
    primitiveTypeExtension: boolean;
    /** How relative import/export specifiers are written in generated modules.
     *
     * - "extensionless" (default): `"./profiles"`, `"../Patient"` — resolved by
     *   bundlers, TypeScript and Bun.
     * - "node-esm": explicit file targets (`"./profiles/index.js"`,
     *   `"../Patient.js"`), so output transpiled to plain `.js` modules under
     *   `"type": "module"` loads under Node's ESM resolver.
     */
    moduleSpecifierStyle?: "extensionless" | "node-esm";
    extensionGetterDefault?: "flat" | "profile" | "raw";
    sliceGetterDefault?: "flat" | "raw";
    terminology?: {
        /** Emit one terminology module for every resolved package. Defaults to false. */
        enabled?: boolean;
        /**
         * Limit terminology modules to these `name@version` package refs.
         * When omitted, every resolved package in the closure emits one —
         * which for real closures (VSAC, hl7.terminology, ...) can be huge.
         */
        packages?: string[];
        /** Attestation per `name@version` package ref; see {@link TerminologyVerification}. */
        packageVerification?: Record<string, TerminologyVerification>;
    };
} & WriterOptions;

const validTsIdentifier = (source: string): string => {
    const normalized = source.replace(CHOICE_SUFFIX_RE, "_x_").replace(INVALID_TS_IDENTIFIER_RUN_RE, "_");
    return TS_IDENTIFIER_START_RE.test(normalized) ? normalized : `_${normalized}`;
};

const terminologySymbolName = (resource: TerminologyResource): string => {
    const sourceName = resource.name ?? resource.id ?? tsNameFromCanonical(resource.url) ?? "Terminology";
    return validTsIdentifier(`${uppercaseFirstLetter(sourceName)}${resource.resourceType}`);
};

const terminologyResourceIdentity = (resource: TerminologyResource): string =>
    `${resource.id ?? ""}\u0000${resource.name ?? ""}`;

const safePackageDir = (source: string): string => {
    const normalized = tsPackageDir(source.replace(PACKAGE_PATH_SEPARATOR_RE, "_"));
    return normalized.replace(INVALID_PACKAGE_DIR_RUN_RE, "-").replace(PACKAGE_DIR_EDGE_RE, "") || "package";
};

const allocateTerminologySymbols = (
    resources: TerminologyResource[],
): { resource: TerminologyResource; symbol: string }[] => {
    const baseNames = resources.map(terminologySymbolName);
    const counts: Record<string, number> = {};
    for (const name of baseNames) counts[name] = (counts[name] ?? 0) + 1;
    const used = new Set<string>();

    return resources.map((resource, index) => {
        const baseName = baseNames[index] ?? "Terminology";
        // Prefer the canonical-derived name: package ids can be content hashes.
        const localIdentity = tsNameFromCanonical(resource.url) ?? resource.id ?? "Resource";
        const desired =
            counts[baseName] === 1 ? baseName : validTsIdentifier(`${baseName}_${pascalCase(localIdentity)}`);
        let symbol = desired;
        let suffix = 2;
        while (used.has(symbol)) {
            symbol = `${desired}_${suffix}`;
            suffix += 1;
        }
        used.add(symbol);
        return { resource, symbol };
    });
};

export class TypeScript extends Writer<TypeScriptOptions> {
    private packageDirectories = new Map<string, string>();

    constructor(options: TypeScriptOptions) {
        super({ lineWidth: 120, ...options, resolveAssets: options.resolveAssets ?? resolveTsAssets });
    }

    /** The package's physical output directory: consults the collision-suffix
     *  map, so it can differ from the logical `tsPackageDir(name)` in name.ts
     *  (e.g. `hl7-fhir-r4-core--2`). Unprefixed = stateful writer method. */
    packageDir(physical: PackageMeta | TypeIdentifier): string {
        const pkg = "package" in physical ? { name: physical.package, version: physical.version } : physical;
        return this.packageDirectories.get(packageMetaToNpm(pkg)) ?? safePackageDir(pkg.name);
    }

    /** The module's physical position in the output tree: `packageDir/ModuleName`. */
    modulePath(identifier: TypeIdentifier): string {
        return `${this.packageDir(identifier)}/${tsModuleName(identifier)}`;
    }

    private moduleSpecifier(specifier: string): string {
        if (this.opts.moduleSpecifierStyle !== "node-esm" || !specifier.startsWith(".")) return specifier;
        return specifier.endsWith(".js") ? specifier : `${specifier}.js`;
    }

    private directorySpecifier(specifier: string): string {
        if (this.opts.moduleSpecifierStyle !== "node-esm" || !specifier.startsWith(".")) return specifier;
        return `${specifier}/index.js`;
    }

    ifElseChain(branches: { cond: string; body: () => void }[], elseBody?: () => void) {
        branches.forEach((branch, i) => {
            const prefix = i === 0 ? "if" : "} else if";
            this.line(`${prefix} (${branch.cond}) {`);
            this.indent();
            branch.body();
            this.deindent();
        });
        if (elseBody) {
            this.line("} else {");
            this.indent();
            elseBody();
            this.deindent();
        }
        this.line("}");
    }

    tsImport(tsPackageName: string, ...entities: string[]): void;
    tsImport(tsPackageName: string, ...args: [...string[], { typeOnly: boolean }]): void;
    tsImport(tsPackageName: string, ...rest: (string | { typeOnly: boolean })[]) {
        const last = rest[rest.length - 1];
        const typeOnly = typeof last === "object" ? last.typeOnly : false;
        const entities = (typeof last === "object" ? rest.slice(0, -1) : rest) as string[];
        const keyword = typeOnly ? "import type" : "import";
        const specifier = this.moduleSpecifier(tsPackageName);
        const singleLine = `${keyword} { ${entities.join(", ")} } from "${specifier}"`;
        if (singleLine.length <= (this.opts.lineWidth ?? 120)) {
            this.lineSM(singleLine);
        } else {
            this.curlyBlock([keyword], () => {
                for (const entity of entities) {
                    this.line(`${entity},`);
                }
            }, [` from "${specifier}";`]);
        }
    }

    tsExport(from: string, ...entities: string[]): void;
    tsExport(from: string, ...args: [...string[], { typeOnly: boolean }]): void;
    tsExport(from: string, ...rest: (string | { typeOnly: boolean })[]) {
        const last = rest[rest.length - 1];
        const typeOnly = typeof last === "object" ? last.typeOnly : false;
        const entities = (typeof last === "object" ? rest.slice(0, -1) : rest) as string[];
        const keyword = typeOnly ? "export type" : "export";
        this.lineSM(`${keyword} { ${entities.join(", ")} } from "${this.moduleSpecifier(from)}"`);
    }

    /** `export * from` a module, or a directory barrel when `barrel` is set. */
    tsExportAll(from: string, opts?: { barrel?: boolean }): void {
        const specifier = opts?.barrel ? this.directorySpecifier(from) : this.moduleSpecifier(from);
        this.lineSM(`export * from "${specifier}"`);
    }

    generateFhirPackageIndexFile(schemas: TypeSchema[], hasTerminology = false) {
        this.cat("index.ts", () => {
            if (hasTerminology) this.tsExportAll("./terminology");
            const profiles = schemas.filter(isSnapshotProfileTypeSchema);
            if (profiles.length > 0) {
                this.tsExportAll("./profiles", { barrel: true });
            }

            let exports = schemas
                .flatMap((schema) => {
                    const resourceName = tsResourceName(schema.identifier);
                    const typeExports = isSnapshotProfileTypeSchema(schema)
                        ? []
                        : [
                              resourceName,
                              ...((isResourceTypeSchema(schema) && schema.nested) ||
                              (isLogicalTypeSchema(schema) && schema.nested)
                                  ? schema.nested.map((n) => tsResourceName(n.identifier))
                                  : []),
                          ];
                    const valueExports = isResourceTypeSchema(schema) ? [`is${resourceName}`] : [];

                    return [
                        {
                            identifier: schema.identifier,
                            tsPackageName: tsModuleName(schema.identifier),
                            resourceName,
                            typeExports,
                            valueExports,
                        },
                    ];
                })
                .sort((a, b) => a.resourceName.localeCompare(b.resourceName));

            // FIXME: actually, duplication may means internal error...
            exports = Array.from(new Map(exports.map((exp) => [exp.resourceName.toLowerCase(), exp])).values()).sort(
                (a, b) => a.resourceName.localeCompare(b.resourceName),
            );

            for (const exp of exports) {
                this.debugComment(exp.identifier);
                const from = `./${exp.tsPackageName}`;
                if (exp.typeExports.length > 0) {
                    this.tsExport(from, ...exp.typeExports, { typeOnly: true });
                }
                if (exp.valueExports.length > 0) {
                    this.tsExport(from, ...exp.valueExports);
                }
            }
        });
    }

    generateDependenciesImports(tsIndex: TypeSchemaIndex, schema: SpecializationTypeSchema, importPrefix = "../") {
        if (schema.dependencies) {
            const imports = [];
            const skipped = [];
            for (const dep of schema.dependencies) {
                if (["complex-type", "resource", "logical"].includes(dep.kind)) {
                    imports.push({
                        tsPackage: `${importPrefix}${this.modulePath(dep)}`,
                        name: tsResourceName(dep),
                        dep: dep,
                    });
                } else {
                    skipped.push(dep);
                }
            }
            imports.sort((a, b) => a.name.localeCompare(b.name));
            for (const dep of imports) {
                this.debugComment(dep.dep);
                this.tsImport(dep.tsPackage, dep.name, { typeOnly: true });
            }
            for (const dep of skipped) {
                this.debugComment("skip:", dep);
            }
            this.line();
            if (
                this.withPrimitiveTypeExtension(schema) &&
                schema.identifier.name !== "Element" &&
                schema.dependencies.find((e) => e.name === "Element") === undefined
            ) {
                const elementUrl = "http://hl7.org/fhir/StructureDefinition/Element" as CanonicalUrl;
                const element = tsIndex.resolveByUrl(schema.identifier.package, elementUrl);
                if (!element) throw new Error(`'${elementUrl}' not found for ${schema.identifier.package}.`);

                this.tsImport(`${importPrefix}${this.modulePath(element.identifier)}`, "Element", { typeOnly: true });
            }
        }
    }

    generateComplexTypeReexports(schema: SpecializationTypeSchema) {
        const complexTypeDeps = schema.dependencies?.filter(isComplexTypeIdentifier);
        if (complexTypeDeps && complexTypeDeps.length > 0) {
            for (const dep of complexTypeDeps) {
                this.debugComment(dep);
                this.tsExport(`../${this.modulePath(dep)}`, tsResourceName(dep), { typeOnly: true });
            }
            this.line();
        }
    }

    addFieldExtension(fieldName: string, isArray: boolean): void {
        const extFieldName = tsFieldName(`_${fieldName}`);
        const typeExpr = isArray ? "(Element | null)[]" : "Element";
        this.lineSM(`${extFieldName}?: ${typeExpr}`);
    }

    generateType(
        tsIndex: TypeSchemaIndex,
        schema: SpecializationTypeSchema | NestedTypeSchema,
        isFamilyType?: (ref: TypeIdentifier) => boolean,
    ): void {
        let name: string;
        // Generic types: Reference, Coding, CodeableConcept
        const genericTypes = ["Reference", "Coding", "CodeableConcept"];
        const isHardcodedGeneric = genericTypes.includes(schema.identifier.name);
        if (isHardcodedGeneric) {
            name = `${schema.identifier.name}<T extends string = string>`;
        } else {
            name = tsResourceName(schema.identifier);
        }

        // Generic params come from the IR (populated for all generic-bearing schemas, top-level + nested).
        // Hardcoded TS specials (Reference/Coding/CodeableConcept) get their `<T extends string>` above.
        const params = isHardcodedGeneric ? [] : (schema.generic?.params ?? []);

        // Per-field substitutions: walk fields once, deciding for each whether its type substitutes
        // with a schema param (introduce) or its reference appends args (passthrough). Aligning by
        // leaf segment of the param's `path` matches deep origins across nesting hops.
        const fieldMap: Record<string, string> = {};
        const nestedArgsByField: Record<string, string> = {};
        if (!isHardcodedGeneric) {
            for (const [fieldName, field] of Object.entries(schema.fields ?? {})) {
                if (isChoiceDeclarationField(field) || !field.type) continue;
                const target = tsIndex.resolveType(field.type);
                if (!target || TS_HARDCODED_GENERIC_NAMES.has(target.identifier.name)) continue;
                const tsName = tsFieldName(fieldName);
                const targetParams =
                    isNestedTypeSchema(target) || isSpecializationTypeSchema(target)
                        ? target.generic?.params
                        : undefined;
                if (targetParams?.length) {
                    const args = targetParams.map(
                        (tp) => params.find((q) => leafOf(q.path) === leafOf(tp.path))?.typeVar ?? tp.typeVar,
                    );
                    nestedArgsByField[tsName] = `<${args.join(", ")}>`;
                } else if (isSpecializationTypeSchema(target) && (target.typeFamily?.resources?.length ?? 0) > 0) {
                    const p = params.find((q) => leafOf(q.path) === fieldName);
                    if (p) fieldMap[tsName] = p.typeVar;
                }
            }
        }
        if (!isHardcodedGeneric && params.length > 0) {
            const declParams = params.map((p) => `${p.typeVar} extends ${p.constraint.name} = ${p.constraint.name}`);
            name += `<${declParams.join(", ")}>`;
        }

        let extendsClause: string | undefined;
        if (schema.base) extendsClause = `extends ${tsNameFromCanonical(schema.base.url)}`;

        this.debugComment(schema.identifier);
        if (!schema.fields && !extendsClause && !isResourceTypeSchema(schema)) {
            this.lineSM(`export type ${name} = object`);
            return;
        }
        this.curlyBlock(["export", "interface", name, extendsClause], () => {
            if (isResourceTypeSchema(schema)) {
                const possibleResourceTypes = [schema.identifier, ...(schema.typeFamily?.resources ?? [])];
                const openSetSuffix =
                    this.opts.openResourceTypeSet && possibleResourceTypes.length > 1 ? " | string" : "";
                this.lineSM(
                    `resourceType: ${possibleResourceTypes
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((e) => `"${e.name}"`)
                        .join(" | ")}${openSetSuffix}`,
                );
                this.line();
            }

            if (!schema.fields) return;
            const fields = Object.entries(schema.fields).sort((a, b) => a[0].localeCompare(b[0]));

            for (const [fieldName, field] of fields) {
                if (isChoiceDeclarationField(field)) continue;
                // Skip fields without type info (can happen with incomplete StructureDefinitions)
                if (!field.type) continue;

                this.debugComment(fieldName, ":", field);

                const tsName = tsFieldName(fieldName);
                const tsType = resolveFieldTsType(
                    schema.identifier.name,
                    tsName,
                    field,
                    undefined,
                    fieldMap,
                    isFamilyType,
                );
                const optionalSymbol = field.required ? "" : "?";
                const arraySymbol = field.array ? "[]" : "";
                const nestedArgs = nestedArgsByField[tsName] ?? "";
                this.lineSM(`${tsName}${optionalSymbol}: ${tsType}${nestedArgs}${arraySymbol}`);

                if (this.withPrimitiveTypeExtension(schema)) {
                    if (isPrimitiveIdentifier(field.type)) {
                        this.addFieldExtension(fieldName, field.array ?? false);
                    }
                }
            }
        });
    }

    withPrimitiveTypeExtension(schema: TypeSchema | NestedTypeSchema): boolean {
        if (!this.opts.primitiveTypeExtension) return false;
        if (!isSpecializationTypeSchema(schema)) return false;
        for (const field of Object.values(schema.fields ?? {})) {
            if (isChoiceDeclarationField(field)) continue;
            if (isPrimitiveIdentifier(field.type)) return true;
        }
        return false;
    }

    generateResourceTypePredicate(schema: SpecializationTypeSchema) {
        if (!isResourceTypeSchema(schema)) return;
        const name = tsResourceName(schema.identifier);
        this.curlyBlock(["export", "const", `is${name}`, "=", `(resource: unknown): resource is ${name}`, "=>"], () => {
            this.lineSM(
                `return resource !== null && typeof resource === "object" && (resource as {resourceType: string}).resourceType === "${schema.identifier.name}"`,
            );
        });
    }

    generateNestedTypes(
        tsIndex: TypeSchemaIndex,
        schema: SpecializationTypeSchema,
        isFamilyType?: (ref: TypeIdentifier) => boolean,
    ): void {
        if (!schema.nested) return;
        for (const subtype of schema.nested) {
            this.generateType(tsIndex, subtype, isFamilyType);
            this.line();
        }
    }

    generateResourceModule(tsIndex: TypeSchemaIndex, schema: TypeSchema) {
        if (isSnapshotProfileTypeSchema(schema)) {
            this.cd("profiles", () => {
                this.cat(`${tsProfileModuleFileName(tsIndex, schema)}`, () => {
                    this.generateDisclaimer();
                    generateProfileImports(this, tsIndex, schema);
                    generateProfileClass(this, tsIndex, schema);
                });
            });
        } else if (isSpecializationTypeSchema(schema)) {
            const isFamilyType = mkIsFamilyType(tsIndex);
            this.cat(`${tsModuleFileName(schema.identifier)}`, () => {
                this.generateDisclaimer();
                this.generateDependenciesImports(tsIndex, schema);
                this.generateComplexTypeReexports(schema);
                this.generateNestedTypes(tsIndex, schema, isFamilyType);
                this.comment(
                    "CanonicalURL:",
                    schema.identifier.url,
                    `(pkg: ${packageMetaToFhir(packageMeta(schema))})`,
                );
                this.generateType(tsIndex, schema, isFamilyType);
                this.generateResourceTypePredicate(schema);
            });
        } else {
            throw new Error(`Profile generation not implemented for kind: ${schema.identifier.kind}`);
        }
    }

    /** Normalized terminology types: the FHIR vocabulary comes from the generated
     *  CodeSystem type when the closure provides one; a package-free closure gets
     *  a self-contained copy of the R4/R5 content-mode vocabulary instead. */
    generateTerminologyTypes(codeSystemImport: string | undefined) {
        this.cat("terminology-types.ts", () => {
            this.generateDisclaimer();
            if (codeSystemImport) this.tsImport(codeSystemImport, "CodeSystem", { typeOnly: true });
            this.line();
            const contentType = codeSystemImport
                ? `CodeSystem["content"]`
                : `("not-present" | "example" | "fragment" | "complete" | "supplement")`;
            this.lineSM(`export type TerminologyVerification = "registry-integrity" | "unverifiable" | (string & {})`);
            this.line();
            this.curlyBlock(["type", "TerminologyEntryBase", "="], () => {
                this.lineSM("canonicalUrl: string");
                this.lineSM("packageId: string");
                this.lineSM("packageVersion: string");
                this.lineSM("verification: TerminologyVerification");
            }, [";"]);
            this.line();
            this.line("/** `contentMode` is a CodeSystem concept; the other entry kinds have none. */");
            this.curlyBlock(["export", "type", "CodeSystemEntry", "=", "TerminologyEntryBase", "&"], () => {
                this.lineSM(`resourceType: "CodeSystem"`);
                this.lineSM(`contentMode?: ${contentType}`);
            }, [";"]);
            this.line();
            this.curlyBlock(["export", "type", "ValueSetEntry", "=", "TerminologyEntryBase", "&"], () => {
                this.lineSM(`resourceType: "ValueSet"`);
            }, [";"]);
            this.line();
            this.curlyBlock(["export", "type", "NamingSystemEntry", "=", "TerminologyEntryBase", "&"], () => {
                this.lineSM(`resourceType: "NamingSystem"`);
            }, [";"]);
            this.line();
            this.line("/** One normalized terminology resource, discriminated by `resourceType`. */");
            this.lineSM("export type TerminologyEntry = CodeSystemEntry | ValueSetEntry | NamingSystemEntry");
            this.line();
            this.line("/** A complete CodeSystem whose codes are embedded: the simplified runtime surface. */");
            this.curlyBlock([
                "export",
                "type",
                "CodedTerminologyEntry<Code extends string = string>",
                "=",
                "CodeSystemEntry",
                "&",
            ], () => {
                this.lineSM(`contentMode: "complete"`);
                this.lineSM("codes: readonly Code[]");
                this.lineSM("displays: Readonly<Partial<Record<Code, string>>>");
            }, [";"]);
        });
    }

    /** Emitted terminology, resolved ahead of module generation so profile
     *  emission can reference the allocated symbols. Keyed by package dir. */
    private terminologyModules = new Map<
        string,
        { entry: TerminologyEntry | CodedTerminologyEntry; symbol: string }[]
    >();
    /** Coded systems across every emitted terminology module, by canonical URL. */
    private terminologyCodeIndex = new Map<string, { moduleDir: string; symbol: string; codes: ReadonlySet<string> }>();

    private prepareTerminology(generationUnits: Map<string, { terminology?: PackageTerminology }>) {
        this.terminologyModules = new Map();
        this.terminologyCodeIndex = new Map();
        for (const [packageDir, unit] of [...generationUnits].sort(([left], [right]) => left.localeCompare(right))) {
            if (unit.terminology) this.prepareTerminologyModule(packageDir, unit.terminology);
        }
    }

    prepareTerminologyModule(packageDir: string, packageTerminology: PackageTerminology) {
        const { packageMeta: pkg } = packageTerminology;
        const verification = this.opts.terminology?.packageVerification?.[packageMetaToNpm(pkg)] ?? "not-recorded";
        // The register builds the normalized entries (dedup, code embedding
        // policy); this writer only allocates symbols and serializes them.
        const dedupedEntries = mkTerminologyEntries(packageTerminology, verification, this.logger());
        const sortedResources = dedupedEntries.slice().sort(({ resource: left }, { resource: right }) => {
            if (left.resourceType !== right.resourceType) return left.resourceType.localeCompare(right.resourceType);
            const symbolOrder = terminologySymbolName(left).localeCompare(terminologySymbolName(right));
            if (symbolOrder !== 0) return symbolOrder;
            const canonicalOrder = left.url.localeCompare(right.url);
            if (canonicalOrder !== 0) return canonicalOrder;
            return terminologyResourceIdentity(left).localeCompare(terminologyResourceIdentity(right));
        });
        const allocated = allocateTerminologySymbols(sortedResources.map(({ resource }) => resource));
        const allocatedEntries = sortedResources.map(({ entry }, index) => ({
            entry,
            symbol: allocated[index]?.symbol ?? "Terminology",
        }));
        this.terminologyModules.set(packageDir, allocatedEntries);
        for (const { entry, symbol } of allocatedEntries) {
            if ("codes" in entry && !this.terminologyCodeIndex.has(entry.canonicalUrl))
                this.terminologyCodeIndex.set(entry.canonicalUrl, {
                    moduleDir: packageDir,
                    symbol,
                    codes: new Set(entry.codes),
                });
        }
    }

    /** Enum validations whose value lists are fully explained by emitted coded
     *  systems reference those systems' `codes` instead of inlining literals.
     *  Returns the replacement expression per field and the value imports the
     *  profile module needs. Only whole-system matches convert; anything else
     *  stays an inline literal, so unlinked output is unchanged. */
    private linkFieldEnum(
        tsIndex: TypeSchemaIndex,
        field: Field,
    ): { expr: string; imports: Map<string, Set<string>> } | undefined {
        if (isChoiceDeclarationField(field)) return undefined;
        if (!field.enum || field.enum.values.length === 0 || !field.binding) return undefined;
        const binding = tsIndex.resolveByUrl(field.binding.package, field.binding.url);
        if (!binding) return undefined;
        let concepts = "concept" in binding ? binding.concept : undefined;
        if (!concepts) {
            // Binding schemas carry the enum values only; the concepts — with
            // their systems — live on the ValueSet the binding depends on.
            const dependencies = "dependencies" in binding ? (binding.dependencies ?? []) : [];
            const valueSets = dependencies.filter((dep) => dep.kind === "value-set");
            const valueSetId = valueSets.length === 1 ? valueSets[0] : undefined;
            const valueSet = valueSetId ? tsIndex.resolveByUrl(valueSetId.package, valueSetId.url) : undefined;
            concepts = valueSet && "concept" in valueSet ? valueSet.concept : undefined;
            if (!concepts && valueSetId && tsIndex.register) {
                // Tree shaking drops ValueSet schemas the output doesn't need;
                // the register still resolves the concepts from the package.
                concepts = extractValueSetConceptsByUrl(
                    tsIndex.register,
                    { name: valueSetId.package, version: valueSetId.version },
                    valueSetId.url,
                    this.logger(),
                );
            }
        }
        if (!concepts || concepts.length === 0) return undefined;
        // The enum must be exactly the binding's concept set, else the two
        // were derived differently (truncation, filters) — don't link.
        const conceptCodes = new Set(concepts.map(({ code }) => code));
        const values = field.enum.values;
        if (values.length !== conceptCodes.size || !values.every((value) => conceptCodes.has(value))) return undefined;
        const bySystem = new Map<string, Set<string>>();
        for (const concept of concepts) {
            if (!concept.system) continue;
            const codes = bySystem.get(concept.system) ?? new Set<string>();
            codes.add(concept.code);
            bySystem.set(concept.system, codes);
        }
        const spreads: string[] = [];
        const covered = new Set<string>();
        const imports = new Map<string, Set<string>>();
        for (const [system, codes] of bySystem) {
            const indexed = this.terminologyCodeIndex.get(system);
            if (!indexed) continue;
            if (codes.size !== indexed.codes.size || ![...codes].every((code) => indexed.codes.has(code))) continue;
            spreads.push(`...${indexed.symbol}.codes`);
            for (const code of codes) covered.add(code);
            const symbols = imports.get(indexed.moduleDir) ?? new Set<string>();
            symbols.add(indexed.symbol);
            imports.set(indexed.moduleDir, symbols);
        }
        if (spreads.length === 0) return undefined;
        const literals = values.filter((value) => !covered.has(value)).map((value) => JSON.stringify(value));
        return { expr: `[${[...spreads, ...literals].join(", ")}]`, imports };
    }

    enumTerminologyLinks(
        tsIndex: TypeSchemaIndex,
        snapshot: SnapshotProfileTypeSchema,
    ): { exprs: Map<string, string>; imports: Map<string, Set<string>> } {
        const exprs = new Map<string, string>();
        const imports = new Map<string, Set<string>>();
        if (this.terminologyCodeIndex.size === 0) return { exprs, imports };
        for (const [name, field] of Object.entries(snapshot.fields)) {
            const link = this.linkFieldEnum(tsIndex, field);
            if (!link) continue;
            exprs.set(name, link.expr);
            for (const [dir, symbols] of link.imports) {
                const merged = imports.get(dir) ?? new Set<string>();
                for (const symbol of symbols) merged.add(symbol);
                imports.set(dir, merged);
            }
        }
        return { exprs, imports };
    }

    generateTerminologyModule(packageDir: string) {
        const allocatedEntries = this.terminologyModules.get(packageDir) ?? [];

        this.cat("terminology.ts", () => {
            this.generateDisclaimer();
            const anyCoded = allocatedEntries.some(({ entry }) => "codes" in entry);
            const typeImports = anyCoded ? ["TerminologyEntry", "CodedTerminologyEntry"] : ["TerminologyEntry"];
            this.tsImport("../terminology-types", ...typeImports, { typeOnly: true });
            this.line();
            allocatedEntries.forEach(({ entry, symbol }, index) => {
                const coded = "codes" in entry;
                const codeName = symbol.endsWith("CodeSystem")
                    ? symbol.replace(CODE_SYSTEM_SUFFIX_RE, "Code")
                    : `${symbol}Code`;
                if (coded) {
                    const union = entry.codes.map((code) => JSON.stringify(code)).join(" | ") || "never";
                    this.lineSM(`export type ${codeName} = ${union}`);
                }
                const satisfiesClause = coded
                    ? ` as const satisfies CodedTerminologyEntry<${codeName}>;`
                    : " as const satisfies TerminologyEntry;";
                this.curlyBlock(["export", "const", symbol, "="], () => {
                    this.line(`canonicalUrl: ${JSON.stringify(entry.canonicalUrl)},`);
                    this.line(`packageId: ${JSON.stringify(entry.packageId)},`);
                    this.line(`packageVersion: ${JSON.stringify(entry.packageVersion)},`);
                    this.line(`verification: ${JSON.stringify(entry.verification)},`);
                    this.line(`resourceType: ${JSON.stringify(entry.resourceType)},`);
                    if ("contentMode" in entry && entry.contentMode !== undefined)
                        this.line(`contentMode: ${JSON.stringify(entry.contentMode)},`);
                    if (coded) {
                        this.line(`codes: [${entry.codes.map((code) => JSON.stringify(code)).join(", ")}],`);
                        this.curlyBlock(["displays:"], () => {
                            for (const code of entry.codes) {
                                const display = entry.displays[code];
                                if (display === undefined) continue;
                                this.line(`${tsObjectKey(code)}: ${JSON.stringify(display)},`);
                            }
                        }, [","]);
                    }
                }, [satisfiesClause]);
                if (index < allocatedEntries.length - 1) this.line();
            });
        });
    }

    override async generate(tsIndex: TypeSchemaIndex) {
        // Only generate code for schemas from focused packages
        const typesToGenerate = [
            ...tsIndex.collectComplexTypes(),
            ...tsIndex.collectResources(),
            ...tsIndex.collectLogicalModels(),
            ...(this.opts.generateProfile ? tsIndex.collectSnapshotProfiles() : []),
        ];
        const terminologyPackages = this.opts.terminology?.packages;
        const terminology = this.opts.terminology?.enabled
            ? (tsIndex.register?.allTerminology() ?? []).filter(
                  ({ packageMeta: pkg, resources }) =>
                      resources.length > 0 &&
                      (terminologyPackages === undefined || terminologyPackages.includes(packageMetaToNpm(pkg))),
              )
            : [];
        const logicalUnits = new Map<
            string,
            { packageMeta: PackageMeta; packageSchemas: TypeSchema[]; terminology?: PackageTerminology }
        >();
        for (const schema of typesToGenerate) {
            const pkg = packageMeta(schema);
            const identity = packageMetaToNpm(pkg);
            const unit = logicalUnits.get(identity) ?? { packageMeta: pkg, packageSchemas: [] };
            unit.packageSchemas.push(schema);
            logicalUnits.set(identity, unit);
        }
        for (const packageTerminology of terminology) {
            const identity = packageMetaToNpm(packageTerminology.packageMeta);
            const unit = logicalUnits.get(identity) ?? {
                packageMeta: packageTerminology.packageMeta,
                packageSchemas: [],
            };
            unit.terminology = packageTerminology;
            logicalUnits.set(identity, unit);
        }

        const identitiesByPackageName = new Map<string, string[]>();
        for (const [identity, { packageMeta: pkg }] of logicalUnits) {
            const identities = identitiesByPackageName.get(pkg.name) ?? [];
            identities.push(identity);
            identitiesByPackageName.set(pkg.name, identities);
        }

        const unitsByBaseDir = new Map<
            string,
            { identity: string; packageSchemas: TypeSchema[]; terminology?: PackageTerminology }[]
        >();
        for (const [identity, { packageMeta: pkg, packageSchemas, terminology: packageTerminology }] of logicalUnits) {
            const directorySource =
                (identitiesByPackageName.get(pkg.name)?.length ?? 0) > 1 ? packageMetaToNpm(pkg) : pkg.name;
            const baseDir = safePackageDir(directorySource);
            const units = unitsByBaseDir.get(baseDir) ?? [];
            const schemasByIdentity = new Map(
                packageSchemas.map((schema) => [JSON.stringify(schema.identifier), schema]),
            );
            const sortedSchemas = [...schemasByIdentity.values()].sort((left, right) =>
                left.identifier.name.localeCompare(right.identifier.name),
            );
            units.push({ identity, packageSchemas: sortedSchemas, terminology: packageTerminology });
            unitsByBaseDir.set(baseDir, units);
        }

        const generationUnits = new Map<string, { packageSchemas: TypeSchema[]; terminology?: PackageTerminology }>();
        const usedPackageDirs = new Set<string>();
        for (const [baseDir, units] of unitsByBaseDir) {
            if (units.length !== 1) continue;
            const unit = units[0];
            if (!unit) continue;
            generationUnits.set(baseDir, unit);
            usedPackageDirs.add(baseDir);
        }
        for (const [baseDir, units] of [...unitsByBaseDir].sort(([left], [right]) => left.localeCompare(right))) {
            if (units.length < 2) continue;
            let suffix = 1;
            for (const unit of units.sort((left, right) => left.identity.localeCompare(right.identity))) {
                let packageDir = `${baseDir}--${suffix}`;
                while (usedPackageDirs.has(packageDir)) {
                    suffix += 1;
                    packageDir = `${baseDir}--${suffix}`;
                }
                generationUnits.set(packageDir, unit);
                usedPackageDirs.add(packageDir);
                suffix += 1;
            }
        }
        this.packageDirectories = new Map(
            [...generationUnits].flatMap(([packageDir, unit]) => {
                if (unit.terminology) {
                    return [[packageMetaToNpm(unit.terminology.packageMeta), packageDir] as const];
                }
                const schema = unit.packageSchemas[0];
                return schema ? [[packageMetaToNpm(packageMeta(schema)), packageDir] as const] : [];
            }),
        );

        const hasProfiles = this.opts.generateProfile && typesToGenerate.some(isSnapshotProfileTypeSchema);

        this.prepareTerminology(generationUnits);

        this.cd("/", () => {
            if (hasProfiles) {
                this.cp("profile-helpers.ts", "profile-helpers.ts");
            }
            if (terminology.length > 0) {
                const codeSystemSchema = typesToGenerate.find(
                    (schema) => schema.identifier.url === "http://hl7.org/fhir/StructureDefinition/CodeSystem",
                );
                this.generateTerminologyTypes(
                    codeSystemSchema ? `./${this.packageDir(codeSystemSchema.identifier)}/CodeSystem` : undefined,
                );
            }

            for (const [packageDir, { packageSchemas, terminology }] of [...generationUnits].sort(([left], [right]) =>
                left.localeCompare(right),
            )) {
                this.cd(packageDir, () => {
                    for (const schema of packageSchemas) {
                        this.generateResourceModule(tsIndex, schema);
                    }
                    generateProfileIndexFile(this, tsIndex, packageSchemas.filter(isSnapshotProfileTypeSchema));
                    if (terminology) this.generateTerminologyModule(packageDir);
                    this.generateFhirPackageIndexFile(packageSchemas, terminology !== undefined);
                });
            }
        });
    }
}
