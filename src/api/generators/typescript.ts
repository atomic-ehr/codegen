/**
 * High-Level TypeScript Generator
 *
 * Provides a high-level API for generating TypeScript interfaces from TypeSchema documents.
 * This wraps the core TypeSchema transformer with additional convenience features.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { TypeScriptTransformer } from "../../typeschema/transformer";
import type { AnyTypeSchema } from "../../typeschema/types";

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

/**
 * High-Level TypeScript Generator
 *
 * Generates TypeScript interfaces from TypeSchema documents with additional
 * features like index generation, documentation, and flexible output options.
 */
export class TypeScriptAPIGenerator {
	private transformer: TypeScriptTransformer;
	private options: Required<TypeScriptAPIOptions>;

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

		this.transformer = new TypeScriptTransformer({
			outputDir: this.options.outputDir,
			moduleFormat: this.options.moduleFormat,
			generateIndex: this.options.generateIndex,
			includeDocuments: this.options.includeDocuments,
			namingConvention: this.options.namingConvention,
			includeExtensions: this.options.includeExtensions,
			includeProfiles: this.options.includeProfiles,
		});
	}

	/**
	 * Generate TypeScript files from TypeSchema documents
	 */
	async generate(schemas: AnyTypeSchema[]): Promise<GeneratedFile[]> {
		const filteredSchemas = this.filterSchemas(schemas);
		const results = await this.transformer.transformSchemas(filteredSchemas);
		const generatedFiles: GeneratedFile[] = [];

		// Ensure output directory and subfolders exist
		await mkdir(this.options.outputDir, { recursive: true });
		await mkdir(join(this.options.outputDir, "valuesets"), { recursive: true });
		if (this.options.includeProfiles) {
			await mkdir(join(this.options.outputDir, "profiles"), {
				recursive: true,
			});
		}
		await mkdir(join(this.options.outputDir, "extensions"), {
			recursive: true,
		});

		// Write individual type files
		for (const result of results) {
			const filePath = join(this.options.outputDir, result.filename);
			await this.ensureDirectoryExists(filePath);
			await writeFile(filePath, result.content, "utf-8");

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

		// Generate package.json for the generated code
		const packageJsonFile = await this.generatePackageJson();
		const packagePath = join(this.options.outputDir, "package.json");
		await writeFile(packagePath, packageJsonFile, "utf-8");

		generatedFiles.push({
			path: packagePath,
			filename: "package.json",
			content: packageJsonFile,
			exports: [],
		});

		// Generate TypeScript configuration
		const tsConfigFile = await this.generateTsConfig();
		const tsConfigPath = join(this.options.outputDir, "tsconfig.json");
		await writeFile(tsConfigPath, tsConfigFile, "utf-8");

		generatedFiles.push({
			path: tsConfigPath,
			filename: "tsconfig.json",
			content: tsConfigFile,
			exports: [],
		});

		return generatedFiles;
	}

	/**
	 * Generate and return results without writing to files
	 */
	async build(schemas: AnyTypeSchema[]): Promise<GeneratedFile[]> {
		const filteredSchemas = this.filterSchemas(schemas);
		const results = await this.transformer.transformSchemas(filteredSchemas);
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
		this.transformer.setOptions({ outputDir: directory });
	}

	/**
	 * Update generator options
	 */
	setOptions(options: Partial<TypeScriptAPIOptions>): void {
		this.options = { ...this.options, ...options };
		this.transformer.setOptions(options);
	}

	/**
	 * Get current options
	 */
	getOptions(): Required<TypeScriptAPIOptions> {
		return { ...this.options };
	}

	// Private helper methods

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

		lines.push("// Extensions namespace - contains all FHIR Extension types");
		lines.push('export * as Extensions from "./extensions";');
		lines.push("");

		if (profiles.length > 0) {
			lines.push("// Profiles namespace - contains all FHIR Profile types");
			lines.push('export * as Profiles from "./profiles";');
			lines.push("");
		}

		const content = lines.join("\n");
		return { content, exports };
	}

	private async generatePackageJson(): Promise<string> {
		const packageJson = {
			name: "generated-fhir-types",
			version: "1.0.0",
			description: "Generated TypeScript type definitions for FHIR",
			main: this.options.moduleFormat === "cjs" ? "index.js" : undefined,
			module: this.options.moduleFormat === "esm" ? "index.js" : undefined,
			types: "index.d.ts",
			type: this.options.moduleFormat === "esm" ? "module" : "commonjs",
			files: ["*.ts", "*.js", "*.d.ts", "**/*.ts", "**/*.js", "**/*.d.ts"],
			scripts: {
				build: "tsc",
				"type-check": "tsc --noEmit",
			},
			devDependencies: {
				typescript: "^5.0.0",
			},
			keywords: [
				"fhir",
				"typescript",
				"types",
				"healthcare",
				"ehr",
				"generated",
			],
			license: "MIT",
			author: "atomic-codegen",
			repository: {
				type: "git",
				url: "generated by atomic-codegen",
			},
		};

		return JSON.stringify(packageJson, null, 2);
	}

	private async generateTsConfig(): Promise<string> {
		const tsConfig = {
			compilerOptions: {
				target: "ES2020",
				module: this.options.moduleFormat === "esm" ? "ESNext" : "CommonJS",
				moduleResolution: "node",
				declaration: true,
				declarationMap: true,
				sourceMap: true,
				outDir: "./dist",
				rootDir: "./",
				strict: true,
				esModuleInterop: true,
				skipLibCheck: true,
				forceConsistentCasingInFileNames: true,
				lib: ["ES2020"],
				types: ["node"],
			},
			include: ["*.ts", "**/*.ts"],
			exclude: ["node_modules", "dist", "*.test.ts", "**/*.test.ts"],
		};

		return JSON.stringify(tsConfig, null, 2);
	}

	private async ensureDirectoryExists(filePath: string): Promise<void> {
		const dir = dirname(filePath);
		await mkdir(dir, { recursive: true });
	}

	/**
	 * Filter schemas based on includeExtensions option
	 */
	private filterSchemas(schemas: AnyTypeSchema[]): AnyTypeSchema[] {
		if (this.options.includeExtensions) {
			return schemas;
		}

		return schemas.filter((schema) => {
			// Check if this schema represents an extension
			if (this.isExtensionSchema(schema)) {
				return false;
			}
			return true;
		});
	}

	/**
	 * Check if a schema represents an extension type
	 */
	private isExtensionSchema(schema: AnyTypeSchema): boolean {
		// Check metadata for extension marker (only for schemas that have metadata)
		if ("metadata" in schema && schema.metadata?.isExtension === true) {
			return true;
		}

		// Check if base type is Extension (only for schemas that have base)
		if (
			"base" in schema &&
			schema.base &&
			schema.base.name === "Extension" &&
			schema.base.url === "http://hl7.org/fhir/StructureDefinition/Extension"
		) {
			return true;
		}

		// Check if the schema identifier represents an Extension type
		if (
			schema.identifier?.name === "Extension" &&
			schema.identifier?.url ===
				"http://hl7.org/fhir/StructureDefinition/Extension"
		) {
			return true;
		}

		// Check if the identifier kind suggests this is an extension
		// Note: "extension" is not currently in the TypeSchemaIdentifier kind union, but this is future-proofing
		if (
			schema.identifier?.kind === "complex-type" &&
			(schema.identifier.name?.includes("Extension") ||
				schema.identifier.url?.includes("extension"))
		) {
			return true;
		}

		return false;
	}

	/**
	 * Generate index files for subfolders
	 */
	private async generateSubfolderIndexFiles(
		results: any[],
		generatedFiles: GeneratedFile[],
	): Promise<void> {
		const subfolders = ["valuesets", "extensions"];

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
}
