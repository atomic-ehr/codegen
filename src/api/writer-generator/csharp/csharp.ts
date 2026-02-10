import fs from "node:fs";
import Path from "node:path";
import { fileURLToPath } from "node:url";
import { pascalCase, uppercaseFirstLetter, uppercaseFirstLetterOfEach } from "@root/api/writer-generator/utils.ts";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer.ts";
import type { PartialBy } from "@root/utils/types.ts";
import type { Field, Identifier, RegularField } from "@typeschema/types";
import { type ChoiceFieldInstance, isChoiceDeclarationField, type RegularTypeSchema } from "@typeschema/types.ts";
import type { TypeSchemaIndex } from "@typeschema/utils.ts";
import { formatEnumEntry, formatName } from "./formatHelper.ts";

const resolveCSharpAssets = (fn: string) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = Path.dirname(__filename);
    if (__filename.endsWith("dist/index.js")) {
        return Path.resolve(__dirname, "..", "assets", "api", "writer-generator", "csharp", fn);
    } else {
        return Path.resolve(__dirname, "../../../..", "assets", "api", "writer-generator", "csharp", fn);
    }
};

const PRIMITIVE_TYPE_MAP: Record<string, string> = {
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

const RESERVED_TYPE_NAMES = ["Reference", "Expression"];

const getFieldModifiers = (field: Field) => {
    return field.required ? ["required"] : [];
};

const formatClassName = (schema: RegularTypeSchema) => {
    const name = prefixReservedTypeName(getResourceName(schema.identifier));
    return uppercaseFirstLetter(name);
};

const formatBaseClass = (schema: RegularTypeSchema) => {
    return schema.base ? `: ${schema.base.name}` : "";
};

const canonicalToName = (canonical: string | undefined, dropFragment = true): string | undefined => {
    if (!canonical) return undefined;
    let localName = canonical.split("/").pop();
    if (!localName) return undefined;
    if (dropFragment && localName.includes("#")) localName = localName.split("#")[0];
    if (!localName) return undefined;
    if (/^\d/.test(localName)) {
        localName = `number_${localName}`;
    }
    return formatName(localName);
};

const getResourceName = (id: Identifier): string => {
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

const isReservedTypeName = (name: string): boolean => RESERVED_TYPE_NAMES.includes(name);

const prefixReservedTypeName = (name: string): string => (isReservedTypeName(name) ? `Resource${name}` : name);

export type CSharpGeneratorOptions = WriterOptions & {
    outputDir: string;
    staticSourceDir?: string;
    rootNamespace: string;
};

interface EnumRegistry {
    [packageName: string]: {
        [enumName: string]: string[];
    };
}

export class CSharp extends Writer<CSharpGeneratorOptions> {
    private readonly enums: EnumRegistry = {};

    constructor(options: PartialBy<CSharpGeneratorOptions, "tabSize" | "commentLinePrefix">) {
        super({
            tabSize: 4,
            withDebugComment: false,
            commentLinePrefix: "//",
            resolveAssets: options.resolveAssets ?? resolveCSharpAssets,
            ...options,
        });
    }

    override async generate(typeSchemaIndex: TypeSchemaIndex): Promise<void> {
        const complexTypes = typeSchemaIndex.collectComplexTypes();
        const resources = typeSchemaIndex.collectResources();
        const packages = Array.from(new Set(resources.map((r) => formatName(r.identifier.package))));

        this.generateAllFiles(complexTypes, resources, packages);
        this.copyStaticFiles();
    }

    private generateAllFiles(
        complexTypes: RegularTypeSchema[],
        resources: RegularTypeSchema[],
        packages: string[],
    ): void {
        this.generateUsingFile(packages);
        this.generateBaseTypes(complexTypes);
        this.generateResources(resources);
        this.generateEnumFiles(packages);
        this.generateResourceDictionaries(resources, packages);
        this.generateHelperFile();
    }

    private generateType(schema: RegularTypeSchema, packageName: string): void {
        const className = formatClassName(schema);
        const baseClass = formatBaseClass(schema);

        this.curlyBlock(["public", "class", className, baseClass], () => {
            this.generateFields(schema, packageName);
            this.generateNestedTypes(schema, packageName);
            this.line();
            this.includeHelperMethods();
        });
        this.line();
    }

    private generateFields(schema: RegularTypeSchema, packageName: string): void {
        if (!schema.fields) return;

        const sortedFields = Object.entries(schema.fields).sort(([a], [b]) => a.localeCompare(b));

        for (const [fieldName, field] of sortedFields) {
            this.generateField(fieldName, field, packageName);
        }
    }

    private generateNestedTypes(schema: RegularTypeSchema, packageName: string): void {
        if (!("nested" in schema) || !schema.nested) return;

        this.line();
        for (const subtype of schema.nested) {
            this.generateType(subtype, packageName);
        }
    }

    private generateField(fieldName: string, field: Field, packageName: string): void {
        try {
            if (isChoiceDeclarationField(field)) return;

            const fieldDeclaration = this.buildFieldDeclaration(fieldName, field, packageName);
            this.line(...fieldDeclaration);
        } catch (error) {
            this.logger()?.error(`Error processing field ${fieldName}: ${(error as Error).message}`);
        }
    }

    private buildFieldDeclaration(fieldName: string, field: Field, packageName: string): string[] {
        const fieldType = this.determineFieldType(fieldName, field, packageName);
        const modifiers = getFieldModifiers(field);
        const propertyName = pascalCase(fieldName);
        const accessors = "{ get; set; }";

        return ["public", ...modifiers, fieldType, propertyName, accessors].filter(Boolean);
    }

    private determineFieldType(fieldName: string, field: Field, packageName: string): string {
        let typeName = this.getBaseTypeName(field);

        if ("enum" in field && field.enum && !field.enum.isOpen) {
            typeName = this.registerAndGetEnumType(fieldName, field, packageName);
        }

        typeName = prefixReservedTypeName(typeName);

        // questionable
        const baseNamespacePrefix = "";
        const nullable = field.required ? "" : "?";
        const arraySpecifier = field.array ? "[]" : "";

        return `${baseNamespacePrefix}${typeName}${arraySpecifier}${nullable}`;
    }

    private getBaseTypeName(field: Field): string {
        if ("type" in field) {
            let typeName = field.type.name.toString();

            if (field.type.kind === "nested") {
                typeName = getResourceName(field.type);
            } else if (field.type.kind === "primitive-type") typeName = PRIMITIVE_TYPE_MAP[field.type.name] ?? "string";

            return typeName;
        }
        return "";
    }

    private registerAndGetEnumType(
        fieldName: string,
        field: RegularField | ChoiceFieldInstance,
        packageName: string,
    ): string {
        const enumName = formatName(field.binding?.name ?? fieldName);
        const enumTypeName = `${enumName}Enum`;

        if (!this.enums[packageName]) this.enums[packageName] = {};
        if (field.enum) this.enums[packageName][enumTypeName] = field.enum.values;

        return enumTypeName;
    }

    private includeHelperMethods(): void {
        this.line("public override string ToString() => ");
        this.line("    JsonSerializer.Serialize(this, Helper.JsonSerializerOptions);");
        this.line();
    }

    private generateUsingFile(packages: string[]): void {
        this.cd("/", async () => {
            this.cat("Usings.cs", () => {
                this.generateDisclaimer();
                this.generateGlobalUsings(packages);
            });
        });
    }

    private generateGlobalUsings(packages: string[]): void {
        const globalUsings = [
            "CSharpSDK",
            "System.Text.Json",
            "System.Text.Json.Serialization",
            this.opts.rootNamespace,
            ...packages.map((pkg) => `${this.opts.rootNamespace}.${pkg}`),
        ];

        for (const using of globalUsings) this.lineSM("global", "using", using);
    }

    private generateBaseTypes(complexTypes: RegularTypeSchema[]): void {
        this.cd("/", async () => {
            this.cat("base.cs", () => {
                this.generateDisclaimer();
                this.line();
                this.lineSM("namespace", this.opts.rootNamespace);

                for (const schema of complexTypes) {
                    const packageName = formatName(schema.identifier.package);
                    this.generateType(schema, packageName);
                }
            });
        });
    }

    private generateResources(resources: RegularTypeSchema[]): void {
        for (const schema of resources) this.generateResourceFile(schema);
    }

    private generateResourceFile(schema: RegularTypeSchema): void {
        const packageName = formatName(schema.identifier.package);

        this.cd(`/${packageName}`, async () => {
            this.cat(`${schema.identifier.name}.cs`, () => {
                this.generateDisclaimer();
                this.line();
                this.lineSM("namespace", `${this.opts.rootNamespace}.${packageName}`);
                this.line();
                this.generateType(schema, packageName);
            });
        });
    }

    private generateEnumFiles(packages: string[]): void {
        for (const packageName of packages) {
            this.generatePackageEnums(packageName);
        }
    }

    private generatePackageEnums(packageName: string): void {
        const packageEnums = this.enums[packageName];
        if (!packageEnums || Object.keys(packageEnums).length === 0) return;

        this.cd(`/${packageName}`, async () => {
            this.cat(`${packageName}Enums.cs`, () => {
                this.generateDisclaimer();
                this.generateEnumFileContent(packageName, packageEnums);
            });
        });
    }

    private generateEnumFileContent(packageName: string, enums: Record<string, string[]>): void {
        this.lineSM("using", "System.ComponentModel");
        this.line();
        this.lineSM(`namespace ${this.opts.rootNamespace}.${packageName}`);

        for (const [enumName, values] of Object.entries(enums)) {
            this.generateEnum(enumName, values);
        }
    }

    private generateEnum(enumName: string, values: string[]): void {
        this.curlyBlock(["public", "enum", enumName], () => {
            for (const value of values) {
                this.line(`[Description("${value}")]`);
                this.line(`${formatEnumEntry(value)},`);
            }
        });
        this.line();
    }

    private generateResourceDictionaries(resources: RegularTypeSchema[], packages: string[]): void {
        this.cd("/", async () => {
            for (const packageName of packages) {
                const packageResources = resources.filter((r) => formatName(r.identifier.package) === packageName);

                if (packageResources.length === 0) return;

                this.cat(`${packageName}ResourceDictionary.cs`, () => {
                    this.generateDisclaimer();
                    this.line();
                    this.lineSM(`namespace ${this.opts.rootNamespace}`);
                    this.generateResourceDictionaryClass(packageName, packageResources);
                });
            }
        });
    }

    private generateResourceDictionaryClass(packageName: string, resources: RegularTypeSchema[]): void {
        this.curlyBlock(["public", "static", "class", "ResourceDictionary"], () => {
            this.curlyBlock(["public static readonly Dictionary<Type, string> Map = new()"], () => {
                for (const schema of resources) {
                    const typeName = schema.identifier.name;
                    this.line(`{ typeof(${packageName}.${typeName}), "${typeName}" },`);
                }
            });
            this.lineSM();
        });
    }

    private copyStaticFiles(): void {
        this.cp("Client.cs", "Client.cs");
        this.cp("Helper.cs", "Helper.cs");
    }

    private generateHelperFile(): void {
        if (this.opts.inMemoryOnly) return;
        const sourceFile = resolveCSharpAssets("Helper.cs");
        const destFile = Path.join(this.opts.outputDir, "Helper.cs");
        fs.copyFileSync(sourceFile, destFile);
    }
}
