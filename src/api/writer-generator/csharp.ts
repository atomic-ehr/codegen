import {
    pascalCase,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import { Writer } from "@root/api/writer-generator/writer";
import type { Field, Identifier } from "@root/typeschema";
import { isChoiceDeclarationField, type RegularTypeSchema } from "@root/typeschema/types";
import { type TypeSchemaIndex } from "@root/typeschema/utils";
import { formatEnumEntry, formatName } from "./formatHelper";
import { CodegenLogger } from "@root/utils/codegen-logger.ts";
import fs from "node:fs";
import Path from "node:path";

const typeMap: Record<string, string> = {
    boolean: "bool",
    instant: "string",
    time: "string",
    date: "string",
    dateTime: "string",

    decimal: "decimal",
    integer: "int",
    unsignedInt: "long",
    positiveInt: "long",
    integer64: "long",
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

const CSharpLogger = new CodegenLogger({
    prefix: "C#",
    timestamp: true,
    verbose: true,
    suppressLoggingLevel: [],
});

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
    return formatName(localName);
};

const getResourceName = (id: Identifier) => {
    if (id.kind === "nested") {
        const url = id.url;
        const path = canonicalToName(url, false);
        if (!path) return "";
        const [resourceName, fragment] = path.split("#");
        const name = uppercaseFirstLetterOfEach((fragment ?? "").split(".")).join("");
        return formatName([resourceName, name].join(""));
    }
    return formatName(id.name);
};

export class CSharp extends Writer {
    private enums: Record<string, Record<string, string[]>> = {};
    private readonly staticSourceDir: string | undefined;
    private readonly namespace: string | undefined;

    constructor(
        outputDir: string,
        staticSourceDir: string | undefined,
        namespace: string,
        logger: CodegenLogger | undefined = undefined,
    ) {
        super({
            outputDir: outputDir,
            tabSize: 4,
            withDebugComment: false,
            commentLinePrefix: "//",
            logger: logger ?? CSharpLogger,
        });
        this.staticSourceDir = staticSourceDir;
        this.namespace = namespace;
    }

    includeHelperMethods() {
        this.line("public override string ToString() => ");
        this.line("    JsonSerializer.Serialize(this, Config.JsonSerializerOptions);");
        this.line();
    }

    generateField(fieldName: string, field: Field, packageName: string) {
        try {
            if (isChoiceDeclarationField(field)) return;

            // fixme: questionable
            const baseNamespacePrefix = ""; // field.type.kind == 'complex-type' ? 'Base.' : '';

            const nullable = field.required ? "" : "?";
            const required = field.required ? "required" : "";
            const arraySpecifier = field.array ? "[]" : "";
            const accessors = "{ get; set; }";

            let t = field.type.name.toString(); // fixme: name can include incompatible symbols (?)

            if (field.type.kind === "nested") t = getResourceName(field.type);

            if (field.type.kind === "primitive-type") t = typeMap[field.type.name] ?? "string";

            if (t === "Reference" || t === "Expression") t = `Resource${t}`;

            if (field.enum) {
                const enumName = formatName(field.binding?.name ?? fieldName);
                t = `${enumName}Enum`;
                if (!this.enums[packageName]) this.enums[packageName] = {};
                this.enums[packageName][t] = field.enum;
            }

            const fieldType = baseNamespacePrefix + t + arraySpecifier + nullable;
            const fieldSymbol = pascalCase(fieldName);
            this.line("public", required, fieldType, fieldSymbol, accessors);
        } catch (e) {
            this.logger()?.error(`Error processing field ${fieldName}: ${(e as Error).message}`);
        }
    }

    generateType(schema: RegularTypeSchema, packageName: string) {
        let name = getResourceName(schema.identifier);

        if (name === "Reference" || name === "Expression") {
            name = `Resource${name}`;
        }

        const base = schema.base ? `: ${schema.base.name}` : "";
        this.curlyBlock(["public", "class", uppercaseFirstLetter(name), base], () => {
            if (schema.fields) {
                const fields = Object.entries(schema.fields).sort((a, b) => a[0].localeCompare(b[0]));
                for (const [fieldName, field] of fields) {
                    this.generateField(fieldName, field, packageName);
                }
            }

            if ("nested" in schema && schema.nested) {
                this.line();
                for (const subtype of schema.nested) {
                    this.generateType(subtype, packageName);
                }
            }
            this.line();
            this.includeHelperMethods();
        });
        this.line();
    }

    private generateEnums(packages: string[]) {
        for (const packageName of packages) {
            this.cd(`/${packageName}`, async () => {
                this.cat(`${packageName}Enums.cs`, () => {
                    this.generateDisclaimer();
                    this.lineSM("using", "System.ComponentModel");
                    this.line();
                    // for(const package_ of packages) {
                    //     this.lineSM(`using ${this.namespace}.${package_}`);
                    // }
                    this.lineSM(`namespace ${this.namespace}.${packageName}`);
                    for (const [name, values] of Object.entries(this.enums[packageName] ?? {})) {
                        this.curlyBlock(["public", "enum", name], () =>
                            values.forEach((entry) => {
                                this.line(`[Description("${entry}")]`);
                                this.line(formatEnumEntry(entry), ",");
                            }),
                        );
                        this.line();
                    }
                });
            });
        }
    }

    generateUsingFile(packages: string[]) {
        this.cd("/", async () => {
            this.cat("Usings.cs", () => {
                this.generateDisclaimer();
                this.lineSM("global", "using", "CSharpSDK");
                this.lineSM("global", "using", "System.Text.Json");
                this.lineSM("global", "using", "System.Text.Json.Serialization");
                this.lineSM("global", "using", `${this.namespace}`);
                for (const package_name of packages) {
                    this.lineSM("global", "using", `${this.namespace}.${package_name}`);
                }
            });
        });
    }

    private generateBase(complexTypes: RegularTypeSchema[]) {
        this.cd("/", async () => {
            this.cat("base.cs", () => {
                this.generateDisclaimer();
                this.line();
                this.lineSM("namespace", `${this.namespace}`);
                for (const schema of complexTypes) {
                    const package_ = formatName(schema.identifier.package);
                    this.generateType(schema, package_);
                }
            });
        });
    }

    private generateResource(resources: RegularTypeSchema[]) {
        for (const schema of resources) {
            const packageName = formatName(schema.identifier.package);
            this.cd(`/${packageName}`, async () => {
                this.cat(`${schema.identifier.name}.cs`, () => {
                    this.generateDisclaimer();
                    this.line();
                    this.lineSM("namespace", `${this.namespace}.${packageName}`);
                    this.line();

                    this.generateType(schema, packageName);
                });
            });
        }
    }

    private generateResourceDictionaries(resources: RegularTypeSchema[], packages: string[]) {
        this.cd("/", async () => {
            for (const package_ of packages) {
                this.cat(`${package_}ResourceDictionary.cs`, () => {
                    this.generateDisclaimer();
                    this.line();
                    this.lineSM(`namespace ${this.namespace}`);
                    // this.line(`public static class ${package_}ResourceDictionary`); // todo: make this work
                    this.line(`public static class ResourceDictionary`);
                    this.line("{");
                    this.line("    public static readonly Dictionary<Type, string> Map = new()");
                    this.line("    {");
                    for (const schema of resources) {
                        if (formatName(schema.identifier.package) !== package_) continue;
                        this.line(
                            `        { typeof(${package_}.${schema.identifier.name}), "${schema.identifier.name}" },`,
                        );
                    }
                    this.line("    };");
                    this.line("}");
                });
            }
        });
    }

    private copyStaticFiles() {
        if (this.staticSourceDir)
            fs.cpSync(Path.resolve(this.staticSourceDir), this.opts.outputDir, { recursive: true });
    }

    override generate(csharpIndex: TypeSchemaIndex) {
        const complexTypes = csharpIndex.collectComplexTypes();
        const resources = csharpIndex.collectResources();
        const packages = // todo: spread resources and types into packages (?)
            Array.from(new Set(resources.map((r) => formatName(r.identifier.package))));

        this.generateUsingFile(packages);
        this.generateBase(complexTypes);
        this.generateResource(resources);
        this.generateEnums(packages);
        this.generateResourceDictionaries(resources, packages);
        this.copyStaticFiles(); // todo: configure namespaces (?)
    }
}
