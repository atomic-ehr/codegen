import { describe, expect, it, beforeEach } from "bun:test";
import { TypeScriptGenerator } from "../../../../src/api/generators/typescript";
import type {
	TypeSchema,
	TypeSchemaIdentifier,
} from "../../../../src/typeschema/types";

describe("TypeScript Generator Core Logic", () => {
	let generator: TypeScriptGenerator;

	beforeEach(() => {
		generator = new TypeScriptGenerator({
			outputDir: "/test/output",
			moduleFormat: "esm",
			generateIndex: true,
			namingConvention: "PascalCase",
		});
	});

	describe("TypeScriptAPIGenerator.transformSchema", () => {
		it("should transform basic resource schema to TypeScript", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "resource",
					name: "Patient",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/Patient",
				},
				fields: {
					id: {
						type: {
							kind: "primitive-type",
							name: "id",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
					name: {
						type: {
							kind: "complex-type",
							name: "HumanName",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						array: true,
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("export interface Patient");
			expect(result?.content).toContain("resourceType: 'Patient'");
			expect(result?.exports).toContain("Patient");
		});

		it("should skip value-set schemas", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "value-set",
					name: "TestValueSet",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/ValueSet/test",
				},
				description: "Test value set",
			};

			const result = await generator.transformSchema(schema);
			expect(result).toBeUndefined();
		});

		it("should skip primitive-type schemas", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "primitive-type",
					name: "string",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/string",
				},
			};

			const result = await generator.transformSchema(schema);
			expect(result).toBeUndefined();
		});

		it("should handle complex type with base interface", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "Address",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/Address",
				},
				base: {
					kind: "complex-type",
					name: "Element",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/Element",
				},
				fields: {
					use: {
						type: {
							kind: "primitive-type",
							name: "code",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
					line: {
						type: {
							kind: "primitive-type",
							name: "string",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						array: true,
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("export interface Address");
			expect(result?.content).toContain("use?: string");
			expect(result?.content).toContain("line?: string[]");
		});

		it("should handle Reference type with generics", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "Reference",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/Reference",
				},
				fields: {
					type: {
						type: {
							kind: "primitive-type",
							name: "string",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
					reference: {
						type: {
							kind: "primitive-type",
							name: "string",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain(
				"Reference<T extends ResourceType = ResourceType>",
			);
			expect(result?.content).toContain("import type { ResourceType }");
		});

		it("should handle optional fields correctly", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "TestType",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/TestType",
				},
				fields: {
					requiredField: {
						type: {
							kind: "primitive-type",
							name: "string",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						required: true,
					},
					optionalField: {
						type: {
							kind: "primitive-type",
							name: "string",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						required: false,
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("requiredField: string");
			expect(result?.content).toContain("optionalField?: string");
		});

		it("should handle array fields", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "ArrayType",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/ArrayType",
				},
				fields: {
					items: {
						type: {
							kind: "primitive-type",
							name: "string",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						array: true,
					},
					singleItem: {
						type: {
							kind: "primitive-type",
							name: "string",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						array: false,
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("items?: string[]");
			expect(result?.content).toContain("singleItem?: string");
		});

		it("should handle enum fields with small sets", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "EnumType",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/EnumType",
				},
				fields: {
					status: { 
						type: { name: "code", kind: "primitive-type", package: "hl7.fhir.r4.core", version: "4.0.1", url: "http://hl7.org/fhir/code" },
						enum: ["active", "inactive", "pending"], 
						required: true 
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("status: string");
			expect(result?.content).toContain("export interface EnumType");
		});

		it("should handle enum fields with large sets", async () => {
			const largeEnum = Array.from({ length: 20 }, (_, i) => `value${i}`);
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "LargeEnumType",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/LargeEnumType",
				},
				fields: {
					code: { 
						type: { name: "code", kind: "primitive-type", package: "hl7.fhir.r4.core", version: "4.0.1", url: "http://hl7.org/fhir/code" },
						enum: largeEnum, 
						required: true 
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("code: string");
			expect(result?.content).toContain("export interface LargeEnumType");
		});

		it("should handle nested types", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "ParentType",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/ParentType",
				},
				fields: {
					nested: {
						type: {
							kind: "nested",
							name: "NestedType",
							package: "test",
							version: "1.0.0",
							url: "",
						},
					},
				},
				nested: [
					{
						identifier: {
							kind: "nested",
							name: "NestedType",
							package: "test",
							version: "1.0.0",
							url: "http://example.org/ParentType#NestedType",
						},
						fields: {
							value: {
								type: {
									kind: "primitive-type",
									name: "string",
									package: "hl7.fhir.r4.core",
									version: "4.0.1",
									url: "",
								},
							},
						},
					},
				],
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("export interface ParentType");
			expect(result?.content).toContain("nested?: unknown");
		});

		it("should handle reference fields with specific targets", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "resource",
					name: "Observation",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/Observation",
				},
				fields: {
					subject: {
						reference: [
							{
								kind: "resource",
								name: "Patient",
								package: "hl7.fhir.r4.core",
								version: "4.0.1",
								url: "",
							},
							{
								kind: "resource",
								name: "Group",
								package: "hl7.fhir.r4.core",
								version: "4.0.1",
								url: "",
							},
						],
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("resourceType: 'Observation'");
			expect(result?.content).toContain("subject?: any");
		});

		it("should handle polymorphic fields", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "resource",
					name: "Observation",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/Observation",
				},
				fields: {
					value: {
						polymorphic: true,
						types: [
							{
								kind: "complex-type",
								name: "Quantity",
								package: "hl7.fhir.r4.core",
								version: "4.0.1",
								url: "",
							},
							{
								kind: "primitive-type",
								name: "string",
								package: "hl7.fhir.r4.core",
								version: "4.0.1",
								url: "",
							},
							{
								kind: "primitive-type",
								name: "boolean",
								package: "hl7.fhir.r4.core",
								version: "4.0.1",
								url: "",
							},
						],
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("value?: any");
		});

		it("should track resource types for ResourceType union", async () => {
			const schemas: TypeSchema[] = [
				{
					identifier: {
						kind: "resource",
						name: "Patient",
						package: "hl7.fhir.r4.core",
						version: "4.0.1",
						url: "http://hl7.org/fhir/StructureDefinition/Patient",
					},
					fields: {},
					dependencies: [],
				},
				{
					identifier: {
						kind: "resource",
						name: "Observation",
						package: "hl7.fhir.r4.core",
						version: "4.0.1",
						url: "http://hl7.org/fhir/StructureDefinition/Observation",
					},
					fields: {},
					dependencies: [],
				},
			];

			// Set a writable output directory for test
			generator.setOutputDir("/tmp/test-output");

			// Transform schemas to populate resourceTypes
			const results = await generator.transformSchemas(schemas);

			expect(results).toHaveLength(2);
			expect(results.some(r => r.filename === "Patient.ts")).toBe(true);
			expect(results.some(r => r.filename === "Observation.ts")).toBe(true);
		});

		it("should handle primitive type mapping", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "PrimitiveTest",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/PrimitiveTest",
				},
				fields: {
					stringField: {
						type: {
							kind: "primitive-type",
							name: "string",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
					integerField: {
						type: {
							kind: "primitive-type",
							name: "integer",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
					booleanField: {
						type: {
							kind: "primitive-type",
							name: "boolean",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
					dateField: {
						type: {
							kind: "primitive-type",
							name: "date",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
					decimalField: {
						type: {
							kind: "primitive-type",
							name: "decimal",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("stringField?: string");
			expect(result?.content).toContain("integerField?: number");
			expect(result?.content).toContain("booleanField?: boolean");
			expect(result?.content).toContain("dateField?: string");
			expect(result?.content).toContain("decimalField?: number");
		});

		it("should generate correct imports for complex types", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "resource",
					name: "Patient",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/Patient",
				},
				fields: {
					name: {
						type: {
							kind: "complex-type",
							name: "HumanName",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						array: true,
					},
					address: {
						type: {
							kind: "complex-type",
							name: "Address",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						array: true,
					},
					identifier: {
						type: {
							kind: "complex-type",
							name: "Identifier",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						array: true,
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.imports.has("HumanName")).toBe(true);
			expect(result?.imports.has("Address")).toBe(true);
			expect(result?.imports.has("Identifier")).toBe(true);
		});

		it("should handle schemas without fields", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "EmptyType",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/EmptyType",
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("export interface EmptyType {");
			expect(result?.content).toContain("}");
		});

		it("should respect naming convention option", async () => {
			generator.setOptions({ namingConvention: "camelCase" });

			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "test-type",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/test-type",
				},
				fields: {},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.filename).toBe("TestType.ts");
		});

		it("should handle DomainResource and Resource base types", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "resource",
					name: "DomainResource",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/DomainResource",
				},
				base: {
					kind: "resource",
					name: "Resource",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					url: "http://hl7.org/fhir/StructureDefinition/Resource",
				},
				fields: {},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("export interface DomainResource");
			expect(result?.content).toContain("resourceType: 'DomainResource'");
		});

		it("should handle binding fields", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "BoundType",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/BoundType",
				},
				fields: {
					status: {
						type: {
							kind: "primitive-type",
							name: "code",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						binding: {
							kind: "value-set",
							name: "StatusValueSet",
							package: "test",
							version: "1.0.0",
							url: "http://example.org/ValueSet/status",
						},
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("status?: string");
		});

		it("should generate correct filename for types", async () => {
			const testCases = [
				{ name: "Patient", expected: "Patient.ts" },
				{ name: "HumanName", expected: "HumanName.ts" },
				{ name: "us-core-patient", expected: "UsCorePatient.ts" },
				{ name: "some_snake_case", expected: "SomeSnakeCase.ts" },
			];

			for (const testCase of testCases) {
				const schema: TypeSchema = {
					identifier: {
						kind: "complex-type",
						name: testCase.name,
						package: "test",
						version: "1.0.0",
						url: `http://example.org/${testCase.name}`,
					},
					fields: {},
					dependencies: [],
				};

				const result = await generator.transformSchema(schema);
				expect(result?.filename).toBe(testCase.expected);
			}
		});

		it("should handle circular dependencies gracefully", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "complex-type",
					name: "CircularType",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/CircularType",
				},
				fields: {
					parent: {
						type: {
							kind: "complex-type",
							name: "CircularType",
							package: "test",
							version: "1.0.0",
							url: "http://example.org/CircularType",
						},
					},
					children: {
						type: {
							kind: "complex-type",
							name: "CircularType",
							package: "test",
							version: "1.0.0",
							url: "http://example.org/CircularType",
						},
						array: true,
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("parent?: CircularType");
			expect(result?.content).toContain("children?: CircularType[]");
		});

		it("should handle mixed field types in one schema", async () => {
			const schema: TypeSchema = {
				identifier: {
					kind: "resource",
					name: "MixedResource",
					package: "test",
					version: "1.0.0",
					url: "http://example.org/MixedResource",
				},
				fields: {
					simpleString: {
						type: {
							kind: "primitive-type",
							name: "string",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
					enumField: { 
						type: {
							kind: "primitive-type",
							name: "code",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						enum: ["a", "b", "c"] 
					},
					complexField: {
						type: {
							kind: "complex-type",
							name: "Address",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
					},
					arrayField: {
						type: {
							kind: "primitive-type",
							name: "integer",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						array: true,
					},
					requiredField: {
						type: {
							kind: "primitive-type",
							name: "boolean",
							package: "hl7.fhir.r4.core",
							version: "4.0.1",
							url: "",
						},
						required: true,
					},
					referenceField: {
						reference: [
							{
								kind: "resource",
								name: "Patient",
								package: "hl7.fhir.r4.core",
								version: "4.0.1",
								url: "",
							},
						],
					},
				},
				dependencies: [],
			};

			const result = await generator.transformSchema(schema);

			expect(result).toBeDefined();
			expect(result?.content).toContain("resourceType: 'MixedResource'");
			expect(result?.content).toContain("simpleString?: string");
			expect(result?.content).toContain("enumField?: string");
			expect(result?.content).toContain("complexField?: Address");
			expect(result?.content).toContain("arrayField?: number[]");
			expect(result?.content).toContain("requiredField: boolean");
			expect(result?.content).toContain("referenceField?: any");
		});
	});

	describe("TypeScriptAPIGenerator options", () => {
		it("should update options correctly", () => {
			generator.setOptions({
				moduleFormat: "cjs",
				generateIndex: false,
			});

			const options = generator.getOptions();
			expect(options.moduleFormat).toBe("cjs");
			expect(options.generateIndex).toBe(false);
			expect(options.namingConvention).toBe("PascalCase");
		});

		it("should update output directory", () => {
			generator.setOutputDir("/new/output/dir");
			const options = generator.getOptions();
			expect(options.outputDir).toBe("/new/output/dir");
		});
	});
});
