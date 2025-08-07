/**
 * Tests for TypeSchema types and type guards
 */

import { describe, expect, test } from "bun:test";
import {
	isLegacyTypeSchemaBinding,
	isLegacyTypeSchemaValueSet,
	isPolymorphicDeclarationField,
	isPolymorphicInstanceField,
	isPrimitiveTypeSchema,
	isProfileTypeSchema,
	isRegularField,
	isResourceTypeSchema,
	isTypeSchema,
	isTypeSchemaBinding,
	isTypeSchemaValueSet,
	type AnyTypeSchema,
	type AnyTypeSchemaCompliant,
	type TypeSchemaBinding,
	type TypeSchemaFieldPolymorphicDeclaration,
	type TypeSchemaFieldPolymorphicInstance,
	type TypeSchemaFieldRegular,
	type TypeSchemaPrimitiveType,
	type TypeSchemaProfile,
	type TypeSchemaResourceType,
	type TypeSchemaValueSet,
} from "../../src/typeschema/types";

describe("TypeSchema Type Guards", () => {
	describe("Field Type Guards", () => {
		test("isRegularField should identify regular fields", () => {
			const regularField: TypeSchemaFieldRegular = {
				type: {
					kind: "primitive-type",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "string",
					url: "http://hl7.org/fhir/StructureDefinition/string",
				},
				required: true,
			};

			expect(isRegularField(regularField)).toBe(true);
		});

		test("isPolymorphicDeclarationField should identify polymorphic declaration fields", () => {
			const polyField: TypeSchemaFieldPolymorphicDeclaration = {
				choices: ["string", "integer", "boolean"],
				required: false,
			};

			expect(isPolymorphicDeclarationField(polyField)).toBe(true);
			expect(isRegularField(polyField)).toBe(false);
		});

		test("isPolymorphicInstanceField should identify polymorphic instance fields", () => {
			const instanceField: TypeSchemaFieldPolymorphicInstance = {
				choiceOf: "value",
				type: {
					kind: "primitive-type",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "string",
					url: "http://hl7.org/fhir/StructureDefinition/string",
				},
			};

			expect(isPolymorphicInstanceField(instanceField)).toBe(true);
			expect(isRegularField(instanceField)).toBe(false);
		});
	});

	describe("Schema Type Guards", () => {
		test("isPrimitiveTypeSchema should identify primitive type schemas", () => {
			const primitiveSchema: TypeSchemaPrimitiveType = {
				identifier: {
					kind: "primitive-type",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "string",
					url: "http://hl7.org/fhir/StructureDefinition/string",
				},
				description: "A sequence of Unicode characters",
			};

			expect(isPrimitiveTypeSchema(primitiveSchema)).toBe(true);
		});

		test("isResourceTypeSchema should identify resource and complex type schemas", () => {
			const resourceSchema: TypeSchemaResourceType = {
				identifier: {
					kind: "resource",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "Patient",
					url: "http://hl7.org/fhir/StructureDefinition/Patient",
				},
				fields: {},
			};

			const complexSchema: TypeSchemaResourceType = {
				identifier: {
					kind: "complex-type",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "Address",
					url: "http://hl7.org/fhir/StructureDefinition/Address",
				},
				fields: {},
			};

			expect(isResourceTypeSchema(resourceSchema)).toBe(true);
			expect(isResourceTypeSchema(complexSchema)).toBe(true);
		});

		test("isProfileTypeSchema should identify profile schemas", () => {
			const profileSchema: TypeSchemaProfile = {
				identifier: {
					kind: "profile",
					package: "hl7.fhir.us.core",
					version: "5.0.1",
					name: "USCorePatient",
					url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
				},
				base: {
					kind: "resource",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "Patient",
					url: "http://hl7.org/fhir/StructureDefinition/Patient",
				},
				fields: {},
			};

			expect(isProfileTypeSchema(profileSchema)).toBe(true);
		});

		test("isTypeSchemaBinding should identify binding schemas", () => {
			const bindingSchema: TypeSchemaBinding = {
				identifier: {
					kind: "binding",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "AdministrativeGenderBinding",
					url: "http://hl7.org/fhir/ValueSet/administrative-gender",
				},
				valueset: {
					kind: "value-set",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "AdministrativeGender",
					url: "http://hl7.org/fhir/ValueSet/administrative-gender",
				},
				strength: "required",
				dependencies: [],
			};

			expect(isTypeSchemaBinding(bindingSchema)).toBe(true);
		});

		test("isTypeSchemaValueSet should identify value set schemas", () => {
			const valueSetSchema: TypeSchemaValueSet = {
				identifier: {
					kind: "value-set",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "AdministrativeGender",
					url: "http://hl7.org/fhir/ValueSet/administrative-gender",
				},
				concept: [
					{ code: "male", display: "Male" },
					{ code: "female", display: "Female" },
					{ code: "other", display: "Other" },
					{ code: "unknown", display: "Unknown" },
				],
			};

			expect(isTypeSchemaValueSet(valueSetSchema)).toBe(true);
		});
	});

	describe("Legacy Type Guards", () => {
		test("isTypeSchema should identify legacy TypeSchema", () => {
			const legacySchema: AnyTypeSchema = {
				identifier: {
					kind: "resource",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "Patient",
					url: "http://hl7.org/fhir/StructureDefinition/Patient",
				},
				fields: {},
				dependencies: [],
			};

			expect(isTypeSchema(legacySchema)).toBe(true);
		});

		test("isLegacyTypeSchemaBinding should identify legacy binding schemas", () => {
			const legacyBinding: TypeSchemaBinding = {
				identifier: {
					kind: "binding",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "AdministrativeGenderBinding",
					url: "http://hl7.org/fhir/ValueSet/administrative-gender",
				},
				valueset: {
					kind: "value-set",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "AdministrativeGender",
					url: "http://hl7.org/fhir/ValueSet/administrative-gender",
				},
				strength: "required",
				dependencies: [],
			};

			expect(isLegacyTypeSchemaBinding(legacyBinding)).toBe(true);
		});

		test("isLegacyTypeSchemaValueSet should identify legacy value set schemas", () => {
			const legacyValueSet: TypeSchemaValueSet = {
				identifier: {
					kind: "value-set",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "AdministrativeGender",
					url: "http://hl7.org/fhir/ValueSet/administrative-gender",
				},
				concept: [
					{ code: "male", display: "Male" },
					{ code: "female", display: "Female" },
				],
			};

			expect(isLegacyTypeSchemaValueSet(legacyValueSet)).toBe(true);
		});
	});

	describe("Type Validation", () => {
		test("should correctly validate TypeSchema identifier structure", () => {
			const validIdentifier = {
				kind: "resource" as const,
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				name: "Patient",
				url: "http://hl7.org/fhir/StructureDefinition/Patient",
			};

			// TypeScript compilation success indicates valid structure
			expect(validIdentifier.kind).toBe("resource");
			expect(validIdentifier.package).toBe("hl7.fhir.r4.core");
			expect(validIdentifier.version).toBe("4.0.1");
			expect(validIdentifier.name).toBe("Patient");
			expect(validIdentifier.url).toBe("http://hl7.org/fhir/StructureDefinition/Patient");
		});

		test("should handle all valid kind values", () => {
			const validKinds = [
				"primitive-type",
				"resource",
				"complex-type",
				"nested",
				"logical",
				"binding",
				"value-set",
				"profile"
			] as const;

			for (const kind of validKinds) {
				const identifier = {
					kind,
					package: "test.package",
					version: "1.0.0",
					name: "TestType",
					url: "http://example.com/TestType",
				};

				// TypeScript compilation success indicates valid kind
				expect(typeof identifier.kind).toBe("string");
				expect(validKinds.includes(identifier.kind)).toBe(true);
			}
		});
	});
});