import {
    kebabCase,
    pascalCase,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import type { Identifier, Name, TypeSchema } from "@root/typeschema";
import {
    isFhirSchemaBased,
    isNestedIdentifier,
    isNotChoiceDeclarationField,
    isProfileTypeSchema,
    isSpecializationTypeSchema,
    type ProfileTypeSchema,
    type RegularField,
    type RegularTypeSchema,
} from "@root/typeschema/types";
import {
    collectComplexTypes,
    collectResources,
    groupByPackages,
    mkTypeSchemaIndex,
    type TypeSchemaIndex,
} from "@root/typeschema/utils";

const primitiveType2tsType: Record<string, string> = {
    boolean: "boolean",
    instant: "string",
    time: "string",
    date: "string",
    dateTime: "string",

    decimal: "number",
    integer: "number",
    unsignedInt: "number",
    positiveInt: "number",
    integer64: "number",
    base64Binary: "string",

    uri: "string",
    url: "string",
    canonical: "string",
    oid: "string",
    uuid: "string",

    string: "string",
    code: "string",
    markdown: "string",
    id: "string",
    xhtml: "string",
};

const tsFhirPackageDir = (name: string): string => {
    return kebabCase(name);
};

const tsModuleName = (id: Identifier): string => {
    if (id.kind === "profile") return `${tsResourceName(id)}_profile`;
    return pascalCase(id.name);
};

const tsModuleFileName = (id: Identifier): string => {
    return `${tsModuleName(id)}.ts`;
};

const canonicalToName = (canonical: string | undefined, dropFragment = true) => {
    if (!canonical) return undefined;
    let localName = canonical.split("/").pop();
    if (!localName) return undefined;
    if (dropFragment && localName.includes("#")) {
        localName = localName.split("#")[0];
    }
    if (!localName) return undefined;
    if (/^\d/.test(localName)) {
        localName = `number_${localName}`;
    }
    return normalizeTsName(localName);
};

const tsResourceName = (id: Identifier): string => {
    // if (id.kind === "constraint") return pascalCase(canonicalToName(id.url) ?? "");
    if (id.kind === "nested") {
        const url = id.url;
        const path = canonicalToName(url, false);
        if (!path) return "";
        const [resourceName, fragment] = path.split("#");
        const name = uppercaseFirstLetterOfEach((fragment ?? "").split(".")).join("");
        return normalizeTsName([resourceName, name].join(""));
    }
    return normalizeTsName(id.name);
};

const tsFieldName = (n: string): string => normalizeTsName(n);

const normalizeTsName = (n: string): string => {
    // if (n === "extends") return "extends_";
    return n.replace(/[- ]/g, "_");
};

export type TypeScriptOptions = {} & WriterOptions;

export class TypeScript extends Writer {
    tsIndex: TypeSchemaIndex = mkTypeSchemaIndex([]);

    tsImportType(tsPackageName: string, ...entities: string[]) {
        this.lineSM(`import type { ${entities.join(", ")} } from "${tsPackageName}"`);
    }

    generateFhirPackageIndexFile(schemas: TypeSchema[]) {
        this.cat("index.ts", () => {
            let exports = schemas
                .map((schema) => ({
                    identifier: schema.identifier,
                    tsPackageName: tsModuleName(schema.identifier),
                    resourceName: tsResourceName(schema.identifier),
                }))
                .sort((a, b) => a.resourceName.localeCompare(b.resourceName));

            // FIXME: actually, duplication may means internal error...
            exports = Array.from(new Map(exports.map((exp) => [exp.resourceName.toLowerCase(), exp])).values()).sort(
                (a, b) => a.resourceName.localeCompare(b.resourceName),
            );

            for (const exp of exports) {
                this.debugComment(exp.identifier);
                this.lineSM(`export type { ${exp.resourceName} } from "./${exp.tsPackageName}"`);
            }
        });
    }

    generateDependenciesImports(schema: RegularTypeSchema) {
        if (schema.dependencies) {
            const deps = [
                ...schema.dependencies
                    .filter((dep) => ["complex-type", "resource", "logical"].includes(dep.kind))
                    .map((dep) => ({
                        tsPackage: `../${kebabCase(dep.package)}/${pascalCase(dep.name)}`,
                        name: uppercaseFirstLetter(dep.name),
                    })),
                ...schema.dependencies.filter(isNestedIdentifier).map((dep) => ({
                    tsPackage: `../${kebabCase(dep.package)}/${pascalCase(canonicalToName(dep.url) ?? "")}`,
                    name: tsResourceName(dep),
                })),
            ].sort((a, b) => a.name.localeCompare(b.name));
            for (const dep of deps) {
                this.tsImportType(dep.tsPackage, dep.name);
            }
            this.line();
            // // NOTE: for primitive type extensions
            // const element = this.loader.complexTypes().find((e) => e.identifier.name === "Element");
            // if (
            //     element &&
            //     deps.find((e) => e.name === "Element") === undefined &&
            //     // FIXME: don't import if fields and nested fields don't have primitive types
            //     schema.identifier.name !== "Element"
            // ) {
            //     this.tsImport(`../${kebabCase(element.identifier.package)}/Element`, "Element");
            // }
        }
    }

    generateComplexTypeReexports(schema: RegularTypeSchema) {
        const complexTypeDeps = schema.dependencies
            ?.filter((dep) => ["complex-type"].includes(dep.kind))
            .map((dep) => ({
                tsPackage: `../${kebabCase(dep.package)}/${pascalCase(dep.name)}`,
                name: uppercaseFirstLetter(dep.name),
            }));
        if (complexTypeDeps && complexTypeDeps.length > 0) {
            for (const dep of complexTypeDeps) {
                this.lineSM(`export type { ${dep.name} } from "${dep.tsPackage}"`);
            }
            this.line();
        }
    }

    addFieldExtension(fieldName: string, field: RegularField): void {
        if (field.type.kind === "primitive-type") {
            this.lineSM(`_${tsFieldName(fieldName)}?: Element`);
        }
    }

    generateType(schema: RegularTypeSchema) {
        var name: string;
        if (schema.identifier.name === "Reference") {
            name = "Reference<T extends string = string>";
        } else if (schema.identifier.kind === "nested") {
            name = tsResourceName(schema.identifier);
        } else {
            name = tsResourceName(schema.identifier);
        }

        const parent = canonicalToName(schema.base?.url);
        const extendsClause = parent && `extends ${parent}`;

        this.debugComment(schema.identifier);

        this.curlyBlock(["export", "interface", name, extendsClause], () => {
            if (!schema.fields) return;

            if (schema.identifier.kind === "resource") {
                const possibleResourceTypes: Identifier[] = [schema.identifier];
                possibleResourceTypes.push(...this.tsIndex.resourceChildren(schema.identifier));
                this.lineSM(`resourceType: ${possibleResourceTypes.map((e) => `"${e.name}"`).join(" | ")}`);
                this.line();
            }

            const fields = Object.entries(schema.fields).sort((a, b) => a[0].localeCompare(b[0]));
            for (const [fieldName, field] of fields) {
                if (!isNotChoiceDeclarationField(field)) continue;

                this.debugComment(fieldName, ":", field);

                const tsName = tsFieldName(fieldName);
                const optionalSymbol = field.required ? "" : "?";
                const arraySymbol = field.array ? "[]" : "";

                if (field.type === undefined) continue;

                let tsType = field.type.name as string;

                if (field.type.kind === "nested") {
                    tsType = tsResourceName(field.type);
                }

                if (field.type.kind === "primitive-type") {
                    tsType = (primitiveType2tsType[field.type.name] ?? "string") as Name;
                }

                if (schema.identifier.name === "Reference" && tsName === "reference") {
                    tsType = "`${T}/${string}`";
                }

                if (field.reference?.length) {
                    const references = field.reference.map((ref) => `"${ref.name}"`).join(" | ");
                    tsType = `Reference<${references}>`;
                }

                if (field.enum) {
                    tsType = field.enum.map((e) => `"${e}"`).join(" | ");
                }

                this.lineSM(`${tsName}${optionalSymbol}:`, `${tsType}${arraySymbol}`);

                if (["resource", "complex-type"].includes(schema.identifier.kind)) {
                    this.addFieldExtension(fieldName, field);
                }
            }
        });
    }

    generateNestedTypes(schema: RegularTypeSchema) {
        if (schema.nested) {
            for (const subtype of schema.nested) {
                this.generateType(subtype);
            }
        }
    }

    generateProfileType(schema: ProfileTypeSchema) {
        const name = tsResourceName(schema.identifier);
        this.debugComment(schema.identifier);
        this.curlyBlock(["export", "interface", name], () => {
            this.lineSM(`__profileUrl: "${schema.identifier.url}"`);
            this.line();

            if (!isFhirSchemaBased(schema)) return;
            for (const [fieldName, field] of Object.entries(schema.fields ?? {})) {
                if (!isNotChoiceDeclarationField(field)) continue;
                this.debugComment(fieldName, field);

                const tsName = tsFieldName(fieldName);

                let tsType: string;
                if (field.type.kind === "nested") {
                    tsType = tsResourceName(field.type);
                } else if (field.enum) {
                    tsType = field.enum.map((e) => `'${e}'`).join(" | ");
                } else if (field.reference && field.reference.length > 0) {
                    const specializationId = this.tsIndex.findLastSpecialization(schema.identifier);
                    const specialization = this.tsIndex.resolve(specializationId);
                    if (specialization === undefined || !isSpecializationTypeSchema(specialization))
                        throw new Error(`Invalid specialization for ${schema.identifier}`);

                    const sField = specialization.fields?.[fieldName];
                    if (sField === undefined || !isNotChoiceDeclarationField(sField))
                        throw new Error(`Invalid field declaration for ${fieldName}`);

                    const sRefs = (sField.reference ?? []).map((e) => e.name);
                    const references = field.reference
                        .map((ref) => {
                            const resRef = this.tsIndex.findLastSpecialization(ref);
                            if (resRef.name !== ref.name) {
                                return `"${resRef.name}" /*${ref.name}*/`;
                            }
                            return `'${ref.name}'`;
                        })
                        .join(" | ");
                    if (sRefs.length === 1 && sRefs[0] === "Resource" && references !== '"Resource"') {
                        // FIXME: should be generilized to type families
                        tsType = `Reference<"Resource" /* ${references} */ >`;
                    } else {
                        tsType = `Reference<${references}>`;
                    }
                } else {
                    tsType = primitiveType2tsType[field.type.name] ?? field.type.name;
                }

                this.lineSM(`${tsName}${!field.required ? "?" : ""}: ${tsType}${field.array ? "[]" : ""}`);
            }
        });

        this.line();
    }

    generateResourceModule(schema: TypeSchema) {
        this.cat(`${tsModuleFileName(schema.identifier)}`, () => {
            this.generateDisclaimer();

            if (["complex-type", "resource", "logical", "nested"].includes(schema.identifier.kind)) {
                this.generateDependenciesImports(schema);
                this.generateComplexTypeReexports(schema);
                this.generateNestedTypes(schema);
                this.generateType(schema);
            } else if (isProfileTypeSchema(schema)) {
                const flatProfile = this.tsIndex.flatProfile(schema);
                this.debugComment(flatProfile.dependencies);
                this.generateDependenciesImports(flatProfile);
                this.generateProfileType(flatProfile);
                // this.generateAttachProfile(flatProfile);
                // this.line();
                // this.generateExtractProfile(flatProfile);
            } else {
                throw new Error(`Profile generation not implemented for kind: ${schema.identifier.kind}`);
            }
        });
    }

    override generate(schemas: TypeSchema[]) {
        const typesToGenerate = [
            ...collectComplexTypes(schemas),
            ...collectResources(schemas),
            // ...collectLogicalModels(schemas),
            // ...collectProfiles(schemas),
        ];
        this.tsIndex = mkTypeSchemaIndex(typesToGenerate);
        const grouped = groupByPackages(typesToGenerate);

        this.cd("/", () => {
            for (const [packageName, packageSchemas] of Object.entries(grouped)) {
                const tsPackageDir = tsFhirPackageDir(packageName);
                this.cd(tsPackageDir, () => {
                    for (const schema of packageSchemas) {
                        this.generateResourceModule(schema);
                    }
                    this.generateFhirPackageIndexFile(packageSchemas);
                });
            }
        });
    }
}
