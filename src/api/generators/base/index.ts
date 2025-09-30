/**
 * Base Generator Public API
 *
 * This is the main entry point for the base generator system.
 * Import from here to access all base generator functionality with
 * clean, well-organized exports.
 */

// ==========================================
// Core Base Generator System
// ==========================================

// Main base generator class
export { BaseGenerator } from "./BaseGenerator";
export { PythonTypeMapper } from "./PythonTypeMapper";
export type { TypeMapperOptions } from "./TypeMapper";
// Type system and mapping
export { TypeMapper } from "./TypeMapper";
export type { TypeScriptTypeMapperOptions } from "./TypeScriptTypeMapper";
export { TypeScriptTypeMapper } from "./TypeScriptTypeMapper";
export type {
    ConfigValidationResult,
    GeneratorCapabilities,
    LanguageType,
    TemplateContext,
} from "./types";

// ==========================================
// Configuration and Options
// ==========================================

export type { BaseGeneratorOptions, FileBuilderOptions } from "./types";

// ==========================================
// File Management System
// ==========================================

export type { DirectoryBuilderConfig } from "./builders/DirectoryBuilder";
export { DirectoryBuilder } from "./builders/DirectoryBuilder";
export type { FileBuilderConfig } from "./builders/FileBuilder";
// Fluent builders
export { FileBuilder } from "./builders/FileBuilder";
export type { IndexBuilderConfig } from "./builders/IndexBuilder";
export { IndexBuilder } from "./builders/IndexBuilder";
export type { FileManagerOptions, WriteFileResult } from "./FileManager";
// Core file management
export { FileManager } from "./FileManager";

// ==========================================
// Error Handling System
// ==========================================

// All error classes for comprehensive error handling
export {
    BatchOperationError,
    ConfigurationError,
    createErrorWithContext,
    FileOperationError,
    GeneratorError,
    SchemaValidationError,
    TemplateError,
    TypeMappingError,
} from "./errors";

// ==========================================
// Core Types and Interfaces
// ==========================================

// Generated file types
// Progress monitoring
// Lifecycle hooks for customization
// Batch operations
export type {
    AfterSaveHook,
    BatchResult,
    BeforeSaveHook,
    ErrorHook,
    FileContext,
    FileStats,
    GeneratedFile,
    ProgressCallback,
} from "./types";

// ==========================================
// External Dependencies (re-exported for convenience)
// ==========================================

// TypeSchema types (commonly needed by generator implementations)
export type { TypeSchema, Identifier } from "@typeschema/index";

// Logger interface
export type { CodegenLogger } from "../../../utils/codegen-logger";

// ==========================================
// Utility Types for Generator Development
// ==========================================

/**
 * Helper type for creating generator options with language-specific extensions
 *
 * @example
 * ```typescript
 * interface TypeScriptOptions extends GeneratorOptions<{
 *   moduleFormat: 'esm' | 'cjs';
 *   generateIndex: boolean;
 * }> {}
 * ```
 */
export type GeneratorOptions<TExtensions = {}> = import("./types").BaseGeneratorOptions & TExtensions;

/**
 * Helper type for generator result arrays
 * Useful for typing the return value of generate() methods
 */
export type GeneratorResult = import("./types").GeneratedFile[];

/**
 * Helper type for async generator functions
 */
export type AsyncGenerator<
    TOptions extends import("./types").BaseGeneratorOptions,
    TResult extends import("./types").GeneratedFile[],
> = (options: TOptions) => Promise<TResult>;

/**
 * Type guard to check if an object is a GeneratedFile
 */
export function isGeneratedFile(obj: unknown): obj is import("./types").GeneratedFile {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "path" in obj &&
        "filename" in obj &&
        "content" in obj &&
        "exports" in obj &&
        "size" in obj &&
        "timestamp" in obj
    );
}

/**
 * Type guard to check if an error is a GeneratorError
 */
export function isGeneratorError(error: unknown): error is import("./errors").GeneratorError {
    const { GeneratorError } = require("./errors");
    return error instanceof GeneratorError;
}

// ==========================================
// Version Information
// ==========================================

/**
 * Base generator system version
 * Updated automatically during build process
 */
export const VERSION = "1.0.0";

/**
 * Supported TypeSchema version
 */
export const SUPPORTED_TYPESCHEMA_VERSION = "1.0.0";

// ==========================================
// Development Utilities
// ==========================================

/**
 * Create a development logger for testing
 * @param prefix - Logger prefix
 * @param verbose - Enable verbose logging
 */
export function createDevLogger(prefix: string = "Dev", verbose: boolean = true) {
    const { createLogger } = require("../../../utils/codegen-logger");
    return createLogger({ prefix, verbose });
}

/**
 * Validate generator options before instantiation
 * @param options - Options to validate
 * @returns Validation result with errors and suggestions
 */
export function validateGeneratorOptions(
    options: import("./types").BaseGeneratorOptions,
): import("./types").ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Required field validation
    if (!options.outputDir) {
        errors.push("outputDir is required");
        suggestions.push("Provide a valid output directory path");
    }

    // Type validation
    if (options.outputDir && typeof options.outputDir !== "string") {
        errors.push("outputDir must be a string");
    }

    if (options.overwrite !== undefined && typeof options.overwrite !== "boolean") {
        errors.push("overwrite must be a boolean");
    }

    if (options.validate !== undefined && typeof options.validate !== "boolean") {
        errors.push("validate must be a boolean");
    }

    // Path validation (only if outputDir is a valid string)
    if (options.outputDir && typeof options.outputDir === "string") {
        const path = require("node:path");
        if (!path.isAbsolute(options.outputDir)) {
            warnings.push("Using relative path for outputDir - consider using absolute path");
            suggestions.push("Use path.resolve() to convert to absolute path");
        }
    }

    // Performance warnings
    if (options.validate === false) {
        warnings.push("Validation is disabled - this may lead to invalid generated code");
        suggestions.push("Consider enabling validation for better code quality");
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestions,
    };
}

// ==========================================
// Constants and Defaults
// ==========================================

/**
 * Default generator options
 */
export const DEFAULT_GENERATOR_OPTIONS: Partial<import("./types").BaseGeneratorOptions> = {
    outputDir: "./generated",
    overwrite: true,
    validate: true,
    verbose: false,
    beginnerMode: false,
    errorFormat: "console",
};

/**
 * Maximum recommended batch size for schema processing
 */
export const MAX_BATCH_SIZE = 50;

/**
 * Default file builder options
 */
export const DEFAULT_FILE_BUILDER_OPTIONS: Partial<import("./types").FileBuilderOptions> = {
    importStrategy: "auto",
    validation: "strict",
    prettify: true,
    formatting: {
        indentSize: 2,
        useTabs: false,
        maxLineLength: 100,
    },
    encoding: "utf-8",
};

// ==========================================
// Backwards Compatibility
// ==========================================

/**
 * @deprecated Use BaseGenerator instead
 * Provided for backwards compatibility only
 */
export { BaseGenerator as Generator } from "./BaseGenerator";

/**
 * @deprecated Use GeneratorError instead
 * Provided for backwards compatibility only
 */
export { GeneratorError as BaseError } from "./errors";
