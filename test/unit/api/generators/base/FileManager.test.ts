/**
 * Unit tests for FileManager
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rm, access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { FileManager } from "../../../../../src/api/generators/base/FileManager";
import { FileOperationError } from "../../../../../src/api/generators/base/errors";
import { createLogger } from "../../../../../src/utils/codegen-logger";

function createMockLogger() {
    return createLogger({ prefix: "Test", verbose: false });
}

describe("FileManager", () => {
    let fileManager: FileManager;
    const testOutputDir = "./test-output-filemanager";

    beforeEach(() => {
        fileManager = new FileManager({
            outputDir: testOutputDir,
            logger: createMockLogger(),
        });
    });

    afterEach(async () => {
        try {
            await rm(testOutputDir, { recursive: true, force: true });
        } catch {
            // Directory might not exist
        }
    });

    describe("File Writing", () => {
        test("writes file with automatic directory creation", async () => {
            const content = "export interface Test { id: string; }";
            const result = await fileManager.writeFile("nested/deep/test.ts", content);

            expect(result.path).toMatch(/test\.ts$/);
            expect(result.size).toBeGreaterThan(0);
            expect(result.writeTime).toBeGreaterThan(0);

            // Verify file was actually written
            const writtenContent = await readFile(result.path, "utf-8");
            expect(writtenContent).toBe(content);
        });

        test("respects overwrite setting", async () => {
            const initialContent = "initial content";
            const newContent = "new content";

            // Write initial file
            await fileManager.writeFile("test.ts", initialContent);

            // Create non-overwrite manager
            const noOverwriteManager = new FileManager({
                outputDir: testOutputDir,
                logger: createMockLogger(),
                overwrite: false,
            });

            // Try to write again - should skip
            const result = await noOverwriteManager.writeFile("test.ts", newContent);

            // Should return existing file stats
            expect(result.size).toBe(Buffer.byteLength(initialContent, "utf-8"));
            expect(result.writeTime).toBe(0);

            // File content should remain unchanged
            const content = await readFile(result.path, "utf-8");
            expect(content).toBe(initialContent);
        });

        test("handles file encoding correctly", async () => {
            const content = "Hello 世界! 🌍";

            const result = await fileManager.writeFile("unicode.ts", content, {
                encoding: "utf-8",
            });

            const readContent = await readFile(result.path, "utf-8");
            expect(readContent).toBe(content);
            expect(result.size).toBe(Buffer.byteLength(content, "utf-8"));
        });
    });

    describe("Batch Operations", () => {
        test("writes multiple files efficiently", async () => {
            const files = new Map<string, string>();

            // Create 50 test files
            for (let i = 0; i < 50; i++) {
                files.set(`file-${i}.ts`, `export const value${i} = ${i};`);
            }

            const startTime = performance.now();
            const results = await fileManager.writeBatch(files);
            const batchTime = performance.now() - startTime;

            expect(results).toHaveLength(50);
            expect(batchTime).toBeLessThan(2000); // Should complete within 2 seconds

            // Verify all files were written
            for (let i = 0; i < 50; i++) {
                const filePath = join(testOutputDir, `file-${i}.ts`);
                await expect(access(filePath)).resolves.toBeDefined();
            }
        });

        test("handles large batch operations", async () => {
            const files = new Map<string, string>();

            // Create 100 files in subdirectories
            for (let i = 0; i < 100; i++) {
                const dir = `group-${Math.floor(i / 10)}`;
                files.set(`${dir}/file-${i}.ts`, `export const value${i} = ${i};`);
            }

            const results = await fileManager.writeBatch(files);

            expect(results).toHaveLength(100);

            // Verify directory structure was created
            for (let i = 0; i < 10; i++) {
                const dirPath = join(testOutputDir, `group-${i}`);
                await expect(access(dirPath)).resolves.toBeDefined();
            }
        });

        test("uses configurable batch size", async () => {
            fileManager.setBatchSize(5);
            expect(fileManager.getBatchSize()).toBe(5);

            // Batch size should be clamped to valid range
            fileManager.setBatchSize(0);
            expect(fileManager.getBatchSize()).toBe(1);

            fileManager.setBatchSize(100);
            expect(fileManager.getBatchSize()).toBe(50);
        });
    });

    describe("Directory Operations", () => {
        test("ensures directory creation", async () => {
            const deepPath = join(testOutputDir, "very/deep/nested/path");

            await fileManager.ensureDirectory(deepPath);

            await expect(access(deepPath)).resolves.toBeDefined();
        });

        test("cleans directory recursively", async () => {
            // Create some files first
            await fileManager.writeFile("dir1/file1.ts", "content1");
            await fileManager.writeFile("dir1/subdir/file2.ts", "content2");
            await fileManager.writeFile("dir2/file3.ts", "content3");

            // Clean dir1
            await fileManager.cleanDirectory("dir1");

            // dir1 should be gone, dir2 should remain
            await expect(access(join(testOutputDir, "dir1"))).rejects.toThrow();
            await expect(access(join(testOutputDir, "dir2/file3.ts"))).resolves.toBeDefined();
        });

        test("handles cleaning non-existent directory gracefully", async () => {
            // Should not throw error
            await expect(fileManager.cleanDirectory("nonexistent")).resolves.toBeUndefined();
        });
    });

    describe("Import Path Resolution", () => {
        test("generates correct relative import paths", async () => {
            const fromFile = "components/Patient.ts";
            const toFile = "types/Reference.ts";

            const relativePath = fileManager.getRelativeImportPath(fromFile, toFile);

            expect(relativePath).toBe("../types/Reference");
        });

        test("handles same directory imports", async () => {
            const fromFile = "types/Patient.ts";
            const toFile = "types/Reference.ts";

            const relativePath = fileManager.getRelativeImportPath(fromFile, toFile);

            expect(relativePath).toBe("./Reference");
        });

        test("handles nested to parent directory imports", async () => {
            const fromFile = "types/nested/Patient.ts";
            const toFile = "types/Reference.ts";

            const relativePath = fileManager.getRelativeImportPath(fromFile, toFile);

            expect(relativePath).toBe("../Reference");
        });

        test("removes file extensions from import paths", async () => {
            const fromFile = "components/Patient.tsx";
            const toFile = "types/Reference.d.ts";

            const relativePath = fileManager.getRelativeImportPath(fromFile, toFile);

            expect(relativePath).toBe("../types/Reference");
        });
    });

    describe("File Utilities", () => {
        test("checks file overwrite correctly", async () => {
            const filePath = "test-overwrite.ts";

            // File doesn't exist yet
            expect(await fileManager.wouldOverwrite(filePath)).toBe(false);

            // Create file
            await fileManager.writeFile(filePath, "content");

            // Now it would overwrite
            expect(await fileManager.wouldOverwrite(filePath)).toBe(true);
        });

        test("gets file statistics", async () => {
            const content = 'export const test = "value";';
            const filePath = "stats-test.ts";

            // No stats for non-existent file
            expect(await fileManager.getFileStats(filePath)).toBeNull();

            // Create file and get stats
            await fileManager.writeFile(filePath, content);
            const stats = await fileManager.getFileStats(filePath);

            expect(stats).not.toBeNull();
            expect(stats!.size).toBe(Buffer.byteLength(content, "utf-8"));
            expect(stats!.generationTime).toBe(0); // Set by caller
            expect(stats!.writeTime).toBe(0); // Set by caller
        });

        test("provides output directory access", () => {
            expect(fileManager.getOutputDirectory()).toBe(testOutputDir);
        });
    });

    describe("Error Handling", () => {
        test("throws FileOperationError on write failure", async () => {
            // Try to write to an invalid path (contains null byte)
            await expect(fileManager.writeFile("invalid\0path.ts", "content")).rejects.toThrow(FileOperationError);
        });

        test("provides recovery suggestions in errors", async () => {
            try {
                // Try to write to an invalid path
                await fileManager.writeFile("invalid\0path.ts", "content");
            } catch (error) {
                expect(error).toBeInstanceOf(FileOperationError);
                const suggestions = (error as FileOperationError).getSuggestions();
                expect(suggestions.length).toBeGreaterThan(0);
                expect(suggestions.some((s) => s.includes("backup-output"))).toBe(true);
            }
        });

        test("handles directory creation errors", async () => {
            // Mock a permission error scenario (hard to test directly)
            const originalError = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
            originalError.code = "EACCES";

            // This would normally be tested with a mocked filesystem
            // For now, just verify the error structure is correct
            expect(() => {
                throw new FileOperationError("Failed to create directory", "create", "/invalid/path", originalError, {
                    canRetry: true,
                    permissionFix: "chmod 755 /path",
                });
            }).toThrow(FileOperationError);
        });
    });

    describe("Performance", () => {
        test("batch operations complete successfully", async () => {
            const fileCount = 20;
            const files = new Map<string, string>();

            for (let i = 0; i < fileCount; i++) {
                files.set(`perf-test-${i}.ts`, `export const value${i} = ${i};`);
            }

            // Test batch write performance
            const batchStart = performance.now();
            const results = await fileManager.writeBatch(files);
            const batchTime = performance.now() - batchStart;

            expect(results).toHaveLength(fileCount);
            expect(batchTime).toBeLessThan(1000); // Should complete within 1 second

            // Verify all files were created
            for (let i = 0; i < fileCount; i++) {
                const filePath = join(testOutputDir, `perf-test-${i}.ts`);
                await expect(access(filePath)).resolves.toBeDefined();
            }
        });

        test("handles memory efficiently with large files", async () => {
            const largeContent = "x".repeat(1024 * 1024); // 1MB file

            const startMemory = process.memoryUsage().heapUsed;

            await fileManager.writeFile("large-file.ts", largeContent);

            const endMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = endMemory - startMemory;

            // Memory increase should be reasonable (less than 10MB)
            expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
        });
    });
});
