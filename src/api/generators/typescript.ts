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
import { toPascalCase } from "../../utils.ts";

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
	private options: Required<TypeScriptAPIOptions>;
	private imports = new Map<string, string>();
	private exports = new Set<string>();
	private resourceTypes = new Set<string>();
	private currentSchemaName?: string;

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
			schema.identifier.kind === "primitive-type" ||
			schema.identifier.kind === "profile"
		) {
			return undefined;
		}

		if (this.currentSchemaName === "Uri") {
			console.log(schema);
		}

		// Clear state for new transformation
		this.imports.clear();
		this.exports.clear();
		this.currentSchemaName = this.formatTypeName(schema.identifier.name);

		// Generate TypeScript content
		const content = this.generateTypeScriptForSchema(schema);

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

		// Add interface declaration
		const interfaceName = this.formatTypeName(schema.identifier.name);

		let overridedName: string | undefined;

		if (interfaceName === "Reference") {
			overridedName = `Reference<T extends ResourceTypes = ResourceTypes>`;
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

		this.exports.add(interfaceName);

		if (nested.base) {
			const baseInterface = this.getType(nested.base);

			if (baseInterface.isPrimitive) {
				lines.push(`export interface ${baseName}${interfaceName}{`);
			} else {
				this.imports.set(baseInterface.value, baseInterface.value);
				lines.push(
					`export interface ${baseName}${interfaceName} extends ${baseInterface.value} {`,
				);
			}
		} else {
			lines.push(`export interface ${baseName}${interfaceName}{`);
		}

		if (nested.fields) {
			for (const [fieldName, field] of Object.entries(nested.fields)) {
				const fieldLine = this.generateField(fieldName, field);
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

		if (field.reference) {
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
			if (field.enum.length > 15) {
				typeString = "string";
			} else {
				typeString = `${field.enum.map((e) => `'${e}'`).join(" | ")}`;
			}
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
		}

		const optional = !field.required ? "?" : "";
		const array = field.array ? "[]" : "";

		return `${fieldName}${optional}: ${nestedOpts?.isNested && nestedOpts.baseName ? nestedOpts.baseName : ""}${typeString}${array};`;
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

		results.push({
			filename: "utility.ts",
			content: `export type ResourceTypes = ${Array.from(this.resourceTypes.keys().map((key) => `'${key}'`)).join(" | ")};\n\n`,
			imports: new Map(),
			exports: ["ResourceTypes"],
		});

		// Write individual type files
		for (const result of results) {
			const filePath = join(this.options.outputDir, result.filename);
			await this.ensureDirectoryExists(filePath);
			await writeFile(
				filePath,
				`${this.generateImportStatements(result.imports)}\n\n${result.content}`,
				"utf-8",
			);

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

		for (const [item, pkg] of imports.entries()) {
			lines.push(`import type { ${item} } from './${pkg}';`);
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
				// Categorize exports based on naming patterns
				if (result.filename.includes("primitive")) {
					primitiveTypes.push(exportName);
				} else if (result.filename.includes("complex")) {
					complexTypes.push(exportName);
				} else if (result.filename.includes("resource")) {
					resources.push(exportName);
				} else if (result.filename.includes("profile")) {
					profiles.push(exportName);
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
				baseName.startsWith("profile")
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

		if (profiles.length > 0) {
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
		if (isTypeSchemaForResourceComplexTypeLogical(schema) && schema.base) {
			return this.getType(schema.base);
		}
		return null;
	}

	/**
	 * Get filename for schema
	 */
	private getFilename(identifier: TypeSchemaIdentifier): string {
		const name = toPascalCase(identifier.name);
		return `${name}.ts`;
	}
}
