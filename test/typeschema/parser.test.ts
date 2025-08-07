/**
 * Tests for TypeSchema Parser
 */

import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
	TypeSchemaParser,
	parseTypeSchemaFromFile,
	parseTypeSchemaFromString,
} from "../../src/typeschema/parser";
import type { AnyTypeSchema, TypeSchemaIdentifier } from "../../src/typeschema/types";

describe("TypeSchemaParser", () => {
	let parser: TypeSchemaParser;
	let tempDir: string;

	const sampleSchema: AnyTypeSchema = {
		identifier: {
			kind: "resource",
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			name: "Patient",
			url: "http://hl7.org/fhir/StructureDefinition/Patient",
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
	};

	beforeEach(async () => {
		parser = new TypeSchemaParser();
		tempDir = await mkdtemp(join(tmpdir(), "typeschema-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true });
	});

	describe("Format Detection", () => {
		test("should detect JSON format from file extension", async () => {
			const filePath = join(tempDir, "schema.json");
			await writeFile(filePath, JSON.stringify(sampleSchema));

			const schemas = await parser.parseFromFile(filePath);
			expect(schemas).toHaveLength(1);
			expect(schemas[0].identifier.name).toBe("Patient");
		});

		test("should detect NDJSON format from file extension", async () => {
			const filePath = join(tempDir, "schemas.ndjson");
			const ndjsonContent = JSON.stringify(sampleSchema) + "\n" + JSON.stringify({
				...sampleSchema,
				identifier: { ...sampleSchema.identifier, name: "Observation" },
			});
			await writeFile(filePath, ndjsonContent);

			const schemas = await parser.parseFromFile(filePath);
			expect(schemas).toHaveLength(2);
			expect(schemas[0].identifier.name).toBe("Patient");
			expect(schemas[1].identifier.name).toBe("Observation");
		});

		test("should auto-detect JSON format from content", async () => {
			const jsonContent = JSON.stringify([sampleSchema]);
			const schemas = await parser.parseFromString(jsonContent);
			
			expect(schemas).toHaveLength(1);
			expect(schemas[0].identifier.name).toBe("Patient");
		});

		test("should auto-detect NDJSON format from content", async () => {
			const ndjsonContent = JSON.stringify(sampleSchema) + "\n" + JSON.stringify({
				...sampleSchema,
				identifier: { ...sampleSchema.identifier, name: "Observation" },
			});
			const schemas = await parser.parseFromString(ndjsonContent);
			
			expect(schemas).toHaveLength(2);
			expect(schemas[0].identifier.name).toBe("Patient");
			expect(schemas[1].identifier.name).toBe("Observation");
		});
	});

	describe("Parsing Functionality", () => {
		test("should parse single schema from JSON", async () => {
			const jsonContent = JSON.stringify(sampleSchema);
			const schemas = await parser.parseFromString(jsonContent, 'json');
			
			expect(schemas).toHaveLength(1);
			expect(schemas[0]).toEqual(sampleSchema);
		});

		test("should parse array of schemas from JSON", async () => {
			const jsonContent = JSON.stringify([sampleSchema, {
				...sampleSchema,
				identifier: { ...sampleSchema.identifier, name: "Observation" },
			}]);
			const schemas = await parser.parseFromString(jsonContent, 'json');
			
			expect(schemas).toHaveLength(2);
			expect(schemas[0].identifier.name).toBe("Patient");
			expect(schemas[1].identifier.name).toBe("Observation");
		});

		test("should parse multiple schemas from NDJSON", async () => {
			const ndjsonContent = [
				JSON.stringify(sampleSchema),
				JSON.stringify({ ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Observation" }}),
				JSON.stringify({ ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Practitioner" }}),
			].join("\n");

			const schemas = await parser.parseFromString(ndjsonContent, 'ndjson');
			
			expect(schemas).toHaveLength(3);
			expect(schemas[0].identifier.name).toBe("Patient");
			expect(schemas[1].identifier.name).toBe("Observation");
			expect(schemas[2].identifier.name).toBe("Practitioner");
		});

		test("should handle empty lines in NDJSON", async () => {
			const ndjsonContent = [
				JSON.stringify(sampleSchema),
				"",
				JSON.stringify({ ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Observation" }}),
				"",
			].join("\n");

			const schemas = await parser.parseFromString(ndjsonContent, 'ndjson');
			
			expect(schemas).toHaveLength(2);
			expect(schemas[0].identifier.name).toBe("Patient");
			expect(schemas[1].identifier.name).toBe("Observation");
		});
	});

	describe("Schema Search and Filtering", () => {
		const schemas: AnyTypeSchema[] = [
			sampleSchema,
			{
				...sampleSchema,
				identifier: {
					...sampleSchema.identifier,
					kind: "complex-type",
					name: "HumanName",
					url: "http://hl7.org/fhir/StructureDefinition/HumanName",
				},
			},
			{
				...sampleSchema,
				identifier: {
					...sampleSchema.identifier,
					kind: "profile",
					package: "hl7.fhir.us.core",
					name: "USCorePatient",
					url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
				},
			},
		];

		test("should find schemas by identifier", () => {
			const found = parser.findByIdentifier(schemas, { kind: "resource" });
			expect(found).toHaveLength(1);
			expect(found[0].identifier.name).toBe("Patient");
		});

		test("should find schemas by URL", () => {
			const found = parser.findByUrl(schemas, "http://hl7.org/fhir/StructureDefinition/HumanName");
			expect(found).toBeDefined();
			expect(found?.identifier.name).toBe("HumanName");
		});

		test("should find schemas by kind", () => {
			const resources = parser.findByKind(schemas, "resource");
			const complexTypes = parser.findByKind(schemas, "complex-type");
			const profiles = parser.findByKind(schemas, "profile");

			expect(resources).toHaveLength(1);
			expect(complexTypes).toHaveLength(1);
			expect(profiles).toHaveLength(1);
			
			expect(resources[0].identifier.name).toBe("Patient");
			expect(complexTypes[0].identifier.name).toBe("HumanName");
			expect(profiles[0].identifier.name).toBe("USCorePatient");
		});

		test("should find schemas by package", () => {
			const corePackage = parser.findByPackage(schemas, "hl7.fhir.r4.core");
			const usCorePackage = parser.findByPackage(schemas, "hl7.fhir.us.core");

			expect(corePackage).toHaveLength(2);
			expect(usCorePackage).toHaveLength(1);
			
			expect(usCorePackage[0].identifier.name).toBe("USCorePatient");
		});
	});

	describe("Dependency Resolution", () => {
		test("should extract dependencies from schema", () => {
			const schemaWithDeps: AnyTypeSchema = {
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
					name: {
						type: {
							kind: "complex-type",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							name: "HumanName",
							url: "http://hl7.org/fhir/StructureDefinition/HumanName",
						},
						array: true,
					},
				},
				dependencies: [],
			};

			const dependencies = parser.getDependencies(schemaWithDeps);
			
			expect(dependencies).toHaveLength(2); // base + field type
			expect(dependencies.find(d => d.name === "DomainResource")).toBeDefined();
			expect(dependencies.find(d => d.name === "HumanName")).toBeDefined();
		});

		test("should resolve dependencies from schema collection", () => {
			const baseSchema: AnyTypeSchema = {
				identifier: {
					kind: "resource",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "DomainResource",
					url: "http://hl7.org/fhir/StructureDefinition/DomainResource",
				},
				fields: {},
				dependencies: [],
			};

			const typeSchema: AnyTypeSchema = {
				identifier: {
					kind: "complex-type",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "HumanName",
					url: "http://hl7.org/fhir/StructureDefinition/HumanName",
				},
				fields: {},
				dependencies: [],
			};

			const targetSchema: AnyTypeSchema = {
				identifier: {
					kind: "resource",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "Patient",
					url: "http://hl7.org/fhir/StructureDefinition/Patient",
				},
				base: baseSchema.identifier,
				fields: {
					name: {
						type: typeSchema.identifier,
						array: true,
					},
				},
				dependencies: [],
			};

			const allSchemas = [baseSchema, typeSchema, targetSchema];
			const resolved = parser.resolveDependencies(allSchemas, targetSchema);
			
			expect(resolved).toHaveLength(2);
			expect(resolved.find(s => s.identifier.name === "DomainResource")).toBeDefined();
			expect(resolved.find(s => s.identifier.name === "HumanName")).toBeDefined();
		});
	});

	describe("Error Handling", () => {
		test("should handle invalid JSON", async () => {
			const invalidJson = "{ invalid json }";
			
			await expect(parser.parseFromString(invalidJson, 'json')).rejects.toThrow();
		});

		test("should handle missing identifier in strict mode", async () => {
			parser.setOptions({ strict: true });
			const invalidSchema = { name: "Invalid" };
			const content = JSON.stringify(invalidSchema);
			
			await expect(parser.parseFromString(content, 'json')).rejects.toThrow();
		});

		test("should skip invalid lines in NDJSON non-strict mode", async () => {
			parser.setOptions({ strict: false });
			const ndjsonContent = [
				JSON.stringify(sampleSchema),
				"{ invalid json }",
				JSON.stringify({ ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Valid" }}),
			].join("\n");

			const schemas = await parser.parseFromString(ndjsonContent, 'ndjson');
			
			expect(schemas).toHaveLength(2);
			expect(schemas[0].identifier.name).toBe("Patient");
			expect(schemas[1].identifier.name).toBe("Valid");
		});
	});

	describe("Options and Configuration", () => {
		test("should respect parser options", () => {
			const initialOptions = parser.getOptions();
			expect(initialOptions.format).toBe('auto');
			expect(initialOptions.validate).toBe(true);
			expect(initialOptions.strict).toBe(false);

			parser.setOptions({
				format: 'json',
				validate: false,
				strict: true,
			});

			const updatedOptions = parser.getOptions();
			expect(updatedOptions.format).toBe('json');
			expect(updatedOptions.validate).toBe(false);
			expect(updatedOptions.strict).toBe(true);
		});
	});

	describe("Convenience Functions", () => {
		test("parseTypeSchemaFromFile should work", async () => {
			const filePath = join(tempDir, "schema.json");
			await writeFile(filePath, JSON.stringify(sampleSchema));

			const schemas = await parseTypeSchemaFromFile(filePath);
			expect(schemas).toHaveLength(1);
			expect(schemas[0].identifier.name).toBe("Patient");
		});

		test("parseTypeSchemaFromString should work", async () => {
			const content = JSON.stringify(sampleSchema);
			const schemas = await parseTypeSchemaFromString(content, 'json');
			
			expect(schemas).toHaveLength(1);
			expect(schemas[0].identifier.name).toBe("Patient");
		});
	});
});