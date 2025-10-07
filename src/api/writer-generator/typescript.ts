import { kebabCase, pascalCase } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import type { Identifier, TypeSchema } from "@root/typeschema";

const collectComplexTypes = (tss: TypeSchema[]) => tss.filter((t) => t.identifier.kind === "complex-type");
const collectResources = (tss: TypeSchema[]) => tss.filter((t) => t.identifier.kind === "resource");
const _collectLogicalModels = (tss: TypeSchema[]) => tss.filter((t) => t.identifier.kind === "logical");
const _collectProfiles = (tss: TypeSchema[]) => tss.filter((t) => t.identifier.kind === "profile");

const groupByPackages = (typeSchemas: TypeSchema[]) => {
    const grouped = {} as Record<string, TypeSchema[]>;
    for (const ts of typeSchemas) {
        const packageName = ts.identifier.package;
        if (!grouped[packageName]) {
            grouped[packageName] = [];
        }
        grouped[packageName].push(ts);
    }
    for (const [_packageName, typeSchemas] of Object.entries(grouped)) {
        typeSchemas.sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
    }
    return grouped;
};

const _canonicalToName = (canonical: string | undefined) => {
    if (!canonical) return undefined;
    let localName = canonical.split("/").pop();
    if (localName?.includes("#")) {
        localName = localName.split("#")[0];
    }
    if (/^\d/.test(localName ?? "")) {
        localName = `number_${localName}`;
    }
    return localName;
};

const fileNameStem = (id: Identifier): string => {
    // if (id.kind === "constraint") return `${pascalCase(canonicalToName(id.url) ?? "")}_profile`;
    return pascalCase(id.name);
};

const _fileName = (id: Identifier): string => {
    return `${fileNameStem(id)}.ts`;
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

export type TypeScriptOptions = {} & WriterOptions;

export class TypeScript extends Writer {
    tsImportFrom(tsPackage: string, ...entities: string[]) {
        this.lineSM(`import { ${entities.join(", ")} } from '${tsPackage}'`);
    }

    generatePackageIndexFile(schemas: TypeSchema[]) {
        this.cat("index.ts", () => {
            let exports = schemas
                .map((schema) => ({
                    identifier: schema.identifier,
                    fileName: fileNameStem(schema.identifier),
                    name: resourceName(schema.identifier),
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            // FIXME: actually, duplication means internal error...
            exports = Array.from(new Map(exports.map((exp) => [exp.name.toLowerCase(), exp])).values()).sort((a, b) =>
                a.name.localeCompare(b.name),
            );

            for (const exp of exports) {
                this.debugComment(exp.identifier);
                this.tsImportFrom(`./${exp.fileName}`, exp.name);
            }
            this.lineSM(`export { ${exports.map((e) => e.name).join(", ")} }`);

            this.line("");

            this.curlyBlock(["export type ResourceTypeMap = "], () => {
                this.lineSM("User: Record<string, any>");
                exports.forEach((exp) => {
                    this.debugComment(exp.identifier);
                    this.lineSM(`${exp.name}: ${exp.name}`);
                });
            });
            this.lineSM("export type ResourceType = keyof ResourceTypeMap");

            this.squareBlock(["export const resourceList: readonly ResourceType[] = "], () => {
                exports.forEach((exp) => {
                    this.debugComment(exp.identifier);
                    this.line(`'${exp.name}', `);
                });
            });
        });
    }

    override generate(schemas: TypeSchema[]) {
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
                    // for (const schema of packageSchemas) {
                    //     this.generateResourceModule(schema);
                    // }
                    this.generatePackageIndexFile(packageSchemas);
                });
            }
        });
    }
}
