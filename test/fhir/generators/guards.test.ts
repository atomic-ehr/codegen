/**
 * Comprehensive Tests for FHIR Type Guards
 * 
 * Tests the enhanced type guard generation system including:
 * - Resource discrimination guards
 * - Complex type guards
 * - Primitive type guards
 * - Choice type discriminators
 * - Bundle entry guards
 * - Performance optimizations
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { 
  generateAllTypeGuards, 
  generateResourceTypeGuards,
  generateComplexTypeGuards,
  generatePrimitiveTypeGuards,
  generateChoiceTypeDiscriminators,
  type GuardGenerationOptions,
  type GuardGenerationContext,
  type TypeGuardResult
} from "../../../src/fhir/generators/typescript/guards";
import type { AnyTypeSchema } from "../../../src/typeschema/lib-types";

// Mock TypeSchemas for testing
const mockPatientSchema: AnyTypeSchema = {
  identifier: {
    name: "Patient",
    url: "http://hl7.org/fhir/StructureDefinition/Patient",
    kind: "resource",
  },
  description: "Information about an individual receiving health care services",
  fields: {
    resourceType: {
      type: "string",
      required: true,
      description: "The type of resource",
    },
    id: {
      type: "id",
      required: false,
      description: "Logical id of this artifact",
    },
    identifier: {
      type: "Identifier",
      required: false,
      array: true,
      description: "An identifier for this patient",
    },
    name: {
      type: "HumanName",
      required: false,
      array: true,
      description: "A name associated with the patient",
    },
    birthDate: {
      type: "date",
      required: false,
      description: "The date of birth for the individual",
    },
    gender: {
      type: "code",
      required: false,
      description: "Administrative gender",
    },
  },
};

const mockObservationSchema: AnyTypeSchema = {
  identifier: {
    name: "Observation",
    url: "http://hl7.org/fhir/StructureDefinition/Observation",
    kind: "resource",
  },
  description: "Measurements and simple assertions made about a patient",
  fields: {
    resourceType: {
      type: "string",
      required: true,
    },
    status: {
      type: "code",
      required: true,
      description: "Status of the observation",
    },
    code: {
      type: "CodeableConcept",
      required: true,
      description: "Type of observation",
    },
    subject: {
      type: "Reference",
      required: false,
      description: "Who/what this is about",
    },
    "value[x]": {
      type: "choice",
      required: false,
      choices: ["Quantity", "string", "boolean", "integer"],
      description: "Actual result",
    },
  },
};

const mockIdentifierSchema: AnyTypeSchema = {
  identifier: {
    name: "Identifier",
    url: "http://hl7.org/fhir/StructureDefinition/Identifier",
    kind: "complex-type",
  },
  description: "An identifier intended for computation",
  fields: {
    use: {
      type: "code",
      required: false,
      description: "usual | official | temp | secondary",
    },
    system: {
      type: "uri",
      required: false,
      description: "The namespace for the identifier value",
    },
    value: {
      type: "string",
      required: false,
      description: "The value that is unique",
    },
  },
};

const mockIdSchema: AnyTypeSchema = {
  identifier: {
    name: "id",
    url: "http://hl7.org/fhir/StructureDefinition/id",
    kind: "primitive-type",
  },
  description: "Any combination of letters, numerals, \"-\" and \".\", with a length limit of 64 characters",
};

const mockStringSchema: AnyTypeSchema = {
  identifier: {
    name: "string",
    url: "http://hl7.org/fhir/StructureDefinition/string",
    kind: "primitive-type",
  },
  description: "A sequence of Unicode characters",
};

const mockBooleanSchema: AnyTypeSchema = {
  identifier: {
    name: "boolean",
    url: "http://hl7.org/fhir/StructureDefinition/boolean",
    kind: "primitive-type",
  },
  description: "Value of \"true\" or \"false\"",
};

describe("FHIR Type Guard Generation", () => {
  let schemas: AnyTypeSchema[];
  let defaultOptions: GuardGenerationOptions;
  let context: GuardGenerationContext;

  beforeEach(() => {
    schemas = [
      mockPatientSchema,
      mockObservationSchema,
      mockIdentifierSchema,
      mockIdSchema,
      mockStringSchema,
      mockBooleanSchema,
    ];
    
    defaultOptions = {
      includeRuntimeValidation: true,
      includeErrorMessages: true,
      treeShakeable: true,
      targetTSVersion: "5.0",
      strict: false,
      includeNullChecks: true,
      verbose: false,
    };

    context = {
      schemas,
      options: defaultOptions,
      guardCache: new Map(),
      processing: new Set(),
    };
  });

  describe("Main Generation Function", () => {
    test("should generate all types of guards", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      expect(result.guardCode).toContain("export function isPatient(");
      expect(result.guardCode).toContain("export function isObservation(");
      expect(result.guardCode).toContain("export function isIdentifier(");
      expect(result.guardCode).toContain("export function isid(");
      expect(result.guardCode).toContain("export function isString(");
      expect(result.guardCode).toContain("export function isBoolean(");
    });

    test("should include common utility guards", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      expect(result.guardCode).toContain("export function isResource(");
      expect(result.guardCode).toContain("export function isResourceOfType(");
      expect(result.guardCode).toContain("export function isBundleEntry(");
    });

    test("should include imports and dependencies", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      expect(result.imports).toContain("Patient");
      expect(result.imports).toContain("Observation");
      expect(result.imports).toContain("Identifier");
    });

    test("should generate proper header with package info", async () => {
      const packageInfo = {
        name: "test-package",
        version: "1.0.0",
        description: "Test package"
      };
      
      const result = await generateAllTypeGuards(schemas, defaultOptions, packageInfo);
      
      expect(result.guardCode).toContain("Generated from: test-package@1.0.0");
      expect(result.guardCode).toContain("Auto-generated type guards");
      expect(result.guardCode).toContain("WARNING: This file is auto-generated");
    });
  });

  describe("Resource Type Guards", () => {
    test("should generate basic resource type guards", () => {
      const result = generateResourceTypeGuards(schemas, context);
      
      expect(result.guardCode).toContain("export function isPatient(");
      expect(result.guardCode).toContain("export function isObservation(");
      expect(result.guardCode).toContain("value is Patient");
      expect(result.guardCode).toContain("value is Observation");
    });

    test("should include resourceType validation", () => {
      const result = generateResourceTypeGuards(schemas, context);
      
      expect(result.guardCode).toContain("obj.resourceType === 'Patient'");
      expect(result.guardCode).toContain("obj.resourceType === 'Observation'");
    });

    test("should generate assertion functions", () => {
      const result = generateResourceTypeGuards(schemas, context);
      
      expect(result.guardCode).toContain("export function assertPatient(");
      expect(result.guardCode).toContain("export function assertObservation(");
      expect(result.guardCode).toContain("asserts value is Patient");
      expect(result.guardCode).toContain("asserts value is Observation");
    });

    test("should include field validation when strict mode enabled", () => {
      const strictContext = { ...context, options: { ...defaultOptions, strict: true } };
      const result = generateResourceTypeGuards(schemas, strictContext);
      
      expect(result.guardCode).toContain("// Required field:");
      expect(result.guardCode).toContain("// Array cardinality check");
    });

    test("should handle resources without fields", () => {
      const resourceWithoutFields = {
        identifier: { name: "TestResource", kind: "resource" as const },
      } as AnyTypeSchema;
      
      const result = generateResourceTypeGuards([resourceWithoutFields], context);
      expect(result.guardCode).toBe(""); // Should not generate guard for invalid schema
    });
  });

  describe("Complex Type Guards", () => {
    test("should generate complex type guards", () => {
      const result = generateComplexTypeGuards(schemas, context);
      
      expect(result.guardCode).toContain("export function isIdentifier(");
      expect(result.guardCode).toContain("value is Identifier");
    });

    test("should include assertion functions for complex types", () => {
      const result = generateComplexTypeGuards(schemas, context);
      
      expect(result.guardCode).toContain("export function assertIdentifier(");
      expect(result.guardCode).toContain("asserts value is Identifier");
    });

    test("should include field validation", () => {
      const result = generateComplexTypeGuards(schemas, context);
      
      expect(result.guardCode).toContain("// No specific field validation required");
      // Or specific field validation if strict mode is enabled
    });
  });

  describe("Primitive Type Guards", () => {
    test("should generate common primitive helpers", () => {
      const result = generatePrimitiveTypeGuards(schemas, context);
      
      expect(result.guardCode).toContain("export function isString(");
      expect(result.guardCode).toContain("export function isNumber(");
      expect(result.guardCode).toContain("export function isBoolean(");
      expect(result.guardCode).toContain("export function isObject(");
      expect(result.guardCode).toContain("export function isArray(");
    });

    test("should generate FHIR-specific primitive validators", () => {
      const result = generatePrimitiveTypeGuards(schemas, context);
      
      expect(result.guardCode).toContain("export function isid(");
      expect(result.guardCode).toContain("ValidationUtils.isValidId(value)");
    });

    test("should include assertion functions for primitives", () => {
      const result = generatePrimitiveTypeGuards(schemas, context);
      
      expect(result.guardCode).toContain("export function assertid(");
      expect(result.guardCode).toContain("export function assertstring(");
      expect(result.guardCode).toContain("asserts value is id");
      expect(result.guardCode).toContain("asserts value is string");
    });

    test("should handle different primitive types correctly", () => {
      const dateSchema: AnyTypeSchema = {
        identifier: { name: "date", kind: "primitive-type" },
      } as AnyTypeSchema;
      
      const uriSchema: AnyTypeSchema = {
        identifier: { name: "uri", kind: "primitive-type" },
      } as AnyTypeSchema;
      
      const result = generatePrimitiveTypeGuards([dateSchema, uriSchema], context);
      
      expect(result.guardCode).toContain("ValidationUtils.isValidDate(value)");
      expect(result.guardCode).toContain("ValidationUtils.isValidUri(value)");
    });
  });

  describe("Choice Type Discriminators", () => {
    test("should generate choice type utilities", () => {
      const result = generateChoiceTypeDiscriminators(schemas, context);
      
      expect(result.guardCode).toContain("export function validateChoiceType");
      expect(result.guardCode).toContain("export function getChoiceType");
    });

    test("should generate specific choice discriminators", () => {
      const result = generateChoiceTypeDiscriminators(schemas, context);
      
      // Should generate discriminator for value[x] in Observation
      expect(result.guardCode).toContain("discriminateObservationValue");
      expect(result.guardCode).toContain("validateObservationValueChoice");
    });

    test("should handle multiple choice types", () => {
      const result = generateChoiceTypeDiscriminators(schemas, context);
      
      expect(result.guardCode).toContain("presentChoices.length === 0");
      expect(result.guardCode).toContain("presentChoices.length > 1");
      expect(result.guardCode).toContain("ValidationErrorCodes.MISSING_CHOICE_VALUE");
      expect(result.guardCode).toContain("ValidationErrorCodes.MULTIPLE_CHOICE_VALUES");
    });

    test("should validate choice values with appropriate validators", () => {
      const result = generateChoiceTypeDiscriminators(schemas, context);
      
      expect(result.guardCode).toContain("isQuantity:");
      expect(result.guardCode).toContain("isString:");
      expect(result.guardCode).toContain("isBoolean:");
      expect(result.guardCode).toContain("isInteger:");
    });
  });

  describe("Common Utility Guards", () => {
    test("should generate isResource utility", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      expect(result.guardCode).toContain("export function isResource(");
      expect(result.guardCode).toContain("'resourceType' in value");
      expect(result.guardCode).toContain("typeof (value as any).resourceType === 'string'");
    });

    test("should generate isResourceOfType utility", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      expect(result.guardCode).toContain("export function isResourceOfType");
      expect(result.guardCode).toContain("isResource(value)");
      expect(result.guardCode).toContain("(value as any).resourceType === resourceType");
    });

    test("should generate isBundleEntry utility", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      expect(result.guardCode).toContain("export function isBundleEntry");
      expect(result.guardCode).toContain("!('resource' in obj)) return true"); // Entry without resource is valid
      expect(result.guardCode).toContain("isResourceOfType(resource, resourceType)");
    });
  });

  describe("Options Handling", () => {
    test("should respect includeRuntimeValidation option", async () => {
      const optionsWithoutRuntime = { ...defaultOptions, includeRuntimeValidation: false };
      const result = await generateAllTypeGuards(schemas, optionsWithoutRuntime);
      
      // Should still generate guards but with less runtime validation
      expect(result.guardCode).toContain("export function isPatient(");
    });

    test("should respect strict mode", async () => {
      const strictOptions = { ...defaultOptions, strict: true };
      const result = await generateAllTypeGuards(schemas, strictOptions);
      
      expect(result.guardCode).toContain("// Required field:");
      expect(result.guardCode).toContain("// Array cardinality check");
    });

    test("should respect includeErrorMessages option", async () => {
      const optionsWithoutMessages = { ...defaultOptions, includeErrorMessages: false };
      const result = await generateAllTypeGuards(schemas, optionsWithoutMessages);
      
      // Should generate guards but with less detailed error handling
      expect(result.guardCode).toContain("export function isPatient(");
    });

    test("should respect treeShakeable option", async () => {
      const nonTreeShakeableOptions = { ...defaultOptions, treeShakeable: false };
      const result = await generateAllTypeGuards(schemas, nonTreeShakeableOptions);
      
      expect(result.guardCode).toContain("export function isPatient(");
    });
  });

  describe("Generated Code Quality", () => {
    test("should generate valid TypeScript syntax", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      // Basic syntax checks
      expect(result.guardCode).not.toContain("undefined,"); // No trailing undefined
      expect(result.guardCode).not.toContain(",,"); // No double commas
      expect(result.guardCode).toMatch(/export function \w+\(/); // Valid function exports
      expect(result.guardCode).toMatch(/value is \w+/); // Valid type predicates
    });

    test("should include proper imports", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      expect(result.imports).toContain("Patient");
      expect(result.imports).toContain("Observation");
      expect(result.imports).toContain("Identifier");
      expect(result.imports.length).toBeGreaterThan(0);
    });

    test("should handle dependencies correctly", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      expect(Array.isArray(result.dependencies)).toBe(true);
    });

    test("should generate consistent code structure", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      // Check for consistent patterns
      const guardFunctions = result.guardCode.match(/export function is\w+\(/g);
      const assertFunctions = result.guardCode.match(/export function assert\w+\(/g);
      
      expect(guardFunctions?.length).toBeGreaterThan(0);
      expect(assertFunctions?.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    test("should handle schemas without identifiers", () => {
      const invalidSchema = { fields: {} } as AnyTypeSchema;
      const result = generateResourceTypeGuards([invalidSchema], context);
      
      expect(result.guardCode).toBe(""); // Should not generate invalid code
      expect(result.imports).toEqual([]);
    });

    test("should handle empty schema list", async () => {
      const result = await generateAllTypeGuards([], defaultOptions);
      
      expect(result.guardCode).toContain("/**"); // Should still have header
      expect(result.imports).toEqual([]);
    });

    test("should handle malformed choice types", () => {
      const schemaWithBadChoice: AnyTypeSchema = {
        identifier: { name: "TestResource", kind: "resource" },
        fields: {
          "bad[x]": {
            type: "choice",
            choices: [], // Empty choices
          },
        },
      } as AnyTypeSchema;
      
      const result = generateChoiceTypeDiscriminators([schemaWithBadChoice], context);
      expect(result.guardCode).toContain("validateChoiceType"); // Should still generate utility functions
    });
  });

  describe("Performance Considerations", () => {
    test("should generate efficient guards", async () => {
      const result = await generateAllTypeGuards(schemas, defaultOptions);
      
      // Should not have redundant checks
      expect(result.guardCode).not.toContain("if (!value || typeof value !== 'object') return false;\n  if (!value || typeof value !== 'object') return false;");
      
      // Should use efficient patterns
      expect(result.guardCode).toContain("typeof value !== 'object'");
      expect(result.guardCode).toContain("value as Record<string, unknown>");
    });

    test("should support tree shaking", async () => {
      const result = await generateAllTypeGuards(schemas, { ...defaultOptions, treeShakeable: true });
      
      // Each function should be independently exportable
      expect(result.guardCode).toMatch(/export function is\w+\(/);
      expect(result.guardCode).toMatch(/export function assert\w+\(/);
    });
  });
});