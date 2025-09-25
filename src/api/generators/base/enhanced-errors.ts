/**
 * Enhanced error handling with rich context and suggestions
 *
 * This module builds on the basic GeneratorError classes to provide
 * even more detailed error context, smarter suggestions, and better
 * user experience for developers at all skill levels.
 */

import type { TypeSchema } from "@typeschema/index";
import { GeneratorError } from "./errors";

/**
 * Enhanced schema validation error with smart suggestions
 */
export class EnhancedSchemaValidationError extends GeneratorError {
  constructor(
    message: string,
    public readonly schema: TypeSchema,
    public readonly validationErrors: string[],
    public readonly userContext?: {
      isBeginnerMode?: boolean;
      previousSuccessfulSchemas?: string[];
      commonPatterns?: string[];
    },
  ) {
    super(message, "validation", {
      schemaName: schema.identifier.name,
      schemaKind: schema.identifier.kind,
      schemaPackage: schema.identifier.package,
      validationErrors,
      userContext,
    });
  }

  getSuggestions(): string[] {
    const suggestions: string[] = [];

    // Basic suggestions
    suggestions.push(
      "Check the schema structure matches TypeSchema specification",
    );
    suggestions.push("Verify all required fields are present");

    // Context-aware suggestions based on validation errors
    for (const error of this.validationErrors) {
      if (error.includes("identifier.name")) {
        suggestions.push("Add missing identifier.name field to the schema");
        suggestions.push("Ensure identifier.name is a non-empty string");
      }

      if (error.includes("identifier.kind")) {
        suggestions.push(
          "Set identifier.kind to one of: resource, complex-type, profile, primitive-type",
        );
        suggestions.push("Check FHIR specification for valid kind values");
      }

      if (error.includes("circular")) {
        suggestions.push("Remove circular references between schemas");
        suggestions.push("Use forward references for recursive types");
      }
    }

    // Beginner-friendly suggestions
    if (this.userContext?.isBeginnerMode) {
      suggestions.push(
        "📚 Review the TypeSchema documentation at: docs/typeschema.md",
      );
      suggestions.push(
        "🔍 Use --verbose flag for more detailed error information",
      );

      if (this.userContext.previousSuccessfulSchemas?.length) {
        suggestions.push(
          `✅ Compare with working schema: ${this.userContext.previousSuccessfulSchemas[0]}`,
        );
      }
    }

    return suggestions;
  }

  /**
   * Get formatted error message for display
   */
  getFormattedMessage(): string {
    const lines = [
      `❌ Schema Validation Failed: ${this.message}`,
      "",
      "📍 Context:",
      `   Schema: ${this.schema.identifier.name}`,
      `   Kind: ${this.schema.identifier.kind}`,
      `   Package: ${this.schema.identifier.package || "unknown"}`,
      "",
    ];

    if (this.validationErrors.length > 0) {
      lines.push("🔍 Validation Errors:");
      this.validationErrors.forEach((error, index) => {
        lines.push(`   ${index + 1}. ${error}`);
      });
      lines.push("");
    }

    const suggestions = this.getSuggestions();
    if (suggestions.length > 0) {
      lines.push("💡 Suggestions:");
      suggestions.forEach((suggestion) => {
        lines.push(`   • ${suggestion}`);
      });
    }

    return lines.join("\n");
  }
}

/**
 * Enhanced file operation error with recovery suggestions
 */
export class EnhancedFileOperationError extends GeneratorError {
  constructor(
    message: string,
    public readonly operation: "create" | "write" | "read" | "delete",
    public readonly filePath: string,
    public readonly originalError?: Error,
    public readonly recoveryOptions?: {
      canRetry?: boolean;
      alternativePaths?: string[];
      permissionFix?: string;
    },
  ) {
    super(message, "writing", {
      operation,
      filePath,
      originalError: originalError?.message,
      recoveryOptions,
    });
  }

  getSuggestions(): string[] {
    const suggestions: string[] = [];

    // Operation-specific suggestions
    switch (this.operation) {
      case "create":
      case "write":
        suggestions.push("Check if the directory exists and is writable");
        suggestions.push(
          "Verify you have permission to write to this location",
        );

        if (this.filePath.includes(" ")) {
          suggestions.push(
            "File path contains spaces - ensure proper escaping",
          );
        }

        if (this.recoveryOptions?.alternativePaths?.length) {
          suggestions.push("Try alternative output directory:");
          this.recoveryOptions.alternativePaths.forEach((path) => {
            suggestions.push(`  • ${path}`);
          });
        }
        break;

      case "read":
        suggestions.push("Verify the file exists at the specified path");
        suggestions.push("Check file permissions are readable");
        break;

      case "delete":
        suggestions.push("Check if file is locked by another process");
        suggestions.push("Verify delete permissions for this directory");
        break;
    }

    // Permission-specific suggestions
    if (this.originalError?.message.includes("EACCES")) {
      suggestions.push(
        "Permission denied - try running with elevated permissions",
      );
      if (this.recoveryOptions?.permissionFix) {
        suggestions.push(`Fix command: ${this.recoveryOptions.permissionFix}`);
      }
    }

    // Space-related suggestions
    if (this.originalError?.message.includes("ENOSPC")) {
      suggestions.push("Insufficient disk space - free up space and retry");
      suggestions.push("Consider using a different output directory");
    }

    // Recovery suggestions
    if (this.recoveryOptions?.canRetry) {
      suggestions.push("This operation can be retried safely");
    }

    return suggestions;
  }

  /**
   * Check if this error is recoverable
   */
  override isRecoverable(): boolean {
    return this.recoveryOptions?.canRetry || false;
  }

  /**
   * Get recovery actions user can take
   */
  getRecoveryActions(): Array<{
    action: string;
    command?: string;
    automatic?: boolean;
  }> {
    const actions: Array<{
      action: string;
      command?: string;
      automatic?: boolean;
    }> = [];

    if (this.originalError?.message.includes("EACCES")) {
      actions.push({
        action: "Fix file permissions",
        command: `chmod 755 "${this.filePath}"`,
        automatic: false,
      });
    }

    if (this.originalError?.message.includes("ENOENT")) {
      actions.push({
        action: "Create missing directory",
        command: `mkdir -p "${this.filePath}"`,
        automatic: true,
      });
    }

    return actions;
  }
}

/**
 * Enhanced template error with template debugging info
 */
export class EnhancedTemplateError extends GeneratorError {
  constructor(
    message: string,
    public readonly templateName: string,
    public readonly templateContext: Record<string, unknown>,
    public readonly debugInfo?: {
      availableTemplates?: string[];
      missingVariables?: string[];
      templateSource?: string;
      lineNumber?: number;
    },
  ) {
    super(message, "generation", {
      templateName,
      contextKeys: Object.keys(templateContext),
      debugInfo,
    });
  }

  getSuggestions(): string[] {
    const suggestions: string[] = [];

    // Template existence suggestions
    if (this.debugInfo?.availableTemplates?.length) {
      suggestions.push("Available templates:");
      this.debugInfo.availableTemplates.forEach((template) => {
        suggestions.push(`  • ${template}`);
      });

      // Suggest similar template names
      const similar = this.findSimilarTemplates(
        this.templateName,
        this.debugInfo.availableTemplates,
      );
      if (similar.length > 0) {
        suggestions.push("Did you mean:");
        similar.forEach((template) => {
          suggestions.push(`  • ${template}`);
        });
      }
    }

    // Missing variables suggestions
    if (this.debugInfo?.missingVariables?.length) {
      suggestions.push("Missing template variables:");
      this.debugInfo.missingVariables.forEach((variable) => {
        suggestions.push(`  • ${variable}`);
      });
      suggestions.push("Add these variables to the template context");
    }

    // Template syntax suggestions
    if (this.debugInfo?.lineNumber) {
      suggestions.push(
        `Check template syntax around line ${this.debugInfo.lineNumber}`,
      );
    }

    suggestions.push("Enable template debugging: { debug: true }");
    suggestions.push("Verify template file exists and has correct syntax");

    return suggestions;
  }

  private findSimilarTemplates(target: string, available: string[]): string[] {
    return available
      .filter((template) => {
        const distance = this.levenshteinDistance(
          target.toLowerCase(),
          template.toLowerCase(),
        );
        return distance <= 2 && distance > 0;
      })
      .slice(0, 3);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]?.[j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]?.[j - 1]! + 1,
            matrix[i]?.[j - 1]! + 1,
            matrix[i - 1]?.[j]! + 1,
          );
        }
      }
    }

    return matrix[str2.length]?.[str1.length]!;
  }
}
