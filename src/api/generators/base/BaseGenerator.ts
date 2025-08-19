/**
 * Abstract base generator class
 *
 * This is the foundation of the generator system. All language-specific generators
 * extend this class to inherit common functionality while implementing their own
 * specific logic for type mapping, content generation, and validation.
 */

import type { TypeSchema } from "../../../typeschema";
import type { CodegenLogger } from "../../../utils/codegen-logger";
import { createLogger } from "../../../utils/codegen-logger";
import { ErrorHandler, GeneratorErrorBoundary } from "./error-handler";
import { ConfigurationError, SchemaValidationError } from "./errors";
import { FileManager } from "./FileManager";
import type {
	BaseGeneratorOptions,
	ConfigValidationResult,
	GeneratedFile,
	GeneratorCapabilities,
	ProgressCallback,
	TemplateContext,
	TemplateEngine,
	TypeMapper,
} from "./types";

/**
 * Abstract base generator class with comprehensive functionality
 *
 * Provides common functionality for all generators including:
 * - Schema validation and processing
 * - File management with fluent API
 * - Template processing
 * - Error handling and recovery
 * - Progress monitoring
 * - Performance optimization
 */
export abstract class BaseGenerator<
	TOptions extends BaseGeneratorOptions = BaseGeneratorOptions,
	TResult extends GeneratedFile[] = GeneratedFile[],
> {
	/** Validated and merged options */
	protected options: Required<TOptions>;

	/** Logger instance for this generator */
	protected readonly logger: CodegenLogger;

	/** File manager for all file operations */
	protected readonly fileManager: FileManager;

	/** Template engine for content generation */
	protected readonly templateEngine: TemplateEngine;

	/** Language-specific type mapper */
	protected readonly typeMapper: TypeMapper;

	/** Enhanced error handler for comprehensive error reporting */
	protected readonly errorHandler: ErrorHandler;

	/** Error boundary for catching and handling all generator errors */
	protected readonly errorBoundary: GeneratorErrorBoundary;

	/** Progress callback if provided */
	private progressCallback?: ProgressCallback;

	/** Generated files tracking */
	private generatedFiles: GeneratedFile[] = [];

	/** Generation start time for performance metrics */
	private generationStartTime = 0;

	/** Cache for expensive operations */
	private readonly cache = new Map<string, unknown>();

	constructor(options: TOptions) {
		// Validate configuration first
		const validation = this.validateConfiguration(options);
		if (!validation.isValid) {
			throw new ConfigurationError(
				`Invalid generator configuration: ${validation.errors.join(", ")}`,
				"configuration",
				options,
			);
		}

		// Merge with defaults and store
		this.options = this.mergeWithDefaults(options);

		// Initialize logger
		this.logger =
			options.logger ||
			createLogger({
				prefix: this.getLanguageName(),
				verbose: this.options.verbose || false,
			});

		// Initialize core components
		this.fileManager = this.createFileManager();
		this.templateEngine = this.createTemplateEngine();
		this.typeMapper = this.createTypeMapper();

		// Initialize enhanced error handling
		this.errorHandler = new ErrorHandler({
			logger: this.logger,
			verbose: this.options.verbose || false,
			beginnerMode: this.options.beginnerMode || false,
			outputFormat: this.options.errorFormat || "console",
		});

		this.errorBoundary = new GeneratorErrorBoundary(this.errorHandler);

		this.logger.debug(`${this.getLanguageName()} generator initialized`);

		// Log any configuration warnings
		if (validation.warnings.length > 0) {
			validation.warnings.forEach((warning) => {
				this.logger.warn(`Configuration warning: ${warning}`);
			});
		}
	}

	// ==========================================
	// Abstract Methods - Must be implemented by subclasses
	// ==========================================

	/**
	 * Get the name of the target language (e.g., "TypeScript", "Python", "Rust")
	 */
	protected abstract getLanguageName(): string;

	/**
	 * Get the file extension for the target language (e.g., ".ts", ".py", ".rs")
	 */
	protected abstract getFileExtension(): string;

	/**
	 * Create a language-specific type mapper
	 */
	protected abstract createTypeMapper(): TypeMapper;

	/**
	 * Generate content for a single schema
	 * @param schema - The TypeSchema to generate code for
	 * @param context - Additional context for generation
	 */
	protected abstract generateSchemaContent(
		schema: TypeSchema,
		context: TemplateContext,
	): Promise<string>;

	/**
	 * Validate generated content before writing
	 * @param content - The generated content
	 * @param context - The generation context
	 */
	protected abstract validateContent(
		content: string,
		context: TemplateContext,
	): Promise<void>;

	/**
	 * Filter and sort schemas with language-specific logic
	 * @param schemas - Input schemas
	 */
	protected abstract filterAndSortSchemas(schemas: TypeSchema[]): TypeSchema[];

	// ==========================================
	// Optional Abstract Methods - Can be overridden
	// ==========================================

	/**
	 * Get generator capabilities - can be overridden for introspection
	 */
	getCapabilities(): GeneratorCapabilities {
		return {
			language: this.getLanguageName(),
			fileExtensions: [this.getFileExtension()],
			supportsTemplates: true,
			supportsCustomTypeMapping: true,
			supportsIncrementalGeneration: false,
			supportsValidation: true,
			supportedSchemaKinds: ["resource", "complex-type", "profile", "logical"],
			version: "1.0.0",
		};
	}

	/**
	 * Create file manager instance - can be overridden for custom file handling
	 */
	protected createFileManager(): FileManager {
		return new FileManager({
			outputDir: this.options.outputDir,
			logger: this.logger.child("FileManager"),
			overwrite: this.options.overwrite,
		});
	}

	/**
	 * Create template engine instance - can be overridden for custom templates
	 */
	protected createTemplateEngine(): TemplateEngine {
		// This will be implemented in the TemplateEngine class
		const { TemplateEngine } = require("./TemplateEngine");
		return new TemplateEngine({
			logger: this.logger.child("Templates"),
		});
	}

	// ==========================================
	// Public API - Main entry points
	// ==========================================

	/**
	 * Generate code from TypeSchema documents
	 * This is the main method that orchestrates the entire generation process
	 * @param schemas - Array of TypeSchema documents
	 */
	public async generate(schemas: TypeSchema[]): Promise<TResult> {
		return this.errorBoundary.withErrorBoundary(
			async () => {
				this.generationStartTime = performance.now();
				this.generatedFiles = [];

				this.logger.info(
					`Starting ${this.getLanguageName()} generation for ${schemas.length} schemas`,
				);

				// Phase 1: Schema validation
				this.reportProgress(
					"validation",
					0,
					schemas.length,
					"Validating schemas...",
				);
				await this.validateSchemas(schemas);

				// Phase 2: Schema processing and filtering
				this.reportProgress(
					"generation",
					0,
					schemas.length,
					"Processing schemas...",
				);
				const processedSchemas = this.filterAndSortSchemas(schemas);
				this.logger.debug(
					`Filtered to ${processedSchemas.length} schemas for generation`,
				);

				// Phase 3: Content generation
				await this.generateFiles(processedSchemas);

				// Phase 4: Post-generation hooks
				await this.runPostGenerationHooks();

				this.reportProgress(
					"complete",
					schemas.length,
					schemas.length,
					"Generation complete",
				);

				const duration = performance.now() - this.generationStartTime;
				this.logger.info(
					`Generated ${this.generatedFiles.length} files in ${duration.toFixed(2)}ms ` +
						`(avg ${(duration / this.generatedFiles.length).toFixed(2)}ms per file)`,
				);

				return this.generatedFiles as TResult;
			},
			{ operationName: "generate" },
		);
	}

	/**
	 * Generate and return content without writing files (useful for testing)
	 * @param schemas - Array of TypeSchema documents
	 */
	public async build(schemas: TypeSchema[]): Promise<TResult> {
		// Temporarily disable file writing by mocking the writeFile method
		const originalWriteFile = this.fileManager.writeFile;
		const mockWriteResults = new Map<
			string,
			{ path: string; size: number; writeTime: number }
		>();

		this.fileManager.writeFile = async (path: string, content: string) => {
			const result = {
				path: `${this.options.outputDir}/${path}`,
				size: Buffer.byteLength(content, "utf-8"),
				writeTime: 0,
			};
			mockWriteResults.set(path, result);
			return result;
		};

		try {
			const result = await this.generate(schemas);

			// Update file paths to reflect what would have been written
			result.forEach((file) => {
				const mockResult = mockWriteResults.get(file.filename);
				if (mockResult) {
					file.path = mockResult.path;
					file.size = mockResult.size;
				}
			});

			return result;
		} finally {
			// Restore original file writing function
			this.fileManager.writeFile = originalWriteFile;
		}
	}

	// ==========================================
	// Fluent API - Builder pattern methods
	// ==========================================

	/**
	 * Create a file builder for fluent file generation
	 * @param filename - Name of the file to create
	 */
	public file(filename: string): import("./builders/FileBuilder").FileBuilder {
		const { FileBuilder } = require("./builders/FileBuilder");
		return new FileBuilder({
			filename: this.ensureFileExtension(filename),
			fileManager: this.fileManager,
			templateEngine: this.templateEngine,
			typeMapper: this.typeMapper,
			logger: this.logger.child("FileBuilder"),
		});
	}

	/**
	 * Create a directory builder for batch operations
	 * @param path - Directory path relative to output directory
	 */
	public directory(
		path: string,
	): import("./builders/DirectoryBuilder").DirectoryBuilder {
		const { DirectoryBuilder } = require("./builders/DirectoryBuilder");
		return new DirectoryBuilder({
			path,
			fileManager: this.fileManager,
			logger: this.logger.child("DirectoryBuilder"),
		});
	}

	/**
	 * Create an index file builder
	 * @param directory - Directory to create index for
	 */
	public index(
		directory: string = ".",
	): import("./builders/IndexBuilder").IndexBuilder {
		const { IndexBuilder } = require("./builders/IndexBuilder");
		return new IndexBuilder({
			directory,
			fileManager: this.fileManager,
			templateEngine: this.templateEngine,
			logger: this.logger.child("IndexBuilder"),
		});
	}

	/**
	 * Set progress callback for monitoring generation
	 * @param callback - Progress callback function
	 */
	public onProgress(callback: ProgressCallback): this {
		this.progressCallback = callback;
		return this;
	}

	// ==========================================
	// Configuration and Validation
	// ==========================================

	/**
	 * Validate generator configuration
	 */
	private validateConfiguration(options: TOptions): ConfigValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];
		const suggestions: string[] = [];

		// Required options validation
		if (!options.outputDir) {
			errors.push("outputDir is required");
			suggestions.push("Provide a valid output directory path");
		}

		// Type validation
		if (options.outputDir && typeof options.outputDir !== "string") {
			errors.push("outputDir must be a string");
		}

		if (
			options.overwrite !== undefined &&
			typeof options.overwrite !== "boolean"
		) {
			errors.push("overwrite must be a boolean");
		}

		if (
			options.validate !== undefined &&
			typeof options.validate !== "boolean"
		) {
			errors.push("validate must be a boolean");
		}

		// Warnings for suboptimal configuration
		if (options.outputDir && !require("path").isAbsolute(options.outputDir)) {
			warnings.push(
				"Using relative path for outputDir - consider using absolute path",
			);
			suggestions.push("Use path.resolve() to convert to absolute path");
		}

		if (options.validate === false) {
			warnings.push(
				"Validation is disabled - this may lead to invalid generated code",
			);
			suggestions.push("Consider enabling validation for better code quality");
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
			suggestions,
		};
	}

	/**
	 * Merge options with defaults
	 */
	private mergeWithDefaults(options: TOptions): Required<TOptions> {
		return {
			overwrite: true,
			validate: true,
			verbose: false,
			beginnerMode: false,
			errorFormat: "console" as const,
			...options,
		} as Required<TOptions>;
	}

	// ==========================================
	// Schema Processing
	// ==========================================

	/**
	 * Validate schemas before processing
	 */
	private async validateSchemas(schemas: TypeSchema[]): Promise<void> {
		if (!this.options.validate) {
			this.logger.debug("Schema validation disabled");
			return;
		}

		this.logger.info(
			`🔍 Starting schema validation for ${schemas.length} schemas`,
		);
		this.logger.debug(
			"Schema validation enabled - performing comprehensive validation",
		);

		const operations = schemas.map(
			(schema) => () =>
				this.errorBoundary.withErrorBoundary(
					async () => {
						await this.validateSchema(schema);
						this.reportProgress(
							"validation",
							schemas.indexOf(schema) + 1,
							schemas.length,
							`Validated ${schema.identifier?.name || "schema"}`,
						);
					},
					{ schema, operationName: "validateSchema" },
				),
		);

		await this.errorBoundary.withBatchErrorBoundary(operations, {
			operationName: "validateSchemas",
		});

		this.logger.debug(`Successfully validated ${schemas.length} schemas`);
	}

	/**
	 * Validate individual schema
	 */
	protected async validateSchema(schema: TypeSchema): Promise<void> {
		const errors: string[] = [];
		const schemaName = schema.identifier?.name || "unknown";

		this.logger.debug(
			`🔍 Validating schema: ${schemaName} (kind: ${schema.identifier?.kind})`,
		);

		// Basic structure validation
		if (!schema.identifier) {
			errors.push("Schema missing identifier");
			this.logger.warn(
				`❌ Schema missing identifier: ${JSON.stringify(schema, null, 2).substring(0, 200)}...`,
			);
		} else {
			if (!schema.identifier.name) {
				errors.push("Schema identifier missing name");
			}

			if (!schema.identifier.kind) {
				errors.push("Schema identifier missing kind");
			} else {
				const validKinds = [
					"resource",
					"complex-type",
					"profile",
					"primitive-type",
					"logical",
					"value-set",
					"binding",
					"extension",
				];
				if (!validKinds.includes(schema.identifier.kind)) {
					errors.push(
						`Schema identifier.kind must be one of: ${validKinds.join(", ")}`,
					);
				}
			}
		}

		// Field validation
		if ("fields" in schema && schema.fields) {
			for (const [fieldName, field] of Object.entries(schema.fields)) {
				if (!fieldName.trim()) {
					errors.push("Field name cannot be empty");
				}

				if (!field) {
					errors.push(`Field '${fieldName}' is null or undefined`);
				}

				// Add more field-specific validation as needed
			}
		}

		// Circular reference detection (make it a warning, not an error for FHIR schemas)
		if (await this.detectCircularReferences(schema)) {
			this.logger.warn(
				`⚠️ Circular reference detected in schema '${schemaName}' - this may be expected for FHIR primitive types`,
			);
			// Don't add to errors - FHIR schemas often have legitimate circular references
		}

		if (errors.length > 0) {
			this.logger.error(
				`❌ Schema validation failed for '${schemaName}': ${errors.join(", ")}`,
			);
			this.logger.debug(`Schema details: ${JSON.stringify(schema, null, 2)}`);
			throw new SchemaValidationError(
				`Schema validation failed for '${schema.identifier?.name || "unknown"}'`,
				schema,
				errors,
			);
		}

		this.logger.debug(`✅ Schema validation passed for '${schemaName}'`);
	}

	/**
	 * Detect circular references in schema dependencies
	 */
	private async detectCircularReferences(schema: TypeSchema): Promise<boolean> {
		// Simple implementation - can be enhanced for complex cases
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const checkCircular = (currentSchema: TypeSchema): boolean => {
			const name = currentSchema.identifier?.name;
			if (!name) return false;

			if (visiting.has(name)) {
				return true; // Circular reference found
			}

			if (visited.has(name)) {
				return false; // Already processed
			}

			visiting.add(name);

			// Check field references
			if ("fields" in currentSchema && currentSchema.fields) {
				for (const field of Object.values(currentSchema.fields)) {
					if ((field as any)?.type?.name === name) {
						return true; // Self-reference
					}
					// Add more complex reference checking as needed
				}
			}

			visiting.delete(name);
			visited.add(name);
			return false;
		};

		return checkCircular(schema);
	}

	// ==========================================
	// File Generation
	// ==========================================

	/**
	 * Generate files from processed schemas
	 */
	private async generateFiles(schemas: TypeSchema[]): Promise<void> {
		const operations = schemas.map(
			(schema, index) => () =>
				this.errorBoundary.withErrorBoundary(
					async () => {
						const file = await this.generateFileForSchema(
							schema,
							index,
							schemas.length,
						);
						this.generatedFiles.push(file);
						return file;
					},
					{ schema, operationName: "generateFile" },
				),
		);

		await this.errorBoundary.withBatchErrorBoundary(operations, {
			operationName: "generateFiles",
		});

		this.logger.debug(`Generated ${this.generatedFiles.length} files`);
	}

	/**
	 * Generate a single file from a schema
	 */
	private async generateFileForSchema(
		schema: TypeSchema,
		index: number,
		total: number,
	): Promise<GeneratedFile> {
		const fileStartTime = performance.now();

		// Create template context
		const context: TemplateContext = {
			schema,
			typeMapper: this.typeMapper,
			filename: this.typeMapper.formatFileName(
				schema.identifier?.name || "unknown",
			),
			language: this.getLanguageName(),
			timestamp: new Date().toISOString(),
			imports: new Map(),
			exports: new Set(),
		};

		// Generate content
		const content = await this.generateSchemaContent(schema, context);

		// Validate content if enabled
		if (this.options.validate) {
			await this.validateContent(content, context);
		}

		// Write file
		const filename = context.filename + this.getFileExtension();
		const writeResult = await this.fileManager.writeFile(filename, content);

		const generationTime = performance.now() - fileStartTime;

		// Report progress
		this.reportProgress(
			"writing",
			index + 1,
			total,
			`Generated ${filename} (${writeResult.size} bytes)`,
		);

		// Create GeneratedFile result
		const generatedFile: GeneratedFile = {
			path: writeResult.path,
			filename,
			content,
			exports: this.extractExports(content),
			size: writeResult.size,
			timestamp: new Date(),
			metadata: {
				generationTime,
				schemaCount: 1,
				templateName: context.templateName?.toString(),
				warnings: [],
			},
		};

		return generatedFile;
	}

	// ==========================================
	// Helper Methods
	// ==========================================

	/**
	 * Ensure filename has correct extension
	 */
	private ensureFileExtension(filename: string): string {
		const extension = this.getFileExtension();
		return filename.endsWith(extension) ? filename : `${filename}${extension}`;
	}

	/**
	 * Extract exported symbols from generated content
	 * Can be overridden by language-specific implementations
	 */
	protected extractExports(content: string): string[] {
		const exports: string[] = [];

		// Handle export { name1, name2 } syntax
		const exportListRegex = /export\s*\{\s*([^}]+)\s*\}/g;
		let match;
		while ((match = exportListRegex.exec(content)) !== null) {
			if (match[1]) {
				const names = match[1]
					.split(",")
					.map((name) => name.trim())
					.filter(Boolean);
				exports.push(...names);
			}
		}

		// Handle direct export declarations
		const directExportRegex =
			/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
		while ((match = directExportRegex.exec(content)) !== null) {
			if (match[1]) {
				exports.push(match[1]);
			}
		}

		// Remove duplicates
		return [...new Set(exports)];
	}

	/**
	 * Report progress to callback if provided
	 */
	protected reportProgress(
		phase: "validation" | "generation" | "writing" | "complete",
		current: number,
		total: number,
		message?: string,
		schema?: TypeSchema,
	): void {
		if (this.progressCallback) {
			this.progressCallback(phase, current, total, message, schema);
		}

		if (message && this.options.verbose) {
			this.logger.debug(`[${phase}] ${message} (${current}/${total})`);
		}
	}

	/**
	 * Run post-generation hooks
	 * Can be overridden to add custom post-processing
	 */
	protected async runPostGenerationHooks(): Promise<void> {
		// Default implementation does nothing
		// Subclasses can override to add custom logic
	}

	/**
	 * Get cached value or compute and cache it
	 */
	protected getCachedOrCompute<T>(
		key: string,
		computeFn: () => T | Promise<T>,
	): T | Promise<T> {
		if (this.cache.has(key)) {
			return this.cache.get(key) as T;
		}

		const result = computeFn();

		if (result instanceof Promise) {
			return result.then((value) => {
				this.cache.set(key, value);
				return value;
			});
		} else {
			this.cache.set(key, result);
			return result;
		}
	}

	/**
	 * Clear internal cache
	 */
	protected clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get generation statistics
	 */
	public getGenerationStats(): {
		filesGenerated: number;
		totalSize: number;
		averageFileSize: number;
		generationTime: number;
		averageTimePerFile: number;
		cacheHitRate: number;
	} {
		const totalSize = this.generatedFiles.reduce(
			(sum, file) => sum + file.size,
			0,
		);
		const generationTime = performance.now() - this.generationStartTime;

		return {
			filesGenerated: this.generatedFiles.length,
			totalSize,
			averageFileSize:
				this.generatedFiles.length > 0
					? totalSize / this.generatedFiles.length
					: 0,
			generationTime,
			averageTimePerFile:
				this.generatedFiles.length > 0
					? generationTime / this.generatedFiles.length
					: 0,
			cacheHitRate: 0, // TODO: Implement cache hit tracking
		};
	}
}
