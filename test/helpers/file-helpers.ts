/**
 * File system testing utilities
 */

import { rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

/**
 * Test file system manager
 */
export class TestFileSystem {
    constructor(private basePath: string) {}

    static async createTempTestDir(prefix = "codegen-test-"): Promise<TestFileSystem> {
        const tempPath = join(tmpdir(), `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        const testFs = new TestFileSystem(tempPath);
        await testFs.setup();
        return testFs;
    }

    async setup(): Promise<void> {
        await this.cleanup();
        await mkdir(this.basePath, { recursive: true });
    }

    async cleanup(): Promise<void> {
        await rm(this.basePath, { recursive: true, force: true });
    }

    async writeTestFile(relativePath: string, content: string): Promise<void> {
        const fullPath = join(this.basePath, relativePath);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content, "utf-8");
    }

    async readTestFile(relativePath: string): Promise<string> {
        const fullPath = join(this.basePath, relativePath);
        return await readFile(fullPath, "utf-8");
    }

    async fileExists(relativePath: string): Promise<boolean> {
        try {
            await readFile(join(this.basePath, relativePath));
            return true;
        } catch {
            return false;
        }
    }

    async listFiles(relativePath: string = ""): Promise<string[]> {
        try {
            const { readdir } = await import("node:fs/promises");
            const fullPath = join(this.basePath, relativePath);
            const files = await readdir(fullPath, { recursive: true });
            return files.filter((file) => typeof file === "string") as string[];
        } catch {
            return [];
        }
    }

    getPath(relativePath: string = ""): string {
        return join(this.basePath, relativePath);
    }

    getBasePath(): string {
        return this.basePath;
    }
}

/**
 * File content expectations for testing
 */
export interface FileExpectation {
    path: string;
    content?: string;
    contains?: string[];
    notContains?: string[];
    size?: { min?: number; max?: number };
}

/**
 * Assert file system state matches expectations
 */
export async function assertFileSystemState(testFs: TestFileSystem, expectations: FileExpectation[]): Promise<void> {
    for (const expectation of expectations) {
        const exists = await testFs.fileExists(expectation.path);
        if (!exists) {
            throw new Error(`Expected file does not exist: ${expectation.path}`);
        }

        if (expectation.content !== undefined) {
            const actualContent = await testFs.readTestFile(expectation.path);
            if (actualContent !== expectation.content) {
                throw new Error(
                    `File content mismatch for ${expectation.path}:\n` +
                        `Expected: ${expectation.content}\n` +
                        `Actual: ${actualContent}`,
                );
            }
        }

        if (expectation.contains) {
            const actualContent = await testFs.readTestFile(expectation.path);
            for (const substring of expectation.contains) {
                if (!actualContent.includes(substring)) {
                    throw new Error(`File ${expectation.path} does not contain: ${substring}`);
                }
            }
        }

        if (expectation.notContains) {
            const actualContent = await testFs.readTestFile(expectation.path);
            for (const substring of expectation.notContains) {
                if (actualContent.includes(substring)) {
                    throw new Error(`File ${expectation.path} should not contain: ${substring}`);
                }
            }
        }

        if (expectation.size) {
            const actualContent = await testFs.readTestFile(expectation.path);
            const actualSize = Buffer.byteLength(actualContent, "utf-8");

            if (expectation.size.min !== undefined && actualSize < expectation.size.min) {
                throw new Error(`File ${expectation.path} too small: ${actualSize} < ${expectation.size.min}`);
            }

            if (expectation.size.max !== undefined && actualSize > expectation.size.max) {
                throw new Error(`File ${expectation.path} too large: ${actualSize} > ${expectation.size.max}`);
            }
        }
    }
}

/**
 * Create a temporary directory for testing
 */
export async function createTempTestDirectory(): Promise<string> {
    const tempPath = join(tmpdir(), `codegen-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await mkdir(tempPath, { recursive: true });
    return tempPath;
}

/**
 * Clean up a temporary test directory
 */
export async function cleanupTempTestDirectory(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
}

/**
 * Write multiple test files at once
 */
export async function writeTestFiles(basePath: string, files: Record<string, string>): Promise<void> {
    await Promise.all(
        Object.entries(files).map(async ([relativePath, content]) => {
            const fullPath = join(basePath, relativePath);
            await mkdir(dirname(fullPath), { recursive: true });
            await writeFile(fullPath, content, "utf-8");
        }),
    );
}

/**
 * Read multiple test files at once
 */
export async function readTestFiles(basePath: string, relativePaths: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    await Promise.all(
        relativePaths.map(async (relativePath) => {
            try {
                const fullPath = join(basePath, relativePath);
                results[relativePath] = await readFile(fullPath, "utf-8");
            } catch (error) {
                results[relativePath] = `ERROR: ${error instanceof Error ? error.message : String(error)}`;
            }
        }),
    );

    return results;
}
