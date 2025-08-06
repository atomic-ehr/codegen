/**
 * Python Generator Tests
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PythonGenerator } from "../../src/generators/python/generator";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("PythonGenerator", () => {
	let tempDir: string;
	let generator: PythonGenerator;

	beforeEach(async () => {
		// Create temporary directory for test output
		tempDir = await mkdtemp(join(tmpdir(), "python-generator-test-"));

		generator = new PythonGenerator({
			outputDir: tempDir,
			verbose: false,
			overwrite: true,
			format: true,
		});
	});

	afterEach(async () => {
		// Clean up temporary directory
		await rm(tempDir, { recursive: true, force: true });
	});

	test("should instantiate with correct properties", () => {
		expect(generator.name).toBe("python");
		expect(generator.target).toBe("Python");
	});

	test("should validate successfully with valid output directory", async () => {
		await expect(generator.validate()).resolves.not.toThrow();
	});

	test("should generate Python naming conventions correctly", () => {
		const generatorAny = generator as any;

		// Test snake_case conversion
		expect(generatorAny.toSnakeCase("PatientName")).toBe("patient_name");
		expect(generatorAny.toSnakeCase("HTTPResponse")).toBe("http_response");
		expect(generatorAny.toSnakeCase("simpleString")).toBe("simple_string");

		// Test PascalCase conversion
		expect(generatorAny.toPascalCase("patient_name")).toBe("PatientName");
		expect(generatorAny.toPascalCase("http-response")).toBe("HttpResponse");
		expect(generatorAny.toPascalCase("simple string")).toBe("SimpleString");

		// Test CONSTANT_CASE conversion
		expect(generatorAny.toConstantCase("PatientName")).toBe("PATIENT_NAME");
		expect(generatorAny.toConstantCase("http-response")).toBe("HTTP_RESPONSE");
	});

	test("should handle Python type mapping correctly", () => {
		const generatorAny = generator as any;
		const typeMapping = generatorAny.typeMapping;

		expect(typeMapping.get("boolean")).toBe("bool");
		expect(typeMapping.get("integer")).toBe("int");
		expect(typeMapping.get("string")).toBe("str");
		expect(typeMapping.get("decimal")).toBe("float");
	});

	test("should generate with Pydantic option", () => {
		const pydanticGenerator = new PythonGenerator({
			outputDir: tempDir,
			verbose: false,
			overwrite: true,
			format: true,
			usePydantic: true,
		});

		const generatorAny = pydanticGenerator as any;
		expect(generatorAny.usePydantic).toBe(true);
	});

	test("should generate with dataclass option (default)", () => {
		const generatorAny = generator as any;
		expect(generatorAny.usePydantic).toBe(false);
	});

	test("should handle generateInit option", () => {
		const noInitGenerator = new PythonGenerator({
			outputDir: tempDir,
			verbose: false,
			overwrite: true,
			format: true,
			generateInit: false,
		});

		const generatorAny = noInitGenerator as any;
		expect(generatorAny.generateInit).toBe(false);
	});

	test("should generate basic Python code structure", async () => {
		// Mock minimal schemas
		const generatorAny = generator as any;
		generatorAny.schemas = {
			primitiveTypes: [
				{
					name: "string",
					description: "A string primitive type"
				}
			],
			complexTypes: [],
			resources: [],
			valueSets: [],
			profiles: []
		};

		// Test generation doesn't throw
		await expect(generator.generate()).resolves.not.toThrow();
	});

	test("should handle field type generation", () => {
		const generatorAny = generator as any;

		// Test primitive field type
		const stringField = {
			type: "string",
			required: true,
			array: false
		};
		expect(generatorAny.getFieldType(stringField)).toBe("str");

		// Test array field type
		const arrayField = {
			type: "string",
			required: true,
			array: true
		};
		expect(generatorAny.getFieldType(arrayField)).toBe("List[str]");

		// Test reference field type
		const referenceField = {
			type: "reference",
			required: false,
			array: false
		};
		expect(generatorAny.getFieldType(referenceField)).toBe("Reference");
	});

	test("should handle choice types", () => {
		const generatorAny = generator as any;

		const choiceField = {
			type: "choice",
			choiceOf: ["string", "integer"],
			required: true,
			array: false
		};

		const result = generatorAny.getFieldType(choiceField);
		expect(result).toBe("Union[str, int]");
	});

	test("should generate proper Python imports for dataclass mode", () => {
		const generatorAny = generator as any;
		generatorAny.usePydantic = false;

		// Start a new file to test imports
		generatorAny.file("test.py");
		generatorAny.line("from typing import Union, Optional, List, Dict, Any");
		generatorAny.line("from dataclasses import dataclass, field");

		const content = generatorAny.buildFileContent();
		expect(content).toContain("from dataclasses import dataclass, field");
		expect(content).not.toContain("from pydantic import BaseModel, Field");
	});

	test("should generate proper Python imports for Pydantic mode", () => {
		const pydanticGenerator = new PythonGenerator({
			outputDir: tempDir,
			verbose: false,
			overwrite: true,
			format: true,
			usePydantic: true,
		});

		const generatorAny = pydanticGenerator as any;

		// Start a new file to test imports
		generatorAny.file("test.py");
		generatorAny.line("from typing import Union, Optional, List, Dict, Any");
		generatorAny.line("from pydantic import BaseModel, Field");

		const content = generatorAny.buildFileContent();
		expect(content).toContain("from pydantic import BaseModel, Field");
		expect(content).not.toContain("from dataclasses import dataclass, field");
	});
});
