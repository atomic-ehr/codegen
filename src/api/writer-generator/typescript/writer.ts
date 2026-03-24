import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import {
    type CanonicalUrl,
    isChoiceDeclarationField,
    isComplexTypeIdentifier,
    isLogicalTypeSchema,
    isPrimitiveIdentifier,
    isProfileTypeSchema,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type NestedTypeSchema,
    packageMeta,
    packageMetaToFhir,
    type SpecializationTypeSchema,
    type TypeSchema,
} from "@root/typeschema/types";
import { groupByPackages, type TypeSchemaIndex } from "@root/typeschema/utils";
import {
    tsFieldName,
    tsModuleFileName,
    tsModuleName,
    tsModulePath,
    tsNameFromCanonical,
    tsPackageDir,
    tsProfileModuleFileName,
    tsResourceName,
} from "./name";
import { generateProfileClass, generateProfileImports, generateProfileIndexFile } from "./profile";
import { resolveFieldTsType } from "./utils";

export const resolveTsAssets = (fn: string) => {
    const __dirname = Path.dirname(fileURLToPath(import.meta.url));
    const __filename = fileURLToPath(import.meta.url);
    if (__filename.endsWith("dist/index.js")) {
        return Path.resolve(__dirname, "..", "assets", "api", "writer-generator", "typescript", fn);
    }
    return Path.resolve(__dirname, "../../../..", "assets", "api", "writer-generator", "typescript", fn);
};

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
} & WriterOptions;

export class TypeScript extends Writer<TypeScriptOptions> {
    constructor(options: TypeScriptOptions) {
        super({ lineWidth: 120, ...options, resolveAssets: options.resolveAssets ?? resolveTsAssets });
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

    generateFhirPackageIndexFile(schemas: TypeSchema[]) {
        this.cat("index.ts", () => {
            const profiles = schemas.filter(isProfileTypeSchema);
            if (profiles.length > 0) {
                this.lineSM(`export * from "./profiles"`);
            }

            let exports = schemas
                .flatMap((schema) => {
                    const resourceName = tsResourceName(schema.identifier);
                    const typeExports = isProfileTypeSchema(schema)
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
                        tsPackage: `${importPrefix}${tsModulePath(dep)}`,
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

                this.tsImport(`${importPrefix}${tsModulePath(element.identifier)}`, "Element", { typeOnly: true });
            }
        }
    }

    generateComplexTypeReexports(schema: SpecializationTypeSchema) {
        const complexTypeDeps = schema.dependencies?.filter(isComplexTypeIdentifier);
        if (complexTypeDeps && complexTypeDeps.length > 0) {
            for (const dep of complexTypeDeps) {
                this.debugComment(dep);
                this.lineSM(`export type { ${tsResourceName(dep)} } from "${`../${tsModulePath(dep)}`}"`);
            }
            this.line();
        }
    }

    addFieldExtension(fieldName: string, isArray: boolean): void {
        const extFieldName = tsFieldName(`_${fieldName}`);
        const typeExpr = isArray ? "(Element | null)[]" : "Element";
        this.lineSM(`${extFieldName}?: ${typeExpr}`);
    }

    generateType(tsIndex: TypeSchemaIndex, schema: SpecializationTypeSchema | NestedTypeSchema) {
        let name: string;
        // Generic types: Reference, Coding, CodeableConcept
        const genericTypes = ["Reference", "Coding", "CodeableConcept"];
        if (genericTypes.includes(schema.identifier.name)) {
            name = `${schema.identifier.name}<T extends string = string>`;
        } else {
            name = tsResourceName(schema.identifier);
        }

        // Collect fields whose type is a resource type family (has children)
        const typeFamilyFields: { fieldName: string; familyTypeName: string }[] = [];
        for (const [fieldName, field] of Object.entries(schema.fields ?? {})) {
            if (isChoiceDeclarationField(field) || !field.type) continue;
            const fieldTypeSchema = tsIndex.resolveType(field.type);
            if (
                isSpecializationTypeSchema(fieldTypeSchema) &&
                (fieldTypeSchema.typeFamily?.resources?.length ?? 0) > 0
            ) {
                typeFamilyFields.push({ fieldName: tsFieldName(fieldName), familyTypeName: field.type.name });
            }
        }

        // Build generic params from type-family fields
        const genericFieldMap: Record<string, string> = {};
        if (!genericTypes.includes(schema.identifier.name) && typeFamilyFields.length > 0) {
            const [first, ...rest] = typeFamilyFields;
            if (first && rest.length === 0) {
                genericFieldMap[first.fieldName] = "T";
                name += `<T extends ${first.familyTypeName} = ${first.familyTypeName}>`;
            } else {
                const params = typeFamilyFields.map((tf) => {
                    const paramName = `T${uppercaseFirstLetter(tf.fieldName)}`;
                    genericFieldMap[tf.fieldName] = paramName;
                    return `${paramName} extends ${tf.familyTypeName} = ${tf.familyTypeName}`;
                });
                name += `<${params.join(", ")}>`;
            }
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
                const tsType = resolveFieldTsType(schema.identifier.name, tsName, field, undefined, genericFieldMap);
                const optionalSymbol = field.required ? "" : "?";
                const arraySymbol = field.array ? "[]" : "";
                this.lineSM(`${tsName}${optionalSymbol}: ${tsType}${arraySymbol}`);

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

    generateNestedTypes(tsIndex: TypeSchemaIndex, schema: SpecializationTypeSchema) {
        if (schema.nested) {
            for (const subtype of schema.nested) {
                this.generateType(tsIndex, subtype);
                this.line();
            }
        }
    }

    generateResourceModule(tsIndex: TypeSchemaIndex, schema: TypeSchema) {
        if (isProfileTypeSchema(schema)) {
            this.cd("profiles", () => {
                this.cat(`${tsProfileModuleFileName(tsIndex, schema)}`, () => {
                    this.generateDisclaimer();
                    const flatProfile = tsIndex.flatProfile(schema);
                    generateProfileImports(this, tsIndex, flatProfile);
                    generateProfileClass(this, tsIndex, flatProfile);
                });
            });
        } else if (isSpecializationTypeSchema(schema)) {
            this.cat(`${tsModuleFileName(schema.identifier)}`, () => {
                this.generateDisclaimer();
                this.generateDependenciesImports(tsIndex, schema);
                this.generateComplexTypeReexports(schema);
                this.generateNestedTypes(tsIndex, schema);
                this.comment(
                    "CanonicalURL:",
                    schema.identifier.url,
                    `(pkg: ${packageMetaToFhir(packageMeta(schema))})`,
                );
                this.generateType(tsIndex, schema);
                this.generateResourceTypePredicate(schema);
            });
        } else {
            throw new Error(`Profile generation not implemented for kind: ${schema.identifier.kind}`);
        }
    }

    override async generate(tsIndex: TypeSchemaIndex) {
        // Only generate code for schemas from focused packages
        const typesToGenerate = [
            ...tsIndex.collectComplexTypes(),
            ...tsIndex.collectResources(),
            ...tsIndex.collectLogicalModels(),
            ...(this.opts.generateProfile ? tsIndex.collectProfiles() : []),
        ];
        const grouped = groupByPackages(typesToGenerate);

        const hasProfiles = this.opts.generateProfile && typesToGenerate.some(isProfileTypeSchema);

        this.cd("/", () => {
            if (hasProfiles) {
                this.cp("profile-helpers.ts", "profile-helpers.ts");
            }

            for (const [packageName, packageSchemas] of Object.entries(grouped)) {
                const packageDir = tsPackageDir(packageName);
                this.cd(packageDir, () => {
                    for (const schema of packageSchemas) {
                        this.generateResourceModule(tsIndex, schema);
                    }
                    generateProfileIndexFile(this, tsIndex, packageSchemas.filter(isProfileTypeSchema));
                    this.generateFhirPackageIndexFile(packageSchemas);
                });
            }
        });
    }
}
