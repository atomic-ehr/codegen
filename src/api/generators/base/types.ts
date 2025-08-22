/**
 * Core types and interfaces for the base generator system
 *
 * This module provides the foundational type definitions that all generators
 * build upon, ensuring consistency and type safety across the system.
 */

import type {
	TypeSchema,
	TypeSchemaIdentifier,
} from "../../../typeschema/index.js";
import type { CodegenLogger } from "../../../utils/codegen-logger.js";

/**
 * Base configuration options that all generators must support
 * These options provide the minimum required configuration for any generator
 */
export interface BaseGeneratorOptions {
	/** Output directory where generated files will be written */
	outputDir: string;

	/** Logger instance for tracking generation progress and errors */
	logger?: CodegenLogger;

	/** Whether to overwrite existing files (default: true) */
	overwrite?: boolean;

	/** Whether to validate schemas and generated content (default: true) */
	validate?: boolean;

	/** Enable detailed logging for debugging (default: false) */
	verbose?: boolean;

	/** Enable beginner-friendly error messages and guidance (default: false) */
	beginnerMode?: boolean;

	/** Format for error output: console, json, or structured (default: 'console') */
	errorFormat?: "console" | "json" | "structured";
}

/**
 * Language-specific type representation
 * This interface standardizes how FHIR types are mapped to target languages
 */
export interface LanguageType {
	/** The type string in the target language (e.g., "string", "number", "Patient") */
	name: string;

	/** Whether this is a primitive type that doesn't need imports */
	isPrimitive: boolean;

	/** Import path if this type needs to be imported from another module */
	importPath?: string;

	/** Generic parameters if this is a generic type (e.g., ["T", "K"] for Map<T,K>) */
	generics?: string[];

	/** Whether this type is nullable/optional in the target language */
	nullable?: boolean;

	/** Additional metadata specific to the target language */
	metadata?: Record<string, unknown>;
}

/**
 * Generated file metadata and content
 * Represents a single generated file with all its associated information
 */
export interface GeneratedFile {
	/** Full file system path where the file was/will be written */
	path: string;

	/** Filename only (without directory path) */
	filename: string;

	/** The generated content of the file */
	content: string;

	/** List of symbols exported from this file */
	exports: string[];

	/** File size in bytes */
	size: number;

	/** When this file was generated */
	timestamp: Date;

	/** Additional metadata about the generation process */
	metadata?: {
		/** Time taken to generate this file in milliseconds */
		generationTime?: number;

		/** Number of schemas processed for this file */
		schemaCount?: number;

		/** Template used to generate this file */
		templateName?: string;

		/** Any warnings generated during processing */
		warnings?: string[];
	};
}

/**
 * Template context provided to template engines
 * Contains all the data needed to render templates for code generation
 */
export interface TemplateContext {
	/** The schema being processed */
	schema: TypeSchema;

	/** Type mapper for the target language */
	typeMapper: TypeMapper;

	/** Current file being generated */
	filename: string;

	/** Target language name (e.g., "TypeScript", "Python") */
	language: string;

	/** Generation timestamp in ISO format */
	timestamp: string;

	/** Import map for the current file */
	imports?: Map<string, string>;

	/** Export set for the current file */
	exports?: Set<string>;

	/** Additional context data that templates can use */
	[key: string]: unknown;
}

/**
 * File builder context passed to lifecycle hooks
 * Provides access to file generation state during the build process
 */
export interface FileContext {
	/** Name of the file being generated */
	filename: string;

	/** Current file content */
	content: string;

	/** Map of imports (symbol name -> import path) */
	imports: Map<string, string>;

	/** Set of exported symbols */
	exports: Set<string>;

	/** Additional metadata about the file */
	metadata: Record<string, unknown>;

	/** The schema that generated this file (if applicable) */
	schema?: TypeSchema;

	/** Template name used to generate this file (if applicable) */
	templateName?: string;
}

/**
 * Statistics about file operations
 * Used for performance monitoring and optimization
 */
export interface FileStats {
	/** File size in bytes */
	size: number;

	/** Time taken to generate content in milliseconds */
	generationTime: number;

	/** Time taken to write to disk in milliseconds */
	writeTime: number;

	/** Memory used during generation in bytes */
	memoryUsed?: number;

	/** Number of template renders performed */
	templateRenders?: number;
}

/**
 * Progress callback signature for monitoring generation
 * Allows consumers to track progress of long-running operations
 */
export type ProgressCallback = (
	/** Current phase of generation */
	phase: "validation" | "generation" | "writing" | "complete",

	/** Current item number being processed */
	current: number,

	/** Total number of items to process */
	total: number,

	/** Optional message describing current operation */
	message?: string,

	/** Schema being processed (if applicable) */
	schema?: TypeSchema,
) => void;

/**
 * Lifecycle hook signatures for file operations
 * These hooks allow customization of the file generation process
 */

/** Hook called before saving a file - can modify content or abort save */
export type BeforeSaveHook = (context: FileContext) => void | Promise<void>;

/** Hook called after successfully saving a file */
export type AfterSaveHook = (
	filePath: string,
	stats: FileStats,
) => void | Promise<void>;

/** Hook called when an error occurs during file operations */
export type ErrorHook = (
	error: Error,
	context: FileContext,
) => void | Promise<void>;

/**
 * File builder configuration options
 * Controls how files are generated and processed
 */
export interface FileBuilderOptions {
	/** Template name to use for content generation */
	template?: string;

	/** Strategy for resolving import paths */
	importStrategy?: "auto" | "manual" | "none";

	/** Level of content validation to perform */
	validation?: "strict" | "loose" | "none";

	/** Enable pretty printing of generated content */
	prettify?: boolean;

	/** Custom formatting options */
	formatting?: {
		/** Number of spaces for indentation (default: 2) */
		indentSize?: number;

		/** Use tabs instead of spaces (default: false) */
		useTabs?: boolean;

		/** Maximum line length before wrapping (default: 100) */
		maxLineLength?: number;
	};

	/** File encoding (default: 'utf-8') */
	encoding?: BufferEncoding;
}

/**
 * Abstract base class for type mapping between FHIR and target languages
 * Each language-specific generator must implement this interface
 */
export abstract class TypeMapper {
	/**
	 * Map a FHIR primitive type to the target language
	 * @param fhirType - FHIR primitive type name (e.g., "string", "integer")
	 * @returns Language-specific type representation
	 */
	abstract mapPrimitive(fhirType: string): LanguageType;

	/**
	 * Map a FHIR reference to the target language
	 * @param targets - Array of possible reference targets
	 * @returns Language-specific reference type
	 */
	abstract mapReference(targets: TypeSchemaIdentifier[]): LanguageType;

	/**
	 * Map an array type in the target language
	 * @param elementType - The element type name
	 * @returns Language-specific array type
	 */
	abstract mapArray(elementType: string): LanguageType;

	/**
	 * Map optional/nullable types
	 * @param type - The base type
	 * @param required - Whether the field is required
	 * @returns Language-specific optional type
	 */
	abstract mapOptional(type: string, required: boolean): LanguageType;

	/**
	 * Map enumerated values to the target language
	 * @param values - Array of possible values
	 * @param name - Optional name for the enum type
	 * @returns Language-specific enum type
	 */
	abstract mapEnum(values: string[], name?: string): LanguageType;

	/**
	 * Format a FHIR type name according to target language conventions
	 * @param name - FHIR type name
	 * @returns Formatted type name
	 */
	abstract formatTypeName(name: string): string;

	/**
	 * Format a field name according to target language conventions
	 * @param name - FHIR field name
	 * @returns Formatted field name
	 */
	abstract formatFieldName(name: string): string;

	/**
	 * Format a filename according to target language conventions
	 * @param name - Base filename
	 * @returns Formatted filename (without extension)
	 */
	abstract formatFileName(name: string): string;

	/**
	 * Map a complete TypeSchema identifier to target language type
	 * @param identifier - FHIR type identifier
	 * @returns Language-specific type representation
	 */
	abstract mapType(identifier: TypeSchemaIdentifier): LanguageType;

	/**
	 * Get import statement format for the target language
	 * @param symbols - Symbols to import
	 * @param from - Module to import from
	 * @returns Formatted import statement
	 */
	formatImport?(symbols: string[], from: string): string;

	/**
	 * Get export statement format for the target language
	 * @param symbols - Symbols to export
	 * @returns Formatted export statement
	 */
	formatExport?(symbols: string[]): string;
}

/**
 * Directory builder configuration
 * Used for batch directory operations
 */
export interface DirectoryBuilderConfig {
	/** Directory path relative to output directory */
	path: string;

	/** File manager instance for file operations */
	fileManager: any; // Will be properly typed in FileManager implementation

	/** Logger for directory operations */
	logger: CodegenLogger;

	/** Whether to clean directory before creating files */
	clean?: boolean;
}

/**
 * Index builder configuration
 * Used for generating index/barrel files
 */
export interface IndexBuilderConfig {
	/** Directory to create index for */
	directory: string;

	/** File manager instance */
	fileManager: any;

	/** Template engine for rendering index files */
	templateEngine: any;

	/** Logger instance */
	logger: CodegenLogger;

	/** Header to include in index file */
	header?: string;

	/** Footer to include in index file */
	footer?: string;
}

/**
 * Batch operation result
 * Used for tracking results of operations on multiple items
 */
export interface BatchResult<T> {
	/** Successful results */
	successes: T[];

	/** Failed operations with their errors */
	failures: Array<{
		/** The item that failed */
		item: unknown;

		/** The error that occurred */
		error: Error;

		/** Index of the failed item */
		index: number;
	}>;

	/** Total number of items processed */
	total: number;

	/** Time taken for the entire batch operation */
	duration: number;
}

/**
 * Template engine interface
 * Abstraction for different template engines (Handlebars, etc.)
 */
export interface TemplateEngine {
	/**
	 * Render a template with the given context
	 * @param templateName - Name of the template to render
	 * @param context - Data to pass to the template
	 * @returns Rendered content
	 */
	render(templateName: string, context: Record<string, unknown>): string;

	/**
	 * Register a template
	 * @param name - Template name
	 * @param template - Template content or compiled template
	 */
	registerTemplate(name: string, template: string | Function): void;

	/**
	 * Register a helper function
	 * @param name - Helper name
	 * @param helper - Helper function
	 */
	registerHelper(name: string, helper: Function): void;

	/**
	 * Check if a template exists
	 * @param name - Template name
	 * @returns True if template exists
	 */
	hasTemplate(name: string): boolean;

	/**
	 * Get list of available templates
	 * @returns Array of template names
	 */
	getAvailableTemplates(): string[];
}

/**
 * File manager interface
 * Abstraction for file system operations
 */
export interface FileManager {
	/**
	 * Write a file with automatic directory creation
	 * @param relativePath - Path relative to output directory
	 * @param content - File content
	 * @param options - Write options
	 * @returns Write result with path and stats
	 */
	writeFile(
		relativePath: string,
		content: string,
		options?: { encoding?: BufferEncoding; overwrite?: boolean },
	): Promise<{ path: string; size: number; writeTime: number }>;

	/**
	 * Write multiple files in batch
	 * @param files - Map of path to content
	 * @returns Array of write results
	 */
	writeBatch(files: Map<string, string>): Promise<
		Array<{
			path: string;
			size: number;
			writeTime: number;
		}>
	>;

	/**
	 * Ensure directory exists
	 * @param dirPath - Directory path
	 */
	ensureDirectory(dirPath: string): Promise<void>;

	/**
	 * Clean directory contents
	 * @param relativePath - Path relative to output directory
	 */
	cleanDirectory(relativePath?: string): Promise<void>;

	/**
	 * Get relative import path between files
	 * @param fromFile - Source file
	 * @param toFile - Target file
	 * @returns Relative import path
	 */
	getRelativeImportPath(fromFile: string, toFile: string): string;
}

/**
 * Generator configuration validation result
 * Used to validate generator options before initialization
 */
export interface ConfigValidationResult {
	/** Whether the configuration is valid */
	isValid: boolean;

	/** Validation errors if any */
	errors: string[];

	/** Non-fatal warnings */
	warnings: string[];

	/** Suggested fixes for invalid configuration */
	suggestions: string[];
}

/**
 * Generator capabilities interface
 * Describes what a generator can do - used for introspection
 */
export interface GeneratorCapabilities {
	/** Programming language this generator targets */
	language: string;

	/** File extensions this generator produces */
	fileExtensions: string[];

	/** Whether this generator supports templates */
	supportsTemplates: boolean;

	/** Whether this generator supports custom type mapping */
	supportsCustomTypeMapping: boolean;

	/** Whether this generator supports incremental generation */
	supportsIncrementalGeneration: boolean;

	/** Whether this generator supports validation */
	supportsValidation: boolean;

	/** Supported schema kinds */
	supportedSchemaKinds: Array<
		"resource" | "complex-type" | "profile" | "primitive-type" | "logical"
	>;

	/** Version of the generator */
	version: string;

	/** Additional metadata about capabilities */
	metadata?: Record<string, unknown>;
}
