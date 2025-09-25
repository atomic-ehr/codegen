/**
 * Runtime validation tests for generated value set helper functions
 */
import { describe, test, expect } from "bun:test";
import { TypeScriptGenerator } from "../../../../src/api/generators/typescript";
import type { TypeSchemaForBinding } from "@typeschema/types";
import { createLogger } from "../../../../src/utils/codegen-logger";

describe("Generated Code Structure Tests", () => {
  test("should generate TypeScript arrays and types correctly", () => {
    const generator = new TypeScriptGenerator({
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
      enum: ["value1", "value2", "value3"],
      valueset: { url: "http://test.com/valueset" },
    };

    const generatedCode = (generator as any).generateValueSetFile(binding);

    // Check that the generated code contains expected structures
    expect(generatedCode).toContain("export const TestBindingValues = [");
    expect(generatedCode).toContain("'value1',");
    expect(generatedCode).toContain("'value2',");
    expect(generatedCode).toContain("'value3'");
    expect(generatedCode).toContain("] as const;");
    expect(generatedCode).toContain(
      "export type TestBinding = typeof TestBindingValues[number];",
    );
    expect(generatedCode).toContain(
      "export const isValidTestBinding = (value: string): value is TestBinding =>",
    );
    expect(generatedCode).toContain(
      "TestBindingValues.includes(value as TestBinding);",
    );
  });

  test("should handle special character values in arrays", () => {
    const generator = new TypeScriptGenerator({
      generateValueSets: true,
      includeValueSetHelpers: true,
      outputDir: "/tmp/test",
      logger: createLogger({ prefix: "Test", verbose: false }),
    });

    const binding: TypeSchemaForBinding = {
      identifier: {
        name: "SpecialBinding",
        kind: "binding",
        package: "test.package",
        version: "1.0.0",
        url: "http://test.com/binding",
      },
      strength: "required",
      enum: [
        "1.2.840.10065.1.12.1.1",
        "http://example.com/value",
        "value-with-hyphens",
        "value_with_underscores",
      ],
      valueset: { url: "http://test.com/valueset" },
    };

    const generatedCode = (generator as any).generateValueSetFile(binding);

    // Check that special characters are properly quoted and included
    expect(generatedCode).toContain("'1.2.840.10065.1.12.1.1'");
    expect(generatedCode).toContain("'http://example.com/value'");
    expect(generatedCode).toContain("'value-with-hyphens'");
    expect(generatedCode).toContain("'value_with_underscores'");
    expect(generatedCode).toContain("export const SpecialBindingValues = [");
    expect(generatedCode).toContain("export const isValidSpecialBinding");
  });

  test("should generate proper const assertions and types", () => {
    const generator = new TypeScriptGenerator({
      generateValueSets: true,
      outputDir: "/tmp/test",
      logger: createLogger({ prefix: "Test", verbose: false }),
    });

    const binding: TypeSchemaForBinding = {
      identifier: {
        name: "ConstAssertionBinding",
        kind: "binding",
        package: "test.package",
        version: "1.0.0",
        url: "http://test.com/binding",
      },
      strength: "required",
      enum: ["readonly1", "readonly2"],
      valueset: { url: "http://test.com/valueset" },
    };

    const generatedCode = (generator as any).generateValueSetFile(binding);

    // Check that const assertion is properly generated
    expect(generatedCode).toContain("] as const;");
    expect(generatedCode).toContain(
      "typeof ConstAssertionBindingValues[number]",
    );
    expect(generatedCode).toContain("'readonly1'");
    expect(generatedCode).toContain("'readonly2'");
  });

  test("should generate proper type guards when helpers enabled", () => {
    const generator = new TypeScriptGenerator({
      generateValueSets: true,
      includeValueSetHelpers: true,
      outputDir: "/tmp/test",
      logger: createLogger({ prefix: "Test", verbose: false }),
    });

    const binding: TypeSchemaForBinding = {
      identifier: {
        name: "TypeGuardBinding",
        kind: "binding",
        package: "test.package",
        version: "1.0.0",
        url: "http://test.com/binding",
      },
      strength: "required",
      enum: ["guard1", "guard2"],
      valueset: { url: "http://test.com/valueset" },
    };

    const generatedCode = (generator as any).generateValueSetFile(binding);

    // Check type guard function signature and implementation
    expect(generatedCode).toContain(
      "(value: string): value is TypeGuardBinding",
    );
    expect(generatedCode).toContain(
      "TypeGuardBindingValues.includes(value as TypeGuardBinding)",
    );
    expect(generatedCode).toContain("export const isValidTypeGuardBinding");
  });

  test("should generate complete syntactically correct TypeScript", () => {
    const generator = new TypeScriptGenerator({
      generateValueSets: true,
      includeDocuments: true,
      includeValueSetHelpers: true,
      outputDir: "/tmp/test",
      logger: createLogger({ prefix: "Test", verbose: false }),
    });

    const binding: TypeSchemaForBinding = {
      identifier: {
        name: "SyntaxBinding",
        kind: "binding",
        package: "hl7.fhir.r4.core",
        version: "4.0.1",
        url: "http://hl7.org/fhir/syntax-binding",
      },
      strength: "required",
      enum: ["syntax1", "syntax2", "syntax3"],
      valueset: { url: "http://hl7.org/fhir/ValueSet/syntax-binding" },
    };

    const generatedCode = (generator as any).generateValueSetFile(binding);

    // Check for complete structure with docs, types, and helpers
    expect(generatedCode).toContain("/**");
    expect(generatedCode).toContain("* SyntaxBinding value set");
    expect(generatedCode).toContain(
      "* @see http://hl7.org/fhir/ValueSet/syntax-binding",
    );
    expect(generatedCode).toContain("* @package hl7.fhir.r4.core");
    expect(generatedCode).toContain(
      "* @generated This file is auto-generated. Do not edit manually.",
    );
    expect(generatedCode).toContain("*/");
    expect(generatedCode).toContain("export const SyntaxBindingValues = [");
    expect(generatedCode).toContain("] as const;");
    expect(generatedCode).toContain(
      "export type SyntaxBinding = typeof SyntaxBindingValues[number];",
    );
    expect(generatedCode).toContain(
      "export const isValidSyntaxBinding = (value: string): value is SyntaxBinding =>",
    );
    expect(generatedCode).toContain(
      "SyntaxBindingValues.includes(value as SyntaxBinding);",
    );

    // Verify it doesn't contain any obvious syntax errors
    expect(generatedCode).not.toContain("undefined");
    expect(generatedCode).not.toContain("[object Object]");
    expect(generatedCode).not.toContain("export export");
  });

  test("should generate arrays with exact values and length", () => {
    const generator = new TypeScriptGenerator({
      generateValueSets: true,
      outputDir: "/tmp/test",
      logger: createLogger({ prefix: "Test", verbose: false }),
    });

    const binding: TypeSchemaForBinding = {
      identifier: {
        name: "ArrayTestBinding",
        kind: "binding",
        package: "test.package",
        version: "1.0.0",
        url: "http://test.com/binding",
      },
      strength: "required",
      enum: ["first", "second", "third"],
      valueset: { url: "http://test.com/valueset" },
    };

    const generatedCode = (generator as any).generateValueSetFile(binding);

    // Verify exact array structure
    expect(generatedCode).toMatch(
      /export const ArrayTestBindingValues = \[\s*'first',\s*'second',\s*'third'\s*\] as const;/,
    );

    // Count occurrences to ensure proper structure
    const firstCount = (generatedCode.match(/'first'/g) || []).length;
    const secondCount = (generatedCode.match(/'second'/g) || []).length;
    const thirdCount = (generatedCode.match(/'third'/g) || []).length;

    // Each value should appear exactly once in the array
    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1);
    expect(thirdCount).toBe(1);
  });
});
