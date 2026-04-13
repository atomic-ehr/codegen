import assert from "node:assert";
import fs from "node:fs";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import {
    canonicalToName,
    deriveResourceName,
    fixReservedWords,
    PRIMITIVE_TYPE_MAP,
    pyFhirPackage,
    pyFhirPackageByName,
    pyPackage,
} from "@root/api/writer-generator/python/naming-utils.ts";
import { camelCase, pascalCase, snakeCase } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer.ts";
import { groupByPackages, sortAsDeclarationSequence, type TypeSchemaIndex } from "@root/typeschema/utils";
import {
    type CanonicalUrl,
    type EnumDefinition,
    type Field,
    isPrimitiveIdentifier,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type NestedTypeSchema,
    type SpecializationTypeSchema,
    type TypeIdentifier,
} from "@typeschema/types.ts";
import { generateNewProfiles } from "./profile";

export const resolvePyAssets = (fn: string) => {
    const __dirname = Path.dirname(fileURLToPath(import.meta.url));
    const __filename = fileURLToPath(import.meta.url);
    if (__filename.endsWith("dist/index.js")) {
        return Path.resolve(__dirname, "..", "assets", "api", "writer-generator", "python", fn);
    }
    return Path.resolve(__dirname, "../../../..", "assets", "api", "writer-generator", "python", fn);
};

type StringFormatKey = "snake_case" | "PascalCase" | "camelCase";

const AVAILABLE_STRING_FORMATS: Record<StringFormatKey, (str: string) => string> = {
    snake_case: snakeCase,
    PascalCase: pascalCase,
    camelCase: camelCase,
};

const MAX_IMPORT_LINE_LENGTH = 100;

const GENERIC_FIELD_REWRITES: Record<string, Record<string, string>> = {
    Coding: { code: "T" },
    CodeableConcept: { coding: "Coding[T]" },
};

const pyEnumType = (enumDef: EnumDefinition): string => {
    const values = enumDef.values.map((e) => `"${e}"`).join(", ");
    return enumDef.isOpen ? `Literal[${values}] | str` : `Literal[${values}]`;
};

export interface PythonGeneratorOptions extends WriterOptions {
    allowExtraFields?: boolean;
    primitiveTypeExtension?: boolean;
    generateProfile?: boolean;
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

type TypeSchemaPackageGroups = {
    groupedResources: Record<string, SpecializationTypeSchema[]>;
    groupedComplexTypes: Record<string, SpecializationTypeSchema[]>;
};

export class Python extends Writer<PythonGeneratorOptions> {
    readonly nameFormatFunction: (name: string) => string;
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
        this.generateSDKPackages(tsIndex, groups);
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

    private generateSDKPackages(tsIndex: TypeSchemaIndex, groups: TypeSchemaPackageGroups): void {
        this.generateComplexTypesPackages(groups.groupedComplexTypes);
        this.generateResourcePackages(tsIndex, groups);
    }

    private generateComplexTypesPackages(groupedComplexTypes: Record<string, SpecializationTypeSchema[]>): void {
        for (const [packageName, packageComplexTypes] of Object.entries(groupedComplexTypes)) {
            this.cd(`/${snakeCase(packageName)}`, () => {
                this.generateBasePy(packageName, packageComplexTypes);
            });
        }
    }

    private generateResourcePackages(tsIndex: TypeSchemaIndex, groups: TypeSchemaPackageGroups): void {
        const profilesByPackage = this.opts.generateProfile ? groupByPackages(tsIndex.collectProfiles()) : {};

        for (const [packageName, packageResources] of Object.entries(groups.groupedResources)) {
            this.cd(`/${snakeCase(packageName)}`, () => {
                this.generateResourcePackageContent(
                    packageName,
                    packageResources,
                    groups.groupedComplexTypes[packageName] || [],
                );

                const packageProfiles = profilesByPackage[packageName];
                if (packageProfiles && packageProfiles.length > 0) {
                    generateNewProfiles(this, tsIndex, packageProfiles);
                }
            });
        }

        // Profile-only packages (e.g. us-core, which constrains r4.core
        // resources but has no resources of its own). Emit their profiles
        // into a sibling package directory.
        for (const [packageName, packageProfiles] of Object.entries(profilesByPackage)) {
            if (groups.groupedResources[packageName]) continue;
            if (!packageProfiles || packageProfiles.length === 0) continue;
            this.cd(`/${snakeCase(packageName)}`, () => {
                generateNewProfiles(this, tsIndex, packageProfiles);
            });
        }
    }

    private generateResourcePackageContent(
        packageName: string,
        packageResources: SpecializationTypeSchema[],
        packageComplexTypes: SpecializationTypeSchema[],
    ): void {
        const pyPackageName = pyFhirPackageByName(this.opts.rootPackageName, packageName);

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
            const fullPyPackageName = pyFhirPackageByName(this.opts.rootPackageName, packageName);
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

    private importProfileRegistrations(groups: TypeSchemaPackageGroups): void {
        if (!this.opts.generateProfile) return;
        this.line();
        for (const packageName of Object.keys(groups.groupedResources)) {
            const profilesPackage = `${pyFhirPackageByName(this.opts.rootPackageName, packageName)}.profiles`;
            this.line(`import ${profilesPackage}  # noqa: F401`);
        }
    }

    private generateBasePy(_packageName: string, packageComplexTypes: SpecializationTypeSchema[]): void {
        const hasGenericTypes = packageComplexTypes.some((s) => s.identifier.name in GENERIC_FIELD_REWRITES);
        this.cat("base.py", () => {
            this.generateDisclaimer();
            this.generateDefaultImports(hasGenericTypes);
            if (hasGenericTypes) {
                this.line();
                this.line("T = TypeVar('T', bound=str, default=str)");
            }
            this.line();
            this.generateComplexTypes(packageComplexTypes);
            this.line();
        });
    }

    private generateComplexTypes(complexTypes: SpecializationTypeSchema[]): void {
        for (const schema of sortAsDeclarationSequence(complexTypes)) {
            this.generateNestedTypes(schema);
            this.line();
            this.generateType(schema);
        }
    }

    private generateResourcePackageInit(
        fullPyPackageName: string,
        packageResources: SpecializationTypeSchema[],
        packageComplexTypes?: SpecializationTypeSchema[],
    ): void {
        this.cat("__init__.py", () => {
            this.generateDisclaimer();
            this.importComplexTypes(fullPyPackageName, packageComplexTypes);
            const allResourceNames = this.importResources(fullPyPackageName, true, packageResources);
            this.line();
            this.generateExportsDeclaration(packageComplexTypes, allResourceNames);
        });
    }

    private importComplexTypes(fullPyPackageName: string, packageComplexTypes?: SpecializationTypeSchema[]): string[] {
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
        packageResources?: SpecializationTypeSchema[],
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

    private importOneResource(resource: SpecializationTypeSchema, fullPyPackageName: string): string[] {
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

    private collectResourceImportNames(resource: SpecializationTypeSchema): string[] {
        const names = [deriveResourceName(resource.identifier)];

        for (const nested of resource.nested ?? []) {
            const nestedName = deriveResourceName(nested.identifier);
            names.push(nestedName);
        }

        return names;
    }

    private shouldImportResourceFamily(resource: SpecializationTypeSchema): boolean {
        return resource.identifier.kind === "resource" && (resource.typeFamily?.resources?.length ?? 0) > 0;
    }

    private generateExportsDeclaration(
        packageComplexTypes: SpecializationTypeSchema[] | undefined,
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

    private generateResourceModule(schema: SpecializationTypeSchema): void {
        this.cat(`${snakeCase(schema.identifier.name)}.py`, () => {
            this.generateDisclaimer();
            this.generateDefaultImports(false);
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

    private generateType(schema: SpecializationTypeSchema | NestedTypeSchema): void {
        const className = deriveResourceName(schema.identifier);
        const superClasses = this.getSuperClasses(schema);

        this.line(`class ${className}(${superClasses.join(", ")}):`);
        this.indentBlock(() => {
            this.generateClassBody(schema);
        });
        this.line();
    }

    private getSuperClasses(schema: SpecializationTypeSchema | NestedTypeSchema): string[] {
        const bases: string[] = [];
        if (schema.base) bases.push(schema.base.name);
        bases.push(...this.injectSuperClasses(schema.identifier.url));
        if (schema.identifier.name in GENERIC_FIELD_REWRITES) bases.push("Generic[T]");
        return bases;
    }

    private generateClassBody(schema: SpecializationTypeSchema | NestedTypeSchema): void {
        this.generateModelConfig();

        if (!schema.fields) {
            this.line("pass");
            return;
        }

        if (isResourceTypeSchema(schema)) {
            this.generateResourceTypeField(schema);
        }

        this.generateFields(schema, schema.identifier.name);

        if (this.opts.generateProfile && schema.identifier.name === "Extension") {
            this.generateExtensionEqualityMethods();
        }

        if (isResourceTypeSchema(schema)) {
            this.generateResourceMethods(schema);
        }
    }

    private generateModelConfig(): void {
        const extraMode = this.opts.allowExtraFields ? "allow" : "forbid";
        this.line(`model_config = ConfigDict(validate_by_name=True, serialize_by_alias=True, extra="${extraMode}")`);
    }

    private generateResourceTypeField(schema: SpecializationTypeSchema): void {
        const hasChildren = (schema.typeFamily?.resources?.length ?? 0) > 0;

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

    private generateFields(schema: SpecializationTypeSchema | NestedTypeSchema, schemaName: string): void {
        const sortedFields = Object.entries(schema.fields ?? []).sort(([a], [b]) => a.localeCompare(b));
        const withExtensions = this.shouldAddPrimitiveExtensions(schema);

        for (const [fieldName, field] of sortedFields) {
            if ("choices" in field && field.choices) continue;

            const fieldInfo = this.buildFieldInfo(fieldName, field, schemaName);
            this.line(`${fieldInfo.name}: ${fieldInfo.type}${fieldInfo.defaultValue}`);

            if (withExtensions && "type" in field && isPrimitiveIdentifier(field.type)) {
                this.addPrimitiveExtensionField(fieldName, field.array ?? false);
            }
        }
    }

    private shouldAddPrimitiveExtensions(schema: SpecializationTypeSchema | NestedTypeSchema): boolean {
        if (!this.opts.primitiveTypeExtension) return false;
        if (!isSpecializationTypeSchema(schema)) return false;
        for (const field of Object.values(schema.fields ?? {})) {
            if ("choices" in field && field.choices) continue;
            if ("type" in field && isPrimitiveIdentifier(field.type)) return true;
        }
        return false;
    }

    private addPrimitiveExtensionField(fieldName: string, isArray: boolean): void {
        const pyFieldName = this.nameFormatFunction(`${fieldName}Extension`);
        const alias = `_${fieldName}`;
        const typeExpr = isArray ? "PyList[Element | None] | None" : "Element | None";
        const aliasSpec = `alias="${alias}", serialization_alias="${alias}"`;
        this.line(`${pyFieldName}: ${typeExpr} = Field(None, ${aliasSpec})`);
    }

    private buildFieldInfo(fieldName: string, field: Field, schemaName: string): FieldInfo {
        const pyFieldName = fixReservedWords(this.nameFormatFunction(fieldName));
        const fieldType = this.determineFieldType(field, fieldName, schemaName);
        const defaultValue = this.getFieldDefaultValue(field, fieldName);

        return {
            name: pyFieldName,
            type: fieldType,
            defaultValue: defaultValue,
        };
    }

    private determineFieldType(field: Field, fieldName: string, schemaName: string): string {
        let fieldType = field ? this.getBaseFieldType(field) : "";

        // Check for generic type field rewrites (e.g., Coding.code → T, CodeableConcept.coding → Coding[T])
        const rewrite = GENERIC_FIELD_REWRITES[schemaName]?.[fieldName];
        if (rewrite) {
            fieldType = rewrite;
            if (field.array) fieldType = `PyList[${fieldType}]`;
            if (!field.required) fieldType = `${fieldType} | None`;
            return fieldType;
        }

        if ("enum" in field && field.enum) {
            const baseTypeName = "type" in field ? field.type.name : "";
            if (baseTypeName in GENERIC_FIELD_REWRITES) {
                fieldType = `${fieldType}[${pyEnumType(field.enum)}]`;
            } else if (!field.enum.isOpen) {
                const s: string = field.enum.values.map((e: string) => `"${e}"`).join(", ");
                fieldType = `Literal[${s}]`;
            }
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

    private generateResourceMethods(schema: SpecializationTypeSchema): void {
        const className = schema.identifier.name.toString();

        this.line();
        this.line(
            "def to_json(self, indent: int | None = None, by_alias: bool = False, exclude_unset: bool = True) -> str:",
        );
        this.line(
            "    return self.model_dump_json(by_alias=by_alias, exclude_unset=exclude_unset, exclude_none=True, indent=indent)",
        );
        this.line();
        this.line("@classmethod");
        this.line(`def from_json(cls, json: str) -> ${className}:`);
        this.line("    return cls.model_validate_json(json)");
    }

    private generateExtensionEqualityMethods(): void {
        this.line();
        this.line("def __eq__(self, other: object) -> bool:");
        this.line("    if not isinstance(other, Extension):");
        this.line("        return NotImplemented");
        this.line(
            "    return self.model_dump(by_alias=True, exclude_none=True) == other.model_dump(by_alias=True, exclude_none=True)",
        );
        this.line();
        this.line("def __hash__(self) -> int:");
        this.line("    return hash(self.url)");
    }

    private generateNestedTypes(schema: SpecializationTypeSchema): void {
        if (!schema.nested) return;

        this.line();
        for (const subtype of schema.nested) {
            this.generateType(subtype);
        }
    }

    private generateDefaultImports(includeGenericImports: boolean): void {
        this.pyImportFrom("__future__", "annotations");
        this.pyImportFrom("pydantic", "BaseModel", "ConfigDict", "Field", "PositiveInt");
        const typingImports = ["Any", "List as PyList", "Literal"];
        if (includeGenericImports) {
            typingImports.push("Generic");
        }
        this.pyImportFrom("typing", ...typingImports.sort());
        if (includeGenericImports) {
            this.pyImportFrom("typing_extensions", "TypeVar");
        }
    }

    private generateDependenciesImports(schema: SpecializationTypeSchema): void {
        if (!schema.dependencies || schema.dependencies.length === 0) return;

        this.importComplexTypeDependencies(schema.dependencies);
        this.importResourceDependencies(schema.dependencies);
        this.importElementIfNeeded(schema);
    }

    private importElementIfNeeded(schema: SpecializationTypeSchema): void {
        if (!this.shouldAddPrimitiveExtensions(schema)) return;
        if (schema.identifier.name === "Element") return;
        if (schema.dependencies?.find((d) => d.name === "Element")) return;

        assert(this.tsIndex !== undefined);
        const elementUrl = "http://hl7.org/fhir/StructureDefinition/Element" as CanonicalUrl;
        const element = this.tsIndex.resolveByUrl(schema.identifier.package, elementUrl);
        if (!element) return;

        const pyPkg = pyPackage(this.opts.rootPackageName, element.identifier);
        this.pyImportFrom(pyPkg, "Element");
    }

    private importComplexTypeDependencies(dependencies: TypeIdentifier[]): void {
        const complexTypeDeps = dependencies.filter((dep) => dep.kind === "complex-type");
        const depsByPackage = this.groupDependenciesByPackage(complexTypeDeps);

        for (const [pyPackage, names] of Object.entries(depsByPackage)) {
            this.pyImportFrom(pyPackage, ...names.sort());
        }
    }

    private importResourceDependencies(dependencies: TypeIdentifier[]): void {
        const resourceDeps = dependencies.filter((dep) => dep.kind === "resource");

        for (const dep of resourceDeps) {
            this.pyImportType(dep);

            const familyName = `${pascalCase(dep.name)}Family`;
            const familyPackage = `${pyFhirPackage(this.opts.rootPackageName, dep)}.resource_families`;
            this.pyImportFrom(familyPackage, familyName);
        }
    }

    private groupDependenciesByPackage(dependencies: TypeIdentifier[]): ImportGroup {
        const grouped: ImportGroup = {};

        for (const dep of dependencies) {
            const pyPkg = pyPackage(this.opts.rootPackageName, dep);
            if (!grouped[pyPkg]) {
                grouped[pyPkg] = [];
            }
            grouped[pyPkg].push(dep.name);
        }

        return grouped;
    }

    pyImportFrom(pyPackage: string, ...entities: string[]): void {
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

    private pyImportType(identifier: TypeIdentifier): void {
        this.pyImportFrom(pyPackage(this.opts.rootPackageName, identifier), pascalCase(identifier.name));
    }

    private generateResourceFamilies(packageResources: SpecializationTypeSchema[]): void {
        assert(this.tsIndex !== undefined);
        const packages = //this.helper.getPackages(packageResources, this.opts.rootPackageName);
            Object.keys(groupByPackages(packageResources)).map(
                (pkgName) => `${this.opts.rootPackageName}.${pkgName.replaceAll(".", "_")}`,
            );
        const families: Record<string, string[]> = {};
        for (const resource of this.tsIndex.collectResources()) {
            const children = (resource.typeFamily?.resources ?? []).map((c) => c.name);
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
