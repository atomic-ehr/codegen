/**
 * Tests for Builder Pattern Generation
 * 
 * Tests the comprehensive builder generation functionality for FHIR resources
 */

import { describe, test, expect } from "bun:test";
import { 
	generateBuilders, 
	type BuilderGenerationOptions, 
	DEFAULT_BUILDER_OPTIONS 
} from "../../../src/fhir/generators/typescript/builders";
import type { AnyTypeSchema } from "../../../src/typeschema/lib-types";

describe("Builder Pattern Generation", () => {
	// Sample schema for testing
	const samplePatientSchema: AnyTypeSchema = {
		identifier: {
			kind: "resource",
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			name: "Patient",
			url: "http://hl7.org/fhir/StructureDefinition/Patient"
		},
		fields: {
			resourceType: {
				required: true,
				enum: ["Patient"]
			},
			id: {
				type: { kind: "primitive-type", package: "hl7.fhir.r4.core", version: "4.0.1", name: "id", url: "http://hl7.org/fhir/StructureDefinition/id" },
				description: "Logical id of this artifact"
			},
			name: {
				array: true,
				type: { kind: "complex-type", package: "hl7.fhir.r4.core", version: "4.0.1", name: "HumanName", url: "http://hl7.org/fhir/StructureDefinition/HumanName" },
				description: "A name associated with the individual"
			},
			birthDate: {
				type: { kind: "primitive-type", package: "hl7.fhir.r4.core", version: "4.0.1", name: "date", url: "http://hl7.org/fhir/StructureDefinition/date" },
				description: "The date of birth for the individual"
			},
			gender: {
				enum: ["male", "female", "other", "unknown"],
				description: "Administrative gender"
			},
			active: {
				type: { kind: "primitive-type", package: "hl7.fhir.r4.core", version: "4.0.1", name: "boolean", url: "http://hl7.org/fhir/StructureDefinition/boolean" },
				description: "Whether this patient record is in active use"
			}
		}
	};

	describe("Basic Builder Generation", () => {
		test("should generate builder with default options", () => {
			const result = generateBuilders([samplePatientSchema]);
			
			expect(result).toContain("PatientBuilder");
			expect(result).toContain("export class PatientBuilder");
			expect(result).toContain("withResourceType");
			expect(result).toContain("withId");
			expect(result).toContain("withName");
			expect(result).toContain("withBirthDate");
			expect(result).toContain("withGender");
			expect(result).toContain("withActive");
			expect(result).toContain("build()");
		});

		test("should generate builder with JSDoc comments", () => {
			const result = generateBuilders([samplePatientSchema], { includeJSDoc: true });
			
			expect(result).toContain("* Fluent builder for Patient FHIR resource");
			expect(result).toContain("* Set id - Logical id of this artifact");
			expect(result).toContain("* Set name - A name associated with the individual");
			expect(result).toContain("* @param");
			expect(result).toContain("* @returns This builder instance for method chaining");
		});

		test("should generate builder without JSDoc when disabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeJSDoc: false });
			
			expect(result).not.toContain("* Fluent builder for Patient FHIR resource");
			expect(result).not.toContain("@param");
		});
	});

	describe("Fluent API Features", () => {
		test("should generate fluent methods that return 'this'", () => {
			const result = generateBuilders([samplePatientSchema], { fluent: true });
			
			expect(result).toContain("): this {");
			expect(result).toContain("return this;");
		});

		test("should generate non-fluent methods when disabled", () => {
			const result = generateBuilders([samplePatientSchema], { fluent: false });
			
			expect(result).toContain("): void {");
			expect(result).not.toContain("return this;");
		});
	});

	describe("Array Field Helpers", () => {
		test("should generate array helper methods for array fields", () => {
			const result = generateBuilders([samplePatientSchema], { generateArrayHelpers: true });
			
			// Should generate add and clear methods for the 'name' array field
			expect(result).toContain("addNameItem(");
			expect(result).toContain("clearName()");
			expect(result).toContain("this._name = [];");
			expect(result).toContain("this._name.push(nameItem)");
		});

		test("should not generate array helpers when disabled", () => {
			const result = generateBuilders([samplePatientSchema], { generateArrayHelpers: false });
			
			expect(result).not.toContain("addNameItem(");
			expect(result).not.toContain("clearName()");
		});
	});

	describe("Validation Features", () => {
		test("should generate validation methods when enabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeValidation: true });
			
			expect(result).toContain("validate(): { isValid: boolean; errors: string[] }");
			expect(result).toContain("const errors: string[] = [];");
			expect(result).toContain("Field \"resourceType\" is required");
		});

		test("should not generate validation when disabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeValidation: false });
			
			expect(result).not.toContain("validate(): { isValid: boolean; errors: string[] }");
		});
	});

	describe("Build Methods", () => {
		test("should generate build method", () => {
			const result = generateBuilders([samplePatientSchema]);
			
			expect(result).toContain("build(): Patient");
			expect(result).toContain("const result: Patient = {");
		});

		test("should generate buildPartial method when enabled", () => {
			const result = generateBuilders([samplePatientSchema], { supportPartialBuild: true });
			
			expect(result).toContain("buildPartial(): Partial<Patient>");
		});

		test("should not generate buildPartial when disabled", () => {
			const result = generateBuilders([samplePatientSchema], { supportPartialBuild: false });
			
			expect(result).not.toContain("buildPartial(): Partial<Patient>");
		});
	});

	describe("Factory Methods and Functions", () => {
		test("should generate static factory methods when enabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeFactoryMethods: true });
			
			expect(result).toContain("static create(");
			expect(result).toContain("static from(");
			expect(result).toContain("static empty()");
		});

		test("should generate factory functions when enabled", () => {
			const result = generateBuilders([samplePatientSchema], { generateFactories: true });
			
			expect(result).toContain("export function createPatient(");
			expect(result).toContain("return new PatientBuilder(");
		});

		test("should not generate factories when disabled", () => {
			const result = generateBuilders([samplePatientSchema], { generateFactories: false });
			
			expect(result).not.toContain("export function createPatient(");
		});
	});

	describe("Helper Methods", () => {
		test("should generate helper methods when enabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeHelperMethods: true });
			
			expect(result).toContain("clone(): PatientBuilder");
			expect(result).toContain("reset(): this");
			expect(result).toContain("merge(other: Partial<Patient>): this");
		});

		test("should not generate helper methods when disabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeHelperMethods: false });
			
			expect(result).not.toContain("clone(): PatientBuilder");
			expect(result).not.toContain("reset(): this");
			expect(result).not.toContain("merge(other: Partial<Patient>): this");
		});
	});

	describe("Interfaces", () => {
		test("should generate builder interfaces when enabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeInterfaces: true });
			
			expect(result).toContain("export interface IPatientBuilder");
			expect(result).toContain("build(): Patient;");
		});

		test("should not generate interfaces when disabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeInterfaces: false });
			
			expect(result).not.toContain("export interface IPatientBuilder");
		});
	});

	describe("Type Guards and Utilities", () => {
		test("should generate utility functions when enabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeTypeGuards: true });
			
			expect(result).toContain("export function isBuilder<T>(");
			expect(result).toContain("Utility functions for builder pattern");
		});

		test("should not generate utilities when disabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeTypeGuards: false });
			
			expect(result).not.toContain("export function isBuilder<T>(");
		});
	});

	describe("Helper Types", () => {
		test("should generate helper types", () => {
			const result = generateBuilders([samplePatientSchema]);
			
			expect(result).toContain("export type BuilderOptions");
			expect(result).toContain("export interface IBuilder<T>");
			expect(result).toContain("Enhanced helper types for builders");
		});

		test("should include validation types when validation enabled", () => {
			const result = generateBuilders([samplePatientSchema], { includeValidation: true });
			
			expect(result).toContain("export interface ValidationResult");
			expect(result).toContain("isValid: boolean;");
			expect(result).toContain("errors: string[];");
		});
	});

	describe("Edge Cases", () => {
		test("should handle empty schemas array", () => {
			const result = generateBuilders([]);
			
			expect(result).toContain("Enhanced helper types for builders");
			expect(result).not.toContain("export class");
		});

		test("should handle schema without fields", () => {
			const schemaWithoutFields = {
				identifier: {
					kind: "primitive-type" as const,
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "string",
					url: "http://hl7.org/fhir/StructureDefinition/string"
				}
			};
			
			const result = generateBuilders([schemaWithoutFields]);
			expect(result).not.toContain("export class stringBuilder");
		});
	});

	describe("Code Quality", () => {
		test("should generate valid TypeScript syntax", () => {
			const result = generateBuilders([samplePatientSchema]);
			
			// Ensure proper indentation structure
			expect(result).toMatch(/class PatientBuilder \{/);
			expect(result).toMatch(/\t.*private _/);
			expect(result).toMatch(/\t.*constructor\(/);
			
			// Check for proper method structure
			expect(result).toMatch(/with\w+\([^)]*\): this \{/);
			expect(result).toMatch(/build\(\): Patient \{/);
		});

		test("should include proper file header", () => {
			const result = generateBuilders([samplePatientSchema]);
			
			expect(result).toContain("FHIR Builder Classes");
			expect(result).toContain("Auto-generated fluent builder classes");
			expect(result).toContain("WARNING: This file is auto-generated. Do not modify manually.");
			expect(result).toContain("/* eslint-disable */");
		});

		test("should use consistent naming conventions", () => {
			const result = generateBuilders([samplePatientSchema]);
			
			// Class names should be PascalCase
			expect(result).toContain("PatientBuilder");
			expect(result).toContain("IPatientBuilder");
			
			// Method names should use 'with' prefix
			expect(result).toContain("withResourceType");
			expect(result).toContain("withId");
			expect(result).toContain("withName");
		});
	});

	describe("Default Options", () => {
		test("DEFAULT_BUILDER_OPTIONS should have expected values", () => {
			expect(DEFAULT_BUILDER_OPTIONS.includeValidation).toBe(true);
			expect(DEFAULT_BUILDER_OPTIONS.fluent).toBe(true);
			expect(DEFAULT_BUILDER_OPTIONS.includeJSDoc).toBe(true);
			expect(DEFAULT_BUILDER_OPTIONS.generateFactories).toBe(true);
			expect(DEFAULT_BUILDER_OPTIONS.includeHelperMethods).toBe(true);
			expect(DEFAULT_BUILDER_OPTIONS.supportPartialBuild).toBe(true);
		});

		test("should use default options when none provided", () => {
			const result = generateBuilders([samplePatientSchema]);
			
			// Should include features that are enabled by default
			expect(result).toContain("validate(): { isValid: boolean; errors: string[] }");
			expect(result).toContain("buildPartial(): Partial<Patient>");
			expect(result).toContain("clone(): PatientBuilder");
			expect(result).toContain("export function createPatient(");
		});
	});
});