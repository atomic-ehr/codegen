/**
 * Integration tests for enhanced TypeScript generator
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { TypeScriptGenerator } from "../../src/generators/typescript";

describe("Enhanced TypeScript Generator", () => {
	let testDir: string;
	let generator: TypeScriptGenerator;

	beforeEach(() => {
		testDir = join(tmpdir(), `enhanced-ts-generator-${Date.now()}`);
		generator = new TypeScriptGenerator({
			outputDir: testDir,
			verbose: false,
		});
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("should implement Generator interface correctly", () => {
		expect(generator.name).toBe("typescript");
		expect(generator.target).toBe("TypeScript");
		expect(typeof generator.generate).toBe("function");
		expect(typeof generator.validate).toBe("function");
		expect(typeof generator.cleanup).toBe("function");
	});

	test("should validate successfully with valid configuration", async () => {
		await expect(generator.validate()).resolves.toBeUndefined();
	});

	test("should create proper directory structure", async () => {
		// This is a lightweight test without actually loading FHIR schemas
		// We'll mock the internal schemas to test file structure
		
		// Use reflection to access private properties for testing
		const generatorAny = generator as any;
		
		// Mock minimal schemas structure
		generatorAny.schemas = {
			primitiveTypes: [
				{
					identifier: { name: "string", kind: "primitive-type" },
					description: "A string primitive type",
					dependencies: []
				}
			],
			complexTypes: [
				{
					identifier: { name: "Element", kind: "complex-type" },
					description: "Base Element type",
					fields: {},
					dependencies: []
				}
			],
			resources: [
				{
					identifier: { name: "Patient", kind: "resource" },
					description: "Patient resource",
					fields: {
						resourceType: {
							type: { name: "code", kind: "primitive-type" },
							required: true,
							array: false,
							excluded: false
						}
					},
					dependencies: []
				}
			]
		};

		// Generate files using the mocked schemas
		await generatorAny.generatePrimitiveTypes();
		await generatorAny.generateComplexTypes();
		await generatorAny.generateResources();
		await generatorAny.generateIndexFile();
		await generatorAny.writeFiles();

		// Check that all expected files were created
		const indexFile = Bun.file(join(testDir, "index.ts"));
		const primitivesFile = Bun.file(join(testDir, "types", "primitives.ts"));
		const complexFile = Bun.file(join(testDir, "types", "complex.ts"));
		const patientFile = Bun.file(join(testDir, "resources", "Patient.ts"));
		const resourcesIndexFile = Bun.file(join(testDir, "resources", "index.ts"));

		expect(await indexFile.exists()).toBe(true);
		expect(await primitivesFile.exists()).toBe(true);
		expect(await complexFile.exists()).toBe(true);
		expect(await patientFile.exists()).toBe(true);
		expect(await resourcesIndexFile.exists()).toBe(true);
	});

	test("should generate proper TypeScript code structure", async () => {
		const generatorAny = generator as any;
		
		// Mock a simple schema
		generatorAny.schemas = {
			primitiveTypes: [
				{
					identifier: { name: "string", kind: "primitive-type" },
					description: "A sequence of Unicode characters",
					dependencies: []
				}
			],
			complexTypes: [],
			resources: [
				{
					identifier: { name: "Patient", kind: "resource" },
					description: "Demographics and other administrative information about an individual",
					fields: {
						resourceType: {
							type: { name: "code", kind: "primitive-type" },
							required: true,
							array: false,
							excluded: false
						},
						id: {
							type: { name: "id", kind: "primitive-type" },
							required: false,
							array: false,
							excluded: false
						}
					},
					dependencies: []
				}
			]
		};

		await generatorAny.generatePrimitiveTypes();
		await generatorAny.generateResources();
		await generatorAny.generateIndexFile();
		await generatorAny.writeFiles();

		// Check primitives file content
		const primitivesContent = await Bun.file(join(testDir, "types", "primitives.ts")).text();
		expect(primitivesContent).toContain("export interface Reference<T = any>");
		expect(primitivesContent).toContain("export type string = string;");
		expect(primitivesContent).toContain("Generic Reference type for FHIR references");

		// Check index file content
		const indexContent = await Bun.file(join(testDir, "index.ts")).text();
		expect(indexContent).toContain("export * as primitives from './types/primitives';");
		expect(indexContent).toContain("export type { Reference } from './types/primitives';");
		expect(indexContent).toContain("export const ResourceTypeMap = {");
		expect(indexContent).toContain("Patient: true,");
		expect(indexContent).toContain("export type ResourceType = keyof typeof ResourceTypeMap;");
		expect(indexContent).toContain("export function isFHIRResource(obj: any): obj is AnyResource");

		// Check Patient resource file
		const patientContent = await Bun.file(join(testDir, "resources", "Patient.ts")).text();
		expect(patientContent).toContain("export interface Patient");
		expect(patientContent).toContain("resourceType: string;"); // code maps to string
		expect(patientContent).toContain("id?: string;"); // id maps to string
		expect(patientContent).toContain("Demographics and other administrative information");
	});

	test("should handle field comments and cardinality", async () => {
		const generatorAny = generator as any;
		
		// Mock schema with different field types
		generatorAny.schemas = {
			primitiveTypes: [],
			complexTypes: [],
			resources: [
				{
					identifier: { name: "TestResource", kind: "resource" },
					description: "Test resource for field generation",
					fields: {
						requiredField: {
							type: { name: "string", kind: "primitive-type" },
							required: true,
							array: false,
							excluded: false,
							min: 1,
							max: 1
						},
						arrayField: {
							type: { name: "string", kind: "primitive-type" },
							required: false,
							array: true,
							excluded: false,
							min: 0,
							max: undefined
						},
						referenceField: {
							reference: [{ name: "Patient", kind: "resource" }],
							required: false,
							array: false,
							excluded: false
						}
					},
					dependencies: []
				}
			]
		};

		await generatorAny.generateResources();
		await generatorAny.writeFiles();

		const resourceContent = await Bun.file(join(testDir, "resources", "TestResource.ts")).text();
		
		// Check field comments
		expect(resourceContent).toContain("/** requiredField field of type string | Cardinality: 1..1 */");
		expect(resourceContent).toContain("/** arrayField field of type string | Cardinality: 0..* */");
		expect(resourceContent).toContain("/** Reference to Patient */");
		
		// Check field types
		expect(resourceContent).toContain("requiredField: string;");
		expect(resourceContent).toContain("arrayField?: string[];");
		expect(resourceContent).toContain("referenceField?: Reference<Patient>;");
	});

	test("should generate proper exports structure", async () => {
		const generatorAny = generator as any;
		
		generatorAny.schemas = {
			primitiveTypes: [
				{ identifier: { name: "string", kind: "primitive-type" }, dependencies: [] }
			],
			complexTypes: [
				{ identifier: { name: "Element", kind: "complex-type" }, dependencies: [] }
			],
			resources: [
				{ identifier: { name: "Patient", kind: "resource" }, dependencies: [] },
				{ identifier: { name: "Observation", kind: "resource" }, dependencies: [] }
			]
		};

		await generatorAny.generateResources();
		await generatorAny.generateIndexFile();
		await generatorAny.writeFiles();

		// Check resources index
		const resourcesIndexContent = await Bun.file(join(testDir, "resources", "index.ts")).text();
		expect(resourcesIndexContent).toContain("export type { Patient } from './Patient';");
		expect(resourcesIndexContent).toContain("export type { Observation } from './Observation';");

		// Check main index
		const indexContent = await Bun.file(join(testDir, "index.ts")).text();
		expect(indexContent).toContain("export * as resources from './resources';");
		expect(indexContent).toContain("export type { Patient } from './resources/Patient';");
		expect(indexContent).toContain("export type { Observation } from './resources/Observation';");
	});
});