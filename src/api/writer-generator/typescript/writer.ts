import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { pascalCase, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import type { PackageTerminology, TerminologyConcept, TerminologyResource } from "@root/typeschema/register";
import {
    type CanonicalUrl,
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
    type SpecializationTypeSchema,
    type TypeIdentifier,
    type TypeSchema,
} from "@root/typeschema/types";
import { groupByPackages, type TypeSchemaIndex } from "@root/typeschema/utils";
import { resolveGeneratorAsset } from "../assets";
import {
    tsFieldName,
    tsModuleFileName,
    tsModuleName,
    tsNameFromCanonical,
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
    extensionGetterDefault?: "flat" | "profile" | "raw";
    sliceGetterDefault?: "flat" | "raw";
    terminology?: {
        /** Emit one terminology module for every resolved package. Defaults to false. */
        enabled?: boolean;
        /** Optional map of `name@version` package refs to a closure verification state. */
        packageVerification?: Record<string, string>;
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

const safeTsPackageDir = (source: string): string => {
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
        const localIdentity = resource.id ?? tsNameFromCanonical(resource.url) ?? "Resource";
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

const flattenConcepts = (concepts: TerminologyConcept[] | undefined): TerminologyConcept[] => {
    const flattened: TerminologyConcept[] = [];
    const stack = [...(concepts ?? [])].reverse();
    while (stack.length > 0) {
        const concept = stack.pop();
        if (!concept) continue;
        flattened.push(concept);
        if (concept.concept) {
            for (let index = concept.concept.length - 1; index >= 0; index -= 1) {
                const nested = concept.concept[index];
                if (nested) stack.push(nested);
            }
        }
    }
    return flattened;
};

export class TypeScript extends Writer<TypeScriptOptions> {
    private packageDirectories = new Map<string, string>();

    constructor(options: TypeScriptOptions) {
        super({ lineWidth: 120, ...options, resolveAssets: options.resolveAssets ?? resolveTsAssets });
    }

    packageDirectory(physical: PackageMeta | TypeIdentifier): string {
        const pkg = "package" in physical ? { name: physical.package, version: physical.version } : physical;
        return this.packageDirectories.get(packageMetaToNpm(pkg)) ?? safeTsPackageDir(pkg.name);
    }

    modulePath(identifier: TypeIdentifier): string {
        return `${this.packageDirectory(identifier)}/${tsModuleName(identifier)}`;
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
        const singleLine = `${keyword} { ${entities.join(", ")} } from "${tsPackageName}"`;
        if (singleLine.length <= (this.opts.lineWidth ?? 120)) {
            this.lineSM(singleLine);
        } else {
            this.curlyBlock([keyword], () => {
                for (const entity of entities) {
                    this.line(`${entity},`);
                }
            }, [` from "${tsPackageName}";`]);
        }
    }

    generateFhirPackageIndexFile(schemas: TypeSchema[], hasTerminology = false) {
        this.cat("index.ts", () => {
            if (hasTerminology) this.lineSM(`export * from "./terminology"`);
            const profiles = schemas.filter(isSnapshotProfileTypeSchema);
            if (profiles.length > 0) {
                this.lineSM(`export * from "./profiles"`);
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
                if (exp.typeExports.length > 0) {
                    this.lineSM(`export type { ${exp.typeExports.join(", ")} } from "./${exp.tsPackageName}"`);
                }
                if (exp.valueExports.length > 0) {
                    this.lineSM(`export { ${exp.valueExports.join(", ")} } from "./${exp.tsPackageName}"`);
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
                this.lineSM(`export type { ${tsResourceName(dep)} } from "${`../${this.modulePath(dep)}`}"`);
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

    generateTerminologyModule(packageTerminology: PackageTerminology) {
        const { packageMeta: pkg, resources } = packageTerminology;
        const verification = this.opts.terminology?.packageVerification?.[packageMetaToNpm(pkg)] ?? "not-recorded";
        const resourcesByCanonical = new Map<string, TerminologyResource[]>();
        for (const resource of resources) {
            const key = `${resource.resourceType}\u0000${resource.url}`;
            const matching = resourcesByCanonical.get(key) ?? [];
            matching.push(resource);
            resourcesByCanonical.set(key, matching);
        }
        const duplicate = [...resourcesByCanonical]
            .filter(([, matching]) => matching.length > 1)
            .sort(([left], [right]) => left.localeCompare(right))[0];
        if (duplicate) {
            const resource = duplicate[1][0];
            if (!resource) throw new Error(`Duplicate terminology resource has no representative`);
            const identities = duplicate[1]
                .map((candidate) => candidate.id ?? candidate.name ?? candidate.url)
                .sort((left, right) => left.localeCompare(right));
            throw new Error(
                `Package ${packageMetaToNpm(pkg)} contains duplicate ${resource.resourceType} canonical URL ${JSON.stringify(resource.url)} for resources ${identities.join(", ")}`,
            );
        }
        const sortedResources = resources.slice().sort((left, right) => {
            if (left.resourceType !== right.resourceType) return left.resourceType.localeCompare(right.resourceType);
            const symbolOrder = terminologySymbolName(left).localeCompare(terminologySymbolName(right));
            if (symbolOrder !== 0) return symbolOrder;
            const canonicalOrder = left.url.localeCompare(right.url);
            if (canonicalOrder !== 0) return canonicalOrder;
            return terminologyResourceIdentity(left).localeCompare(terminologyResourceIdentity(right));
        });
        const allocatedResources = allocateTerminologySymbols(sortedResources);

        this.cat("terminology.ts", () => {
            this.generateDisclaimer();
            allocatedResources.forEach(({ resource, symbol }, index) => {
                const concepts = flattenConcepts(resource.concept);
                const emitsConcepts =
                    resource.resourceType === "CodeSystem" &&
                    resource.content === "complete" &&
                    verification !== "unverifiable";
                if (emitsConcepts) {
                    const seenCodes = new Set<string>();
                    for (const concept of concepts) {
                        if (seenCodes.has(concept.code))
                            throw new Error(`CodeSystem ${resource.url} repeats code ${JSON.stringify(concept.code)}`);
                        seenCodes.add(concept.code);
                    }
                }

                this.curlyBlock(["export", "const", symbol, "="], () => {
                    this.line(`canonicalUrl: ${JSON.stringify(resource.url)},`);
                    this.line(`packageId: ${JSON.stringify(pkg.name)},`);
                    this.line(`packageVersion: ${JSON.stringify(pkg.version)},`);
                    this.line(`verification: ${JSON.stringify(verification)},`);
                    this.line(`resourceType: ${JSON.stringify(resource.resourceType)},`);
                    this.line(
                        `contentMode: ${resource.content === undefined ? "null" : JSON.stringify(resource.content)},`,
                    );
                    if (emitsConcepts) {
                        this.line(`codes: [${concepts.map(({ code }) => JSON.stringify(code)).join(", ")}],`);
                        this.curlyBlock(["displays:"], () => {
                            for (const concept of concepts) {
                                if (concept.display !== undefined)
                                    this.line(`[${JSON.stringify(concept.code)}]: ${JSON.stringify(concept.display)},`);
                            }
                        }, [","]);
                    }
                }, [" as const;"]);
                if (emitsConcepts)
                    this.lineSM(
                        `export type ${symbol.replace(CODE_SYSTEM_SUFFIX_RE, "Code")} = (typeof ${symbol}.codes)[number]`,
                    );
                if (index < allocatedResources.length - 1) this.line();
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
        const terminology = this.opts.terminology?.enabled
            ? (tsIndex.register?.allTerminology() ?? []).filter(({ resources }) => resources.length > 0)
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
            const baseDir = safeTsPackageDir(directorySource);
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

        this.cd("/", () => {
            if (hasProfiles) {
                this.cp("profile-helpers.ts", "profile-helpers.ts");
            }

            for (const [packageDir, { packageSchemas, terminology }] of [...generationUnits].sort(([left], [right]) =>
                left.localeCompare(right),
            )) {
                this.cd(packageDir, () => {
                    for (const schema of packageSchemas) {
                        this.generateResourceModule(tsIndex, schema);
                    }
                    generateProfileIndexFile(this, tsIndex, packageSchemas.filter(isSnapshotProfileTypeSchema));
                    if (terminology) this.generateTerminologyModule(terminology);
                    this.generateFhirPackageIndexFile(packageSchemas, terminology !== undefined);
                });
            }
        });
    }
}
