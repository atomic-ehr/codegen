/**
 * High-Level TypeScript Generator
 *
 * Provides a high-level API for generating TypeScript interfaces from TypeSchema documents.
 * This wraps the core TypeSchema transformer with additional convenience features.
 */

import { access, mkdir, rm, writeFile } from "node:fs/promises";
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
	private profilesByPackage = new Map<string, Array<{filename: string, interfaceName: string}>>();
	private packageNameMap = new Map<string, string>(); // Maps sanitized name -> original name
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
				
				// Track actual interface names for profile barrel files
				if (schema.identifier.kind === 'profile' && result.exports && result.exports.length > 0) {
					// Use the first (and typically only) export as the interface name
					const interfaceName = result.exports[0];
					this.trackProfileInterfaceName(schema.identifier, result.filename, interfaceName ?? '');
				}
			}
		}

		return results;
	}

	/**
	 * Generate TypeScript files from TypeSchema documents
	 */
	async generate(schemas: TypeSchema[]): Promise<GeneratedFile[]> {
		// Clear profile tracking from previous generations
		this.profilesByPackage.clear();
		this.packageNameMap.clear();
		
		const filteredSchemas = this.filterSchemas(schemas);

		// Use legacy transformer
		const results = await this.transformSchemas(filteredSchemas);
		const generatedFiles: GeneratedFile[] = [];

		// Clean output directory if it exists
		await this.cleanOutputDirectory();

		// Ensure output directory and subfolders exist
		await mkdir(this.options.outputDir, { recursive: true });

		if (this.options.includeProfiles) {
			// Create profiles directory - package subfolders will be created as needed
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
	getOptions(): TypeScriptAPIOptions {
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
	 * Clean the output directory by removing all existing files and subdirectories
	 */
	private async cleanOutputDirectory(): Promise<void> {
		try {
			// Check if the directory exists
			await access(this.options.outputDir);
			// If it exists, remove all its contents
			this.logger.debug(`Cleaning output directory: ${this.options.outputDir}`);
			await rm(this.options.outputDir, { recursive: true, force: true });
		} catch (error) {
			// Directory doesn't exist, no need to clean
			if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
				this.logger.warn(`Failed to clean output directory: ${error}`);
			}
		}
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
			if (subfolder === "profiles") {
				// Handle profiles with package-based organization
				await this.generateProfileIndexFiles(generatedFiles);
			} else {
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
	}

	/**
	 * Generate profile index files with package-based organization
	 */
	private async generateProfileIndexFiles(
		generatedFiles: GeneratedFile[],
	): Promise<void> {
		// Generate index file for each package
		for (const [
			packageName,
			profiles,
		] of this.profilesByPackage.entries()) {
			const packageIndexContent = this.generatePackageIndex(
				packageName,
				profiles,
			);
			const packageIndexPath = join(
				this.options.outputDir,
				"profiles",
				packageName,
				"index.ts",
			);
			await writeFile(packageIndexPath, packageIndexContent, "utf-8");

			generatedFiles.push({
				path: packageIndexPath,
				filename: `profiles/${packageName}/index.ts`,
				content: packageIndexContent,
				exports: profiles.map(p => p.interfaceName),
			});
		}

		// Generate main profiles index with namespace exports
		const mainProfilesIndex = this.generateMainProfilesIndex();
		const mainIndexPath = join(this.options.outputDir, "profiles", "index.ts");
		await writeFile(mainIndexPath, mainProfilesIndex, "utf-8");

		generatedFiles.push({
			path: mainIndexPath,
			filename: "profiles/index.ts",
			content: mainProfilesIndex,
			exports: Array.from(this.profilesByPackage.keys()),
		});
	}

	/**
	 * Generate index file for a specific package
	 */
	private generatePackageIndex(
		packageName: string,
		profiles: Array<{filename: string, interfaceName: string}>,
	): string {
		const lines: string[] = [];

		lines.push("/**");
		lines.push(` * ${packageName} Profiles Index`);
		lines.push(" * ");
		lines.push(
			" * Auto-generated exports for all profile types in this package.",
		);
		lines.push(" */");
		lines.push("");

		// If no profiles, export empty object
		if (profiles.length === 0) {
			lines.push("// No profiles in this package");
			lines.push("export {};");
			return lines.join("\n");
		}

		// Export all profiles from their files
		for (const profile of profiles) {
			lines.push(`export type { ${profile.interfaceName} } from './${profile.filename}';`);
		}

		return lines.join("\n");
	}

	/**
	 * Generate main profiles index with namespace exports
	 */
	private generateMainProfilesIndex(): string {
		const lines: string[] = [];

		lines.push("/**");
		lines.push(" * Profiles Index");
		lines.push(" * ");
		lines.push(" * Auto-generated namespace exports for all profile packages.");
		lines.push(" */");
		lines.push("");

		// If no packages, export empty object
		if (this.profilesByPackage.size === 0) {
			lines.push("// No profile packages found");
			lines.push("export {};");
			return lines.join("\n");
		}

		// Export each package as a namespace
		for (const sanitizedPackageName of this.profilesByPackage.keys()) {
			const originalPackageName = this.packageNameMap.get(sanitizedPackageName)!;
			const namespaceNameForExport = this.generateNamespaceName(originalPackageName);
			lines.push(
				`export * as ${namespaceNameForExport} from './${sanitizedPackageName}';`,
			);
		}

		return lines.join("\n");
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

		// For profiles, the name might need special formatting
		let typeName = identifier.name;
		if (identifier.kind === 'profile') {
			// Check if this is an extension profile by looking at the URL or base type
			if (this.isExtensionProfile(identifier)) {
				// Generate extension name from URL
				typeName = this.generateExtensionName(identifier);
			} else if (identifier.url && identifier.url.includes('vitalsigns') && !typeName.includes('Observation')) {
				// For FHIR profiles, check if we need to add a prefix based on the URL pattern
				typeName = `observation-${typeName}`;
			}
		}

		// Return formatted type name
		return { isPrimitive: false, value: this.formatTypeName(typeName) };
	}

	/**
	 * Check if a profile identifier represents an extension
	 */
	private isExtensionProfile(identifier: TypeSchemaIdentifier): boolean {
		// We'll need to check this based on schema data, but for now use URL patterns
		if (identifier.url) {
			// Skip known profile patterns
			const isKnownProfile = identifier.url.includes('/vitalsigns') ||
								  identifier.url.includes('/bmi') ||
								  identifier.url.includes('/bodyheight') ||
								  identifier.url.includes('/bodyweight') ||
								  identifier.url.includes('/bodytemp') ||
								  identifier.url.includes('/headcircum') ||
								  identifier.url.includes('/heartrate') ||
								  identifier.url.includes('/oxygensat') ||
								  identifier.url.includes('/resprate') ||
								  identifier.url.includes('/bp') ||
								  identifier.url.includes('/vitalspanel');
			
			// If it's a StructureDefinition URL but not a known profile, likely an extension
			return identifier.url.includes('/StructureDefinition/') && !isKnownProfile;
		}
		return false;
	}

	/**
	 * Check if a schema extends Extension by looking at its base type
	 */
	private isExtensionSchema(schema: TypeSchema): boolean {
		if (schema.identifier.kind === 'profile') {
			const profileSchema = schema as any;
			if (profileSchema.base && profileSchema.base.name === 'Extension') {
				return true;
			}
		}
		return false;
	}

	/**
	 * Generate extension name from URL
	 * e.g., http://hl7.org/fhir/StructureDefinition/contactpoint-area -> ExtensionContactpointArea
	 */
	private generateExtensionName(identifier: TypeSchemaIdentifier): string {
		if (!identifier.url) {
			return `Extension${this.formatTypeName(identifier.name)}`;
		}

		// Extract the extension name from the URL
		const urlParts = identifier.url.split('/');
		const extensionName = urlParts[urlParts.length - 1];
		
		if (!extensionName) {
			return `Extension${this.formatTypeName(identifier.name)}`;
		}

		// Convert kebab-case or snake_case to PascalCase and add Extension prefix
		const formattedName = extensionName
			.split(/[-_]/)
			.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
			.join('');
			
		return `Extension${formattedName}`;
	}

	/**
	 * Get base interface for schema
	 */
	private getBaseInterface(
		schema: TypeSchema,
	): { isPrimitive: boolean; value: string; baseIdentifier?: TypeSchemaIdentifier } | null {
		// Handle profiles (which have kind: "profile") as well as resources/complex-types
		if (
			(isTypeSchemaForResourceComplexTypeLogical(schema) ||
				schema.identifier.kind === "profile") &&
			(schema as any).base
		) {
			const baseIdentifier = (schema as any).base as TypeSchemaIdentifier;
			const typeInfo = this.getType(baseIdentifier);
			return {
				...typeInfo,
				baseIdentifier
			};
		}
		return null;
	}

	/**
	 * Get filename for schema
	 */
	private getFilename(identifier: TypeSchemaIdentifier): string {
		const name = toPascalCase(identifier.name);

		// Place profiles in package-based subfolder if configured
		if (identifier.kind === "profile" && this.options.includeProfiles) {
			const originalPackageName = identifier.package;
			const sanitizedPackageName = this.sanitizePackageName(originalPackageName);
			const subfolder = `profiles/${sanitizedPackageName}`;

			// Initialize profile tracking for this package (actual interface names will be added later)
			if (!this.profilesByPackage.has(sanitizedPackageName)) {
				this.profilesByPackage.set(sanitizedPackageName, []);
				this.packageNameMap.set(sanitizedPackageName, originalPackageName);
			}

			return `${subfolder}/${name}.ts`;
		}

		return `${name}.ts`;
	}

	/**
	 * Sanitize package name for use as directory name
	 */
	private sanitizePackageName(packageName: string): string {
		// Convert package name to a safe directory name
		return packageName
			.replace(/[@/\.]/g, "-") // Replace @, /, and . with -
			.replace(/[^a-zA-Z0-9\-_]/g, "") // Remove other special chars
			.toLowerCase();
	}

	/**
	 * Generate namespace name from original package name by capitalizing each dot-separated segment
	 */
	private generateNamespaceName(originalPackageName: string): string {
		// Split by dots and capitalize each segment
		return originalPackageName
			.split(".")
			.map(segment => this.toPascalCase(segment))
			.join("");
	}

	/**
	 * Calculate the correct import path from current profile to base type
	 */
	private calculateImportPath(currentSchema: TypeSchema, baseIdentifier: TypeSchemaIdentifier): string {
		if (baseIdentifier.kind === "profile") {
			// Base is another profile - calculate relative path between profile directories
			const currentPackage = this.sanitizePackageName(currentSchema.identifier.package);
			const basePackage = this.sanitizePackageName(baseIdentifier.package);
			
			if (currentPackage === basePackage) {
				// Same package - import from same directory
				// Need to use the properly formatted type name
				const baseTypeInfo = this.getType(baseIdentifier);
				return `./${baseTypeInfo.value}`;
			} else {
				// Different package - import from sibling package directory
				const baseTypeInfo = this.getType(baseIdentifier);
				return `../${basePackage}/${baseTypeInfo.value}`;
			}
		} else {
			// Base is a regular resource/complex-type - import from types root
			return `../../${this.formatTypeName(baseIdentifier.name)}`;
		}
	}

	/**
	 * Track actual interface names for profile index generation
	 */
	private trackProfileInterfaceName(identifier: TypeSchemaIdentifier, filename: string, interfaceName: string): void {
		if (identifier.kind === 'profile' && identifier.package) {
			const originalPackageName = identifier.package;
			const sanitizedPackageName = this.sanitizePackageName(originalPackageName);
			
			// Ensure package exists in tracking
			if (!this.profilesByPackage.has(sanitizedPackageName)) {
				this.profilesByPackage.set(sanitizedPackageName, []);
				this.packageNameMap.set(sanitizedPackageName, originalPackageName);
			}
			
			// Extract just the filename without path and extension
			const baseFilename = filename.split('/').pop()?.replace(/\.ts$/, '') || filename;
			
			// Track the actual interface name
			this.profilesByPackage.get(sanitizedPackageName)!.push({
				filename: baseFilename,
				interfaceName: interfaceName
			});
		}
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
		
		// Use proper naming for extensions
		if (this.isExtensionSchema(schema)) {
			this.currentSchemaName = this.generateExtensionName(schema.identifier);
		} else {
			this.currentSchemaName = this.formatTypeName(schema.identifier.name);
		}

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
		const interfaceName = this.currentSchemaName || this.formatTypeName(schema.identifier.name);
		const isExtension = this.isExtensionSchema(schema);

		// Add documentation if available
		if (schema.description) {
			lines.push("/**");
			lines.push(` * ${schema.description}`);
			if (isExtension) {
				lines.push(` * @extension ${schema.identifier.url}`);
			} else {
				lines.push(` * @profile ${schema.identifier.url}`);
			}
			lines.push(" */");
		}

		this.exports.add(interfaceName);

		// Get base interface (profiles should always have a base)
		const baseInterface = this.getBaseInterface(schema);
		if (baseInterface && !baseInterface.isPrimitive && baseInterface.baseIdentifier) {
			// Calculate correct import path based on whether base is a profile or resource
			const importPath = this.calculateImportPath(schema, baseInterface.baseIdentifier);
			this.imports.set(baseInterface.value, importPath);
			lines.push(
				`export interface ${interfaceName} extends ${baseInterface.value} {`,
			);
		} else {
			lines.push(`export interface ${interfaceName} {`);
		}

		// For profiles, generate field overrides for all constrained fields
		if (schema.identifier.kind === "profile") {
			const constrainedFields = this.getConstrainedFields(schema);
			
			// Collect imports for constrained field types
			for (const fieldName of constrainedFields) {
				this.collectImportsForField(fieldName, schema);
			}
			
			if (constrainedFields.length > 0) {
				// If we have constrained fields, use Omit to exclude them from base type
				const baseType = baseInterface?.value || "{}";
				
				// For extensions, also omit the url field since we're making it const
				let fieldsToOmit = constrainedFields;
				if (isExtension && !fieldsToOmit.includes('url')) {
					fieldsToOmit = [...constrainedFields, 'url'];
				}
				
				const omittedFields = fieldsToOmit.map(field => `'${field}'`).join(' | ');
				
				// Update the interface declaration to use Omit
				lines[lines.length - 1] = `export interface ${interfaceName} extends Omit<${baseType}, ${omittedFields}> {`;
				
				// For extensions, add the const url property first
				if (isExtension) {
					lines.push(`\turl: '${schema.identifier.url}';`);
				}
				
				// Generate field overrides for each constrained field
				for (const fieldName of constrainedFields) {
					const fieldLine = this.generateConstrainedProfileField(fieldName, schema);
					if (fieldLine) {
						lines.push(`\t${fieldLine}`);
					}
				}
			} else if (isExtension) {
				// Extension with no constrained fields, but still need to make url const
				const baseType = baseInterface?.value || "Extension";
				lines[lines.length - 1] = `export interface ${interfaceName} extends Omit<${baseType}, 'url'> {`;
				lines.push(`\turl: '${schema.identifier.url}';`);
			}
		} else if (isTypeSchemaForResourceComplexTypeLogical(schema)) {
			// Handle regular complex types (non-profiles)
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
		}

		lines.push("}");

		// Add nested types if any (rare for profiles)
		if ((schema as any).nested) {
			for (const nested of (schema as any).nested) {
				lines.push("");
				lines.push(this.generateNested(this.currentSchemaName ?? "", nested));
			}
		}


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
					// Calculate correct import path for profile field types
					const importPath = this.calculateImportPath(schema, field.type);
					this.imports.set(subType.value, importPath);
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
					// Calculate correct import path for profile field types
					const importPath = this.calculateImportPath(schema, field.type);
					this.imports.set(subType.value, importPath);
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
	 * Get list of field names that have constraints in a profile
	 */
	private getConstrainedFields(schema: TypeSchema): string[] {
		const constrainedFields: string[] = [];
		const choiceBaseFields = new Set<string>();

		// First, collect all choice base field names and choice instances
		if ((schema as any).fields) {
			const fields = (schema as any).fields as Record<string, any>;
			for (const [fieldName, field] of Object.entries(fields)) {
				if (field.choices && Array.isArray(field.choices)) {
					// This is a choice declaration field - it should be omitted from base interface
					choiceBaseFields.add(fieldName);
				}
				if (field.choiceOf) {
					// This is a choice instance, add its base to omitted fields
					choiceBaseFields.add(field.choiceOf);
					// And include this choice instance as a constrained field
					constrainedFields.push(fieldName);
				} else if (this.hasSignificantConstraints(field, fieldName, schema)) {
					// Check if field has meaningful constraints that differ from base
					constrainedFields.push(fieldName);
				}
			}
		}

		// Also check constraints section for additional constrained fields
		if ((schema as any).constraints) {
			const constraints = (schema as any).constraints as Record<string, any>;
			for (const [path, constraint] of Object.entries(constraints)) {
				const fieldName = path.includes(".") ? path.split(".").pop() : path;
				if (fieldName && !constrainedFields.includes(fieldName)) {
					// Check if this constraint is meaningful
					if (this.isSignificantConstraint(constraint)) {
						constrainedFields.push(fieldName);
					}
				}
			}
		}

		// Add all choice base fields to be omitted from base interface
		for (const choiceBaseField of choiceBaseFields) {
			if (!constrainedFields.includes(choiceBaseField)) {
				constrainedFields.push(choiceBaseField);
			}
		}

		return constrainedFields;
	}

	/**
	 * Check if a field has significant constraints that warrant generation
	 */
	private hasSignificantConstraints(field: any, fieldName: string, schema: TypeSchema): boolean {
		// Check for binding constraints (value sets)
		if (field.binding && field.binding.strength && field.binding.valueSet) {
			return true;
		}

		// Check for cardinality constraints
		if (field.min !== undefined && field.min > 0) {
			return true;
		}

		// Check for type restrictions (e.g., reference constraints)
		if (field.type && Array.isArray(field.type) && field.type.length > 0) {
			// Check if type constraints are more restrictive than base
			return true;
		}

		// Check for choice field constraints
		if (field.choices && Array.isArray(field.choices)) {
			return true;
		}

		// Check for enum values
		if (field.values && Array.isArray(field.values)) {
			return true;
		}

		return false;
	}

	/**
	 * Check if a constraint is significant enough to warrant field generation
	 */
	private isSignificantConstraint(constraint: any): boolean {
		// Required constraint (min > 0)
		if (constraint.min !== undefined && constraint.min > 0) {
			return true;
		}

		// Type restrictions
		if (constraint.type && Array.isArray(constraint.type)) {
			return true;
		}

		// Binding restrictions
		if (constraint.binding) {
			return true;
		}

		return false;
	}

	/**
	 * Generate a constrained field for a profile with proper typing
	 */
	private generateConstrainedProfileField(fieldName: string, schema: TypeSchema): string | null {
		// Get field definition
		const field = (schema as any).fields?.[fieldName];
		if (!field) {
			// Check if it's in constraints only
			const constraint = (schema as any).constraints?.[fieldName];
			if (constraint) {
				return this.generateFieldFromConstraint(fieldName, constraint, schema);
			}
			return null;
		}

		// Skip fields that are choice declarations (have choices property)
		// We'll handle them by omitting them from base interface and generating choice instances
		if (field.choices && Array.isArray(field.choices)) {
			// Don't generate the base choice field, it will be omitted from base interface
			return null;
		}

		// Handle choice instance fields (have choiceOf property)
		if (field.choiceOf) {
			// Generate the choice instance field directly
			return this.generateChoiceInstanceField(fieldName, field, schema);
		}

		// Determine if field is required
		let required = field.required || false;
		if (field.min !== undefined && field.min > 0) {
			required = true;
		}

		// Check constraints for additional requirements
		const constraint = (schema as any).constraints?.[fieldName];
		if (constraint && constraint.min !== undefined && constraint.min > 0) {
			required = true;
		}

		// Determine type string
		let typeString = "any";
		if (field.type) {
			const typeInfo = this.getType(field.type);
			typeString = typeInfo.value;
		}

		// Handle enum values for constrained fields
		if (field.enum && Array.isArray(field.enum)) {
			// Generate enum type from field.enum (which has the constrained values)
			const enumValues = field.enum.map((v: any) => `'${v}'`).join(' | ');
			typeString = enumValues;
		} else if (field.values && Array.isArray(field.values)) {
			// Generate enum type from field.values as fallback
			const enumValues = field.values.map((v: any) => `'${v}'`).join(' | ');
			typeString = enumValues;
		}

		// Handle binding constraints
		if (field.binding && field.binding.strength === 'required' && field.binding.valueSet) {
			// For required bindings, we might want to generate enum types
			// For now, keep as CodeableConcept but could be enhanced
		}

		// Handle reference constraints
		if (field.type && Array.isArray(field.type)) {
			const referenceTypes = field.type
				.filter((t: any) => t.code === 'Reference' && t.targetProfile)
				.map((t: any) => {
					const profile = t.targetProfile.split('/').pop();
					return `'${profile}'`;
				});
			
			if (referenceTypes.length > 0) {
				typeString = `Reference<${referenceTypes.join(' | ')}>`;
			}
		}

		// Determine if array
		let array = field.array || false;
		if (field.max === "*" || (constraint && constraint.max === "*")) {
			array = true;
		}

		const optional = !required ? "?" : "";
		const arrayType = array ? "[]" : "";

		return `${fieldName}${optional}: ${typeString}${arrayType};`;
	}

	/**
	 * Generate a choice instance field (e.g., effectiveDateTime, effectivePeriod)
	 */
	private generateChoiceInstanceField(fieldName: string, field: any, schema: TypeSchema): string {
		// Determine if field is required
		let required = field.required || false;
		if (field.min !== undefined && field.min > 0) {
			required = true;
		}

		// Check constraints for additional requirements
		const constraint = (schema as any).constraints?.[fieldName];
		if (constraint && constraint.min !== undefined && constraint.min > 0) {
			required = true;
		}

		// Determine type string
		let typeString = "any";
		if (field.type) {
			const typeInfo = this.getType(field.type);
			typeString = typeInfo.value;
			
			// Add import if needed
			if (!typeInfo.isPrimitive) {
				const importPath = this.calculateImportPath(schema, field.type);
				this.imports.set(typeInfo.value, importPath);
			}
		}

		// Handle enum values
		if (field.enum && Array.isArray(field.enum)) {
			const enumValues = field.enum.map((v: any) => `'${v}'`).join(' | ');
			typeString = enumValues;
		}

		// Handle reference constraints
		if (field.reference && Array.isArray(field.reference)) {
			typeString = this.buildReferenceType(field.reference);
		}

		// Determine if array
		let array = field.array || false;
		if (field.max === "*" || (constraint && constraint.max === "*")) {
			array = true;
		}

		const optional = !required ? "?" : "";
		const arrayType = array ? "[]" : "";

		return `${fieldName}${optional}: ${typeString}${arrayType};`;
	}

	/**
	 * Generate field from constraint-only definition
	 */
	private generateFieldFromConstraint(fieldName: string, constraint: any, schema: TypeSchema): string | null {
		let typeString = "any";
		let required = constraint.min !== undefined && constraint.min > 0;
		let array = constraint.max === "*";

		// Try to infer type from constraint
		if (constraint.type && Array.isArray(constraint.type)) {
			const types = constraint.type.map((t: any) => {
				if (t.code === 'Reference' && t.targetProfile) {
					const profile = t.targetProfile.split('/').pop();
					return `Reference<'${profile}'>`;
				}
				return t.code || t;
			});
			typeString = types.length === 1 ? types[0] : `(${types.join(' | ')})`;
		}

		const optional = !required ? "?" : "";
		const arrayType = array ? "[]" : "";

		return `${fieldName}${optional}: ${typeString}${arrayType};`;
	}

	/**
	 * Collect imports needed for a constrained field
	 */
	private collectImportsForField(fieldName: string, schema: TypeSchema): void {
		const field = (schema as any).fields?.[fieldName];
		if (!field) return;

		// Handle main field type
		if (field.type && !field.type.isPrimitive) {
			const typeInfo = this.getType(field.type);
			if (!typeInfo.isPrimitive) {
				// Calculate import path for non-primitive types
				const importPath = this.calculateImportPath(schema, field.type);
				this.imports.set(typeInfo.value, importPath);
			}
		}

		// Handle choice field types
		if (field.choices && Array.isArray(field.choices)) {
			field.choices.forEach((choice: string) => {
				const choiceField = (schema as any).fields?.[choice];
				if (choiceField && choiceField.type) {
					const typeInfo = this.getType(choiceField.type);
					if (!typeInfo.isPrimitive) {
						const importPath = this.calculateImportPath(schema, choiceField.type);
						this.imports.set(typeInfo.value, importPath);
					}
				}
			});
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
}
