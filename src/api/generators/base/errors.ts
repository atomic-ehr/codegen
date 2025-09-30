/**
 * Comprehensive error handling system for the base generator
 *
 * This module provides rich, contextual error classes that help developers
 * at all skill levels understand and resolve issues quickly.
 */

import type { TypeSchema } from "@typeschema/index";
import type { FileContext } from "./types";

/**
 * Base error class for all generator-related errors
 *
 * Provides common functionality like context tracking, suggestions,
 * and detailed error reporting that makes debugging easier.
 */
export abstract class GeneratorError extends Error {
    /** When this error occurred */
    public readonly timestamp: Date;

    /** Unique error ID for tracking */
    public readonly errorId: string;

    constructor(
        message: string,
        /** Phase of generation where error occurred */
        public readonly phase: "validation" | "generation" | "writing" | "initialization",
        /** Additional context about the error */
        public readonly context?: Record<string, unknown>,
    ) {
        super(message);
        this.name = this.constructor.name;
        this.timestamp = new Date();
        this.errorId = this.generateErrorId();

        // Maintain proper stack trace in V8
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Generate a unique error ID for tracking
     */
    private generateErrorId(): string {
        return `${this.constructor.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get formatted error message with full context
     * This provides a comprehensive view of what went wrong
     */
    getDetailedMessage(): string {
        const lines = [
            `❌ ${this.constructor.name}: ${this.message}`,
            `   Error ID: ${this.errorId}`,
            `   Phase: ${this.phase}`,
            `   Time: ${this.timestamp.toISOString()}`,
        ];

        if (this.context && Object.keys(this.context).length > 0) {
            lines.push("");
            lines.push("📍 Context:");
            Object.entries(this.context).forEach(([key, value]) => {
                lines.push(`   ${key}: ${this.formatContextValue(value)}`);
            });
        }

        return lines.join("\n");
    }

    /**
     * Format context values for display
     */
    private formatContextValue(value: unknown): string {
        if (value === null || value === undefined) {
            return String(value);
        }

        if (typeof value === "string") {
            return `"${value}"`;
        }

        if (typeof value === "object") {
            try {
                return JSON.stringify(value, null, 2);
            } catch {
                return "[Object]";
            }
        }

        return String(value);
    }

    /**
     * Get actionable suggestions for fixing the error
     * Each error type should provide specific, helpful suggestions
     */
    abstract getSuggestions(): string[];

    /**
     * Get error severity level
     */
    getSeverity(): "error" | "warning" | "info" {
        return "error";
    }

    /**
     * Check if this error is recoverable
     */
    isRecoverable(): boolean {
        return false;
    }

    /**
     * Get related documentation links
     */
    getDocumentationLinks(): string[] {
        return [
            "https://github.com/atomic-ehr/codegen/docs/troubleshooting.md",
            `https://github.com/atomic-ehr/codegen/docs/errors/${this.constructor.name}.md`,
        ];
    }
}

/**
 * Schema validation errors with intelligent suggestions
 */
export class SchemaValidationError extends GeneratorError {
    constructor(
        message: string,
        /** The schema that failed validation */
        public readonly schema: TypeSchema,
        /** Specific validation errors */
        public readonly validationErrors: string[],
        /** Additional user context for better suggestions */
        public readonly userContext?: {
            isBeginnerMode?: boolean;
            previousSuccessfulSchemas?: string[];
            commonPatterns?: string[];
        },
    ) {
        super(message, "validation", {
            schemaName: schema.identifier?.name || "unknown",
            schemaKind: schema.identifier?.kind || "unknown",
            schemaPackage: schema.identifier?.package || "unknown",
            validationErrors,
            userContext,
        });
    }

    getSuggestions(): string[] {
        const suggestions: string[] = [];

        // Add basic validation suggestions
        suggestions.push("Verify the schema follows the TypeSchema specification");
        suggestions.push("Check that all required fields are present and properly typed");

        // Context-aware suggestions based on specific errors
        for (const error of this.validationErrors) {
            if (error.includes("identifier.name")) {
                suggestions.push("✨ Add a valid identifier.name field to your schema");
                suggestions.push('💡 Example: identifier: { name: "Patient", kind: "resource" }');
            }

            if (error.includes("identifier.kind")) {
                suggestions.push(
                    '🎯 Set identifier.kind to: "resource", "complex-type", "profile", or "primitive-type"',
                );
                suggestions.push("📚 Check FHIR specification for the correct kind value");
            }

            if (error.includes("circular")) {
                suggestions.push("🔄 Remove circular references between schemas");
                suggestions.push("💡 Use forward declarations for recursive types");
                suggestions.push("🔍 Look for schemas that reference each other in a loop");
            }

            if (error.includes("fields")) {
                suggestions.push("📝 Check that all fields have proper type definitions");
                suggestions.push("🔧 Ensure field types reference valid TypeSchema identifiers");
            }
        }

        // Beginner-specific suggestions
        if (this.userContext?.isBeginnerMode) {
            suggestions.push("");
            suggestions.push("🎓 Beginner Tips:");
            suggestions.push("📖 Start with the Quick Start guide: docs/getting-started/quick-start.md");
            suggestions.push("🔍 Use --verbose flag for detailed error information");
            suggestions.push("🧪 Test with a simple schema first to verify your setup");

            if (this.userContext.previousSuccessfulSchemas?.length) {
                suggestions.push(
                    `✅ Compare with your working schema: ${this.userContext.previousSuccessfulSchemas[0]}`,
                );
            }
        }

        // Advanced suggestions for experienced users
        if (!this.userContext?.isBeginnerMode) {
            suggestions.push("");
            suggestions.push("🔧 Advanced Debugging:");
            suggestions.push("🕵️ Enable schema validation debugging");
            suggestions.push("📊 Check schema statistics and complexity metrics");
            suggestions.push("⚡ Consider schema preprocessing if dealing with complex inheritance");
        }

        return suggestions;
    }

    override isRecoverable(): boolean {
        // Simple validation errors like missing fields are usually recoverable
        return this.validationErrors.every((error) => !error.includes("circular") && !error.includes("corruption"));
    }
}

/**
 * Template processing errors with debugging information
 */
export class TemplateError extends GeneratorError {
    constructor(
        message: string,
        /** Name of the template that failed */
        public readonly templateName: string,
        /** Context data passed to the template */
        public readonly templateContext: Record<string, unknown>,
        /** Additional debugging information */
        public readonly debugInfo?: {
            availableTemplates?: string[];
            missingVariables?: string[];
            templateSource?: string;
            lineNumber?: number;
            columnNumber?: number;
        },
    ) {
        super(message, "generation", {
            templateName,
            contextKeys: Object.keys(templateContext),
            availableTemplates: debugInfo?.availableTemplates?.length || 0,
            debugInfo,
        });
    }

    getSuggestions(): string[] {
        const suggestions: string[] = [];

        // Template existence suggestions
        if (this.debugInfo?.availableTemplates?.length) {
            if (!this.debugInfo.availableTemplates.includes(this.templateName)) {
                suggestions.push(`❌ Template '${this.templateName}' not found`);
                suggestions.push("📂 Available templates:");
                this.debugInfo.availableTemplates.forEach((template) => {
                    suggestions.push(`   • ${template}`);
                });

                // Suggest similar template names using Levenshtein distance
                const similar = this.findSimilarTemplates(this.templateName, this.debugInfo.availableTemplates);
                if (similar.length > 0) {
                    suggestions.push("🤔 Did you mean:");
                    similar.forEach((template) => {
                        suggestions.push(`   • ${template}`);
                    });
                }
            }
        }

        // Missing variables suggestions
        if (this.debugInfo?.missingVariables?.length) {
            suggestions.push("📝 Missing template variables:");
            this.debugInfo.missingVariables.forEach((variable) => {
                suggestions.push(`   • ${variable}`);
            });
            suggestions.push("💡 Add these variables to your template context");

            // Suggest similar variable names from context
            const contextKeys = Object.keys(this.templateContext);
            this.debugInfo.missingVariables.forEach((missing) => {
                const similar = contextKeys.filter(
                    (key) => this.levenshteinDistance(missing.toLowerCase(), key.toLowerCase()) <= 2,
                );
                if (similar.length > 0) {
                    suggestions.push(`   Similar to: ${similar.join(", ")}`);
                }
            });
        }

        // Template syntax suggestions
        if (this.debugInfo?.lineNumber) {
            suggestions.push(`🐛 Check template syntax around line ${this.debugInfo.lineNumber}`);

            if (this.debugInfo.columnNumber) {
                suggestions.push(`   Column: ${this.debugInfo.columnNumber}`);
            }

            if (this.debugInfo.templateSource) {
                const lines = this.debugInfo.templateSource.split("\n");
                const errorLine = lines[this.debugInfo.lineNumber - 1];
                if (errorLine) {
                    suggestions.push(`   Code: ${errorLine.trim()}`);
                }
            }
        }

        // General template debugging
        suggestions.push("🔧 Template debugging steps:");
        suggestions.push("   • Enable template debugging: { debug: true }");
        suggestions.push("   • Verify template file exists and has correct syntax");
        suggestions.push("   • Check template variable names match context keys");
        suggestions.push("   • Ensure template engine is properly configured");

        return suggestions;
    }

    /**
     * Find templates with similar names using Levenshtein distance
     */
    private findSimilarTemplates(target: string, available: string[]): string[] {
        return available
            .filter((template) => {
                const distance = this.levenshteinDistance(target.toLowerCase(), template.toLowerCase());
                return distance <= 2 && distance > 0;
            })
            .slice(0, 3)
            .sort(
                (a, b) =>
                    this.levenshteinDistance(target.toLowerCase(), a.toLowerCase()) -
                    this.levenshteinDistance(target.toLowerCase(), b.toLowerCase()),
            );
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1)
            .fill(null)
            .map(() => Array(str1.length + 1).fill(0));

        for (let i = 0; i <= str1.length; i++) matrix[0]![i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j]![0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j]![i] = Math.min(
                    matrix[j]?.[i - 1]! + 1, // deletion
                    matrix[j - 1]?.[i]! + 1, // insertion
                    matrix[j - 1]?.[i - 1]! + indicator, // substitution
                );
            }
        }

        return matrix[str2.length]?.[str1.length]!;
    }

    override isRecoverable(): boolean {
        // Template errors are usually recoverable by fixing template or context
        return true;
    }
}

/**
 * File operation errors with recovery suggestions
 */
export class FileOperationError extends GeneratorError {
    constructor(
        message: string,
        /** Type of file operation that failed */
        public readonly operation: "create" | "write" | "read" | "delete" | "copy" | "move",
        /** Path of the file that caused the error */
        public readonly filePath: string,
        /** Original system error if available */
        public readonly originalError?: Error,
        /** Recovery options and suggestions */
        public readonly recoveryOptions?: {
            canRetry?: boolean;
            alternativePaths?: string[];
            permissionFix?: string;
            diskSpaceRequired?: number;
        },
    ) {
        super(message, "writing", {
            operation,
            filePath,
            originalErrorMessage: originalError?.message,
            originalErrorCode: (originalError as NodeJS.ErrnoException)?.code,
            recoveryOptions,
        });
    }

    getSuggestions(): string[] {
        const suggestions: string[] = [];
        const errorCode = (this.originalError as NodeJS.ErrnoException)?.code;

        // Operation-specific suggestions
        switch (this.operation) {
            case "create":
            case "write":
                suggestions.push("📁 File writing troubleshooting:");
                suggestions.push("   • Check if the output directory exists");
                suggestions.push("   • Verify write permissions for the target directory");
                suggestions.push("   • Ensure no other process has the file locked");

                if (this.filePath.includes(" ")) {
                    suggestions.push("   • File path contains spaces - check path escaping");
                }

                if (this.recoveryOptions?.alternativePaths?.length) {
                    suggestions.push("🔄 Alternative output directories:");
                    this.recoveryOptions.alternativePaths.forEach((path) => {
                        suggestions.push(`   • ${path}`);
                    });
                }
                break;

            case "read":
                suggestions.push("📖 File reading troubleshooting:");
                suggestions.push("   • Verify the file exists at the specified path");
                suggestions.push("   • Check file read permissions");
                suggestions.push("   • Ensure file is not corrupted");
                break;

            case "delete":
                suggestions.push("🗑️ File deletion troubleshooting:");
                suggestions.push("   • Check if file is locked by another process");
                suggestions.push("   • Verify delete permissions for the directory");
                suggestions.push("   • Ensure file exists before attempting deletion");
                break;
        }

        // Error code specific suggestions
        switch (errorCode) {
            case "EACCES":
                suggestions.push("🔐 Permission Error:");
                suggestions.push("   • Current user lacks necessary file permissions");

                if (this.recoveryOptions?.permissionFix) {
                    suggestions.push(`   • Fix command: ${this.recoveryOptions.permissionFix}`);
                } else {
                    suggestions.push(`   • Try: chmod 755 "${this.filePath}"`);
                }

                suggestions.push("   • Consider running with elevated permissions");
                suggestions.push("   • Check directory ownership and permissions");
                break;

            case "ENOSPC":
                suggestions.push("💾 Disk Space Error:");
                suggestions.push("   • Insufficient disk space available");
                suggestions.push("   • Free up disk space and retry");
                suggestions.push("   • Consider using a different output directory");

                if (this.recoveryOptions?.diskSpaceRequired) {
                    const mb = Math.ceil(this.recoveryOptions.diskSpaceRequired / 1024 / 1024);
                    suggestions.push(`   • Required space: ~${mb}MB`);
                }
                break;

            case "ENOENT":
                suggestions.push("📂 File Not Found:");
                suggestions.push("   • File or directory does not exist");
                suggestions.push("   • Check the file path for typos");
                suggestions.push("   • Ensure parent directories exist");
                suggestions.push(`   • Create directory: mkdir -p "$(dirname "${this.filePath}")"`);
                break;

            case "EMFILE":
            case "ENFILE":
                suggestions.push("📊 Too Many Open Files:");
                suggestions.push("   • System has reached file handle limit");
                suggestions.push("   • Close unused files and retry");
                suggestions.push("   • Consider processing files in smaller batches");
                break;
        }

        // Recovery suggestions
        if (this.recoveryOptions?.canRetry) {
            suggestions.push("");
            suggestions.push("🔄 Recovery Options:");
            suggestions.push("   • This operation can be retried safely");
            suggestions.push("   • Fix the underlying issue and run again");
        }

        // General debugging
        suggestions.push("");
        suggestions.push("🔍 General Debugging:");
        suggestions.push("   • Check system logs for more details");
        suggestions.push("   • Verify disk health if errors persist");
        suggestions.push("   • Test with a simpler file path");

        return suggestions;
    }

    override isRecoverable(): boolean {
        return this.recoveryOptions?.canRetry || false;
    }

    /**
     * Get specific recovery actions that can be taken
     */
    getRecoveryActions(): Array<{
        action: string;
        command?: string;
        automatic?: boolean;
        riskLevel?: "low" | "medium" | "high";
    }> {
        const actions: Array<{
            action: string;
            command?: string;
            automatic?: boolean;
            riskLevel?: "low" | "medium" | "high";
        }> = [];

        const errorCode = (this.originalError as NodeJS.ErrnoException)?.code;

        switch (errorCode) {
            case "EACCES":
                actions.push({
                    action: "Fix file permissions",
                    command: `chmod 755 "${this.filePath}"`,
                    automatic: false,
                    riskLevel: "medium",
                });
                break;

            case "ENOENT":
                actions.push({
                    action: "Create missing directory",
                    command: `mkdir -p "$(dirname "${this.filePath}")"`,
                    automatic: true,
                    riskLevel: "low",
                });
                break;

            case "ENOSPC":
                actions.push({
                    action: "Free up disk space",
                    automatic: false,
                    riskLevel: "low",
                });
                break;
        }

        return actions;
    }
}

/**
 * Type mapping errors for language-specific type conversion issues
 */
export class TypeMappingError extends GeneratorError {
    constructor(
        message: string,
        /** FHIR type that couldn't be mapped */
        public readonly fhirType: string,
        /** Target language name */
        public readonly targetLanguage: string,
        /** Additional mapping context */
        public readonly mappingContext?: {
            availableMappings?: string[];
            suggestedMappings?: Record<string, string>;
            schema?: TypeSchema;
        },
    ) {
        super(message, "generation", {
            fhirType,
            targetLanguage,
            availableMappings: mappingContext?.availableMappings?.length || 0,
            hasSchema: !!mappingContext?.schema,
        });
    }

    getSuggestions(): string[] {
        const suggestions: string[] = [];

        suggestions.push(`🎯 Type mapping issue for '${this.fhirType}' → ${this.targetLanguage}`);

        // Check for available mappings
        if (this.mappingContext?.availableMappings?.length) {
            suggestions.push("📋 Available type mappings:");
            this.mappingContext.availableMappings.forEach((mapping) => {
                suggestions.push(`   • ${mapping}`);
            });

            // Suggest similar types
            const similar = this.mappingContext.availableMappings.filter(
                (mapping) =>
                    mapping.toLowerCase().includes(this.fhirType.toLowerCase()) ||
                    this.fhirType.toLowerCase().includes(mapping.toLowerCase()),
            );

            if (similar.length > 0) {
                suggestions.push("🤔 Similar types found:");
                similar.forEach((mapping) => {
                    suggestions.push(`   • ${mapping}`);
                });
            }
        }

        // Suggested mappings
        if (this.mappingContext?.suggestedMappings) {
            suggestions.push("💡 Suggested mappings:");
            Object.entries(this.mappingContext.suggestedMappings).forEach(([fhir, target]) => {
                suggestions.push(`   • ${fhir} → ${target}`);
            });
        }

        // General type mapping suggestions
        suggestions.push("");
        suggestions.push("🔧 Fixing type mapping issues:");
        suggestions.push(`   • Add '${this.fhirType}' mapping in ${this.targetLanguage}TypeMapper`);
        suggestions.push("   • Check if the FHIR type name is spelled correctly");
        suggestions.push("   • Verify the type mapper is properly configured");
        suggestions.push("   • Consider adding a fallback type mapping");

        // Language-specific suggestions
        switch (this.targetLanguage.toLowerCase()) {
            case "typescript":
                suggestions.push("   • Add to TYPESCRIPT_PRIMITIVES map");
                suggestions.push("   • Implement in mapPrimitive() method");
                break;
            case "python":
                suggestions.push("   • Add to PYTHON_TYPE_MAP dictionary");
                suggestions.push("   • Consider using typing module types");
                break;
            case "rust":
                suggestions.push("   • Add to RUST_TYPE_MAP");
                suggestions.push("   • Consider Option<T> for nullable types");
                break;
        }

        return suggestions;
    }

    override isRecoverable(): boolean {
        return true; // Type mapping errors can usually be fixed by updating the mapper
    }
}

/**
 * Configuration errors with validation details
 */
export class ConfigurationError extends GeneratorError {
    constructor(
        message: string,
        /** Configuration key that has an issue */
        public readonly configKey: string,
        /** The invalid value that was provided */
        public readonly providedValue: unknown,
        /** Expected value type or format */
        public readonly expectedValue?: string,
        /** Valid options if applicable */
        public readonly validOptions?: unknown[],
    ) {
        super(message, "initialization", {
            configKey,
            providedValue,
            providedType: typeof providedValue,
            expectedValue,
            validOptions,
        });
    }

    getSuggestions(): string[] {
        const suggestions: string[] = [];

        suggestions.push(`⚙️ Configuration error for '${this.configKey}'`);
        suggestions.push(`   Provided: ${JSON.stringify(this.providedValue)} (${typeof this.providedValue})`);

        if (this.expectedValue) {
            suggestions.push(`   Expected: ${this.expectedValue}`);
        }

        if (this.validOptions?.length) {
            suggestions.push("   Valid options:");
            this.validOptions.forEach((option) => {
                suggestions.push(`   • ${JSON.stringify(option)}`);
            });
        }

        suggestions.push("");
        suggestions.push("🔧 Configuration fixes:");
        suggestions.push(`   • Check the '${this.configKey}' value in your configuration`);
        suggestions.push("   • Refer to the configuration documentation");
        suggestions.push("   • Use TypeScript for better config validation");
        suggestions.push("   • Check for typos in configuration keys");

        // Specific suggestions based on config key
        switch (this.configKey) {
            case "outputDir":
                suggestions.push("   • Ensure the output directory path exists");
                suggestions.push("   • Use absolute paths for better reliability");
                break;
            case "logger":
                suggestions.push("   • Provide a valid logger instance");
                suggestions.push("   • Use createLogger() from utils/codegen-logger");
                break;
            case "validation":
                suggestions.push('   • Set to true, false, or "strict"');
                break;
        }

        return suggestions;
    }

    override isRecoverable(): boolean {
        return true; // Configuration errors are usually fixable
    }
}

/**
 * Batch operation error for multiple failures
 */
export class BatchOperationError extends GeneratorError {
    constructor(
        message: string,
        /** Individual errors that occurred */
        public readonly errors: GeneratorError[],
    ) {
        super(message, "generation", {
            errorCount: errors.length,
            errorTypes: [...new Set(errors.map((e) => e.constructor.name))],
            phases: [...new Set(errors.map((e) => e.phase))],
        });
    }

    getSuggestions(): string[] {
        // Aggregate unique suggestions from all errors
        const allSuggestions = this.errors.flatMap((e) => e.getSuggestions());
        const uniqueSuggestions = [...new Set(allSuggestions)];

        const suggestions: string[] = [];
        suggestions.push(`📊 Batch operation failed with ${this.errors.length} errors:`);

        // Group errors by type
        const errorGroups = new Map<string, GeneratorError[]>();
        this.errors.forEach((error) => {
            const type = error.constructor.name;
            if (!errorGroups.has(type)) {
                errorGroups.set(type, []);
            }
            errorGroups.get(type)?.push(error);
        });

        // Show error breakdown
        suggestions.push("");
        suggestions.push("🔍 Error breakdown:");
        for (const [type, typeErrors] of errorGroups) {
            suggestions.push(`   • ${type}: ${typeErrors.length} occurrences`);
        }

        // Show most common suggestions with proper prefixing
        suggestions.push("💡 Most relevant suggestions:");
        const prefixedSuggestions = uniqueSuggestions.slice(0, 8).map((suggestion) => `   ${suggestion}`);
        suggestions.push(...prefixedSuggestions);

        return suggestions;
    }

    /**
     * Get detailed breakdown of all errors
     */
    getErrorBreakdown(): string {
        const lines: string[] = [];

        this.errors.forEach((error, index) => {
            lines.push(`${index + 1}. ${error.constructor.name}: ${error.message}`);
            if (error.context?.schemaName) {
                lines.push(`   Schema: ${error.context.schemaName}`);
            }
            if (error.context?.filename) {
                lines.push(`   File: ${error.context.filename}`);
            }
            lines.push("");
        });

        return lines.join("\n");
    }

    override isRecoverable(): boolean {
        // Batch is recoverable if at least some individual errors are recoverable
        return this.errors.some((error) => error.isRecoverable());
    }

    /**
     * Get errors that are recoverable
     */
    getRecoverableErrors(): GeneratorError[] {
        return this.errors.filter((error) => error.isRecoverable());
    }

    /**
     * Get errors that are not recoverable
     */
    getNonRecoverableErrors(): GeneratorError[] {
        return this.errors.filter((error) => !error.isRecoverable());
    }
}

/**
 * Utility function to create context-aware errors
 * Helps maintain consistent error creation patterns
 */
export function createErrorWithContext<T extends GeneratorError>(
    ErrorClass: new (...args: any[]) => T,
    message: string,
    context: FileContext,
    additionalContext?: Record<string, unknown>,
): T {
    const fullContext = {
        filename: context.filename,
        importsCount: context.imports.size,
        exportsCount: context.exports.size,
        hasSchema: !!context.schema,
        templateName: context.templateName,
        ...additionalContext,
    };

    // Create error with the enhanced context - need to pass phase parameter
    return new ErrorClass(message, "generation", fullContext);
}
