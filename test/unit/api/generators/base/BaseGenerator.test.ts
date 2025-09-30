/**
 * Unit tests for BaseGenerator
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { TestGenerator, MockLogger } from "../../../../helpers/mock-generators";
import { createMockSchema, createMockSchemas, generateMalformedSchemas } from "../../../../helpers/schema-helpers";
import { assertGenerationQuality, assertPerformanceBenchmark } from "../../../../helpers/assertions";
import { TestFileSystem } from "../../../../helpers/file-helpers";

describe("BaseGenerator", () => {
    let generator: TestGenerator;
    let logger: MockLogger;
    let testFs: TestFileSystem;

    beforeEach(async () => {
        logger = new MockLogger();
        testFs = await TestFileSystem.createTempTestDir();

        generator = new TestGenerator({
            outputDir: testFs.getBasePath(),
            logger: logger as any,
            verbose: true,
        });
    });

    afterEach(async () => {
        await testFs.cleanup();
    });

    describe("Initialization", () => {
        test("initializes with valid configuration", () => {
            expect(generator).toBeDefined();
            expect(logger.hasLevel("debug")).toBe(true);
        });

        test("throws error with invalid configuration", () => {
            expect(() => {
                new TestGenerator({} as any);
            }).toThrow();
        });

        test("validates output directory requirement", () => {
            expect(() => {
                new TestGenerator({ outputDir: "" });
            }).toThrow("outputDir is required");
        });
    });

    describe("Schema Processing", () => {
        test("processes single schema successfully", async () => {
            const schema = createMockSchema();
            const results = await generator.build([schema]);

            assertGenerationQuality(results);
            expect(results).toHaveLength(1);
            expect(results[0]?.filename).toMatch(/\.test$/);
        });

        test("processes multiple schemas in correct order", async () => {
            const schemas = createMockSchemas(["ZebraSchema", "AlphaSchema", "BetaSchema"]);
            const results = await generator.build(schemas);

            expect(results).toHaveLength(3);

            // Results should be sorted alphabetically by schema name
            const filenames = results.map((r) => r.filename);
            expect(filenames[0]).toContain("AlphaSchema");
            expect(filenames[1]).toContain("BetaSchema");
            expect(filenames[2]).toContain("ZebraSchema");
        });

        test("handles empty schema array", async () => {
            const results = await generator.build([]);
            expect(results).toHaveLength(0);
        });

        test("validates schemas before processing", async () => {
            const malformedSchemas = generateMalformedSchemas(1);

            await expect(generator.build(malformedSchemas as any)).rejects.toThrow();
        });
    });

    describe("Content Generation", () => {
        test("generates expected content structure", async () => {
            const schema = createMockSchema({
                identifier: {
                    name: "TestResource",
                    kind: "resource",
                    package: "test.package",
                    version: "1.0.0",
                    url: "http://test.com/StructureDefinition/TestResource",
                },
            });

            const results = await generator.build([schema]);
            const content = results[0]?.content;

            expect(content).toContain("// Test content for TestResource");
            expect(content).toBeTruthy();
        });

        test("validates generated content", async () => {
            const generator = new (class extends TestGenerator {
                protected override async generateSchemaContent(schema: any, context: any): Promise<string> {
                    return "INVALID content that should fail validation";
                }
            })({
                outputDir: testFs.getBasePath(),
                logger: logger as any,
            });

            const schema = createMockSchema();

            await expect(generator.build([schema])).rejects.toThrow("operations failed");
        });
    });

    describe("Error Handling", () => {
        test("handles individual schema errors gracefully", async () => {
            const validSchema = createMockSchema();
            const invalidSchema = { identifier: null } as any;

            await expect(generator.build([validSchema, invalidSchema])).rejects.toThrow();

            // Should have logged the error
            expect(logger.hasLevel("error")).toBe(true);
        });

        test("provides helpful error context", async () => {
            const malformedSchema = generateMalformedSchemas(1)[0];

            try {
                await generator.build([malformedSchema] as any);
            } catch (error) {
                expect(error instanceof Error).toBe(true);
                expect(error.message).toContain("operations failed");
            }
        });
    });

    describe("Performance", () => {
        test("generates files within reasonable time", async () => {
            const schemas = createMockSchemas(["A", "B", "C", "D", "E"]);

            const startTime = performance.now();
            await generator.build(schemas);
            const duration = performance.now() - startTime;

            // Should complete within 1 second for 5 simple schemas
            expect(duration).toBeLessThan(1000);
        });

        test("handles large schema sets efficiently", async () => {
            const schemaNames = Array.from({ length: 20 }, (_, i) => `Schema${i}`);
            const schemas = createMockSchemas(schemaNames);

            const startTime = performance.now();
            const results = await generator.build(schemas);
            const duration = performance.now() - startTime;

            expect(results).toHaveLength(20);

            // Should complete within 2 seconds for 20 schemas
            assertPerformanceBenchmark(duration, 2000, 0.5);
        });

        test("reports generation statistics", async () => {
            const schemas = createMockSchemas(["Test1", "Test2"]);
            await generator.build(schemas);

            const stats = generator.getGenerationStats();

            expect(stats.filesGenerated).toBe(2);
            expect(stats.totalSize).toBeGreaterThan(0);
            expect(stats.averageFileSize).toBeGreaterThan(0);
            expect(stats.generationTime).toBeGreaterThan(0);
        });
    });

    describe("Fluent API", () => {
        test("file builder throws error when template engine not available", () => {
            expect(() => generator.file("test-file")).toThrow("Template engine is required for fluent file generation");
        });

        test("directory builder creates directory structure", () => {
            const dirBuilder = generator.directory("test-dir");
            expect(dirBuilder).toBeDefined();
        });

        test("index builder throws error when template engine not available", () => {
            expect(() => generator.index(".")).toThrow("Template engine is required for index file generation");
        });

        test("progress callback receives updates", async () => {
            const progressUpdates: Array<{ phase: string; current: number; total: number }> = [];

            generator.onProgress((phase, current, total) => {
                progressUpdates.push({ phase, current, total });
            });

            const schemas = createMockSchemas(["A", "B"]);
            await generator.build(schemas);

            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates.some((u) => u.phase === "validation")).toBe(true);
            expect(progressUpdates.some((u) => u.phase === "complete")).toBe(true);
        });
    });

    describe("Capabilities", () => {
        test("reports generator capabilities", () => {
            const capabilities = generator.getCapabilities();

            expect(capabilities.language).toBe("TestLanguage");
            expect(capabilities.fileExtensions).toContain(".test");
            expect(capabilities.supportsTemplates).toBe(true);
            expect(capabilities.supportsValidation).toBe(true);
        });
    });

    describe("Logging Integration", () => {
        test("logs generation progress", async () => {
            const schema = createMockSchema();
            await generator.build([schema]);

            const infoMessages = logger.getMessages("info");
            expect(infoMessages.length).toBeGreaterThan(0);
            expect(infoMessages.some((m) => m.message.includes("generation"))).toBe(true);
        });

        test("logs errors with context", async () => {
            const invalidSchema = { identifier: null } as any;

            try {
                await generator.build([invalidSchema]);
            } catch {
                // Expected to throw
            }

            expect(logger.hasLevel("error")).toBe(true);
        });
    });
});
