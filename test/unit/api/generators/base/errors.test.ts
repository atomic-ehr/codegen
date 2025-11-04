/**
 * Unit tests for generator error classes
 */

import { describe, expect, test } from "bun:test";
import {
    BatchOperationError,
    ConfigurationError,
    createErrorWithContext,
    FileOperationError,
    GeneratorError,
    SchemaValidationError,
    TemplateError,
    TypeMappingError,
} from "@root/api/generators/base/errors";
import type { FileContext } from "@root/api/generators/base/types";
import type { TypeSchema } from "@typeschema/index";

// PythonHelper function to create mock schemas
function createMockSchema(overrides: Partial<TypeSchema> = {}): TypeSchema {
    return {
        identifier: {
            name: "TestSchema",
            kind: "resource",
            package: "test.package",
            url: "http://test.com/StructureDefinition/TestSchema",
            ...overrides.identifier,
        },
        description: "Test schema for unit tests",
        fields: {
            id: {
                type: { name: "string", kind: "primitive-type" },
                required: false,
                array: false,
            },
        },
        ...overrides,
    } as TypeSchema;
}

// Concrete implementation of GeneratorError for testing
class TestGeneratorError extends GeneratorError {
    constructor(
        message: string,
        phase: "validation" | "generation" | "writing" | "initialization" = "generation",
        context?: Record<string, unknown>,
    ) {
        super(message, phase, context || { testContext: "test-value" });
    }

    getSuggestions(): string[] {
        return ["This is a test suggestion", "Try this fix"];
    }
}

describe("Generator Error Classes", () => {
    describe("GeneratorError Base Class", () => {
        test("creates error with proper metadata", () => {
            const error = new TestGeneratorError("Test error message", "validation");

            expect(error.message).toBe("Test error message");
            expect(error.phase).toBe("validation");
            expect(error.context?.testContext).toBe("test-value");
            expect(error.timestamp).toBeInstanceOf(Date);
            expect(error.errorId).toBeDefined();
            expect(error.errorId).toMatch(/^TestGeneratorError-\d+-\w+$/);
        });

        test("generates detailed error message", () => {
            const error = new TestGeneratorError("Test error", "generation");
            const detailed = error.getDetailedMessage();

            expect(detailed).toContain("❌ TestGeneratorError: Test error");
            expect(detailed).toContain(`Error ID: ${error.errorId}`);
            expect(detailed).toContain("Phase: generation");
            expect(detailed).toContain("Time: ");
            expect(detailed).toContain("📍 Context:");
            expect(detailed).toContain('testContext: "test-value"');
        });

        test("formats different context value types correctly", () => {
            const error = new TestGeneratorError("Test", "generation");

            // Use reflection to access private method for testing
            const formatValue = (error as any).formatContextValue.bind(error);

            expect(formatValue(null)).toBe("null");
            expect(formatValue(undefined)).toBe("undefined");
            expect(formatValue("string")).toBe('"string"');
            expect(formatValue(123)).toBe("123");
            expect(formatValue({ key: "value" })).toContain('"key": "value"');
        });

        test("provides default properties", () => {
            const error = new TestGeneratorError("Test error");

            expect(error.getSeverity()).toBe("error");
            expect(error.isRecoverable()).toBe(false);
            expect(error.getDocumentationLinks()).toContain(
                "https://github.com/atomic-ehr/codegen/docs/troubleshooting.md",
            );
        });
    });

    describe("SchemaValidationError", () => {
        test("creates schema validation error with context", () => {
            const schema = createMockSchema({
                identifier: { name: "Patient", kind: "resource" },
            });
            const validationErrors = ["identifier.name is missing", "fields are invalid"];

            const error = new SchemaValidationError("Schema validation failed", schema, validationErrors);

            expect(error.schema).toBe(schema);
            expect(error.validationErrors).toEqual(validationErrors);
            expect(error.phase).toBe("validation");
            expect(error.context?.schemaName).toBe("Patient");
            expect(error.context?.schemaKind).toBe("resource");
        });

        test("provides context-aware suggestions", () => {
            const schema = createMockSchema();
            const error = new SchemaValidationError("Validation failed", schema, [
                "identifier.name is missing",
                "identifier.kind is invalid",
            ]);

            const suggestions = error.getSuggestions();

            expect(suggestions).toContain("Verify the schema follows the TypeSchema specification");
            expect(suggestions.some((s) => s.includes("identifier.name"))).toBe(true);
            expect(suggestions.some((s) => s.includes("identifier.kind"))).toBe(true);
        });

        test("provides beginner-friendly suggestions", () => {
            const schema = createMockSchema();
            const error = new SchemaValidationError("Validation failed", schema, ["identifier.name is missing"], {
                isBeginnerMode: true,
                previousSuccessfulSchemas: ["Patient"],
            });

            const suggestions = error.getSuggestions();

            expect(suggestions.some((s) => s.includes("🎓 Beginner Tips"))).toBe(true);
            expect(suggestions.some((s) => s.includes("Quick Start guide"))).toBe(true);
            expect(suggestions.some((s) => s.includes("Compare with your working schema: Patient"))).toBe(true);
        });

        test("determines recoverability correctly", () => {
            const schema = createMockSchema();

            const recoverableError = new SchemaValidationError("Simple validation error", schema, [
                "identifier.name is missing",
            ]);

            const nonRecoverableError = new SchemaValidationError("Circular reference error", schema, [
                "circular reference detected",
            ]);

            expect(recoverableError.isRecoverable()).toBe(true);
            expect(nonRecoverableError.isRecoverable()).toBe(false);
        });
    });

    describe("TemplateError", () => {
        test("creates template error with debug info", () => {
            const context = { schema: { name: "Patient" }, typeMapper: {} };
            const debugInfo = {
                availableTemplates: ["interface", "class"],
                missingVariables: ["typeName"],
                lineNumber: 42,
            };

            const error = new TemplateError("Template rendering failed", "nonexistent-template", context, debugInfo);

            expect(error.templateName).toBe("nonexistent-template");
            expect(error.templateContext).toBe(context);
            expect(error.debugInfo).toBe(debugInfo);
            expect(error.phase).toBe("generation");
        });

        test("suggests similar template names", () => {
            const error = new TemplateError(
                "Template not found",
                "interfac", // Typo in 'interface'
                {},
                { availableTemplates: ["interface", "class", "enum"] },
            );

            const suggestions = error.getSuggestions();

            expect(suggestions.some((s) => s.includes("Did you mean"))).toBe(true);
            expect(suggestions.some((s) => s.includes("interface"))).toBe(true);
        });

        test("handles missing variables", () => {
            const error = new TemplateError(
                "Missing variables",
                "interface",
                { existingVar: "value" },
                { missingVariables: ["typeName", "fields"] },
            );

            const suggestions = error.getSuggestions();

            expect(suggestions.some((s) => s.includes("Missing template variables"))).toBe(true);
            expect(suggestions.some((s) => s.includes("typeName"))).toBe(true);
            expect(suggestions.some((s) => s.includes("fields"))).toBe(true);
        });

        test("calculates Levenshtein distance correctly", () => {
            const error = new TemplateError("Test", "test", {});
            const distance = (error as any).levenshteinDistance("kitten", "sitting");
            expect(distance).toBe(3); // Known Levenshtein distance
        });

        test("is always recoverable", () => {
            const error = new TemplateError("Template error", "test", {});
            expect(error.isRecoverable()).toBe(true);
        });
    });

    describe("FileOperationError", () => {
        test("creates file operation error with recovery options", () => {
            const originalError = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
            originalError.code = "EACCES";

            const recoveryOptions = {
                canRetry: true,
                alternativePaths: ["/tmp/alt-path"],
                permissionFix: "chmod 755 /test/path",
            };

            const error = new FileOperationError(
                "Failed to write file",
                "write",
                "/test/path/file.ts",
                originalError,
                recoveryOptions,
            );

            expect(error.operation).toBe("write");
            expect(error.filePath).toBe("/test/path/file.ts");
            expect(error.originalError).toBe(originalError);
            expect(error.recoveryOptions).toBe(recoveryOptions);
            expect(error.phase).toBe("writing");
        });

        test("provides operation-specific suggestions", () => {
            const error = new FileOperationError("Write failed", "write", "/test/file.ts");

            const suggestions = error.getSuggestions();

            expect(suggestions.some((s) => s.includes("File writing troubleshooting"))).toBe(true);
            expect(suggestions.some((s) => s.includes("output directory exists"))).toBe(true);
            expect(suggestions.some((s) => s.includes("write permissions"))).toBe(true);
        });

        test("provides error-code specific suggestions", () => {
            const enoentError = new Error("ENOENT: no such file or directory") as NodeJS.ErrnoException;
            enoentError.code = "ENOENT";

            const error = new FileOperationError("File not found", "read", "/nonexistent/file.ts", enoentError);

            const suggestions = error.getSuggestions();

            expect(suggestions.some((s) => s.includes("📂 File Not Found"))).toBe(true);
            expect(suggestions.some((s) => s.includes("mkdir -p"))).toBe(true);
        });

        test("provides recovery actions", () => {
            const eaccesError = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
            eaccesError.code = "EACCES";

            const error = new FileOperationError("Permission denied", "write", "/test/file.ts", eaccesError);

            const actions = error.getRecoveryActions();

            expect(actions).toHaveLength(1);
            expect(actions[0].action).toBe("Fix file permissions");
            expect(actions[0].command).toContain("chmod 755");
            expect(actions[0].automatic).toBe(false);
            expect(actions[0].riskLevel).toBe("medium");
        });

        test("determines recoverability from options", () => {
            const recoverableError = new FileOperationError("Recoverable error", "write", "/test/file.ts", undefined, {
                canRetry: true,
            });

            const nonRecoverableError = new FileOperationError("Non-recoverable error", "write", "/test/file.ts");

            expect(recoverableError.isRecoverable()).toBe(true);
            expect(nonRecoverableError.isRecoverable()).toBe(false);
        });
    });

    describe("TypeMappingError", () => {
        test("creates type mapping error with context", () => {
            const mappingContext = {
                availableMappings: ["string", "integer", "boolean"],
                suggestedMappings: { unknownType: "string" },
            };

            const error = new TypeMappingError("Cannot map type", "unknownType", "TypeScript", mappingContext);

            expect(error.fhirType).toBe("unknownType");
            expect(error.targetLanguage).toBe("TypeScript");
            expect(error.mappingContext).toBe(mappingContext);
        });

        test("suggests available and similar mappings", () => {
            const error = new TypeMappingError("Unknown type", "str", "TypeScript", {
                availableMappings: ["string", "integer", "boolean"],
                suggestedMappings: { str: "string" },
            });

            const suggestions = error.getSuggestions();

            expect(suggestions.some((s) => s.includes("Available type mappings"))).toBe(true);
            expect(suggestions.some((s) => s.includes("Suggested mappings"))).toBe(true);
            expect(suggestions.some((s) => s.includes("string"))).toBe(true);
        });

        test("provides language-specific suggestions", () => {
            const tsError = new TypeMappingError("Type error", "unknown", "TypeScript");
            const tsSuggestions = tsError.getSuggestions();
            expect(tsSuggestions.some((s) => s.includes("TYPESCRIPT_PRIMITIVES"))).toBe(true);

            const pyError = new TypeMappingError("Type error", "unknown", "Python");
            const pySuggestions = pyError.getSuggestions();
            expect(pySuggestions.some((s) => s.includes("PYTHON_TYPE_MAP"))).toBe(true);

            const rustError = new TypeMappingError("Type error", "unknown", "Rust");
            const rustSuggestions = rustError.getSuggestions();
            expect(rustSuggestions.some((s) => s.includes("Option<T>"))).toBe(true);
        });

        test("is always recoverable", () => {
            const error = new TypeMappingError("Type error", "unknown", "TypeScript");
            expect(error.isRecoverable()).toBe(true);
        });
    });

    describe("ConfigurationError", () => {
        test("creates configuration error with validation details", () => {
            const error = new ConfigurationError("Invalid config value", "outputDir", 123, "string", [
                "/valid/path",
                "./another/path",
            ]);

            expect(error.configKey).toBe("outputDir");
            expect(error.providedValue).toBe(123);
            expect(error.expectedValue).toBe("string");
            expect(error.validOptions).toEqual(["/valid/path", "./another/path"]);
        });

        test("provides configuration-specific suggestions", () => {
            const error = new ConfigurationError("Invalid outputDir", "outputDir", null);

            const suggestions = error.getSuggestions();

            expect(suggestions.some((s) => s.includes("outputDir"))).toBe(true);
            expect(suggestions.some((s) => s.includes("absolute paths"))).toBe(true);
        });

        test("is always recoverable", () => {
            const error = new ConfigurationError("Config error", "test", null);
            expect(error.isRecoverable()).toBe(true);
        });
    });

    describe("BatchOperationError", () => {
        test("creates batch error from multiple individual errors", () => {
            const errors = [
                new TestGeneratorError("Error 1", "validation"),
                new TestGeneratorError("Error 2", "generation"),
                new TestGeneratorError("Error 3", "validation"),
            ];

            const batchError = new BatchOperationError("Multiple operations failed", errors);

            expect(batchError.errors).toBe(errors);
            expect(batchError.context?.errorCount).toBe(3);
            expect(batchError.context?.errorTypes).toEqual(["TestGeneratorError"]);
            expect(batchError.context?.phases).toEqual(["validation", "generation"]);
        });

        test("aggregates unique suggestions", () => {
            const errors = [
                new TestGeneratorError("Error 1"),
                new TestGeneratorError("Error 2"),
                new TestGeneratorError("Error 3"),
            ];

            const batchError = new BatchOperationError("Batch failed", errors);
            const suggestions = batchError.getSuggestions();

            // Should contain unique suggestions from TestGeneratorError (with batch prefix)
            expect(suggestions.some((s) => s.includes("This is a test suggestion"))).toBe(true);
            expect(suggestions.some((s) => s.includes("Try this fix"))).toBe(true);

            // Should not duplicate suggestions
            const suggestionCounts = suggestions.reduce(
                (acc, suggestion) => {
                    acc[suggestion] = (acc[suggestion] || 0) + 1;
                    return acc;
                },
                {} as Record<string, number>,
            );

            Object.values(suggestionCounts).forEach((count) => {
                expect(count).toBe(1); // No duplicates
            });
        });

        test("provides detailed error breakdown", () => {
            const schema1 = createMockSchema({
                identifier: { name: "Patient", kind: "resource" },
            });
            const schema2 = createMockSchema({
                identifier: { name: "Observation", kind: "resource" },
            });

            const errors = [
                new SchemaValidationError("Patient validation failed", schema1, ["missing field"]),
                new SchemaValidationError("Observation validation failed", schema2, ["invalid type"]),
            ];

            const batchError = new BatchOperationError("Validation failed", errors);
            const breakdown = batchError.getErrorBreakdown();

            expect(breakdown).toContain("Patient validation failed");
            expect(breakdown).toContain("Observation validation failed");
            expect(breakdown).toContain("Schema: Patient");
            expect(breakdown).toContain("Schema: Observation");
        });

        test("categorizes recoverable and non-recoverable errors", () => {
            const schema = createMockSchema();
            const recoverableError = new SchemaValidationError("Recoverable", schema, ["simple error"]);
            const nonRecoverableError = new SchemaValidationError("Non-recoverable", schema, ["circular reference"]);

            const batchError = new BatchOperationError("Mixed errors", [recoverableError, nonRecoverableError]);

            expect(batchError.getRecoverableErrors()).toEqual([recoverableError]);
            expect(batchError.getNonRecoverableErrors()).toEqual([nonRecoverableError]);
            expect(batchError.isRecoverable()).toBe(true); // At least one is recoverable
        });
    });

    describe("Error Utilities", () => {
        test("createErrorWithContext enhances error with file context", () => {
            const fileContext: FileContext = {
                filename: "Patient.ts",
                content: "interface Patient {}",
                imports: new Map([["Reference", "./Reference"]]),
                exports: new Set(["Patient"]),
                metadata: { templateName: "interface" },
                templateName: "interface",
            };

            const error = createErrorWithContext(TestGeneratorError, "Context error", fileContext, {
                customContext: "value",
            });

            expect(error.message).toBe("Context error");
            expect(error.context?.filename).toBe("Patient.ts");
            expect(error.context?.importsCount).toBe(1);
            expect(error.context?.exportsCount).toBe(1);
            expect(error.context?.templateName).toBe("interface");
            expect(error.context?.customContext).toBe("value");
        });
    });
});
