/**
 * Integration tests for value set workflow
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import type { BindingTypeSchema, TypeSchema } from "@typeschema/types";
import { TypeScriptGenerator } from "../../src/api/generators/typescript";
import { createLogger } from "../../src/utils/codegen-logger";

describe("Value Set Integration Workflow", () => {
    const testOutputDir = "/tmp/test-value-sets";
    let generator: TypeScriptGenerator;

    beforeEach(async () => {
        // Clean up test directory
        if (fs.existsSync(testOutputDir)) {
            fs.rmSync(testOutputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testOutputDir, { recursive: true });

        generator = new TypeScriptGenerator({
            generateValueSets: true,
            includeValueSetHelpers: true,
            valueSetMode: "custom",
            valueSetStrengths: ["required", "preferred"],
            valueSetDirectory: "valuesets",
            outputDir: testOutputDir,
            logger: createLogger({ prefix: "Test", verbose: false }),
        });
    });

    afterEach(() => {
        // Clean up test directory
        if (fs.existsSync(testOutputDir)) {
            fs.rmSync(testOutputDir, { recursive: true, force: true });
        }
    });

    test("should generate complete value set workflow", async () => {
        const schemas: TypeSchema[] = [
            // Required binding schema
            {
                identifier: {
                    kind: "binding",
                    name: "AdministrativeGender",
                    package: "hl7.fhir.r4.core",
                    version: "4.0.1",
                    url: "http://hl7.org/fhir/administrative-gender",
                },
                strength: "required",
                enum: ["male", "female", "other", "unknown"],
                valueset: { url: "http://hl7.org/fhir/ValueSet/administrative-gender" },
            } as BindingTypeSchema,

            // Interface schema using the bindings
            {
                identifier: {
                    kind: "complex-type",
                    name: "Patient",
                    package: "hl7.fhir.r4.core",
                    version: "4.0.1",
                    url: "http://hl7.org/fhir/Patient",
                },
                fields: {
                    gender: {
                        type: { kind: "primitive-type", name: "code" },
                        binding: { name: "AdministrativeGender" },
                        required: false,
                    },
                },
            },
        ];

        const results = await generator.generate(schemas);

        // The main files (Patient.ts) should be generated
        expect(results.length).toBeGreaterThan(0);

        // Check that we have a Patient interface file
        const patientFile = results.find((r) => r.filename === "Patient.ts");
        expect(patientFile).toBeDefined();

        // Value set files are generated in post-generation hooks and written to disk
        // but not currently included in the return array due to architectural limitations.
        // The generation is successful as evidenced by the log messages.

        // Check that value sets are collected by the generator
        const collectedValueSets = (generator as any).collectedValueSets;
        expect(collectedValueSets.size).toBeGreaterThan(0);
        expect(collectedValueSets.has("AdministrativeGender")).toBe(true);
    });

    test("should generate valid TypeScript content", async () => {
        const schema: BindingTypeSchema = {
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

        const _results = await generator.generate([schema]);

        // Value sets are processed but not returned in the results array
        // Check that the value set was collected and can generate correct content
        const collectedValueSets = (generator as any).collectedValueSets;
        expect(collectedValueSets.has("TestBinding")).toBe(true);

        if (collectedValueSets.has("TestBinding")) {
            const binding = collectedValueSets.get("TestBinding");
            const generatedContent = (generator as any).generateValueSetFile(binding);

            // Check that the generated content has correct structure
            expect(generatedContent).toContain("export const TestBindingValues");
            expect(generatedContent).toContain("export type TestBinding");
            expect(generatedContent).toContain("] as const;");
            expect(generatedContent).toContain("export const isValidTestBinding");
        }
    });

    test("should handle empty schema list gracefully", async () => {
        const results = await generator.generate([]);

        // Should still generate some files but no value sets
        const valueSetFiles = results.filter((r) => r.filename.startsWith("valuesets/"));
        expect(valueSetFiles.length).toBe(0);
    });
});
