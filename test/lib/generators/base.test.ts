/**
 * Unit tests for core generator abstractions
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import {
	BaseGenerator,
	GeneratorError,
	type GeneratorOptions,
	type Generator,
} from "../../../src/lib/generators/base";

// Test implementation of BaseGenerator
class TestGenerator extends BaseGenerator {
	readonly name = "test";
	readonly target = "Test";
	
	public generatedContent: string[] = [];

	async generate(): Promise<void> {
		this.file("test.txt");
		this.line("// Test file");
		this.line("export const test = 'hello world';");
		this.blank();
		this.comment("This is a test comment");
		this.multiLineComment("This is a\nmulti-line comment");
		
		this.curlyBlock("export const obj =", () => {
			this.line("property: 'value',");
			this.line("number: 42");
		});
		
		await this.writeFiles();
	}
}

describe("BaseGenerator", () => {
	let testDir: string;
	let generator: TestGenerator;
	let options: GeneratorOptions;

	beforeEach(() => {
		testDir = join(tmpdir(), `test-generator-${Date.now()}`);
		options = {
			outputDir: testDir,
			verbose: false,
			overwrite: true,
		};
		generator = new TestGenerator(options);
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("should implement Generator interface", () => {
		expect(generator.name).toBe("test");
		expect(generator.target).toBe("Test");
		expect(typeof generator.generate).toBe("function");
		expect(typeof generator.validate).toBe("function");
		expect(typeof generator.cleanup).toBe("function");
	});

	test("should validate output directory", async () => {
		await expect(generator.validate()).resolves.toBeUndefined();
	});

	test("should fail validation with missing output directory", async () => {
		const invalidGenerator = new TestGenerator({
			outputDir: "",
			verbose: false,
		});

		await expect(invalidGenerator.validate()).rejects.toThrow(GeneratorError);
	});

	test("should generate files with proper formatting", async () => {
		await generator.generate();
		
		// Check if file was created
		const testFile = Bun.file(join(testDir, "test.txt"));
		expect(await testFile.exists()).toBe(true);
		
		const content = await testFile.text();
		expect(content).toContain("// Test file");
		expect(content).toContain("export const test = 'hello world';");
		expect(content).toContain("// This is a test comment");
		expect(content).toContain("/**");
		expect(content).toContain(" * This is a");
		expect(content).toContain(" * multi-line comment");
		expect(content).toContain(" */");
		expect(content).toContain("export const obj = {");
		expect(content).toContain("  property: 'value',");
		expect(content).toContain("  number: 42");
		expect(content).toContain("}");
	});

	test("should handle indentation correctly", async () => {
		generator.file("indent-test.txt");
		generator.line("level 0");
		generator.indent();
		generator.line("level 1");
		generator.indent();
		generator.line("level 2");
		generator.dedent();
		generator.line("level 1 again");
		generator.dedent();
		generator.line("level 0 again");
		
		await generator.writeFiles();
		
		const content = await Bun.file(join(testDir, "indent-test.txt")).text();
		const lines = content.split('\n');
		
		expect(lines[0]).toBe("level 0");
		expect(lines[1]).toBe("  level 1");
		expect(lines[2]).toBe("    level 2");
		expect(lines[3]).toBe("  level 1 again");
		expect(lines[4]).toBe("level 0 again");
	});

	test("should handle file header when configured", async () => {
		const generatorWithHeader = new TestGenerator({
			...options,
			fileHeader: "Auto-generated file\nDo not edit manually",
		});
		
		generatorWithHeader.file("header-test.txt");
		generatorWithHeader.line("content");
		await generatorWithHeader.writeFiles();
		
		const content = await Bun.file(join(testDir, "header-test.txt")).text();
		expect(content).toContain("/**");
		expect(content).toContain(" * Auto-generated file");
		expect(content).toContain(" * Do not edit manually");
		expect(content).toContain(" */");
		expect(content).toContain("content");
	});

	test("should clean up resources", async () => {
		generator.file("test1.txt");
		generator.line("content");
		generator.file("test2.txt");
		generator.line("more content");
		
		// Before cleanup, should have files
		expect(generator.getFiles()).toHaveLength(2);
		
		await generator.cleanup();
		
		// After cleanup, should be empty
		expect(generator.getFiles()).toHaveLength(0);
	});
});

describe("GeneratorError", () => {
	test("should create error with code and context", () => {
		const error = new GeneratorError(
			"Test error message",
			"TEST_ERROR",
			{ key: "value" }
		);
		
		expect(error.message).toBe("Test error message");
		expect(error.code).toBe("TEST_ERROR");
		expect(error.context).toEqual({ key: "value" });
		expect(error.name).toBe("GeneratorError");
		expect(error).toBeInstanceOf(Error);
	});

	test("should create error without context", () => {
		const error = new GeneratorError("Simple error", "SIMPLE_ERROR");
		
		expect(error.message).toBe("Simple error");
		expect(error.code).toBe("SIMPLE_ERROR");
		expect(error.context).toBeUndefined();
	});
});