/**
 * Unit tests for value set generation functionality
 */
import { beforeEach, describe, expect, test } from "bun:test";
import type { TypeSchemaForBinding } from "@typeschema/types";
import { TypeScriptGenerator } from "../../../../src/api/generators/typescript";
import { createLogger } from "../../../../src/utils/codegen-logger";

describe("Value Set Detection", () => {
    let generator: TypeScriptGenerator;

    beforeEach(() => {
        generator = new TypeScriptGenerator({
            generateValueSets: true,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });
    });

    test("should detect required binding with enum", () => {
        const schema: TypeSchemaForBinding = {
            identifier: {
                kind: "binding",
                name: "TestBinding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/binding",
            },
            strength: "required",
            enum: ["value1", "value2", "value3"],
            valueset: { url: "http://test.com/valueset" },
        };

        expect((generator as any).shouldGenerateValueSet(schema)).toBe(true);
    });

    test("should not detect preferred binding by default (required-only mode)", () => {
        const schema: TypeSchemaForBinding = {
            identifier: {
                kind: "binding",
                name: "TestBinding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/binding",
            },
            strength: "preferred",
            enum: ["value1", "value2"],
            valueset: { url: "http://test.com/valueset" },
        };

        expect((generator as any).shouldGenerateValueSet(schema)).toBe(false);
    });

    test("should detect preferred binding when configured for custom mode", () => {
        generator = new TypeScriptGenerator({
            generateValueSets: true,
            valueSetMode: "custom",
            valueSetStrengths: ["required", "preferred"],
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const schema: TypeSchemaForBinding = {
            identifier: {
                kind: "binding",
                name: "TestBinding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/binding",
            },
            strength: "preferred",
            enum: ["value1", "value2"],
            valueset: { url: "http://test.com/valueset" },
        };

        expect((generator as any).shouldGenerateValueSet(schema)).toBe(true);
    });

    test("should detect all bindings when configured for all mode", () => {
        generator = new TypeScriptGenerator({
            generateValueSets: true,
            valueSetMode: "all",
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const schema: TypeSchemaForBinding = {
            identifier: {
                kind: "binding",
                name: "TestBinding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/binding",
            },
            strength: "example",
            enum: ["value1", "value2"],
            valueset: { url: "http://test.com/valueset" },
        };

        expect((generator as any).shouldGenerateValueSet(schema)).toBe(true);
    });

    test("should not detect binding without enum", () => {
        const schema: TypeSchemaForBinding = {
            identifier: {
                kind: "binding",
                name: "TestBinding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/binding",
            },
            strength: "required",
            valueset: { url: "http://test.com/valueset" },
        };

        expect((generator as any).shouldGenerateValueSet(schema)).toBe(false);
    });

    test("should not detect binding with empty enum", () => {
        const schema: TypeSchemaForBinding = {
            identifier: {
                kind: "binding",
                name: "TestBinding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/binding",
            },
            strength: "required",
            enum: [],
            valueset: { url: "http://test.com/valueset" },
        };

        expect((generator as any).shouldGenerateValueSet(schema)).toBe(false);
    });
});

describe("Value Set File Generation", () => {
    let generator: TypeScriptGenerator;

    beforeEach(() => {
        generator = new TypeScriptGenerator({
            generateValueSets: true,
            includeDocuments: true,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });
    });

    test("should generate correct TypeScript file content", () => {
        const binding: TypeSchemaForBinding = {
            identifier: {
                name: "AdministrativeGender",
                kind: "binding",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                url: "http://hl7.org/fhir/administrative-gender",
            },
            strength: "required",
            enum: ["male", "female", "other", "unknown"],
            valueset: { url: "http://hl7.org/fhir/ValueSet/administrative-gender" },
        };

        const result = (generator as any).generateValueSetFile(binding);

        expect(result).toContain("export const AdministrativeGenderValues");
        expect(result).toContain("export type AdministrativeGender");
        expect(result).toContain("'male'");
        expect(result).toContain("'female'");
        expect(result).toContain("'other'");
        expect(result).toContain("'unknown'");
        expect(result).toContain("@see http://hl7.org/fhir/ValueSet/administrative-gender");
        expect(result).toContain("hl7.fhir.r4.core");
    });

    test("should include helper functions when enabled", () => {
        generator = new TypeScriptGenerator({
            generateValueSets: true,
            includeValueSetHelpers: true,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const binding: TypeSchemaForBinding = {
            identifier: {
                name: "TestBinding",
                kind: "binding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/binding",
            },
            strength: "required",
            enum: ["value1", "value2"],
            valueset: { url: "http://test.com/valueset" },
        };

        const result = (generator as any).generateValueSetFile(binding);

        expect(result).toContain("export const isValidTestBinding");
        expect(result).toContain("TestBindingValues.includes(value as TestBinding)");
    });

    test("should not include helpers when disabled", () => {
        generator = new TypeScriptGenerator({
            generateValueSets: true,
            includeValueSetHelpers: false,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const binding: TypeSchemaForBinding = {
            identifier: {
                name: "TestBinding",
                kind: "binding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/binding",
            },
            strength: "required",
            enum: ["value1", "value2"],
            valueset: { url: "http://test.com/valueset" },
        };

        const result = (generator as any).generateValueSetFile(binding);

        expect(result).not.toContain("export const isValidTestBinding");
    });

    test("should handle special characters in enum values", () => {
        const binding: TypeSchemaForBinding = {
            identifier: {
                name: "SpecialBinding",
                kind: "binding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/binding",
            },
            strength: "required",
            enum: ["1.2.840.10065.1.12.1.1", "http://example.com/value", "value-with-hyphens"],
            valueset: { url: "http://test.com/valueset" },
        };

        const result = (generator as any).generateValueSetFile(binding);

        expect(result).toContain("'1.2.840.10065.1.12.1.1'");
        expect(result).toContain("'http://example.com/value'");
        expect(result).toContain("'value-with-hyphens'");
    });
});

describe("Configuration and Validation", () => {
    test("should accept valid value set strengths when setting options", () => {
        const generator = new TypeScriptGenerator({
            generateValueSets: true,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        // Should not throw for valid strengths
        expect(() => {
            generator.setOptions({
                valueSetStrengths: ["required", "preferred"],
            });
        }).not.toThrow();

        expect(generator.getOptions().valueSetStrengths).toEqual(["required", "preferred"]);
    });

    test("should accept valid directory paths when setting options", () => {
        const generator = new TypeScriptGenerator({
            generateValueSets: true,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        // Should not throw for valid directory paths
        expect(() => {
            generator.setOptions({
                valueSetDirectory: "custom-valuesets",
            });
        }).not.toThrow();

        expect(generator.getOptions().valueSetDirectory).toBe("custom-valuesets");
    });

    test("should have correct default options", () => {
        const generator = new TypeScriptGenerator({
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });
        const options = generator.getOptions();

        // Check that basic options are set
        expect(options.outputDir).toBe("/tmp/test");
        expect(options).toHaveProperty("outputDir");
        expect(options).toHaveProperty("logger");
    });

    test("should handle custom configuration correctly", () => {
        const generator = new TypeScriptGenerator({
            generateValueSets: true,
            valueSetMode: "custom",
            valueSetStrengths: ["required", "preferred", "extensible"],
            includeValueSetHelpers: true,
            valueSetDirectory: "custom-valuesets",
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const options = generator.getOptions();
        expect(options.generateValueSets).toBe(true);
        expect(options.valueSetMode).toBe("custom");
        expect(options.valueSetStrengths).toEqual(["required", "preferred", "extensible"]);
        expect(options.includeValueSetHelpers).toBe(true);
        expect(options.valueSetDirectory).toBe("custom-valuesets");
    });

    test("should validate all supported binding strengths", () => {
        const generator = new TypeScriptGenerator({
            generateValueSets: true,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        expect(() => {
            generator.setOptions({
                valueSetStrengths: ["required", "preferred", "extensible", "example"],
            });
        }).not.toThrow();
    });
});
