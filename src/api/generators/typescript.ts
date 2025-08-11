/**
 * High-Level TypeScript Generator
 *
 * Provides a high-level API for generating TypeScript interfaces from TypeSchema documents.
 * This wraps the core TypeSchema transformer with additional convenience features.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	isPolymorphicInstanceField,
	isRegularField,
	isTypeSchemaForResourceComplexTypeLogical,
	type PolymorphicValueXFieldInstance,
	type RegularField,
	type TypeSchema,
	type TypeSchemaField,
	type TypeSchemaForResourceComplexTypeLogical,
	type TypeSchemaIdentifier,
} from "../../typeschema";
import { toPascalCase } from "../../utils";
import type { CodegenLogger } from "../../utils/codegen-logger";
import { createLogger } from "../../utils/codegen-logger";

type MakeRequiredNonNullable<T, K extends keyof T> = Omit<T, K> & {
	[P in K]-?: NonNullable<T[P]>;
};

/**
 * Options for the TypeScript API generator
 */
export interface TypeScriptAPIOptions {
	outputDir: string;
	moduleFormat?: "esm" | "cjs";
	generateIndex?: boolean;
	includeDocuments?: boolean;
	namingConvention?: "PascalCase" | "camelCase";
	includeExtensions?: boolean;
	includeProfiles?: boolean;
	logger?: CodegenLogger;
}

/**
 * Generated file result
 */
export interface GeneratedFile {
	path: string;
	filename: string;
	content: string;
	exports: string[];
}

export interface GeneratedTypeScript {
	content: string;
	imports: Map<string, string>;
	exports: string[];
	filename: string;
}

/**
 * Mapping of FHIR primitive types to TypeScript types
 */
const PRIMITIVE_TYPE_MAP: Record<string, string> = {
	// String types
	string: "string",
	code: "string",
	uri: "string",
	url: "string",
	canonical: "string",
	oid: "string",
	uuid: "string",
	id: "string",
	markdown: "string",
	xhtml: "string",
	base64Binary: "string",

	// Numeric types
	integer: "number",
	unsignedInt: "number",
	positiveInt: "number",
	decimal: "number",

	// Boolean type
	boolean: "boolean",

	// Date/time types (as strings for JSON compatibility)
	date: "string",
	dateTime: "string",
	instant: "string",
	time: "string",
};

/**
 * High-Level TypeScript Generator
 *
 * Generates TypeScript interfaces from TypeSchema documents with additional
 * features like index generation, documentation, and flexible output options.
 */
export class TypeScriptAPIGenerator {
	private options: Required<Omit<TypeScriptAPIOptions, "logger">> & {
		logger?: CodegenLogger;
	};
	private imports = new Map<string, string>();
	private exports = new Set<string>();
	private resourceTypes = new Set<string>();
	private currentSchemaName?: string;
	private profileTypes = new Set<string>();
	private enumTypes = new Map<
		string,
		{ values: string[]; description?: string }
	>();
	private globalEnumTypes = new Map<
		string,
		{ values: string[]; description?: string }
	>();
	private fieldEnumMap = new Map<string, string>();
	private logger: CodegenLogger;

	constructor(options: TypeScriptAPIOptions) {
		this.options = {
			moduleFormat: "esm",
			generateIndex: true,
			includeDocuments: true,
			namingConvention: "PascalCase",
			includeExtensions: false,
			includeProfiles: false,
			...options,
		};
		this.logger = options.logger || createLogger({ prefix: "TypeScript" });
	}

	/**
	 * Transform a single TypeSchema to TypeScript
	 */
	async transformSchema(
		schema: TypeSchema,
	): Promise<GeneratedTypeScript | undefined> {
		this.currentSchemaName = this.formatTypeName(schema.identifier.name);

		if (
			schema.identifier.kind === "value-set" ||
			schema.identifier.kind === "binding" ||
			schema.identifier.kind === "primitive-type"
		) {
			return undefined;
		}

		// Handle profiles separately if includeProfiles is true
		if (schema.identifier.kind === "profile") {
			if (this.options.includeProfiles) {
				return this.generateProfile(schema);
			}
			return undefined;
		}

		if (this.currentSchemaName === "Uri") {
			this.logger.debug(`Processing schema: ${schema.identifier.name}`);
		}

		// Clear state for new transformation
		this.imports.clear();
		this.exports.clear();
		this.currentSchemaName = this.formatTypeName(schema.identifier.name);

		// Generate TypeScript content
		const content = this.generateTypeScriptForSchema(schema);

		// Add enum types to imports if any were used in this schema
		for (const enumTypeName of this.enumTypes.keys()) {
			this.imports.set(enumTypeName, "utility");
		}

		const imports = new Map(this.imports);
		const filename = this.getFilename(schema.identifier);
		const exports = Array.from(this.exports.keys());

		return {
			content,
			imports,
			exports,
			filename,
		};
	}

	/**
	 * Generate TypeScript for a single schema
	 */
	private generateTypeScriptForSchema(schema: TypeSchema): string {
		const lines: string[] = [];

		// Clear local enum types for this schema
		this.enumTypes.clear();

		// Add interface declaration
		const interfaceName = this.formatTypeName(schema.identifier.name);

		let overridedName: string | undefined;

		if (interfaceName === "Reference") {
			overridedName = `Reference<T extends ResourceTypes = ResourceTypes>`;
		} else if (interfaceName === "Bundle") {
			overridedName = `Bundle<T extends keyof ResourceTypeMap = keyof ResourceTypeMap>`;
			this.imports.set("ResourceTypeMap", "utility");
		}

		this.exports.add(interfaceName);

		const baseInterface = this.getBaseInterface(schema);
		if (baseInterface && !baseInterface.isPrimitive) {
			this.imports.set(baseInterface.value, baseInterface.value);
			lines.push(
				`export interface ${overridedName ?? interfaceName} extends ${baseInterface.value} {`,
			);
		} else {
			lines.push(`export interface ${overridedName ?? interfaceName} {`);
		}

		if (
			schema.identifier.kind === "resource" &&
			interfaceName !== "DomainResource" &&
			interfaceName !== "Resource"
		) {
			this.resourceTypes.add(interfaceName);
			lines.push(`\tresourceType: '${interfaceName}';`);
		}
		if (isTypeSchemaForResourceComplexTypeLogical(schema)) {
			if (schema.fields) {
				for (const [fieldName, field] of Object.entries(schema.fields)) {
					const fieldLine = this.generateField(fieldName, field, {
						isNested: "type" in field && field.type.kind === "nested",
						baseName: interfaceName,
					});
					if (fieldLine) {
						lines.push(`\t${fieldLine}`);
					}
				}
			}

			lines.push("}");

			// Add nested types if any
			if (schema.nested) {
				for (const nested of schema.nested) {
					lines.push("");
					// TODO: improve typings later
					// @ts-expect-error
					lines.push(this.generateNested(this.currentSchemaName ?? "", nested));
				}
			}
		} else {
			lines.push("}");
		}

		// Enum types are exported from utility.ts for reuse

		return lines.join("\n");
	}

	/**
	 * Generate TypeScript for nested type
	 */
	private generateNested(
		baseName: string,
		nested: MakeRequiredNonNullable<
			TypeSchemaForResourceComplexTypeLogical,
			"nested"
		>,
	): string {
		const lines: string[] = [];
		const interfaceName = this.formatTypeName(nested.identifier.name);
		let fullTypeName = `${baseName}${interfaceName}`;

		// Add generic support for BundleEntry
		if (fullTypeName === "BundleEntry") {
			fullTypeName = `BundleEntry<T extends keyof ResourceTypeMap = keyof ResourceTypeMap>`;
			this.imports.set("ResourceTypeMap", "utility");
		}

		this.exports.add(baseName + interfaceName); // Export the base name for imports

		if (nested.base) {
			const baseInterface = this.getType(nested.base);

			if (baseInterface.isPrimitive) {
				lines.push(`export interface ${fullTypeName}{`);
			} else {
				this.imports.set(baseInterface.value, baseInterface.value);
				lines.push(
					`export interface ${fullTypeName} extends ${baseInterface.value} {`,
				);
			}
		} else {
			lines.push(`export interface ${fullTypeName}{`);
		}

		if (nested.fields) {
			for (const [fieldName, field] of Object.entries(nested.fields)) {
				const fieldLine = this.generateField(fieldName, field, {
					isNested: false,
					baseName: fullTypeName,
				});
				if (fieldLine) {
					lines.push(`\t${fieldLine}`);
				}
			}
		}

		lines.push("}");

		return lines.join("\n");
	}

	/**
	 * Generate TypeScript for a field
	 */
	private generateField(
		fieldName: string,
		field: TypeSchemaField,
		nestedOpts?: { isNested?: boolean; baseName?: string },
	): string {
		if (isPolymorphicInstanceField(field)) {
			return this.generatePolymorphicInstance(fieldName, field, nestedOpts);
		} else if (isRegularField(field)) {
			return this.generateRegularField(fieldName, field, nestedOpts);
		}

		return "";
	}

	/**
	 * Generate TypeScript for polymorphic instance
	 */
	private generatePolymorphicInstance(
		fieldName: string,
		field: PolymorphicValueXFieldInstance,
		nestedOpts?: { isNested?: boolean; baseName?: string },
	): string {
		let typeString = "any";

		if (field.enum) {
			// Generate a separate enum type for this field
			const enumTypeName = this.generateEnumType(
				fieldName,
				field.enum,
				nestedOpts?.baseName,
			);
			typeString = enumTypeName;
		} else if (field.reference) {
			typeString = this.buildReferenceType(field.reference);
		} else if (field.type) {
			const subType = this.getType(field.type);
			if (!subType.isPrimitive && !nestedOpts?.isNested) {
				this.imports.set(subType.value, subType.value);
			}
			typeString = subType.value;
		}

		const optional = !field.required ? "?" : "";
		const array = field.array ? "[]" : "";

		return `${fieldName}${optional}: ${nestedOpts?.isNested && nestedOpts.baseName ? nestedOpts.baseName : ""}${typeString}${array};`;
	}

	/**
	 * Generate TypeScript for a regular field
	 */
	private generateRegularField(
		fieldName: string,
		field: RegularField,
		nestedOpts?: { isNested?: boolean; baseName?: string },
	): string {
		let typeString = "any";

		if (field.enum) {
			// Generate a separate enum type for this field
			const enumTypeName = this.generateEnumType(
				fieldName,
				field.enum,
				nestedOpts?.baseName,
			);
			typeString = enumTypeName;
		} else if (field.reference) {
			typeString = this.buildReferenceType(field.reference);
		} else if (field.type) {
			const subType = this.getType(field.type);
			if (!subType.isPrimitive && !nestedOpts?.isNested) {
				this.imports.set(subType.value, subType.value);
			}
			typeString = subType.value;
		}

		if (nestedOpts?.baseName === "Reference" && fieldName === "type") {
			typeString = "T";
			this.imports.set("ResourceTypes", "utility");
		} else if (
			nestedOpts?.baseName?.startsWith("BundleEntry") &&
			fieldName === "resource"
		) {
			typeString = "ResourceTypeMap[T]";
			this.imports.set("ResourceTypeMap", "utility");
		} else if (this.currentSchemaName === "Bundle" && fieldName === "entry") {
			typeString = "BundleEntry<T>";
		}

		const optional = !field.required ? "?" : "";
		const array = field.array ? "[]" : "";

		// Don't add baseName prefix for special cases like Bundle entry field
		const shouldAddPrefix =
			nestedOpts?.isNested &&
			nestedOpts.baseName &&
			!(this.currentSchemaName === "Bundle" && fieldName === "entry");
		return `${fieldName}${optional}: ${shouldAddPrefix ? nestedOpts.baseName : ""}${typeString}${array};`;
	}

	private buildReferenceType(refers: TypeSchemaIdentifier[]) {
		this.imports.set("Reference", "Reference");
		if (refers.length === 0) {
			return "Reference";
		}
		if (refers.length === 1 && refers[0]?.name === "Resource") {
			return "Reference";
		}
		return `Reference<${refers.map((r) => `'${r.name}'`).join(" | ")}>`;
	}

	/**
	 * Transform multiple schemas
	 */
	async transformSchemas(
		schemas: TypeSchema[],
	): Promise<GeneratedTypeScript[]> {
		const results: GeneratedTypeScript[] = [];

		for (const schema of schemas) {
			const result = await this.transformSchema(schema);
			if (result) {
				results.push(result);
			}
		}

		return results;
	}

	/**
	 * Generate TypeScript files from TypeSchema documents
	 */
	async generate(schemas: TypeSchema[]): Promise<GeneratedFile[]> {
		const filteredSchemas = this.filterSchemas(schemas);

		// Use legacy transformer
		const results = await this.transformSchemas(filteredSchemas);
		const generatedFiles: GeneratedFile[] = [];

		// Ensure output directory and subfolders exist
		await mkdir(this.options.outputDir, { recursive: true });

		if (this.options.includeProfiles) {
			await mkdir(join(this.options.outputDir, "profiles"), {
				recursive: true,
			});
		}
		if (this.options.includeExtensions) {
			await mkdir(join(this.options.outputDir, "extensions"), {
				recursive: true,
			});
		}

		// Generate utility types file
		let utilityContent = `export type ResourceTypes = ${Array.from(
			this.resourceTypes,
		)
			.map((key) => `'${key}'`)
			.join(" | ")};\n\n`;

		// Note: ResourceTypeMap is now generated by the REST client generator
		// to prevent circular dependencies between generators

		// Add all global enum types to utility file
		if (this.globalEnumTypes.size > 0) {
			utilityContent += "// Shared Enum Types\n\n";
			for (const [typeName, enumDef] of this.globalEnumTypes) {
				if (enumDef.description) {
					utilityContent += `/**\n * ${enumDef.description}\n */\n`;
				}
				const unionType = enumDef.values.map((v) => `'${v}'`).join(" | ");
				utilityContent += `export type ${typeName} = ${unionType};\n\n`;
			}
		}

		results.push({
			filename: "utility.ts",
			content: utilityContent,
			imports: new Map(),
			exports: ["ResourceTypes", ...Array.from(this.globalEnumTypes.keys())],
		});

		// Write individual type files
		for (const result of results) {
			const filePath = join(this.options.outputDir, result.filename);
			await this.ensureDirectoryExists(filePath);
			const imports =
				result.filename === "utility.ts"
					? ""
					: this.generateImportStatements(result.imports);
			const content = imports
				? `${imports}\n\n${result.content}`
				: result.content;
			await writeFile(filePath, content, "utf-8");

			generatedFiles.push({
				path: filePath,
				filename: result.filename,
				content: result.content,
				exports: result.exports,
			});
		}

		// Generate index file if requested
		if (this.options.generateIndex) {
			const indexFile = await this.generateIndexFile(results);
			const indexPath = join(this.options.outputDir, "index.ts");
			await writeFile(indexPath, indexFile.content, "utf-8");

			generatedFiles.push({
				path: indexPath,
				filename: "index.ts",
				content: indexFile.content,
				exports: indexFile.exports,
			});

			// Generate subfolder index files
			await this.generateSubfolderIndexFiles(results, generatedFiles);
		}

		return generatedFiles;
	}

	private generateImportStatements(imports: Map<string, string>): string {
		const lines: string[] = [];

		// Group imports by package
		const importsByPackage = new Map<string, string[]>();

		for (const [item, pkg] of imports) {
			if (!importsByPackage.has(pkg)) {
				importsByPackage.set(pkg, []);
			}
			importsByPackage.get(pkg)!.push(item);
		}

		// Generate import statements
		for (const [pkg, items] of importsByPackage) {
			if (items.length === 1) {
				lines.push(`import type { ${items[0]} } from './${pkg}';`);
			} else {
				lines.push(
					`import type {\n\t${items.join(",\n\t")}\n} from './${pkg}';`,
				);
			}
		}

		return lines.join("\n");
	}

	/**
	 * Generate and return results without writing to files
	 */
	async build(schemas: TypeSchema[]): Promise<GeneratedFile[]> {
		const filteredSchemas = this.filterSchemas(schemas);
		const results = await this.transformSchemas(filteredSchemas);
		const generatedFiles: GeneratedFile[] = [];

		// Convert transformer results to API format
		for (const result of results) {
			generatedFiles.push({
				path: join(this.options.outputDir, result.filename),
				filename: result.filename,
				content: result.content,
				exports: result.exports,
			});
		}

		// Generate index file if requested
		if (this.options.generateIndex) {
			const indexFile = await this.generateIndexFile(results);
			generatedFiles.push({
				path: join(this.options.outputDir, "index.ts"),
				filename: "index.ts",
				content: indexFile.content,
				exports: indexFile.exports,
			});
		}

		return generatedFiles;
	}

	/**
	 * Set output directory
	 */
	setOutputDir(directory: string): void {
		this.options.outputDir = directory;
	}

	/**
	 * Update generator options
	 */
	setOptions(options: Partial<TypeScriptAPIOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Get current options
	 */
	getOptions(): Required<TypeScriptAPIOptions> {
		return { ...this.options };
	}

	private async generateIndexFile(
		results: any[],
	): Promise<{ content: string; exports: string[] }> {
		const lines: string[] = [];
		const exports: string[] = [];

		// Add header comment
		lines.push("/**");
		lines.push(" * Generated TypeScript Type Definitions");
		lines.push(" * ");
		lines.push(
			" * Auto-generated from TypeSchema documents using atomic-codegen.",
		);
		lines.push(" * ");
		lines.push(" * @packageDocumentation");
		lines.push(" */");
		lines.push("");

		// Group exports by category
		const primitiveTypes: string[] = [];
		const complexTypes: string[] = [];
		const resources: string[] = [];
		const profiles: string[] = [];
		const valueSets: string[] = [];

		for (const result of results) {
			for (const exportName of result.exports) {
				// Categorize exports based on filename patterns
				if (result.filename.includes("profiles/")) {
					profiles.push(exportName);
				} else if (result.filename.includes("primitive")) {
					primitiveTypes.push(exportName);
				} else if (result.filename.includes("complex")) {
					complexTypes.push(exportName);
				} else if (result.filename.includes("resource")) {
					resources.push(exportName);
				} else if (result.filename.includes("valueset")) {
					valueSets.push(exportName);
				} else {
					// Default to complex types
					complexTypes.push(exportName);
				}
			}

			// Generate export statement for each file
			const baseName = result.filename.replace(".ts", "");
			if (
				baseName.startsWith("valueset") ||
				baseName.startsWith("extension") ||
				baseName.startsWith("profiles/")
			) {
				continue;
			}
			if (result.exports.length > 0) {
				if (result.exports.length === 1) {
					lines.push(
						`export type { ${result.exports[0]} } from './${baseName}';`,
					);
				} else {
					lines.push(`export type {`);
					for (let i = 0; i < result.exports.length; i++) {
						const exportName = result.exports[i];
						const isLast = i === result.exports.length - 1;
						lines.push(`  ${exportName}${isLast ? "" : ","}`);
					}
					lines.push(`} from './${baseName}';`);
				}
				exports.push(...result.exports);
			}
		}

		lines.push("");

		// Generate utility types and type guards
		if (resources.length > 0) {
			lines.push("// Resource type utilities");
			lines.push("");

			// Resource type map
			lines.push("export const ResourceTypeMap = {");
			for (const resource of resources.sort()) {
				lines.push(`  ${resource}: true,`);
			}
			lines.push("} as const;");
			lines.push("");

			// Resource type union
			lines.push("export type ResourceType = keyof typeof ResourceTypeMap;");
			lines.push("");

			// Resource union type
			lines.push("export type AnyResource =");
			for (let i = 0; i < resources.length; i++) {
				const resource = resources[i];
				const isLast = i === resources.length - 1;
				lines.push(`  ${i === 0 ? "" : "| "}${resource}${isLast ? ";" : ""}`);
			}
			lines.push("");

			// Type guard function
			lines.push("/**");
			lines.push(" * Type guard to check if an object is a FHIR resource");
			lines.push(" */");
			lines.push(
				"export function isFHIRResource(obj: unknown): obj is AnyResource {",
			);
			lines.push(
				'  return obj && typeof obj === "object" && "resourceType" in obj && (obj.resourceType as string) in ResourceTypeMap;',
			);
			lines.push("}");
			lines.push("");
		}

		// Generate namespace exports for better organization
		lines.push("// Namespace exports for organized access");
		lines.push("");

		// Always export namespaces (even if empty, they'll have export {} in their index)
		lines.push(
			"// Value sets namespace - contains all FHIR ValueSet types and bindings",
		);
		lines.push('export * as ValueSets from "./valuesets";');
		lines.push("");
		if (this.options.includeExtensions) {
			lines.push("// Extensions namespace - contains all FHIR Extension types");
			lines.push('export * as Extensions from "./extensions";');
			lines.push("");
		}

		if (this.options.includeProfiles) {
			lines.push("// Profiles namespace - contains all FHIR Profile types");
			lines.push('export * as Profiles from "./profiles";');
			lines.push("");
		}

		const content = lines.join("\n");
		return { content, exports };
	}

	private async ensureDirectoryExists(filePath: string): Promise<void> {
		const dir = dirname(filePath);
		await mkdir(dir, { recursive: true });
	}

	/**
	 * Filter schemas based on includeExtensions option
	 */
	private filterSchemas(schemas: TypeSchema[]): TypeSchema[] {
		if (this.options.includeExtensions) {
			return schemas;
		}

		// TODO: fix later
		return schemas;
	}

	/**
	 * Generate index files for subfolders
	 */
	private async generateSubfolderIndexFiles(
		results: any[],
		generatedFiles: GeneratedFile[],
	): Promise<void> {
		const subfolders: string[] = [];
		if (this.options.includeExtensions) {
			subfolders.push("extensions");
		}
		if (this.options.includeProfiles) {
			subfolders.push("profiles");
		}

		for (const subfolder of subfolders) {
			const subfolderResults = results.filter((r) =>
				r.filename.startsWith(`${subfolder}/`),
			);

			// Always generate index file, even for empty directories
			const indexContent = this.generateSubfolderIndex(
				subfolderResults,
				subfolder,
			);
			const indexPath = join(this.options.outputDir, subfolder, "index.ts");
			await writeFile(indexPath, indexContent, "utf-8");

			generatedFiles.push({
				path: indexPath,
				filename: `${subfolder}/index.ts`,
				content: indexContent,
				exports: subfolderResults.flatMap((r) => r.exports),
			});
		}
	}

	/**
	 * Generate index content for a subfolder
	 */
	private generateSubfolderIndex(results: any[], subfolder: string): string {
		const lines: string[] = [];

		lines.push("/**");
		lines.push(
			` * ${subfolder.charAt(0).toUpperCase() + subfolder.slice(1)} Index`,
		);
		lines.push(" * ");
		lines.push(" * Auto-generated exports for all types in this subfolder.");
		lines.push(" */");
		lines.push("");

		// If no results, export empty object
		if (results.length === 0) {
			lines.push("// No types in this category");
			lines.push("export {};");
			return lines.join("\n");
		}

		for (const result of results) {
			const baseName = result.filename
				.replace(`${subfolder}/`, "")
				.replace(".ts", "");

			if (result.exports.length > 0) {
				if (result.exports.length === 1) {
					lines.push(
						`export type { ${result.exports[0]} } from './${baseName}';`,
					);
				} else {
					lines.push(`export type {`);
					for (let i = 0; i < result.exports.length; i++) {
						const exportName = result.exports[i];
						const isLast = i === result.exports.length - 1;
						lines.push(`  ${exportName}${isLast ? "" : ","}`);
					}
					lines.push(`} from './${baseName}';`);
				}
			}
		}

		return lines.join("\n");
	}

	/**
	 * Format type name according to naming convention
	 */
	private formatTypeName(name: string): string {
		if (this.options.namingConvention === "PascalCase") {
			return toPascalCase(name);
		}
		return name;
	}

	/**
	 * Get TypeScript type for a TypeSchema identifier
	 */
	private getType(identifier: TypeSchemaIdentifier): {
		isPrimitive: boolean;
		value: string;
	} {
		const primitiveType = PRIMITIVE_TYPE_MAP[identifier.name];
		if (primitiveType) {
			return { isPrimitive: true, value: primitiveType };
		}

		// Return formatted type name
		return { isPrimitive: false, value: this.formatTypeName(identifier.name) };
	}

	/**
	 * Get base interface for schema
	 */
	private getBaseInterface(
		schema: TypeSchema,
	): { isPrimitive: boolean; value: string } | null {
		// Handle profiles (which have kind: "profile") as well as resources/complex-types
		if (
			(isTypeSchemaForResourceComplexTypeLogical(schema) ||
				schema.identifier.kind === "profile") &&
			(schema as any).base
		) {
			return this.getType((schema as any).base);
		}
		return null;
	}

	/**
	 * Get filename for schema
	 */
	private getFilename(identifier: TypeSchemaIdentifier): string {
		const name = toPascalCase(identifier.name);

		// Place profiles in subfolder if configured
		if (identifier.kind === "profile" && this.options.includeProfiles) {
			const subfolder = "profiles"; // Could be made configurable
			return `${subfolder}/${name}.ts`;
		}

		return `${name}.ts`;
	}

	/**
	 * Generate TypeScript for a profile schema
	 */
	private async generateProfile(
		schema: TypeSchema,
	): Promise<GeneratedTypeScript | undefined> {
		// Clear state for new transformation
		this.imports.clear();
		this.exports.clear();
		this.currentSchemaName = this.formatTypeName(schema.identifier.name);

		// Track as profile type
		this.profileTypes.add(this.currentSchemaName);

		// Generate TypeScript content for profile
		const content = this.generateTypeScriptForProfile(schema);

		const imports = new Map(this.imports);
		const filename = this.getFilename(schema.identifier);
		const exports = Array.from(this.exports.keys());

		return {
			content,
			imports,
			exports,
			filename,
		};
	}

	/**
	 * Generate TypeScript for a profile schema
	 */
	private generateTypeScriptForProfile(schema: TypeSchema): string {
		const lines: string[] = [];
		const interfaceName = this.formatTypeName(schema.identifier.name);

		// Add documentation if available
		if (schema.description) {
			lines.push("/**");
			lines.push(` * ${schema.description}`);
			lines.push(` * @profile ${schema.identifier.url}`);
			lines.push(" */");
		}

		this.exports.add(interfaceName);

		// Get base interface (profiles should always have a base)
		const baseInterface = this.getBaseInterface(schema);
		if (baseInterface && !baseInterface.isPrimitive) {
			// Import base from parent directory if in profiles subfolder
			const importPath = baseInterface.value;
			this.imports.set(baseInterface.value, `../${importPath}`);
			lines.push(
				`export interface ${interfaceName} extends ${baseInterface.value} {`,
			);
		} else {
			lines.push(`export interface ${interfaceName} {`);
		}

		// For profiles, we typically don't override fields unless there are specific constraints
		// Profiles usually just add constraints to existing base resource fields
		if (
			isTypeSchemaForResourceComplexTypeLogical(schema) ||
			schema.identifier.kind === "profile"
		) {
			// For profiles, only generate field overrides that have meaningful constraints

			// Check schema.constraints for fields that need to be overridden
			if (
				(schema as any).constraints &&
				Object.keys((schema as any).constraints).length > 0
			) {
				for (const [path, constraint] of Object.entries(
					(schema as any).constraints as Record<string, any>,
				)) {
					const fieldName = path.includes(".") ? path.split(".").pop() : path;
					if (!fieldName) continue;

					// Only generate field override if constraint makes it meaningfully different
					if ((constraint as any).min && (constraint as any).min > 0) {
						// Field is now required - need to override to remove optional marker
						const field = (schema as any).fields?.[fieldName];
						if (field) {
							const fieldLine = this.generateProfileField(
								fieldName,
								field,
								schema,
							);
							if (fieldLine) {
								lines.push(`\t${fieldLine}`);
							}
						}
					}
				}
			}

			lines.push("}");

			// Add nested types if any (rare for profiles)
			if ((schema as any).nested) {
				for (const nested of (schema as any).nested) {
					lines.push("");
					lines.push(this.generateNested(this.currentSchemaName ?? "", nested));
				}
			}
		} else {
			lines.push("}");
		}

		// Generate validator if configured
		if (this.options.includeProfiles) {
			lines.push("");
			lines.push(this.generateProfileValidator(interfaceName, schema));
		}

		// Generate type guard
		lines.push("");
		lines.push(this.generateProfileTypeGuard(interfaceName, schema));

		return lines.join("\n");
	}

	/**
	 * Generate TypeScript for a profile field with constraints
	 */
	private generateProfileField(
		fieldName: string,
		field: TypeSchemaField,
		schema: TypeSchema,
	): string {
		// Apply profile-specific constraints
		let typeString = "any";
		let required = false;
		let array = false;

		if (isRegularField(field)) {
			required = field.required || false;
			array = field.array || false;

			// Handle constrained value sets
			if (field.enum) {
				// Generate a separate enum type for this field
				const enumTypeName = this.generateEnumType(
					fieldName,
					field.enum,
					this.currentSchemaName,
				);
				typeString = enumTypeName;
			} else if (field.reference) {
				typeString = this.buildReferenceType(field.reference);
			} else if (field.type) {
				const subType = this.getType(field.type);
				if (!subType.isPrimitive) {
					// Import from parent directory for profiles
					this.imports.set(subType.value, `../${subType.value}`);
				}
				typeString = subType.value;
			}
		} else if (isPolymorphicInstanceField(field)) {
			required = field.required || false;
			array = field.array || false;

			if (field.reference) {
				typeString = this.buildReferenceType(field.reference);
			} else if (field.type) {
				const subType = this.getType(field.type);
				if (!subType.isPrimitive) {
					this.imports.set(subType.value, `../${subType.value}`);
				}
				typeString = subType.value;
			}
		} else if ("choices" in field) {
			// Handle choice fields (fields with choices array but no choiceOf)
			required = field.required || false;
			array = field.array || false;

			// For choice fields, we don't generate the field itself in profiles
			// The choice fields are handled by the individual choice options
			return ""; // Skip generating this field
		}

		// Apply cardinality constraints from profile
		// Check if field has specific profile constraints (would need to be in schema)
		// Check for profile-specific metadata
		if ((schema as any).constraints && (schema as any).constraints[fieldName]) {
			const constraint = (schema as any).constraints[fieldName] as any;
			if (constraint.min && constraint.min > 0) {
				required = true;
			}
			if (constraint.max === "*") {
				array = true;
			}
		}

		const optional = !required ? "?" : "";
		const arrayType = array ? "[]" : "";

		return `${fieldName}${optional}: ${typeString}${arrayType};`;
	}

	/**
	 * Generate profile validator function
	 */
	private generateProfileValidator(
		interfaceName: string,
		schema: TypeSchema,
	): string {
		const lines: string[] = [];
		const validatorName = `validate${interfaceName}`;

		lines.push("/**");
		lines.push(` * Validate a resource against the ${interfaceName} profile`);
		lines.push(" */");
		lines.push(
			`export function ${validatorName}(resource: unknown): ValidationResult {`,
		);
		lines.push("\tconst errors: string[] = [];");
		lines.push("");

		// Get base validator if exists
		const baseInterface = this.getBaseInterface(schema);
		if (baseInterface && !baseInterface.isPrimitive) {
			// Import base type guard
			this.imports.set(`is${baseInterface.value}`, `../${baseInterface.value}`);

			lines.push(`\t// Validate base resource`);
			lines.push(`\tif (!is${baseInterface.value}(resource)) {`);
			lines.push(
				`\t\treturn { valid: false, errors: ['Not a valid ${baseInterface.value} resource'] };`,
			);
			lines.push("\t}");
			lines.push("");
			lines.push(`\tconst typed = resource as ${baseInterface.value};`);
			lines.push("");
		}

		// Add profile-specific constraint validation
		if ((schema as any).constraints) {
			lines.push("\t// Profile constraint validation");
			for (const [path, constraint] of Object.entries(
				(schema as any).constraints as Record<string, any>,
			)) {
				this.generateConstraintValidation(lines, path, constraint);
			}
			lines.push("");
		}

		// Add must-support validation
		if ((schema as any).constraints) {
			const mustSupportFields: string[] = [];
			for (const [path, constraint] of Object.entries(
				(schema as any).constraints as Record<string, any>,
			)) {
				if ((constraint as any).mustSupport) {
					mustSupportFields.push(path);
				}
			}

			if (mustSupportFields.length > 0) {
				lines.push("\t// Must Support elements validation");
				for (const field of mustSupportFields) {
					lines.push(`\t// Must support: ${field}`);
					lines.push(`\t// Note: Must Support validation is context-dependent`);
				}
				lines.push("");
			}
		}

		lines.push("\treturn {");
		lines.push("\t\tvalid: errors.length === 0,");
		lines.push("\t\terrors");
		lines.push("\t};");
		lines.push("}");

		// Add ValidationResult type if not imported
		this.imports.set("ValidationResult", "../types");

		return lines.join("\n");
	}

	/**
	 * Generate TypeScript field with profile constraints applied
	 */
	private generateConstrainedProfileField(
		path: string,
		constraint: any,
		schema: TypeSchema,
	): string {
		const fieldPath = path.includes(".") ? path.split(".").pop() : path;
		if (!fieldPath) return "";

		// Determine type based on field name and constraint
		let typeString = "any";
		let required = false;
		let array = false;

		// Apply constraints
		if (constraint.min !== undefined && constraint.min > 0) {
			required = true;
		}

		if (constraint.max === "*") {
			array = true;
		}

		// Handle specific field types based on common FHIR field names
		switch (fieldPath) {
			case "status":
				typeString = "string";
				break;
			case "category":
				typeString = "CodeableConcept";
				array = true;
				this.imports.set("CodeableConcept", "../CodeableConcept");
				break;
			case "code":
				typeString = "CodeableConcept";
				this.imports.set("CodeableConcept", "../CodeableConcept");
				break;
			case "subject":
				typeString = "Reference";
				this.imports.set("Reference", "../Reference");
				break;
			case "effective":
			case "effectiveDateTime":
				typeString = "string";
				break;
			case "effectivePeriod":
				typeString = "Period";
				this.imports.set("Period", "../Period");
				break;
			case "dataAbsentReason":
				typeString = "CodeableConcept";
				this.imports.set("CodeableConcept", "../CodeableConcept");
				break;
			case "component":
				typeString = "any"; // Component is complex
				array = true;
				break;
			default:
				// For enum constraints, use the enum values
				if (constraint.binding && constraint.binding.strength === "required") {
					// Would need value set expansion here
					typeString = "string";
				}
		}

		// Apply fixed value constraint
		if (constraint.fixedValue !== undefined) {
			if (typeof constraint.fixedValue === "string") {
				typeString = `'${constraint.fixedValue}'`;
			} else {
				typeString = JSON.stringify(constraint.fixedValue);
			}
		}

		const optional = !required ? "?" : "";
		const arrayType = array ? "[]" : "";

		return `${fieldPath}${optional}: ${typeString}${arrayType};`;
	}

	/**
	 * Generate validation logic for a specific constraint
	 */
	private generateConstraintValidation(
		lines: string[],
		path: string,
		constraint: any,
	): void {
		const fieldPath = path.includes(".") ? path.split(".").pop() : path;

		// Cardinality validation
		if (constraint.min !== undefined && constraint.min > 0) {
			if (constraint.min === 1) {
				lines.push(`\tif (!typed.${fieldPath}) {`);
				lines.push(
					`\t\terrors.push('${fieldPath} is required for this profile');`,
				);
				lines.push("\t}");
			} else {
				lines.push(
					`\tif (!typed.${fieldPath} || (Array.isArray(typed.${fieldPath}) && typed.${fieldPath}.length < ${constraint.min})) {`,
				);
				lines.push(
					`\t\terrors.push('${fieldPath} must have at least ${constraint.min} item(s)');`,
				);
				lines.push("\t}");
			}
		}

		// Fixed value validation
		if (constraint.fixedValue !== undefined) {
			const fixedValue =
				typeof constraint.fixedValue === "string"
					? `'${constraint.fixedValue}'`
					: JSON.stringify(constraint.fixedValue);
			lines.push(`\tif (typed.${fieldPath} !== ${fixedValue}) {`);
			lines.push(
				`\t\terrors.push('${fieldPath} must have fixed value ${fixedValue}');`,
			);
			lines.push("\t}");
		}

		// Value set binding validation (simplified)
		if (constraint.binding && constraint.binding.strength === "required") {
			lines.push(`\t// Required binding validation for ${fieldPath}`);
			lines.push(
				`\t// Note: Full value set validation requires external value set service`,
			);
		}
	}

	/**
	 * Generate an enum type for a field with enumerated values
	 */
	private generateEnumType(
		fieldName: string,
		enumValues: string[],
		baseName?: string,
	): string {
		// Create a type name based on the current schema and field
		const prefix = baseName || this.currentSchemaName || "";
		const enumTypeName = `${prefix}${this.toPascalCase(fieldName)}Values`;

		// Store the enum type if not already stored
		if (!this.enumTypes.has(enumTypeName)) {
			this.enumTypes.set(enumTypeName, {
				values: enumValues,
				description: `Valid values for ${fieldName} field in ${prefix}`,
			});
			this.exports.add(enumTypeName);

			// Also add to global enum types for cross-file reuse
			if (!this.globalEnumTypes.has(enumTypeName)) {
				this.globalEnumTypes.set(enumTypeName, {
					values: enumValues,
					description: `Valid values for ${fieldName} field in ${prefix}`,
				});
			}
		}

		return enumTypeName;
	}

	/**
	 * Generate all enum type definitions
	 */
	private generateEnumTypes(): string {
		const lines: string[] = [];

		if (this.enumTypes.size > 0) {
			lines.push("// Enum Types");
			lines.push("");

			for (const [typeName, enumDef] of this.enumTypes) {
				if (enumDef.description) {
					lines.push("/**");
					lines.push(` * ${enumDef.description}`);
					lines.push(" */");
				}

				// Generate as a union type
				const unionType = enumDef.values.map((v) => `'${v}'`).join(" | ");
				lines.push(`export type ${typeName} = ${unionType};`);
				lines.push("");
			}
		}

		return lines.join("\n");
	}

	/**
	 * Convert string to PascalCase
	 */
	private toPascalCase(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	/**
	 * Generate profile type guard function
	 */
	private generateProfileTypeGuard(
		interfaceName: string,
		schema: TypeSchema,
	): string {
		const lines: string[] = [];
		const guardName = `is${interfaceName}`;

		lines.push("/**");
		lines.push(` * Type guard for ${interfaceName} profile`);
		lines.push(" */");
		lines.push(
			`export function ${guardName}(resource: unknown): resource is ${interfaceName} {`,
		);

		// Check base type first
		const baseInterface = this.getBaseInterface(schema);
		if (baseInterface && !baseInterface.isPrimitive) {
			// Import base type guard
			this.imports.set(`is${baseInterface.value}`, `../${baseInterface.value}`);

			lines.push(`\tif (!is${baseInterface.value}(resource)) return false;`);
			lines.push("");
			lines.push(`\tconst typed = resource as ${baseInterface.value};`);
		} else {
			lines.push(
				`\tif (!resource || typeof resource !== 'object') return false;`,
			);
			lines.push("");
			lines.push("\tconst typed = resource as any;");
		}

		// Add profile-specific constraint checks
		if ((schema as any).constraints) {
			lines.push("\t// Profile constraint checks");
			let hasRequiredChecks = false;

			for (const [path, constraint] of Object.entries(
				(schema as any).constraints as Record<string, any>,
			)) {
				const fieldPath = path.includes(".") ? path.split(".").pop() : path;

				// Check required fields (min cardinality > 0)
				if (
					(constraint as any).min !== undefined &&
					(constraint as any).min > 0
				) {
					hasRequiredChecks = true;
					if ((constraint as any).min === 1) {
						lines.push(`\tif (!typed.${fieldPath}) return false;`);
					} else {
						lines.push(
							`\tif (!typed.${fieldPath} || (Array.isArray(typed.${fieldPath}) && typed.${fieldPath}.length < ${(constraint as any).min})) return false;`,
						);
					}
				}

				// Check fixed values
				if ((constraint as any).fixedValue !== undefined) {
					hasRequiredChecks = true;
					const fixedValue =
						typeof (constraint as any).fixedValue === "string"
							? `'${(constraint as any).fixedValue}'`
							: JSON.stringify((constraint as any).fixedValue);
					lines.push(
						`\tif (typed.${fieldPath} !== ${fixedValue}) return false;`,
					);
				}
			}

			if (hasRequiredChecks) {
				lines.push("");
			}
		}

		// Add extension checks for known profile extensions
		if ((schema as any).extensions && (schema as any).extensions.length > 0) {
			lines.push("\t// Extension presence checks (simplified)");
			for (const ext of (schema as any).extensions) {
				if (ext.min && ext.min > 0) {
					lines.push(`\t// Required extension: ${ext.profile}`);
					lines.push(
						`\t// Note: Full extension validation requires examining extension array`,
					);
				}
			}
			lines.push("");
		}

		lines.push("\treturn true;");
		lines.push("}");

		return lines.join("\n");
	}
}
