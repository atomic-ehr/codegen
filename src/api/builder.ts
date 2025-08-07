/**
 * High-Level API Builder
 *
 * Provides a fluent, chainable API for common codegen use cases with pre-built generators.
 * This builder pattern allows users to configure generation in a declarative way.
 */

import { TypeSchemaCache } from "../typeschema/cache";
import { TypeSchemaGenerator } from "../typeschema/generator";
import { TypeSchemaParser } from "../typeschema/parser";
import type { AnyTypeSchema } from "../typeschema/types";
import { TypeSchemaValidator } from "../typeschema/validator";
import { RESTClientAPIGenerator } from "./generators/rest-client";
import { TypeScriptAPIGenerator } from "./generators/typescript";

/**
 * Configuration options for the API builder
 */
export interface APIBuilderOptions {
	outputDir?: string;
	verbose?: boolean;
	overwrite?: boolean;
	validate?: boolean;
	cache?: boolean;
}

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (
	phase: string,
	current: number,
	total: number,
	message?: string,
) => void;

/**
 * Generation result information
 */
export interface GenerationResult {
	success: boolean;
	outputDir: string;
	filesGenerated: string[];
	errors: string[];
	warnings: string[];
	duration: number;
}

/**
 * High-Level API Builder class
 *
 * Provides a fluent interface for configuring and executing code generation
 * from FHIR packages or TypeSchema documents.
 */
export class APIBuilder {
	private schemas: AnyTypeSchema[] = [];
	private options: Required<APIBuilderOptions>;
	private generators: Map<string, any> = new Map();
	private progressCallback?: ProgressCallback;
	private validator?: TypeSchemaValidator;
	private cache?: TypeSchemaCache;
	private pendingOperations: Promise<void>[] = [];
	private typeSchemaGenerator?: TypeSchemaGenerator;

	constructor(options: APIBuilderOptions = {}) {
		this.options = {
			outputDir: options.outputDir || "./generated",
			verbose: options.verbose ?? false,
			overwrite: options.overwrite ?? true,
			validate: options.validate ?? true,
			cache: options.cache ?? true,
		};

		if (this.options.cache) {
			this.cache = new TypeSchemaCache({
				enabled: true,
				maxSize: 1000,
				ttl: 30 * 60 * 1000, // 30 minutes
			});
		}

		if (this.options.validate) {
			this.validator = new TypeSchemaValidator();
		}
	}

	/**
	 * Load TypeSchema from a FHIR package
	 */
	fromPackage(packageName: string, version?: string): APIBuilder {
		const operation = this.loadFromPackage(packageName, version);
		this.pendingOperations.push(operation);
		return this;
	}

	/**
	 * Load TypeSchema from files
	 */
	fromFiles(...filePaths: string[]): APIBuilder {
		const operation = this.loadFromFiles(filePaths);
		this.pendingOperations.push(operation);
		return this;
	}

	/**
	 * Load TypeSchema from TypeSchema objects
	 */
	fromSchemas(schemas: AnyTypeSchema[]): APIBuilder {
		this.schemas = [...this.schemas, ...schemas];
		return this;
	}

	/**
	 * Load TypeSchema from NDJSON string
	 */
	fromString(
		content: string,
		format: "ndjson" | "json" = "ndjson",
	): APIBuilder {
		const operation = this.loadFromString(content, format);
		this.pendingOperations.push(operation);
		return this;
	}

	/**
	 * Configure TypeScript generation
	 */
	typescript(
		options: {
			moduleFormat?: "esm" | "cjs";
			generateIndex?: boolean;
			includeDocuments?: boolean;
			namingConvention?: "PascalCase" | "camelCase";
			includeExtensions?: boolean;
			includeProfiles?: boolean;
		} = {},
	): APIBuilder {
		// Hardcode types subfolder
		const typesOutputDir = `${this.options.outputDir}/types`;

		const generator = new TypeScriptAPIGenerator({
			outputDir: typesOutputDir,
			moduleFormat: options.moduleFormat || "esm",
			generateIndex: options.generateIndex ?? true,
			includeDocuments: options.includeDocuments ?? true,
			namingConvention: options.namingConvention || "PascalCase",
			includeExtensions: options.includeExtensions ?? false,
			includeProfiles: options.includeProfiles ?? false,
		});

		this.generators.set("typescript", generator);
		return this;
	}

	/**
	 * Configure REST API client generation
	 */
	restClient(
		options: {
			language?: "typescript" | "javascript";
			httpClient?: "fetch" | "axios" | "node-fetch";
			generateTypes?: boolean;
			includeValidation?: boolean;
			baseUrl?: string;
		} = {},
	): APIBuilder {
		// Hardcode client subfolder
		const clientOutputDir = `${this.options.outputDir}/client`;

		const generator = new RESTClientAPIGenerator({
			outputDir: clientOutputDir,
			language: options.language || "typescript",
			httpClient: options.httpClient || "fetch",
			generateTypes: options.generateTypes ?? true,
			includeValidation: options.includeValidation ?? false,
			baseUrl: options.baseUrl,
		});

		this.generators.set("restclient", generator);
		return this;
	}

	/**
	 * Set progress callback for monitoring generation
	 */
	onProgress(callback: ProgressCallback): APIBuilder {
		this.progressCallback = callback;
		return this;
	}

	/**
	 * Set output directory for all generators
	 */
	outputTo(directory: string): APIBuilder {
		this.options.outputDir = directory;

		// Update all configured generators
		for (const generator of this.generators.values()) {
			if (generator.setOutputDir) {
				generator.setOutputDir(directory);
			}
		}

		return this;
	}

	/**
	 * Enable/disable verbose logging
	 */
	verbose(enabled = true): APIBuilder {
		this.options.verbose = enabled;
		return this;
	}

	/**
	 * Enable/disable validation
	 */
	validate(enabled = true): APIBuilder {
		this.options.validate = enabled;

		if (enabled && !this.validator) {
			this.validator = new TypeSchemaValidator();
		}

		return this;
	}

	/**
	 * Execute the generation process
	 */
	async generate(): Promise<GenerationResult> {
		const startTime = performance.now();
		const result: GenerationResult = {
			success: false,
			outputDir: this.options.outputDir,
			filesGenerated: [],
			errors: [],
			warnings: [],
			duration: 0,
		};

		try {
			this.reportProgress("Loading", 0, 4, "Loading TypeSchema data...");

			// Load schemas if needed
			await this.resolveSchemas();

			this.reportProgress(
				"Validating",
				1,
				4,
				"Validating TypeSchema documents...",
			);

			// Validate schemas
			if (this.options.validate && this.validator) {
				await this.validateSchemas(result);
			}

			this.reportProgress("Generating", 2, 4, "Generating code...");

			// Execute all configured generators
			await this.executeGenerators(result);

			this.reportProgress(
				"Complete",
				4,
				4,
				"Generation completed successfully",
			);

			result.success = result.errors.length === 0;
		} catch (error) {
			console.log("err", error);
			result.errors.push(
				error instanceof Error ? error.message : String(error),
			);
			result.success = false;
		} finally {
			result.duration = performance.now() - startTime;
		}

		return result;
	}

	/**
	 * Generate and return the results without writing to files
	 */
	async build(): Promise<{
		typescript?: { content: string; filename: string }[];
		restclient?: { content: string; filename: string }[];
	}> {
		await this.resolveSchemas();

		if (this.options.validate && this.validator) {
			const validationResult = await this.validator.validateWithDependencies(
				this.schemas,
			);
			if (!validationResult.valid) {
				throw new Error(
					`Validation failed: ${validationResult.errors.map((e) => e.message).join(", ")}`,
				);
			}
		}

		const results: any = {};

		for (const [type, generator] of this.generators.entries()) {
			if (generator.build) {
				results[type] = await generator.build(this.schemas);
			}
		}

		return results;
	}

	/**
	 * Clear all configuration and start fresh
	 */
	reset(): APIBuilder {
		this.schemas = [];
		this.generators.clear();
		this.progressCallback = undefined;
		return this;
	}

	/**
	 * Get loaded schemas (for inspection)
	 */
	getSchemas(): AnyTypeSchema[] {
		return [...this.schemas];
	}

	/**
	 * Get configured generators (for inspection)
	 */
	getGenerators(): string[] {
		return Array.from(this.generators.keys());
	}

	// Private implementation methods

	private async loadFromPackage(
		packageName: string,
		version?: string,
	): Promise<void> {
		const generator = new TypeSchemaGenerator({
			verbose: this.options.verbose,
		});

		this.typeSchemaGenerator = generator; // Store for REST client generation
		const schemas = await generator.generateFromPackage(packageName, version);
		this.schemas = [...this.schemas, ...schemas];

		if (this.cache) {
			this.cache.setMany(schemas);
		}
	}

	private async loadFromFiles(filePaths: string[]): Promise<void> {
		// Initialize TypeSchemaGenerator for REST client generation
		if (!this.typeSchemaGenerator) {
			const generator = new TypeSchemaGenerator({
				verbose: this.options.verbose,
			});
			this.typeSchemaGenerator = generator;
		}

		const parser = new TypeSchemaParser({
			format: "auto",
			validate: this.options.validate,
		});

		const schemas = await parser.parseFromFiles(filePaths);
		this.schemas = [...this.schemas, ...schemas];

		if (this.cache) {
			this.cache.setMany(schemas);
		}
	}

	private async loadFromString(
		content: string,
		format: "ndjson" | "json",
	): Promise<void> {
		// Initialize TypeSchemaGenerator for REST client generation
		if (!this.typeSchemaGenerator) {
			const generator = new TypeSchemaGenerator({
				verbose: this.options.verbose,
			});
			this.typeSchemaGenerator = generator;
		}

		const parser = new TypeSchemaParser({
			format: "auto",
			validate: this.options.validate,
		});

		const schemas = await parser.parseFromString(content, format);
		this.schemas = [...this.schemas, ...schemas];

		if (this.cache) {
			this.cache.setMany(schemas);
		}
	}

	private async resolveSchemas(): Promise<void> {
		// Wait for all pending async operations to complete
		if (this.pendingOperations.length > 0) {
			await Promise.all(this.pendingOperations);
			this.pendingOperations = []; // Clear completed operations
		}
	}

	private async validateSchemas(result: GenerationResult): Promise<void> {
		if (!this.validator) return;

		const validationResult = await this.validator.validateWithDependencies(
			this.schemas,
		);

		if (!validationResult.valid) {
			result.errors.push(...validationResult.errors.map((e) => e.message));
		}

		if (validationResult.warnings.length > 0) {
			result.warnings.push(...validationResult.warnings.map((w) => w.message));
		}
	}

	private async executeGenerators(result: GenerationResult): Promise<void> {
		const generatorCount = this.generators.size;
		let current = 0;

		for (const [type, generator] of this.generators.entries()) {
			this.reportProgress(
				"Generating",
				2 + current / generatorCount,
				4,
				`Generating ${type}...`,
			);

			try {
				// Pass TypeSchemaGenerator to REST client for search parameter generation
				const files =
					type === "restclient"
						? await generator.generate(this.schemas, this.typeSchemaGenerator)
						: await generator.generate(this.schemas);
				result.filesGenerated.push(
					...files.map((f: any) => f.path || f.filename),
				);
			} catch (error) {
				result.errors.push(
					`${type} generator failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			current++;
		}
	}

	private reportProgress(
		phase: string,
		current: number,
		total: number,
		message?: string,
	): void {
		if (this.progressCallback) {
			this.progressCallback(phase, current, total, message);
		}

		if (this.options.verbose && message) {
			console.log(`[${phase}] ${message}`);
		}
	}
}

/**
 * Create a new API builder instance
 */
export function createAPI(options?: APIBuilderOptions): APIBuilder {
	return new APIBuilder(options);
}

/**
 * Convenience function for quick TypeScript generation from a package
 */
export async function generateTypesFromPackage(
	packageName: string,
	outputDir: string,
	options: {
		version?: string;
		verbose?: boolean;
		validate?: boolean;
	} = {},
): Promise<GenerationResult> {
	return createAPI({
		outputDir,
		verbose: options.verbose,
		validate: options.validate,
	})
		.fromPackage(packageName, options.version)
		.typescript()
		.generate();
}

/**
 * Convenience function for quick TypeScript generation from files
 */
export async function generateTypesFromFiles(
	inputFiles: string[],
	outputDir: string,
	options: {
		verbose?: boolean;
		validate?: boolean;
	} = {},
): Promise<GenerationResult> {
	return createAPI({
		outputDir,
		verbose: options.verbose,
		validate: options.validate,
	})
		.fromFiles(...inputFiles)
		.typescript()
		.generate();
}
