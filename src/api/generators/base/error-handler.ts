/**
 * Centralized error handling and reporting system
 *
 * This module provides a comprehensive error handling solution that:
 * - Handles both generator-specific and unknown errors gracefully
 * - Provides rich, context-aware error reporting
 * - Supports multiple output formats (console, JSON, structured)
 * - Includes batch error handling for multiple failures
 * - Offers smart error recovery suggestions
 */

import type { TypeSchema } from "@typeschema/types";
import type { CodegenLogger } from "../../../utils/codegen-logger";
import { BatchOperationError, GeneratorError } from "./errors";

export interface ErrorHandlerOptions {
    logger: CodegenLogger;
    verbose?: boolean;
    beginnerMode?: boolean;
    outputFormat?: "console" | "json" | "structured";
}

/**
 * Centralized error handler with smart reporting
 */
export class ErrorHandler {
    constructor(private options: ErrorHandlerOptions) {}

    /**
     * Handle a single error with appropriate reporting
     */
    handleError(error: Error, context?: { schema?: TypeSchema; filename?: string }): void {
        if (error instanceof GeneratorError) {
            this.handleGeneratorError(error, context);
        } else {
            this.handleUnknownError(error, context);
        }
    }

    /**
     * Handle multiple errors in batch
     */
    handleBatchErrors(errors: Error[]): void {
        const generatorErrors = errors.filter((e) => e instanceof GeneratorError) as GeneratorError[];
        const unknownErrors = errors.filter((e) => !(e instanceof GeneratorError));

        if (generatorErrors.length > 0) {
            this.reportBatchErrors(generatorErrors);
        }

        unknownErrors.forEach((error) => {
            this.handleUnknownError(error);
        });
    }

    /**
     * Handle generator-specific errors with rich context
     */
    private handleGeneratorError(error: GeneratorError, _context?: { schema?: TypeSchema; filename?: string }): void {
        switch (this.options.outputFormat) {
            case "json":
                this.reportErrorAsJson(error);
                break;
            case "structured":
                this.reportErrorStructured(error);
                break;
            default:
                this.reportErrorToConsole(error);
        }
    }

    /**
     * Handle unknown errors gracefully
     */
    private handleUnknownError(error: Error, context?: { schema?: TypeSchema; filename?: string }): void {
        this.options.logger.error("Unexpected error occurred:", error);

        if (this.options.verbose) {
            console.error("\n🚨 Unexpected Error Details:");
            console.error(`   Type: ${error.constructor.name}`);
            console.error(`   Message: ${error.message}`);
            if (error.stack) {
                console.error(`   Stack: ${error.stack}`);
            }
            if (context?.schema) {
                console.error(`   Schema: ${context.schema.identifier.name}`);
            }
            if (context?.filename) {
                console.error(`   File: ${context.filename}`);
            }
        }

        console.error("\n💡 General troubleshooting suggestions:");
        console.error("   • Run with --verbose flag for more details");
        console.error("   • Check your input files for corruption");
        console.error("   • Update to the latest version of atomic-codegen");
        console.error("   • Report this issue at: https://github.com/atomic-ehr/codegen/issues");
    }

    /**
     * Report error to console with formatting
     */
    private reportErrorToConsole(error: GeneratorError): void {
        if ("getFormattedMessage" in error) {
            console.error((error as any).getFormattedMessage());
        } else {
            console.error(`\n❌ ${error.constructor.name}: ${error.message}`);

            const suggestions = error.getSuggestions();
            if (suggestions.length > 0) {
                console.error("\n💡 Suggestions:");
                suggestions.forEach((suggestion) => {
                    console.error(`   • ${suggestion}`);
                });
            }
        }

        if (this.options.verbose && error.context) {
            console.error("\n🔍 Debug Information:");
            console.error(JSON.stringify(error.context, null, 2));
        }
    }

    /**
     * Report error as JSON for programmatic consumption
     */
    private reportErrorAsJson(error: GeneratorError): void {
        const errorData = {
            type: error.constructor.name,
            message: error.message,
            phase: error.phase,
            context: error.context,
            suggestions: error.getSuggestions(),
            timestamp: new Date().toISOString(),
        };

        console.error(JSON.stringify(errorData, null, 2));
    }

    /**
     * Report error in structured format
     */
    private reportErrorStructured(error: GeneratorError): void {
        const structure = {
            error: {
                type: error.constructor.name,
                message: error.message,
                phase: error.phase,
            },
            context: error.context,
            suggestions: error.getSuggestions(),
            actions: this.getRecoveryActions(error),
        };

        console.error("---");
        console.error("Error Report:");
        console.error(JSON.stringify(structure, null, 2));
        console.error("---");
    }

    /**
     * Report multiple errors efficiently
     */
    private reportBatchErrors(errors: GeneratorError[]): void {
        console.error(`\n❌ ${errors.length} errors occurred during generation:`);

        // Group errors by type
        const errorGroups = new Map<string, GeneratorError[]>();
        errors.forEach((error) => {
            const type = error.constructor.name;
            if (!errorGroups.has(type)) {
                errorGroups.set(type, []);
            }
            errorGroups.get(type)?.push(error);
        });

        // Report each group
        for (const [type, groupErrors] of errorGroups) {
            console.error(`\n📋 ${type} (${groupErrors.length} occurrences):`);

            groupErrors.forEach((error, index) => {
                console.error(`   ${index + 1}. ${error.message}`);
                if (error.context?.schemaName) {
                    console.error(`      Schema: ${error.context.schemaName}`);
                }
            });

            // Show common suggestions for this error type
            const commonSuggestions = this.getCommonSuggestions(groupErrors);
            if (commonSuggestions.length > 0) {
                console.error("\n   💡 Common suggestions:");
                commonSuggestions.forEach((suggestion) => {
                    console.error(`      • ${suggestion}`);
                });
            }
        }
    }

    /**
     * Get common suggestions across similar errors
     */
    private getCommonSuggestions(errors: GeneratorError[]): string[] {
        const allSuggestions = errors.flatMap((e) => e.getSuggestions());
        const suggestionCounts = new Map<string, number>();

        allSuggestions.forEach((suggestion) => {
            suggestionCounts.set(suggestion, (suggestionCounts.get(suggestion) || 0) + 1);
        });

        // Return suggestions that appear in at least half the errors
        const threshold = Math.ceil(errors.length / 2);
        return Array.from(suggestionCounts.entries())
            .filter(([_, count]) => count >= threshold)
            .map(([suggestion, _]) => suggestion)
            .slice(0, 5); // Limit to 5 most common
    }

    /**
     * Get recovery actions for an error
     */
    private getRecoveryActions(error: GeneratorError): Array<{ action: string; command?: string }> {
        if ("getRecoveryActions" in error) {
            return (error as any).getRecoveryActions();
        }

        return [
            { action: "Review error message and suggestions above" },
            { action: "Check input files and configuration" },
            { action: "Try with --verbose flag for more information" },
        ];
    }
}

/**
 * Error boundary for catching and handling all generator errors
 */
export class GeneratorErrorBoundary {
    constructor(private errorHandler: ErrorHandler) {}

    /**
     * Wrap an async operation with error boundary
     */
    async withErrorBoundary<T>(
        operation: () => Promise<T>,
        context?: {
            schema?: TypeSchema;
            filename?: string;
            operationName?: string;
        },
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            this.errorHandler.handleError(error instanceof Error ? error : new Error(String(error)), context);
            throw error; // Re-throw after handling
        }
    }

    /**
     * Wrap a batch operation with error boundary
     */
    async withBatchErrorBoundary<T>(
        operations: Array<() => Promise<T>>,
        _context?: { operationName?: string },
    ): Promise<T[]> {
        const results: T[] = [];
        const errors: Error[] = [];

        for (const operation of operations) {
            try {
                const result = await operation();
                results.push(result);
            } catch (error) {
                errors.push(error instanceof Error ? error : new Error(String(error)));
            }
        }

        if (errors.length > 0) {
            this.errorHandler.handleBatchErrors(errors);
            throw new BatchOperationError(
                `${errors.length} operations failed`,
                errors.filter((e) => e instanceof GeneratorError) as GeneratorError[],
            );
        }

        return results;
    }
}
