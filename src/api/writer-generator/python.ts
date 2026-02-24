import assert from "node:assert";
import fs from "node:fs";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { camelCase, pascalCase, snakeCase, uppercaseFirstLetterOfEach } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer.ts";
import { groupByPackages, sortAsDeclarationSequence, type TypeSchemaIndex } from "@root/typeschema/utils";
import type { Field, Identifier, RegularTypeSchema } from "@typeschema/types.ts";

const PRIMITIVE_TYPE_MAP: Record<string, string> = {
    boolean: "bool",
    instant: "str",
    time: "str",
    date: "str",
    dateTime: "str",
    decimal: "float",
    integer: "int",
    unsignedInt: "int",
    positiveInt: "PositiveInt",
    integer64: "int",
    base64Binary: "str",
    uri: "str",
    url: "str",
    canonical: "str",
    oid: "str",
    uuid: "str",
    string: "str",
    code: "str",
    markdown: "str",
    id: "str",
    xhtml: "str",
};

type StringFormatKey = "snake_case" | "PascalCase" | "camelCase";

const AVAILABLE_STRING_FORMATS: Record<StringFormatKey, (str: string) => string> = {
    snake_case: snakeCase,
    PascalCase: pascalCase,
    camelCase: camelCase,
};

const PYTHON_KEYWORDS = new Set([
    "False",
    "None",
    "True",
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "nonlocal",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield",
    "List",
]);

const MAX_IMPORT_LINE_LENGTH = 100;

export interface PythonGeneratorOptions extends WriterOptions {
    allowExtraFields?: boolean;
    rootPackageName: string; /// e.g. <rootPackageName>.hl7_fhir_r4_core.Patient.
    fieldFormat: StringFormatKey;
    fhirpyClient?: boolean;
}

interface ImportGroup {
    [packageName: string]: string[];
}

interface FieldInfo {
    name: string;
    type: string;
    defaultValue: string;
}

const fixReservedWords = (name: string): string => {
    return PYTHON_KEYWORDS.has(name) ? `${name}_` : name;
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
    return snakeCase(localName);
};

const deriveResourceName = (id: Identifier): string => {
    if (id.kind === "nested") {
        const url = id.url;
        const path = canonicalToName(url, false);
        if (!path) return "";
        const [resourceName, fragment] = path.split("#");
        const name = uppercaseFirstLetterOfEach((fragment ?? "").split(".")).join("");
        return pascalCase([resourceName, name].join(""));
    }
    return pascalCase(id.name);
};

const resolvePyAssets = (fn: string) => {
    const __dirname = Path.dirname(fileURLToPath(import.meta.url));
    const __filename = fileURLToPath(import.meta.url);
    if (__filename.endsWith("dist/index.js")) {
        return Path.resolve(__dirname, "..", "assets", "api", "writer-generator", "python", fn);
    } else {
        return Path.resolve(__dirname, "../../..", "assets", "api", "writer-generator", "python", fn);
    }
};

type TypeSchemaPackageGroups = {
    groupedResources: Record<string, RegularTypeSchema[]>;
    groupedComplexTypes: Record<string, RegularTypeSchema[]>;
};

export class Python extends Writer<PythonGeneratorOptions> {
    private readonly nameFormatFunction: (name: string) => string;
    private tsIndex: TypeSchemaIndex | undefined;
    private readonly forFhirpyClient: boolean;
    private readonly fieldFormat: StringFormatKey;

    constructor(options: PythonGeneratorOptions) {
        super({ ...options, resolveAssets: options.resolveAssets ?? resolvePyAssets });
        this.nameFormatFunction = this.getFieldFormatFunction(options.fieldFormat);
        this.forFhirpyClient = options.fhirpyClient ?? false;
        this.fieldFormat = options.fieldFormat;
    }

    override async generate(tsIndex: TypeSchemaIndex): Promise<void> {
        this.tsIndex = tsIndex;
        const groups: TypeSchemaPackageGroups = {
            groupedComplexTypes: groupByPackages(tsIndex.collectComplexTypes()),
            groupedResources: groupByPackages(tsIndex.collectResources()),
        };
        this.generateRootPackages(groups);
        this.generateSDKPackages(groups);
    }

    private generateRootPackages(groups: TypeSchemaPackageGroups): void {
        this.generateRootInitFile(groups);
        if (this.forFhirpyClient) {
            if (this.fieldFormat === "camelCase") {
                this.copyAssets(resolvePyAssets("fhirpy_base_model_camel_case.py"), "fhirpy_base_model.py");
            } else {
                this.copyAssets(resolvePyAssets("fhirpy_base_model.py"), "fhirpy_base_model.py");
            }
        }
        this.copyAssets(resolvePyAssets("requirements.txt"), "requirements.txt");
    }

    private generateSDKPackages(groups: TypeSchemaPackageGroups): void {
        this.generateComplexTypesPackages(groups.groupedComplexTypes);
        this.generateResourcePackages(groups);
    }

    private generateComplexTypesPackages(groupedComplexTypes: Record<string, RegularTypeSchema[]>): void {
        for (const [packageName, packageComplexTypes] of Object.entries(groupedComplexTypes)) {
            this.cd(`/${snakeCase(packageName)}`, () => {
                this.generateBasePy(packageComplexTypes);
            });
        }
    }

    private generateResourcePackages(groups: TypeSchemaPackageGroups): void {
        for (const [packageName, packageResources] of Object.entries(groups.groupedResources)) {
            this.cd(`/${snakeCase(packageName)}`, () => {
                this.generateResourcePackageContent(
                    packageName,
                    packageResources,
                    groups.groupedComplexTypes[packageName] || [],
                );
            });
        }
    }

    private generateResourcePackageContent(
        packageName: string,
        packageResources: RegularTypeSchema[],
        packageComplexTypes: RegularTypeSchema[],
    ): void {
        const pyPackageName = this.pyFhirPackageByName(packageName);

        this.generateResourcePackageInit(pyPackageName, packageResources, packageComplexTypes);
        this.generateResourceFamilies(packageResources);

        for (const schema of packageResources) {
            this.generateResourceModule(schema);
        }
    }

    private generateRootInitFile(groups: TypeSchemaPackageGroups): void {
        this.cd("/", () => {
            this.cat("__init__.py", () => {
                this.generateDisclaimer();
                const pydanticModels: string[] = this.collectAndImportAllModels(groups);
                this.generateModelRebuilds(pydanticModels);
            });
        });
    }

    private collectAndImportAllModels(groups: TypeSchemaPackageGroups): string[] {
        const models: string[] = [];

        for (const packageName of Object.keys(groups.groupedResources)) {
            const fullPyPackageName = this.pyFhirPackageByName(packageName);
            models.push(...this.importComplexTypes(fullPyPackageName, groups.groupedComplexTypes[packageName]));
            models.push(...this.importResources(fullPyPackageName, false, groups.groupedResources[packageName]));
        }
        this.line();

        return models;
    }

    private generateModelRebuilds(models: string[]): void {
        for (const modelName of models.sort()) {
            this.line(`${modelName}.model_rebuild()`);
        }
    }

    private generateBasePy(packageComplexTypes: RegularTypeSchema[]): void {
        this.cat("base.py", () => {
            this.generateDisclaimer();
            this.generateDefaultImports();
            this.line();
            this.generateComplexTypes(packageComplexTypes);
            this.line();
        });
    }

    private generateComplexTypes(complexTypes: RegularTypeSchema[]): void {
        for (const schema of sortAsDeclarationSequence(complexTypes)) {
            this.generateNestedTypes(schema);
            this.line();
            this.generateType(schema);
        }
    }

    private generateResourcePackageInit(
        fullPyPackageName: string,
        packageResources: RegularTypeSchema[],
        packageComplexTypes?: RegularTypeSchema[],
    ): void {
        this.cat("__init__.py", () => {
            this.generateDisclaimer();
            this.importComplexTypes(fullPyPackageName, packageComplexTypes);
            const allResourceNames = this.importResources(fullPyPackageName, true, packageResources);
            this.line();
            this.generateExportsDeclaration(packageComplexTypes, allResourceNames);
        });
    }

    private importComplexTypes(fullPyPackageName: string, packageComplexTypes?: RegularTypeSchema[]): string[] {
        if (!packageComplexTypes || packageComplexTypes.length === 0) return [];

        const baseTypes = packageComplexTypes.map((t) => t.identifier.name).sort();
        this.pyImportFrom(`${fullPyPackageName}.base`, ...baseTypes);
        this.line();

        return baseTypes;
    }

    private buildImportLine(remaining: string[], maxImportLineLength: number): string {
        let line = "";
        while (remaining.length > 0 && line.length < maxImportLineLength) {
            const entity = remaining.shift();
            if (!entity) throw new Error("Unexpected empty entity");
            if (line.length > 0) {
                line += ", ";
            }
            line += entity;
        }

        if (remaining.length > 0) {
            line += ", \\";
        }

        return line;
    }

    private importResources(
        fullPyPackageName: string,
        importEmptyResources: boolean,
        packageResources?: RegularTypeSchema[],
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

    private importOneResource(resource: RegularTypeSchema, fullPyPackageName: string): string[] {
        const moduleName = `${fullPyPackageName}.${snakeCase(resource.identifier.name)}`;
        const importNames = this.collectResourceImportNames(resource);

        this.pyImportFrom(moduleName, ...importNames);

        const names = [...importNames];

        if (this.shouldImportResourceFamily(resource)) {
            const familyName = `${resource.identifier.name}Family`;
            this.pyImportFrom(`${fullPyPackageName}.resource_families`, familyName);
        }

        return names;
    }

    private collectResourceImportNames(resource: RegularTypeSchema): string[] {
        const names = [deriveResourceName(resource.identifier)];

        for (const nested of resource.nested ?? []) {
            const nestedName = deriveResourceName(nested.identifier);
            names.push(nestedName);
        }

        return names;
    }

    private shouldImportResourceFamily(resource: RegularTypeSchema): boolean {
        assert(this.tsIndex !== undefined);
        return resource.identifier.kind === "resource" && this.tsIndex.resourceChildren(resource.identifier).length > 0;
    }

    private generateExportsDeclaration(
        packageComplexTypes: RegularTypeSchema[] | undefined,
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

    private generateResourceModule(schema: RegularTypeSchema): void {
        this.cat(`${snakeCase(schema.identifier.name)}.py`, () => {
            this.generateDisclaimer();
            this.generateDefaultImports();
            this.generateFhirBaseModelImport();
            this.line();
            this.generateDependenciesImports(schema);
            this.line();
            this.generateNestedTypes(schema);
            this.line();
            this.generateType(schema);
        });
    }

    private generateFhirBaseModelImport(): void {
        if (this.forFhirpyClient)
            this.pyImportFrom(`${this.opts.rootPackageName}.fhirpy_base_model`, "FhirpyBaseModel");
    }

    private generateType(schema: RegularTypeSchema): void {
        const className = deriveResourceName(schema.identifier);
        const superClasses = this.getSuperClasses(schema);

        this.line(`class ${className}(${superClasses.join(", ")}):`);
        this.indentBlock(() => {
            this.generateClassBody(schema);
        });
        this.line();
    }

    private getSuperClasses(schema: RegularTypeSchema): string[] {
        return [...(schema.base ? [schema.base.name] : []), ...this.injectSuperClasses(schema.identifier.url)];
    }

    private generateClassBody(schema: RegularTypeSchema): void {
        this.generateModelConfig();

        if (!schema.fields) {
            this.line("pass");
            return;
        }

        if (schema.identifier.kind === "resource") {
            this.generateResourceTypeField(schema);
        }

        this.generateFields(schema);

        if (schema.identifier.kind === "resource") {
            this.generateResourceMethods(schema);
        }
    }

    private generateModelConfig(): void {
        const extraMode = this.opts.allowExtraFields ? "allow" : "forbid";
        this.line(`model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True, extra="${extraMode}")`);
    }

    private generateResourceTypeField(schema: RegularTypeSchema): void {
        const hasChildren = this.tsIndex.resourceChildren(schema.identifier).length > 0;

        if (hasChildren) {
            this.line(`${this.nameFormatFunction("resourceType")}: str = Field(`);
        } else {
            this.line(`${this.nameFormatFunction("resourceType")}: Literal['${schema.identifier.name}'] = Field(`);
        }
        this.indentBlock(() => {
            this.line(`default='${schema.identifier.name}',`);
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

    private generateFields(schema: RegularTypeSchema): void {
        const sortedFields = Object.entries(schema.fields ?? []).sort(([a], [b]) => a.localeCompare(b));

        for (const [fieldName, field] of sortedFields) {
            if ("choices" in field && field.choices) continue;

            const fieldInfo = this.buildFieldInfo(fieldName, field);
            this.line(`${fieldInfo.name}: ${fieldInfo.type}${fieldInfo.defaultValue}`);
        }
    }

    private buildFieldInfo(fieldName: string, field: Field): FieldInfo {
        const pyFieldName = fixReservedWords(this.nameFormatFunction(fieldName));
        const fieldType = this.determineFieldType(field);
        const defaultValue = this.getFieldDefaultValue(field, fieldName);

        return {
            name: pyFieldName,
            type: fieldType,
            defaultValue: defaultValue,
        };
    }

    private determineFieldType(field: Field): string {
        let fieldType = field ? this.getBaseFieldType(field) : "";

        if ("enum" in field && field.enum && !field.enum.isOpen) {
            const s: string = field.enum.values.map((e: string) => `"${e}"`).join(", ");
            fieldType = `Literal[${s}]`;
        }

        if (field.array) {
            fieldType = `PyList[${fieldType}]`;
        }

        if (!field.required) {
            fieldType = `${fieldType} | None`;
        }

        return fieldType;
    }

    private getBaseFieldType(field: Field): string {
        if ("type" in field && field.type.kind === "resource") return `${field.type.name}Family`;

        if ("type" in field && field.type.kind === "nested") return deriveResourceName(field.type);

        if ("type" in field && field.type.kind === "primitive-type")
            return PRIMITIVE_TYPE_MAP[field.type.name] ?? "str";

        return "type" in field ? field.type.name : "";
    }

    private getFieldDefaultValue(field: any, fieldName: string): string {
        const aliasSpec = `alias="${fieldName}", serialization_alias="${fieldName}"`;

        if (!field.required) {
            return ` = Field(None, ${aliasSpec})`;
        }

        return ` = Field(${aliasSpec})`;
    }

    private generateResourceMethods(schema: RegularTypeSchema): void {
        const className = schema.identifier.name.toString();

        this.line();
        this.line("def to_json(self, indent: int | None = None) -> str:");
        this.line("    return self.model_dump_json(exclude_unset=True, exclude_none=True, indent=indent)");
        this.line();
        this.line("@classmethod");
        this.line(`def from_json(cls, json: str) -> ${className}:`);
        this.line("    return cls.model_validate_json(json)");
    }

    private generateNestedTypes(schema: RegularTypeSchema): void {
        if (!schema.nested) return;

        this.line();
        for (const subtype of schema.nested) {
            this.generateType(subtype);
        }
    }

    private generateDefaultImports(): void {
        this.pyImportFrom("__future__", "annotations");
        this.pyImportFrom("pydantic", "BaseModel", "ConfigDict", "Field", "PositiveInt");
        this.pyImportFrom("typing", "List as PyList", "Literal");
    }

    private generateDependenciesImports(schema: RegularTypeSchema): void {
        if (!schema.dependencies || schema.dependencies.length === 0) return;

        this.importComplexTypeDependencies(schema.dependencies);
        this.importResourceDependencies(schema.dependencies);
    }

    private importComplexTypeDependencies(dependencies: Identifier[]): void {
        const complexTypeDeps = dependencies.filter((dep) => dep.kind === "complex-type");
        const depsByPackage = this.groupDependenciesByPackage(complexTypeDeps);

        for (const [pyPackage, names] of Object.entries(depsByPackage)) {
            this.pyImportFrom(pyPackage, ...names.sort());
        }
    }

    private importResourceDependencies(dependencies: Identifier[]): void {
        const resourceDeps = dependencies.filter((dep) => dep.kind === "resource");

        for (const dep of resourceDeps) {
            this.pyImportType(dep);

            const familyName = `${pascalCase(dep.name)}Family`;
            const familyPackage = `${this.pyFhirPackage(dep)}.resource_families`;
            this.pyImportFrom(familyPackage, familyName);
        }
    }

    private groupDependenciesByPackage(dependencies: Identifier[]): ImportGroup {
        const grouped: ImportGroup = {};

        for (const dep of dependencies) {
            const pyPackage = this.pyPackage(dep);
            if (!grouped[pyPackage]) {
                grouped[pyPackage] = [];
            }
            grouped[pyPackage].push(dep.name);
        }

        return grouped;
    }

    private pyImportFrom(pyPackage: string, ...entities: string[]): void {
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
        this.line(`from ${pyPackage} import (\\`);
        this.indentBlock(() => {
            const remaining = [...entities];
            while (remaining.length > 0) {
                const line = this.buildImportLine(remaining, MAX_IMPORT_LINE_LENGTH);
                this.line(line);
            }
        });
        this.line(")");
    }

    private pyImportType(identifier: Identifier): void {
        this.pyImportFrom(this.pyPackage(identifier), pascalCase(identifier.name));
    }

    private generateResourceFamilies(packageResources: RegularTypeSchema[]): void {
        assert(this.tsIndex !== undefined);
        const packages = //this.helper.getPackages(packageResources, this.opts.rootPackageName);
            Object.keys(groupByPackages(packageResources)).map(
                (pkgName) => `${this.opts.rootPackageName}.${pkgName.replaceAll(".", "_")}`,
            );
        const families: Record<string, string[]> = {};
        for (const resource of this.tsIndex.collectResources()) {
            const children: string[] = this.tsIndex.resourceChildren(resource.identifier).map((c) => c.name);
            if (children.length > 0) {
                const familyName = `${resource.identifier.name}Family`;
                families[familyName] = children;
            }
        }
        const exportList = Object.keys(families);

        if (exportList.length === 0) return;

        this.buildResourceFamiliesFile(packages, families, exportList);
    }

    private buildResourceFamiliesFile(
        packages: string[],
        families: Record<string, string[]>,
        exportList: string[],
    ): void {
        this.cat("resource_families.py", () => {
            this.generateDisclaimer();
            this.includeResourceFamilyValidator();
            this.line();
            this.generateFamilyDefinitions(packages, families);
            this.generateFamilyExports(exportList);
        });
    }

    private includeResourceFamilyValidator(): void {
        const content = fs.readFileSync(resolvePyAssets("resource_family_validator.py"), "utf-8");
        this.line(content);
    }

    private generateFamilyDefinitions(packages: string[], families: Record<string, string[]>): void {
        this.line(`packages = [${packages.map((p) => `'${p}'`).join(", ")}]`);
        this.line();

        for (const [familyName, resources] of Object.entries(families)) {
            this.generateFamilyDefinition(familyName, resources);
        }
    }

    private generateFamilyDefinition(familyName: string, resources: string[]): void {
        const listName = `${familyName}_resources`;

        this.line(
            `${listName} = [${resources
                .map((r) => `'${r}'`)
                .sort()
                .join(", ")}]`,
        );
        this.line();

        this.line(`def validate_and_downcast_${familyName}(v: Any) -> Any:`);
        this.line(`   return validate_and_downcast(v, packages, ${listName})`);
        this.line();

        this.line(`type ${familyName} = Annotated[Any, BeforeValidator(validate_and_downcast_${familyName})]`);
        this.line();
    }

    private generateFamilyExports(exportList: string[]): void {
        this.line(`__all__ = [${exportList.map((e) => `'${e}'`).join(", ")}]`);
    }

    private buildPyPackageName(packageName: string): string {
        const parts = packageName ? [snakeCase(packageName)] : [""];
        return parts.join(".");
    }

    private pyFhirPackage(identifier: Identifier): string {
        return this.pyFhirPackageByName(identifier.package);
    }

    private pyFhirPackageByName(name: string): string {
        return [this.opts.rootPackageName, this.buildPyPackageName(name)].join(".");
    }

    private pyPackage(identifier: Identifier): string {
        if (identifier.kind === "complex-type") {
            return `${this.pyFhirPackage(identifier)}.base`;
        }
        if (identifier.kind === "resource") {
            return [this.pyFhirPackage(identifier), snakeCase(identifier.name)].join(".");
        }
        return this.pyFhirPackage(identifier);
    }

    private getFieldFormatFunction(format: StringFormatKey): (name: string) => string {
        if (!AVAILABLE_STRING_FORMATS[format]) {
            this.logger()?.warn(`Unknown field format '${format}'. Defaulting to SnakeCase.`);
            this.logger()?.warn(`Supported formats: ${Object.keys(AVAILABLE_STRING_FORMATS).join(", ")}`);
            return snakeCase;
        }
        return AVAILABLE_STRING_FORMATS[format];
    }

    private injectSuperClasses(url: string): string[] {
        const name = canonicalToName(url);
        if (name === "resource") return this.forFhirpyClient ? ["FhirpyBaseModel"] : ["BaseModel"];
        if (name === "element") return ["BaseModel"];
        return [];
    }
}
