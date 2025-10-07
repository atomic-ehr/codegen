import {
    kebabCase,
    pascalCase,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import type { Identifier, Name, TypeSchema } from "@root/typeschema";
import type { RegularField, RegularTypeSchema } from "@root/typeschema/types";
import {
    collectComplexTypes,
    collectResources,
    groupByPackages,
    notChoiceDeclaration,
    resourceChildren,
    resourceRelatives,
    type TypeRelation,
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

const canonicalToName = (canonical: string | undefined, dropFragment = true) => {
    if (!canonical) return undefined;
    let localName = canonical.split("/").pop();
    if (dropFragment && localName?.includes("#")) {
        localName = localName.split("#")[0];
    }
    if (/^\d/.test(localName ?? "")) {
        localName = `number_${localName}`;
    }
    return localName?.replace(/[- ]/g, "_");
};

const tsBaseFileName = (id: Identifier): string => {
    // if (id.kind === "constraint") return `${pascalCase(canonicalToName(id.url) ?? "")}_profile`;
    return pascalCase(id.name);
};

const tsFileName = (id: Identifier): string => {
    return `${tsBaseFileName(id)}.ts`;
};

const normalizeName = (n: string): string => {
    if (n === "extends") {
        return "extends_";
    }
    return n.replace(/[- ]/g, "_");
};

const resourceName = (id: Identifier): string => {
    // if (id.kind === "constraint") return pascalCase(canonicalToName(id.url) ?? "");
    return normalizeName(id.name);
};

const deriveNestedSchemaName = (url: string): string => {
    const path = canonicalToName(url, false);
    if (!path) {
        return "";
    }
    const [resourceName, fragment] = path.split("#");
    const name = uppercaseFirstLetterOfEach((fragment ?? "").split(".")).join("");
    return [resourceName, name].join("");
};

export type TypeScriptOptions = {} & WriterOptions;

export class TypeScript extends Writer {
    resourceRelatives: TypeRelation[] = [];

    tsImport(tsPackageName: string, ...entities: string[]) {
        this.lineSM(`import { ${entities.join(", ")} } from '${tsPackageName}'`);
    }

    generateFhirPackageIndexFile(schemas: TypeSchema[]) {
        this.cat("index.ts", () => {
            let exports = schemas
                .map((schema) => ({
                    identifier: schema.identifier,
                    tsPackageName: tsBaseFileName(schema.identifier),
                    resourceName: resourceName(schema.identifier),
                }))
                .sort((a, b) => a.resourceName.localeCompare(b.resourceName));

            // FIXME: actually, duplication means internal error...
            exports = Array.from(new Map(exports.map((exp) => [exp.resourceName.toLowerCase(), exp])).values()).sort(
                (a, b) => a.resourceName.localeCompare(b.resourceName),
            );

            for (const exp of exports) {
                this.debugComment(exp.identifier);
                this.tsImport(`./${exp.tsPackageName}`, exp.resourceName);
            }
            this.lineSM(`export { ${exports.map((e) => e.resourceName).join(", ")} }`);

            this.line("");

            this.curlyBlock(["export type ResourceTypeMap = "], () => {
                this.lineSM("User: Record<string, any>");
                exports.forEach((exp) => {
                    this.debugComment(exp.identifier);
                    this.lineSM(`${exp.resourceName}: ${exp.resourceName}`);
                });
            });
            this.lineSM("export type ResourceType = keyof ResourceTypeMap");

            this.squareBlock(["export const resourceList: readonly ResourceType[] = "], () => {
                exports.forEach((exp) => {
                    this.debugComment(exp.identifier);
                    this.line(`'${exp.resourceName}', `);
                });
            });
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
                ...schema.dependencies
                    .filter((dep) => ["nested"].includes(dep.kind))
                    .map((dep) => ({
                        tsPackage: `../${kebabCase(dep.package)}/${pascalCase(canonicalToName(dep.url) ?? "")}`,
                        name: deriveNestedSchemaName(dep.url),
                    })),
            ].sort((a, b) => a.name.localeCompare(b.name));
            for (const dep of deps) {
                this.tsImport(dep.tsPackage, dep.name);
            }

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

    addFieldExtension(fieldName: string, field: RegularField): void {
        if (field.type.kind === "primitive-type") {
            this.lineSM(`_${normalizeName(fieldName)}?: Element`);
        }
    }

    generateType(schema: RegularTypeSchema) {
        var name: string;
        if (schema.identifier.name === "Reference") {
            name = "Reference<T extends string = string>";
        } else if (schema.identifier.kind === "nested") {
            name = normalizeName(deriveNestedSchemaName(schema.identifier.url));
        } else {
            name = normalizeName(schema.identifier.name);
        }

        const parent = canonicalToName(schema.base?.url);
        const extendsClause = parent && `extends ${parent}`;

        this.debugComment(schema.identifier);

        this.curlyBlock(["export", "interface", name, extendsClause], () => {
            if (!schema.fields) {
                return;
            }

            if (schema.identifier.kind === "resource") {
                const possibleResourceTypes: Identifier[] = [schema.identifier];
                possibleResourceTypes.push(...resourceChildren(this.resourceRelatives, schema.identifier));
                this.lineSM(`resourceType: ${possibleResourceTypes.map((e) => `'${e.name}'`).join(" | ")}`);
                this.line();
            }

            const fields = Object.entries(schema.fields).sort((a, b) => a[0].localeCompare(b[0]));

            for (const [fieldName, anyField] of fields) {
                const field = notChoiceDeclaration(anyField);
                if (field === undefined) continue;

                this.debugComment(fieldName, ":", field);

                const fieldNameFixed = normalizeName(fieldName);
                const optionalSymbol = field.required ? "" : "?";
                const arraySymbol = field.array ? "[]" : "";

                if (field.type === undefined) {
                    continue;
                }
                let type = field.type.name as string;

                if (field.type.kind === "nested") {
                    type = deriveNestedSchemaName(field.type.url);
                }

                if (field.type.kind === "primitive-type") {
                    type = (primitiveType2tsType[field.type.name] ?? "string") as Name;
                }

                if (schema.identifier.name === "Reference" && fieldNameFixed === "reference") {
                    type = "`${T}/${string}`";
                }

                if (field.reference?.length) {
                    const references = field.reference.map((ref) => `'${ref.name}'`).join(" | ");
                    type = `Reference<${references}>`;
                }

                if (field.enum) {
                    type = field.enum.map((e) => `'${e}'`).join(" | ");
                }

                this.lineSM(`${fieldNameFixed}${optionalSymbol}:`, `${type}${arraySymbol}`);

                if (["resource", "complex-type"].includes(schema.identifier.kind)) {
                    this.addFieldExtension(fieldName, field);
                }
            }
        });

        this.line();
    }

    generateNestedTypes(schema: RegularTypeSchema) {
        if (schema.nested) {
            this.line();
            for (const subtype of schema.nested) {
                this.generateType(subtype);
            }
        }
    }

    generateResourceModule(schema: TypeSchema) {
        this.cat(`${tsFileName(schema.identifier)}`, () => {
            this.generateDisclaimer();

            if (["complex-type", "resource", "logical", "nested"].includes(schema.identifier.kind)) {
                this.generateDependenciesImports(schema);
                this.line();
                this.generateNestedTypes(schema);
                this.generateType(schema);
                // } else if (schema.identifier.kind === 'constraint') {
                //     this.generateProfile(schema);
            } else {
                throw new Error(`Profile generation not implemented for kind: ${schema.identifier.kind}`);
            }
        });
    }

    override generate(schemas: TypeSchema[]) {
        this.resourceRelatives = resourceRelatives(schemas);

        const typesToGenerate = [
            ...collectComplexTypes(schemas),
            ...collectResources(schemas),
            // ...collectLogicalModels(typeSchemas),
            // ...collectProfiles(typeSchemas),
        ];
        const grouped = groupByPackages(typesToGenerate);

        this.cd("/", () => {
            for (const [packageName, packageSchemas] of Object.entries(grouped)) {
                const tsPackageName = kebabCase(packageName);
                this.cd(tsPackageName, () => {
                    for (const schema of packageSchemas) {
                        this.generateResourceModule(schema);
                    }
                    this.generateFhirPackageIndexFile(packageSchemas);
                });
            }
        });
    }
}
