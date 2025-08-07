/**
 * Integration Tests for TypeSchema Core
 * 
 * Tests the complete TypeSchema workflow from generation to TypeScript output.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import {
	TypeSchemaAPI,
	createTypeSchemaAPI,
	TypeSchemaGenerator,
	TypeSchemaParser,
	TypeSchemaValidator,
	TypeScriptTransformer,
	TypeSchemaCache,
} from "../../src/typeschema";
import type { AnyTypeSchema } from "../../src/typeschema/types";

describe("TypeSchema Integration", () => {
	let api: TypeSchemaAPI;

	const sampleSchemas: AnyTypeSchema[] = [
		{
			identifier: {
				kind: "primitive-type",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				name: "string",
				url: "http://hl7.org/fhir/StructureDefinition/string",
			},
			description: "A sequence of Unicode characters",
		},
		{
			identifier: {
				kind: "complex-type",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				name: "HumanName",
				url: "http://hl7.org/fhir/StructureDefinition/HumanName",
			},
			base: {
				kind: "complex-type",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				name: "Element",
				url: "http://hl7.org/fhir/StructureDefinition/Element",
			},
			fields: {
				family: {
					type: {
						kind: "primitive-type",
						package: "hl7.fhir.r4.core",
						version: "4.0.1",
						name: "string",
						url: "http://hl7.org/fhir/StructureDefinition/string",
					},
					required: false,
				},
				given: {
					type: {
						kind: "primitive-type",
						package: "hl7.fhir.r4.core",
						version: "4.0.1",
						name: "string",
						url: "http://hl7.org/fhir/StructureDefinition/string",
					},
					array: true,
					required: false,
				},
			},
			dependencies: [],
		},
		{
			identifier: {
				kind: "resource",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				name: "Patient",
				url: "http://hl7.org/fhir/StructureDefinition/Patient",
			},
			base: {
				kind: "resource",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				name: "DomainResource",
				url: "http://hl7.org/fhir/StructureDefinition/DomainResource",
			},
			fields: {
				id: {
					type: {
						kind: "primitive-type",
						package: "hl7.fhir.r4.core",
						version: "4.0.1",
						name: "id",
						url: "http://hl7.org/fhir/StructureDefinition/id",
					},
					required: false,
				},
				name: {
					type: {
						kind: "complex-type",
						package: "hl7.fhir.r4.core",
						version: "4.0.1",
						name: "HumanName",
						url: "http://hl7.org/fhir/StructureDefinition/HumanName",
					},
					array: true,
					required: false,
				},
			},
			dependencies: [],
		},
	];

	beforeEach(() => {
		api = createTypeSchemaAPI({
			cache: {
				enabled: true,
				maxSize: 100,
				ttl: 60000,
			},
			validator: {
				strict: false,
			},
			transformer: {
				namingConvention: "PascalCase",
				generateIndex: true,
			},
		});
	});

	describe("API Components", () => {
		test("should provide access to all components", () => {
			expect(api.getGenerator()).toBeInstanceOf(TypeSchemaGenerator);
			expect(api.getParser()).toBeInstanceOf(TypeSchemaParser);
			expect(api.getValidator()).toBeInstanceOf(TypeSchemaValidator);
			expect(api.getTransformer()).toBeInstanceOf(TypeScriptTransformer);
			expect(api.getCache()).toBeInstanceOf(TypeSchemaCache);
		});

		test("should provide working cache operations", () => {
			const cache = api.getCache();
			const schema = sampleSchemas[0];

			expect(cache.has(schema.identifier)).toBe(false);
			cache.set(schema);
			expect(cache.has(schema.identifier)).toBe(true);

			const retrieved = cache.get(schema.identifier);
			expect(retrieved).toEqual(schema);
		});
	});

	describe("Validation Workflow", () => {
		test("should validate schemas successfully", async () => {
			const validator = api.getValidator();
			const result = await validator.validateWithDependencies(sampleSchemas);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test("should detect validation errors", async () => {
			const validator = api.getValidator();
			const invalidSchema = {
				// Missing identifier
				fields: {},
				dependencies: [],
			} as any;

			const result = await validator.validate(invalidSchema);
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe("TypeScript Generation Workflow", () => {
		test("should generate TypeScript from schemas", async () => {
			const transformer = api.getTransformer();
			const results = await transformer.transformSchemas(sampleSchemas);

			expect(results).toHaveLength(3);

			// Check string primitive type
			const stringResult = results.find(r => r.filename === "String.ts");
			expect(stringResult).toBeDefined();
			expect(stringResult?.content).toContain("export type String");

			// Check HumanName complex type
			const humanNameResult = results.find(r => r.filename === "HumanName.ts");
			expect(humanNameResult).toBeDefined();
			expect(humanNameResult?.content).toContain("export interface HumanName");
			expect(humanNameResult?.content).toContain("family?");
			expect(humanNameResult?.content).toContain("given?");

			// Check Patient resource
			const patientResult = results.find(r => r.filename === "Patient.ts");
			expect(patientResult).toBeDefined();
			expect(patientResult?.content).toContain("export interface Patient");
			expect(patientResult?.content).toContain("name?");
		});

		test("should generate TypeScript with proper imports", async () => {
			const transformer = api.getTransformer();
			const patientSchema = sampleSchemas.find(s => s.identifier.name === "Patient");
			const result = await transformer.transformSchema(patientSchema!);

			expect(result.imports).toContain("HumanName");
		});
	});

	describe("Parser Integration", () => {
		test("should parse and process schemas", async () => {
			const parser = api.getParser();
			const jsonContent = JSON.stringify(sampleSchemas);
			
			const parsed = await parser.parseFromString(jsonContent, 'json');
			expect(parsed).toHaveLength(3);

			// Verify parsed schemas
			const patientSchema = parsed.find(s => s.identifier.name === "Patient");
			expect(patientSchema).toBeDefined();
			expect(patientSchema?.fields?.name?.type?.name).toBe("HumanName");
		});

		test("should handle schema dependencies", () => {
			const parser = api.getParser();
			const patientSchema = sampleSchemas.find(s => s.identifier.name === "Patient")!;
			
			const dependencies = parser.getDependencies(patientSchema);
			expect(dependencies.length).toBeGreaterThan(0);
			
			const resolved = parser.resolveDependencies(sampleSchemas, patientSchema);
			expect(resolved.length).toBeGreaterThan(0);
		});
	});

	describe("Cache Integration", () => {
		test("should cache schemas during operations", async () => {
			const cache = api.getCache();
			cache.setMany(sampleSchemas);

			// Verify all schemas are cached
			for (const schema of sampleSchemas) {
				expect(cache.has(schema.identifier)).toBe(true);
			}

			// Test retrieval by package
			const coreSchemas = cache.getByPackage("hl7.fhir.r4.core");
			expect(coreSchemas).toHaveLength(3);

			// Test retrieval by kind
			const resources = cache.getByKind("resource");
			const complexTypes = cache.getByKind("complex-type");
			const primitiveTypes = cache.getByKind("primitive-type");

			expect(resources).toHaveLength(1);
			expect(complexTypes).toHaveLength(1);
			expect(primitiveTypes).toHaveLength(1);
		});

		test("should clear cache properly", () => {
			const cache = api.getCache();
			cache.setMany(sampleSchemas);

			expect(cache.getByPackage("hl7.fhir.r4.core")).toHaveLength(3);

			api.clearCache();

			expect(cache.getByPackage("hl7.fhir.r4.core")).toHaveLength(0);
		});
	});

	describe("Error Handling", () => {
		test("should handle validation failures gracefully", async () => {
			const validator = api.getValidator();
			const invalidSchema = {
				identifier: {
					kind: "resource",
					// Missing required fields
				},
			} as any;

			const result = await validator.validate(invalidSchema);
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		test("should handle transformation errors gracefully", async () => {
			const transformer = api.getTransformer();
			const schemaWithMissingType = {
				identifier: {
					kind: "resource",
					package: "test",
					version: "1.0.0",
					name: "TestResource",
					url: "http://test.com/TestResource",
				},
				fields: {
					invalidField: {
						// Missing type information
					},
				},
			} as any;

			// Should not throw, but handle gracefully
			const result = await transformer.transformSchema(schemaWithMissingType);
			expect(result.content).toBeDefined();
		});
	});

	describe("Performance", () => {
		test("should handle multiple schemas efficiently", async () => {
			const largeSchemaSet: AnyTypeSchema[] = [];
			
			// Create 100 test schemas
			for (let i = 0; i < 100; i++) {
				largeSchemaSet.push({
					identifier: {
						kind: "resource",
						package: "test.package",
						version: "1.0.0",
						name: `TestResource${i}`,
						url: `http://test.com/TestResource${i}`,
					},
					fields: {
						id: {
							type: sampleSchemas[0].identifier, // Reference to string type
						},
					},
					dependencies: [],
				});
			}

			const start = performance.now();

			// Cache all schemas
			api.getCache().setMany(largeSchemaSet);

			// Validate all schemas
			const validator = api.getValidator();
			const results = await validator.validateMany(largeSchemaSet);

			const end = performance.now();
			const duration = end - start;

			// Should complete in reasonable time (less than 1 second)
			expect(duration).toBeLessThan(1000);
			expect(results).toHaveLength(100);
		});
	});
});

describe("TypeSchema API Factory Functions", () => {
	test("createTypeSchemaAPI should work", () => {
		const api = createTypeSchemaAPI({
			cache: { maxSize: 50 },
			validator: { strict: true },
		});

		expect(api).toBeInstanceOf(TypeSchemaAPI);
		expect(api.getCache().getOptions().maxSize).toBe(50);
	});

	test("API should handle default options", () => {
		const api = createTypeSchemaAPI();
		
		expect(api).toBeInstanceOf(TypeSchemaAPI);
		expect(api.getGenerator()).toBeInstanceOf(TypeSchemaGenerator);
		expect(api.getParser()).toBeInstanceOf(TypeSchemaParser);
		expect(api.getValidator()).toBeInstanceOf(TypeSchemaValidator);
		expect(api.getTransformer()).toBeInstanceOf(TypeScriptTransformer);
		expect(api.getCache()).toBeInstanceOf(TypeSchemaCache);
	});
});