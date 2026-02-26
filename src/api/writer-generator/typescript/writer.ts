import { uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import {
    type CanonicalUrl,
    isChoiceDeclarationField,
    isComplexTypeIdentifier,
    isLogicalTypeSchema,
    isNestedIdentifier,
    isPrimitiveIdentifier,
    isProfileTypeSchema,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type Name,
    packageMeta,
    packageMetaToFhir,
    type RegularTypeSchema,
    type TypeSchema,
} from "@root/typeschema/types";
import { groupByPackages, type TypeSchemaIndex } from "@root/typeschema/utils";
import {
    canonicalToName,
    tsFhirPackageDir,
    tsFieldName,
    tsModuleFileName,
    tsModuleName,
    tsModulePath,
    tsProfileModuleFileName,
    tsResourceName,
} from "./name";
import {
    generateProfileClass,
    generateProfileHelpersModule,
    generateProfileImports,
    generateProfileIndexFile,
    generateProfileOverrideInterface,
} from "./profile";
import { resolveFieldTsType } from "./utils";

export type TypeScriptOptions = {
    /** openResourceTypeSet -- for resource families (Resource, DomainResource) use open set for resourceType field.
     *
     * - when openResourceTypeSet is false: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" }`
     * - when openResourceTypeSet is true: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" | string }`
     */
    openResourceTypeSet: boolean;
    primitiveTypeExtension: boolean;
} & WriterOptions;

export class TypeScript extends Writer<TypeScriptOptions> {
    tsImportType(tsPackageName: string, ...entities: string[]) {
        this.lineSM(`import type { ${entities.join(", ")} } from "${tsPackageName}"`);
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

    generateDependenciesImports(tsIndex: TypeSchemaIndex, schema: RegularTypeSchema, importPrefix = "../") {
        if (schema.dependencies) {
            const imports = [];
            const skipped = [];
            for (const dep of schema.dependencies) {
                if (["complex-type", "resource", "logical"].includes(dep.kind)) {
                    imports.push({
                        tsPackage: `${importPrefix}${tsModulePath(dep)}`,
                        name: uppercaseFirstLetter(dep.name),
                        dep: dep,
                    });
                } else if (isNestedIdentifier(dep)) {
                    const ndep = { ...dep };
                    ndep.name = canonicalToName(dep.url) as Name;
                    imports.push({
                        tsPackage: `${importPrefix}${tsModulePath(ndep)}`,
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
                this.tsImportType(dep.tsPackage, dep.name);
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

                this.tsImportType(`${importPrefix}${tsModulePath(element.identifier)}`, "Element");
            }
        }
    }

    generateComplexTypeReexports(schema: RegularTypeSchema) {
        const complexTypeDeps = schema.dependencies?.filter(isComplexTypeIdentifier).map((dep) => ({
            tsPackage: `../${tsModulePath(dep)}`,
            name: uppercaseFirstLetter(dep.name),
        }));
        if (complexTypeDeps && complexTypeDeps.length > 0) {
            for (const dep of complexTypeDeps) {
                this.lineSM(`export type { ${dep.name} } from "${dep.tsPackage}"`);
            }
            this.line();
        }
    }

    addFieldExtension(fieldName: string, isArray: boolean): void {
        const extFieldName = tsFieldName(`_${fieldName}`);
        const typeExpr = isArray ? "(Element | null)[]" : "Element";
        this.lineSM(`${extFieldName}?: ${typeExpr}`);
    }

    generateType(tsIndex: TypeSchemaIndex, schema: RegularTypeSchema) {
        let name: string;
        // Generic types: Reference, Coding, CodeableConcept
        const genericTypes = ["Reference", "Coding", "CodeableConcept"];
        if (genericTypes.includes(schema.identifier.name)) {
            name = `${schema.identifier.name}<T extends string = string>`;
        } else if (schema.identifier.kind === "nested") {
            name = tsResourceName(schema.identifier);
        } else {
            name = tsResourceName(schema.identifier);
        }

        let extendsClause: string | undefined;
        if (schema.base) extendsClause = `extends ${canonicalToName(schema.base.url)}`;

        this.debugComment(schema.identifier);
        if (!schema.fields && !extendsClause && !isResourceTypeSchema(schema)) {
            this.lineSM(`export type ${name} = object`);
            return;
        }
        this.curlyBlock(["export", "interface", name, extendsClause], () => {
            if (isResourceTypeSchema(schema)) {
                const possibleResourceTypes = [schema.identifier];
                possibleResourceTypes.push(...tsIndex.resourceChildren(schema.identifier));
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
                const tsType = resolveFieldTsType(schema.identifier.name, tsName, field);
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

    withPrimitiveTypeExtension(schema: TypeSchema): boolean {
        if (!this.opts.primitiveTypeExtension) return false;
        if (!isSpecializationTypeSchema(schema)) return false;
        for (const field of Object.values(schema.fields ?? {})) {
            if (isChoiceDeclarationField(field)) continue;
            if (isPrimitiveIdentifier(field.type)) return true;
        }
        return false;
    }

    generateResourceTypePredicate(schema: RegularTypeSchema) {
        if (!isResourceTypeSchema(schema)) return;
        const name = tsResourceName(schema.identifier);
        this.curlyBlock(["export", "const", `is${name}`, "=", `(resource: unknown): resource is ${name}`, "=>"], () => {
            this.lineSM(
                `return resource !== null && typeof resource === "object" && (resource as {resourceType: string}).resourceType === "${schema.identifier.name}"`,
            );
        });
    }

    generateNestedTypes(tsIndex: TypeSchemaIndex, schema: RegularTypeSchema) {
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
                    generateProfileOverrideInterface(this, tsIndex, flatProfile);
                    generateProfileClass(this, tsIndex, flatProfile, schema);
                });
            });
        } else if (["complex-type", "resource", "logical"].includes(schema.identifier.kind)) {
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
                generateProfileHelpersModule(this);
            }

            for (const [packageName, packageSchemas] of Object.entries(grouped)) {
                const tsPackageDir = tsFhirPackageDir(packageName);
                this.cd(tsPackageDir, () => {
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
