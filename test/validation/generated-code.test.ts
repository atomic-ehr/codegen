/**
 * Generated Code Validation Tests
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { validateGeneratedCode } from "../../src/lib/validation/generated-code";

describe("Generated Code Validation", () => {
	const testDir = join(process.cwd(), "tmp", "test-validation");

	beforeEach(async () => {
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	test("should validate valid TypeScript files", async () => {
		// Create valid TypeScript files
		await writeFile(join(testDir, "valid.ts"), `
export interface User {
	id: string;
	name: string;
	email?: string;
}

export type UserRole = "admin" | "user" | "guest";
`);

		const result = await validateGeneratedCode({
			outputDir: testDir,
			verbose: false,
			strict: false,
		});

		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
		expect(result.stats.totalFiles).toBe(1);
		expect(result.stats.validFiles).toBe(1);
		expect(result.stats.invalidFiles).toBe(0);
	});

	test("should detect syntax errors", async () => {
		// Create TypeScript file with syntax errors
		await writeFile(join(testDir, "invalid.ts"), `
export interface User {
	id: string;
	name: string;
	email?: string;
// Missing closing brace

export type UserRole = "admin" | "user" | "guest";
`);

		const result = await validateGeneratedCode({
			outputDir: testDir,
			verbose: false,
			strict: false,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.stats.totalFiles).toBe(1);
		expect(result.stats.validFiles).toBe(0);
		expect(result.stats.invalidFiles).toBe(1);
		expect(result.stats.syntaxErrors).toBeGreaterThan(0);
	});

	test("should detect code quality issues", async () => {
		// Create TypeScript file with quality issues
		await writeFile(join(testDir, "quality-issues.ts"), `
export interface EmptyInterface {
}

export interface User {
	id: string;
	name: string;
	reallyLongPropertyNameThatExceedsTheRecommendedLineLengthLimitAndShouldTriggerAWarningAboutLineLengthIssuesAndMakeItEvenLonger: string;
}

export interface User {
	id: number;
	name: string;
}
`);

		const result = await validateGeneratedCode({
			outputDir: testDir,
			verbose: false,
			strict: false,
		});

		expect(result.warnings.length).toBeGreaterThan(0);

		// Should have warnings for empty interface, long line, and duplicate definition
		const warningMessages = result.warnings.map(w => w.message);
		expect(warningMessages.some(msg => msg.includes("Empty interface"))).toBe(true);
		expect(warningMessages.some(msg => msg.includes("exceeds 120 characters"))).toBe(true);
		expect(warningMessages.some(msg => msg.includes("Duplicate type definitions"))).toBe(true);
	});

	test("should handle non-existent directory", async () => {
		const result = await validateGeneratedCode({
			outputDir: join(testDir, "non-existent"),
			verbose: false,
			strict: false,
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain("does not exist");
		expect(result.errors[0].severity).toBe("critical");
	});

	test("should handle empty directory", async () => {
		const result = await validateGeneratedCode({
			outputDir: testDir,
			verbose: false,
			strict: false,
		});

		expect(result.valid).toBe(true);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0].message).toContain("No TypeScript files found");
		expect(result.stats.totalFiles).toBe(0);
	});

	test("should treat warnings as errors in strict mode", async () => {
		// Create file with warnings
		await writeFile(join(testDir, "warnings.ts"), `
export interface EmptyInterface {
}
`);

		const result = await validateGeneratedCode({
			outputDir: testDir,
			verbose: false,
			strict: true,
		});

		expect(result.valid).toBe(false);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	test("should validate multiple files", async () => {
		// Create multiple TypeScript files
		await writeFile(join(testDir, "types.ts"), `
export interface User {
	id: string;
	name: string;
}
`);

		await writeFile(join(testDir, "constants.ts"), `
export const API_VERSION = "v1";
export const MAX_USERS = 100;
`);

		await mkdir(join(testDir, "nested"), { recursive: true });
		await writeFile(join(testDir, "nested", "models.ts"), `
export type Status = "active" | "inactive";
`);

		const result = await validateGeneratedCode({
			outputDir: testDir,
			verbose: false,
			strict: false,
		});

		expect(result.valid).toBe(true);
		expect(result.stats.totalFiles).toBe(3);
		expect(result.stats.validFiles).toBe(3);
		expect(result.stats.invalidFiles).toBe(0);
	});

	test("should skip node_modules and other common directories", async () => {
		// Create files in directories that should be skipped
		await mkdir(join(testDir, "node_modules"), { recursive: true });
		await writeFile(join(testDir, "node_modules", "package.ts"), `
export const version = "1.0.0";
`);

		await mkdir(join(testDir, ".git"), { recursive: true });
		await writeFile(join(testDir, ".git", "config.ts"), `
export const gitConfig = {};
`);

		// Create valid file in main directory
		await writeFile(join(testDir, "main.ts"), `
export interface Main {
	id: string;
}
`);

		const result = await validateGeneratedCode({
			outputDir: testDir,
			verbose: false,
			strict: false,
		});

		expect(result.valid).toBe(true);
		expect(result.stats.totalFiles).toBe(1); // Only main.ts should be found
	});

	test("should detect invalid identifiers", async () => {
		// Create file with invalid identifier
		await writeFile(join(testDir, "invalid-identifier.ts"), `
export interface User {
	id: string;
	2name: string; // Invalid: starts with number
}
`);

		const result = await validateGeneratedCode({
			outputDir: testDir,
			verbose: false,
			strict: false,
		});

		expect(result.valid).toBe(false);
		expect(result.errors.some(e => e.message.includes("Invalid identifier starts with number"))).toBe(true);
	});
});
