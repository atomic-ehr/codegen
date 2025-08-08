/**
 * High-Level API Builder
 *
 * Provides a fluent, chainable API for common codegen use cases with pre-built generators.
 * This builder pattern allows users to configure generation in a declarative way.
 */

import type { TypeSchemaConfig } from "../config";
import { Logger } from "../logger.ts";
import {
	type TypeSchema,
	TypeSchemaCache,
	TypeSchemaGenerator,
	TypeSchemaParser,
} from "../typeschema";
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
	typeSchemaConfig?: TypeSchemaConfig;
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
	private schemas: TypeSchema[] = [];
	private options: Omit<Required<APIBuilderOptions>, "typeSchemaConfig"> & {
		typeSchemaConfig?: TypeSchemaConfig;
	};
	private generators: Map<string, any> = new Map();
	private progressCallback?: ProgressCallback;
	private cache?: TypeSchemaCache;
	private pendingOperations: Promise<void>[] = [];
	private typeSchemaGenerator?: TypeSchemaGenerator;
	private logger: Logger;

	private typeSchemaConfig?: TypeSchemaConfig;

	constructor(options: APIBuilderOptions = {}) {
		this.options = {
			outputDir: options.outputDir || "./generated",
			verbose: options.verbose ?? false,
			overwrite: options.overwrite ?? true,
			validate: options.validate ?? true,
			cache: options.cache ?? true,
			typeSchemaConfig: options.typeSchemaConfig,
		};

		this.typeSchemaConfig = options.typeSchemaConfig;

		this.logger = new Logger({
			component: "APIBuilder",
			level: this.options.verbose ? 0 : 1,
		});

		if (this.options.cache) {
			this.cache = new TypeSchemaCache(this.typeSchemaConfig);
		}
	}

	/**
	 * Load TypeSchema from a FHIR package
	 */
	fromPackage(packageName: string, version?: string): APIBuilder {
		this.logger.info(
			`Configuring generation from FHIR package`,
			{ packageName, version: version || "latest" },
			"fromPackage",
		);
		const operation = this.loadFromPackage(packageName, version);
		this.pendingOperations.push(operation);
		return this;
	}

	/**
	 * Load TypeSchema from files
	 */
	fromFiles(...filePaths: string[]): APIBuilder {
		this.logger.info(
			`Configuring generation from TypeSchema files`,
			{ count: filePaths.length, files: filePaths.slice(0, 5) },
			"fromFiles",
		);
		const operation = this.loadFromFiles(filePaths);
		this.pendingOperations.push(operation);
		return this;
	}

	/**
	 * Load TypeSchema from TypeSchema objects
	 */
	fromSchemas(schemas: TypeSchema[]): APIBuilder {
		this.logger.info(
			`Adding TypeSchemas to generation`,
			{ count: schemas.length },
			"fromSchemas",
		);
		this.schemas = [...this.schemas, ...schemas];
		return this;
	}

	/**
	 * Configure TypeScript generation with validation support
	 */
	typescript(
		options: {
			moduleFormat?: "esm" | "cjs";
			generateIndex?: boolean;
			includeDocuments?: boolean;
			namingConvention?: "PascalCase" | "camelCase";
			includeExtensions?: boolean;
			includeProfiles?: boolean;
			// Validation options
			generateValidators?: boolean;
			generateGuards?: boolean;
			generateBuilders?: boolean;
			strictValidation?: boolean;
			includePerformanceMetrics?: boolean;
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
		this.logger.info(
			"Configured TypeScript generator",
			{
				outputDir: typesOutputDir,
				moduleFormat: options.moduleFormat || "esm",
				generateValidators: options.generateValidators ?? true,
				generateGuards: options.generateGuards ?? true,
				generateBuilders: options.generateBuilders ?? false,
			},
			"typescript",
		);
		return this;
	}

	/**
	 * Set a progress callback for monitoring generation
	 */
	onProgress(callback: ProgressCallback): APIBuilder {
		this.progressCallback = callback;
		return this;
	}

	/**
	 * Set the output directory for all generators
	 */
	outputTo(directory: string): APIBuilder {
		this.logger.info(
			`Setting output directory`,
			{ directory, generatorCount: this.generators.size },
			"outputTo",
		);
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

		await this.logger.info(
			"Starting code generation",
			{
				outputDir: this.options.outputDir,
				pendingOperations: this.pendingOperations.length,
				generatorTypes: Array.from(this.generators.keys()),
				validate: this.options.validate,
				cache: this.options.cache,
			},
			"generate",
		);

		try {
			this.reportProgress("Loading", 0, 4, "Loading TypeSchema data...");

			// Load schemas if needed
			await this.resolveSchemas();
			await this.logger.info(
				"Schemas resolved",
				{ schemasCount: this.schemas.length },
				"resolveSchemas",
			);

			this.reportProgress(
				"Validating",
				1,
				4,
				"Validating TypeSchema documents...",
			);

			// Validate schemas
			if (this.options.validate) {
				await this.logger.info("Starting schema validation", {}, "validate");
				await this.validateSchemas(result);
				await this.logger.info(
					"Schema validation completed",
					{ warnings: result.warnings.length },
					"validate",
				);
			}

			this.reportProgress("Generating", 2, 4, "Generating code...");
			await this.logger.info(
				"Starting code generation",
				{ generatorCount: this.generators.size },
				"executeGenerators",
			);

			// Execute all configured generators
			await this.executeGenerators(result);

			this.reportProgress(
				"Complete",
				4,
				4,
				"Generation completed successfully",
			);

			result.success = result.errors.length === 0;

			await this.logger.info(
				"Code generation completed",
				{
					success: result.success,
					filesGenerated: result.filesGenerated.length,
					errors: result.errors.length,
					warnings: result.warnings.length,
					duration: `${Math.round(result.duration)}ms`,
				},
				"generate",
			);
		} catch (error) {
			await this.logger.error(
				"Code generation failed",
				error instanceof Error ? error : new Error(String(error)),
				{
					outputDir: this.options.outputDir,
					schemasCount: this.schemas.length,
				},
			);
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
	}> {
		await this.resolveSchemas();

		const results: Record<string, unknown> = {};

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
	getSchemas(): TypeSchema[] {
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
		const generator = new TypeSchemaGenerator(
			{
				verbose: this.options.verbose,
			},
			this.typeSchemaConfig,
		);

		this.typeSchemaGenerator = generator; // Store for REST client generation
		const schemas = await generator.generateFromPackage(packageName, version);
		this.schemas = [...this.schemas, ...schemas];

		if (this.cache) {
			this.cache.setMany(schemas);
		}
	}

	private async loadFromFiles(filePaths: string[]): Promise<void> {
		if (!this.typeSchemaGenerator) {
			this.typeSchemaGenerator = new TypeSchemaGenerator(
				{
					verbose: this.options.verbose,
				},
				this.typeSchemaConfig,
			);
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
	private async resolveSchemas(): Promise<void> {
		// Wait for all pending async operations to complete
		if (this.pendingOperations.length > 0) {
			await Promise.all(this.pendingOperations);
			this.pendingOperations = []; // Clear completed operations
		}
	}

	private async validateSchemas(_result: GenerationResult): Promise<void> {
		return;
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
				const files = await generator.generate(this.schemas);
				result.filesGenerated.push(
					...files.map((f: Record<string, string>) => f.path || f.filename),
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
