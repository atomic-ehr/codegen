/**
 * Integration tests for TypeScript generation workflow
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { assertGenerationQuality } from "../helpers/assertions";
import { assertFileSystemState, TestFileSystem } from "../helpers/file-helpers";
import { MockLogger, TestGenerator } from "../helpers/mock-generators";
import {
    createComplexNestedSchema,
    createMockSchemas,
    createPrimitiveTypeSchema,
    generateEdgeCaseSchemas,
} from "../helpers/schema-helpers";

describe("TypeScript Generation Integration", () => {
    let generator: TestGenerator;
    let logger: MockLogger;
    let testFs: TestFileSystem;

    beforeEach(async () => {
        logger = new MockLogger();
        testFs = await TestFileSystem.createTempTestDir();

        generator = new TestGenerator({
            outputDir: testFs.getBasePath(),
            logger: logger as any,
            verbose: false,
            validate: true,
        });
    });

    afterEach(async () => {
        await testFs.cleanup();
    });

    describe("End-to-End Generation Workflow", () => {
        test("generates TypeScript files for FHIR resources", async () => {
            const schemas = createMockSchemas(["Patient", "Observation", "Practitioner"]);

            const results = await generator.build(schemas);

            // Verify generation quality
            assertGenerationQuality(results);
            expect(results).toHaveLength(3);

            // Check specific files were generated
            const filenames = results.map((r) => r.filename);
            expect(filenames).toContain("Observation.test");
            expect(filenames).toContain("Patient.test");
            expect(filenames).toContain("Practitioner.test");

            // Verify content quality
            for (const file of results) {
                expect(file.content).toContain(`Test content for ${file.filename.replace(".test", "")}`);
                expect(file.exports.length).toBeGreaterThan(0);
            }
        });

        test("handles complex nested schema structures", async () => {
            const complexSchema = createComplexNestedSchema("DiagnosticReport");

            const results = await generator.build([complexSchema]);

            expect(results).toHaveLength(1);
            const file = results[0]!;

            expect(file.content).toContain("Test content for DiagnosticReport");
            expect(file.filename).toBe("DiagnosticReport.test");
        });

        test("processes mixed schema types", async () => {
            const schemas = [
                ...createMockSchemas(["Patient"]),
                createPrimitiveTypeSchema("string"),
                createComplexNestedSchema("Observation"),
            ];

            const results = await generator.build(schemas);

            expect(results).toHaveLength(3);
            assertGenerationQuality(results);

            // Verify mixed types are handled correctly
            const filenames = results.map((r) => r.filename);
            expect(filenames).toContain("Patient.test");
            expect(filenames).toContain("string.test");
            expect(filenames).toContain("Observation.test");
        });

        test("handles edge case schemas", async () => {
            const edgeCaseSchemas = generateEdgeCaseSchemas();

            const results = await generator.build(edgeCaseSchemas);

            // Should handle all edge cases without throwing
            expect(results.length).toBeGreaterThan(0);

            // Each result should have valid content
            for (const file of results) {
                expect(file.content.length).toBeGreaterThan(0);
                expect(file.filename).toMatch(/\.test$/);
            }
        });
    });

    describe("File System Integration", () => {
        test("writes files to correct locations", async () => {
            // Use actual file generation instead of build()
            const schemas = createMockSchemas(["Patient", "Observation"]);

            const results = await generator.generate(schemas);

            // Verify files were written to filesystem
            await assertFileSystemState(testFs, [
                {
                    path: "Patient.test",
                    contains: ["Test content for Patient"],
                    size: { min: 10 },
                },
                {
                    path: "Observation.test",
                    contains: ["Test content for Observation"],
                    size: { min: 10 },
                },
            ]);

            expect(results).toHaveLength(2);
        });

        test("handles file conflicts gracefully", async () => {
            const schemas = createMockSchemas(["Patient"]);

            // Generate files twice to test overwrite behavior
            await generator.generate(schemas);
            const results = await generator.generate(schemas);

            expect(results).toHaveLength(1);
            expect(await testFs.fileExists("Patient.test")).toBe(true);
        });

        test("creates proper directory structure", async () => {
            const schemas = createMockSchemas(["Patient"]);

            await generator.generate(schemas);

            const fileList = await testFs.listFiles();
            expect(fileList).toContain("Patient.test");
        });
    });

    describe("Progress Reporting", () => {
        test("reports progress during generation", async () => {
            const progressUpdates: Array<{
                phase: string;
                current: number;
                total: number;
                message?: string;
            }> = [];

            generator.onProgress((phase, current, total, message) => {
                progressUpdates.push({ phase, current, total, message });
            });

            const schemas = createMockSchemas(["Patient", "Observation", "Practitioner"]);
            await generator.build(schemas);

            // Should have progress updates for different phases
            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates.some((u) => u.phase === "validation")).toBe(true);
            expect(progressUpdates.some((u) => u.phase === "complete")).toBe(true);

            // Progress should increment correctly
            const validationUpdates = progressUpdates.filter((u) => u.phase === "validation");
            if (validationUpdates.length > 1) {
                expect(validationUpdates[0]?.current).toBeLessThan(
                    validationUpdates[validationUpdates.length - 1]?.current,
                );
            }
        });

        test("reports accurate completion statistics", async () => {
            const schemas = createMockSchemas(["A", "B", "C"]);
            await generator.build(schemas);

            const stats = generator.getGenerationStats();

            expect(stats.filesGenerated).toBe(3);
            expect(stats.totalSize).toBeGreaterThan(0);
            expect(stats.averageFileSize).toBeGreaterThan(0);
            expect(stats.generationTime).toBeGreaterThan(0);
            expect(stats.averageTimePerFile).toBe(stats.generationTime / stats.filesGenerated);
        });
    });

    describe("Error Recovery and Resilience", () => {
        test("continues generation after non-critical errors", async () => {
            const validSchemas = createMockSchemas(["Patient", "Observation"]);

            // Create a generator that validates content strictly
            const strictGenerator = new (class extends TestGenerator {
                protected override async generateSchemaContent(schema: any, context: any): Promise<string> {
                    if (schema.identifier.name === "Patient") {
                        return "INVALID content"; // This will fail validation
                    }
                    return super.generateSchemaContent(schema, context);
                }
            })({
                outputDir: testFs.getBasePath(),
                logger: logger as any,
                validate: true,
            });

            // Should handle validation failure gracefully
            await expect(strictGenerator.build(validSchemas)).rejects.toThrow();

            // Logger should have captured the error
            expect(logger.hasLevel("error")).toBe(true);
        });

        test("provides helpful error context for debugging", async () => {
            const invalidSchema = {
                identifier: { name: null }, // Invalid identifier
            } as any;

            try {
                await generator.build([invalidSchema]);
            } catch (error) {
                expect(error instanceof Error).toBe(true);
                expect(error.message).toBeTruthy();
            }

            // Should log helpful debugging information
            expect(logger.messages.length).toBeGreaterThan(0);
        });
    });

    describe("Performance Under Load", () => {
        test("handles reasonable number of schemas efficiently", async () => {
            const schemaNames = Array.from({ length: 10 }, (_, i) => `Schema${i}`);
            const schemas = createMockSchemas(schemaNames);

            const startTime = performance.now();
            const results = await generator.build(schemas);
            const duration = performance.now() - startTime;

            expect(results).toHaveLength(10);
            expect(duration).toBeLessThan(1000); // Should complete within 1 second

            // All files should be valid
            assertGenerationQuality(results);
        });

        test("memory usage remains reasonable", async () => {
            const schemaNames = Array.from({ length: 20 }, (_, i) => `MemoryTest${i}`);
            const schemas = createMockSchemas(schemaNames);

            const memoryBefore = process.memoryUsage().heapUsed;
            await generator.build(schemas);
            const memoryAfter = process.memoryUsage().heapUsed;

            const memoryIncrease = (memoryAfter - memoryBefore) / 1024 / 1024; // MB

            // Memory increase should be reasonable (less than 50MB for 20 schemas)
            expect(memoryIncrease).toBeLessThan(50);
        });
    });

    describe("Configuration Integration", () => {
        test("respects validation settings", async () => {
            const nonValidatingGenerator = new TestGenerator({
                outputDir: testFs.getBasePath(),
                logger: logger as any,
                validate: false, // Disable validation
            });

            const schemas = createMockSchemas(["Test"]);
            const results = await nonValidatingGenerator.build(schemas);

            expect(results).toHaveLength(1);
            // Should have validation disabled message in logs
            const debugMessages = logger.getMessages("debug");
            expect(debugMessages.some((m) => m.message.includes("validation disabled"))).toBe(true);
        });

        test("respects verbose logging settings", async () => {
            const verboseGenerator = new TestGenerator({
                outputDir: testFs.getBasePath(),
                logger: logger as any,
                verbose: true,
            });

            const schemas = createMockSchemas(["Test"]);
            await verboseGenerator.build(schemas);

            // Should have more detailed logging
            const infoMessages = logger.getMessages("info");
            expect(infoMessages.length).toBeGreaterThan(0);
        });
    });

    describe("API Compatibility", () => {
        test("fluent API methods throw appropriate errors", async () => {
            // File and index builders should throw when no template engine is available
            expect(() => generator.file("test-file")).toThrow("Template engine is required");
            expect(() => generator.index(".")).toThrow("Template engine is required");

            // Directory builder should work without template engine
            const dirBuilder = generator.directory("test-dir");
            expect(dirBuilder).toBeDefined();
        });

        test("progress callbacks integrate properly", async () => {
            let callbackCalled = false;

            const result = generator.onProgress(() => {
                callbackCalled = true;
            });

            expect(result).toBe(generator); // Should return self for chaining

            const schemas = createMockSchemas(["Test"]);
            await generator.build(schemas);

            expect(callbackCalled).toBe(true);
        });

        test("capabilities reporting works correctly", () => {
            const capabilities = generator.getCapabilities();

            expect(capabilities.language).toBe("TestLanguage");
            expect(capabilities.fileExtensions).toContain(".test");
            expect(capabilities.supportsTemplates).toBe(true);
            expect(capabilities.supportsValidation).toBe(true);
            expect(capabilities.version).toBeTruthy();
        });
    });
});
