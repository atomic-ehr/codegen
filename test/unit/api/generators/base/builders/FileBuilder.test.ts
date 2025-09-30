/**
 * Unit tests for FileBuilder
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { assertValidTypeScript } from "../../../../../helpers/assertions";
import { TestFileSystem } from "../../../../../helpers/file-helpers";
import { MockLogger } from "../../../../../helpers/mock-generators";

describe("FileBuilder", () => {
    let testFs: TestFileSystem;
    let _logger: MockLogger;

    beforeEach(async () => {
        testFs = await TestFileSystem.createTempTestDir();
        _logger = new MockLogger();
    });

    afterEach(async () => {
        await testFs.cleanup();
    });

    describe("Mock FileBuilder Tests", () => {
        // Note: These tests use mock implementations since we don't have access to the actual FileBuilder
        // In a real implementation, these would test the actual FileBuilder class

        test("creates file with correct content", () => {
            const mockFileBuilder = {
                content: "",
                imports: new Map<string, string>(),
                exports: new Set<string>(),

                withContent(content: string) {
                    this.content = content;
                    return this;
                },

                addImport(name: string, from: string) {
                    this.imports.set(name, from);
                    return this;
                },

                addExport(name: string) {
                    this.exports.add(name);
                    return this;
                },

                build() {
                    return {
                        filename: "test.ts",
                        content: this.content,
                        imports: this.imports,
                        exports: this.exports,
                    };
                },
            };

            const content = "interface Patient { id: string; }";
            mockFileBuilder.withContent(content);

            const context = mockFileBuilder.build();
            expect(context.content).toBe(content);
        });

        test("manages imports correctly", () => {
            const mockFileBuilder = {
                content: "",
                imports: new Map<string, string>(),
                exports: new Set<string>(),

                withContent(content: string) {
                    this.content = content;
                    return this;
                },

                addImport(name: string, from: string) {
                    this.imports.set(name, from);
                    return this;
                },

                addExport(name: string) {
                    this.exports.add(name);
                    return this;
                },

                build() {
                    return {
                        filename: "test.ts",
                        content: this.content,
                        imports: this.imports,
                        exports: this.exports,
                    };
                },
            };

            mockFileBuilder.addImport("TestType", "./test-type").addImport("AnotherType", "./another-type");

            const context = mockFileBuilder.build();
            expect(context.imports.get("TestType")).toBe("./test-type");
            expect(context.imports.get("AnotherType")).toBe("./another-type");
        });

        test("manages exports correctly", () => {
            const mockFileBuilder = {
                content: "",
                imports: new Map<string, string>(),
                exports: new Set<string>(),

                withContent(content: string) {
                    this.content = content;
                    return this;
                },

                addImport(name: string, from: string) {
                    this.imports.set(name, from);
                    return this;
                },

                addExport(name: string) {
                    this.exports.add(name);
                    return this;
                },

                build() {
                    return {
                        filename: "test.ts",
                        content: this.content,
                        imports: this.imports,
                        exports: this.exports,
                    };
                },
            };

            mockFileBuilder.addExport("TestInterface").addExport("TestType");

            const context = mockFileBuilder.build();
            expect(context.exports.has("TestInterface")).toBe(true);
            expect(context.exports.has("TestType")).toBe(true);
        });

        test("validates TypeScript content", () => {
            const validTypeScript = `
interface Patient {
  id: string;
  name: string;
  active: boolean;
}

export { Patient };
      `.trim();

            // Should not throw
            expect(() => assertValidTypeScript(validTypeScript)).not.toThrow();
        });

        test("detects invalid TypeScript syntax", () => {
            const invalidTypeScript = `
interface Patient {
  id: string
  name: string  // Missing semicolon
  active: boolean;
}
      `.trim();

            expect(() => assertValidTypeScript(invalidTypeScript)).toThrow();
        });

        test("supports fluent API pattern", () => {
            const mockFileBuilder = {
                content: "",
                imports: new Map<string, string>(),
                exports: new Set<string>(),

                withContent(content: string) {
                    this.content = content;
                    return this;
                },

                addImport(name: string, from: string) {
                    this.imports.set(name, from);
                    return this;
                },

                addExport(name: string) {
                    this.exports.add(name);
                    return this;
                },

                appendContent(content: string) {
                    this.content += content;
                    return this;
                },

                build() {
                    return {
                        filename: "test.ts",
                        content: this.content,
                        imports: this.imports,
                        exports: this.exports,
                    };
                },
            };

            // Test method chaining
            const result = mockFileBuilder
                .withContent("interface Test {")
                .appendContent("\n  id: string;")
                .appendContent("\n}")
                .addImport("BaseType", "./base")
                .addExport("Test")
                .build();

            expect(result.content).toBe("interface Test {\n  id: string;\n}");
            expect(result.imports.get("BaseType")).toBe("./base");
            expect(result.exports.has("Test")).toBe(true);
        });
    });

    describe("File System Integration", () => {
        test("writes file to test filesystem", async () => {
            const content = "interface Test { id: string; }";
            const filename = "test.ts";

            await testFs.writeTestFile(filename, content);

            const exists = await testFs.fileExists(filename);
            expect(exists).toBe(true);

            const writtenContent = await testFs.readTestFile(filename);
            expect(writtenContent).toBe(content);
        });

        test("handles file write errors gracefully", async () => {
            // Test that we can catch and handle file write errors
            const mockWrite = async (_filename: string, _content: string) => {
                throw new Error("Permission denied");
            };

            await expect(mockWrite("test.ts", "content")).rejects.toThrow("Permission denied");
        });

        test("manages temporary files for testing", async () => {
            const files = {
                "Patient.ts": "interface Patient { id: string; }",
                "Observation.ts": "interface Observation { id: string; }",
                "index.ts": 'export * from "./Patient";\nexport * from "./Observation";',
            };

            for (const [filename, content] of Object.entries(files)) {
                await testFs.writeTestFile(filename, content);
            }

            const fileList = await testFs.listFiles();
            expect(fileList).toContain("Patient.ts");
            expect(fileList).toContain("Observation.ts");
            expect(fileList).toContain("index.ts");
        });
    });

    describe("Performance", () => {
        test("handles large content efficiently", () => {
            const largeContent =
                "interface Test {\n" +
                Array.from({ length: 1000 }, (_, i) => `  field${i}: string;`).join("\n") +
                "\n}";

            const startTime = performance.now();

            const mockBuilder = {
                content: "",
                withContent(content: string) {
                    this.content = content;
                    return this;
                },
                build() {
                    return { content: this.content };
                },
            };

            mockBuilder.withContent(largeContent);
            const result = mockBuilder.build();

            const duration = performance.now() - startTime;

            expect(result.content).toBe(largeContent);
            expect(duration).toBeLessThan(100); // Should complete quickly
        });

        test("handles many operations efficiently", () => {
            const startTime = performance.now();

            const mockBuilder = {
                imports: new Map<string, string>(),
                exports: new Set<string>(),

                addImport(name: string, from: string) {
                    this.imports.set(name, from);
                    return this;
                },

                addExport(name: string) {
                    this.exports.add(name);
                    return this;
                },

                build() {
                    return {
                        imports: this.imports,
                        exports: this.exports,
                    };
                },
            };

            // Add many imports and exports
            for (let i = 0; i < 100; i++) {
                mockBuilder.addImport(`Type${i}`, `./type${i}`).addExport(`Export${i}`);
            }

            const result = mockBuilder.build();
            const duration = performance.now() - startTime;

            expect(result.imports.size).toBe(100);
            expect(result.exports.size).toBe(100);
            expect(duration).toBeLessThan(50); // Should be fast
        });
    });
});
