/**
 * Comprehensive Tests for FHIR Validators
 * 
 * Tests the enhanced validator generation system including:
 * - Individual resource validators
 * - Partial validation for updates
 * - Assertion functions
 * - Composite validation
 * - Performance metrics
 * - Custom validation rules
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { generateValidators, type ValidatorGenerationOptions } from "../../../src/fhir/generators/typescript/validators";
import { 
  ValidationUtils, 
  ValidationErrorCodes, 
  type ValidationResult, 
  type ValidatorOptions 
} from "../../../src/fhir/core/validation";
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
      pattern: "^[A-Za-z0-9\\-\\.]{1,64}$",
    },
    identifier: {
      type: "Identifier",
      required: false,
      array: true,
      minItems: 0,
      maxItems: undefined,
      description: "An identifier for this patient",
    },
    name: {
      type: "HumanName",
      required: false,
      array: true,
      minItems: 0,
      maxItems: undefined,
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
      // valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender"
    },
    managingOrganization: {
      type: "Reference",
      required: false,
      description: "Organization that is the custodian of the patient record",
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
      choices: ["Quantity", "string", "boolean", "integer", "Range"],
      description: "Actual result",
    },
  },
};

const mockComplexTypeSchema: AnyTypeSchema = {
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

const mockPrimitiveSchema: AnyTypeSchema = {
  identifier: {
    name: "id",
    url: "http://hl7.org/fhir/StructureDefinition/id",
    kind: "primitive-type",
  },
  description: "Any combination of letters, numerals, \"-\" and \".\", with a length limit of 64 characters",
  pattern: "^[A-Za-z0-9\\-\\.]{1,64}$",
};

describe("FHIR Validator Generation", () => {
  let schemas: AnyTypeSchema[];
  let defaultOptions: ValidatorGenerationOptions;

  beforeEach(() => {
    schemas = [mockPatientSchema, mockObservationSchema, mockComplexTypeSchema, mockPrimitiveSchema];
    defaultOptions = {
      includeCardinality: true,
      includeTypes: true,
      includeConstraints: true,
      includeInvariants: false,
      validateRequired: true,
      allowAdditional: false,
      strict: false,
      collectMetrics: false,
      maxDepth: 10,
      generateAssertions: true,
      generatePartialValidators: true,
      optimizePerformance: true,
      includeJSDoc: true,
      generateCompositeValidators: true,
    };
  });

  describe("Basic Validator Generation", () => {
    test("should generate validators for all schema types", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      expect(result).toContain("export function validatePatient(");
      expect(result).toContain("export function validateObservation(");
      expect(result).toContain("export function validateIdentifier(");
      expect(result).toContain("export function validateid(");
    });

    test("should include comprehensive validation logic", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      // Check for resourceType validation
      expect(result).toContain('obj.resourceType !== \'Patient\'');
      expect(result).toContain('obj.resourceType !== \'Observation\'');
      
      // Check for required field validation
      expect(result).toContain('ValidationErrorCodes.MISSING_REQUIRED_FIELD');
      expect(result).toContain('ValidationErrorCodes.INVALID_RESOURCE_TYPE');
      
      // Check for cardinality validation
      expect(result).toContain('Array.isArray');
      expect(result).toContain('ValidationErrorCodes.ARRAY_REQUIRED');
    });

    test("should generate helper functions", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      expect(result).toContain("function createValidationResult");
      expect(result).toContain("function validateReference");
      expect(result).toContain("function validateChoiceField");
    });
  });

  describe("Partial Validator Generation", () => {
    test("should generate partial validators when enabled", () => {
      const options = { ...defaultOptions, generatePartialValidators: true };
      const result = generateValidators(schemas, options);
      
      expect(result).toContain("export function validatePartialPatient(");
      expect(result).toContain("export function validatePartialObservation(");
      expect(result).toContain("validateRequired: false"); // Don't enforce required fields
    });

    test("should not generate partial validators when disabled", () => {
      const options = { ...defaultOptions, generatePartialValidators: false };
      const result = generateValidators(schemas, options);
      
      expect(result).not.toContain("validatePartialPatient");
      expect(result).not.toContain("validatePartialObservation");
    });
  });

  describe("Assertion Function Generation", () => {
    test("should generate assertion functions when enabled", () => {
      const options = { ...defaultOptions, generateAssertions: true };
      const result = generateValidators(schemas, options);
      
      expect(result).toContain("export function assertPatient(");
      expect(result).toContain("export function assertObservation(");
      expect(result).toContain("asserts value is Patient");
      expect(result).toContain("asserts value is Observation");
    });

    test("should include error throwing logic in assertions", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      expect(result).toContain("throw new Error");
      expect(result).toContain("validationErrors");
      expect(result).toContain("validationWarnings");
    });
  });

  describe("JSDoc Generation", () => {
    test("should generate JSDoc when enabled", () => {
      const options = { ...defaultOptions, includeJSDoc: true };
      const result = generateValidators(schemas, options);
      
      expect(result).toContain("/**");
      expect(result).toContain("* @param value");
      expect(result).toContain("* @param options");
      expect(result).toContain("* @returns");
      expect(result).toContain("* @example");
    });

    test("should not generate JSDoc when disabled", () => {
      const options = { ...defaultOptions, includeJSDoc: false };
      const result = generateValidators(schemas, options);
      
      // Should still have basic comments but not full JSDoc
      expect(result).not.toContain("* @param value");
      expect(result).not.toContain("* @example");
    });
  });

  describe("Composite Validator Generation", () => {
    test("should generate composite validator class", () => {
      const options = { ...defaultOptions, generateCompositeValidators: true };
      const result = generateValidators(schemas, options);
      
      expect(result).toContain("export class FHIRValidator");
      expect(result).toContain("export class CompositeValidator");
      expect(result).toContain("registerValidator");
      expect(result).toContain("getSupportedResourceTypes");
    });

    test("should generate validator factory functions", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      expect(result).toContain("export function createValidator");
      expect(result).toContain("export const strictValidator");
      expect(result).toContain("export const lenientValidator");
      expect(result).toContain("export function validateAndTransform");
    });
  });

  describe("Choice Type Validation", () => {
    test("should handle choice type validation", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      // Should contain choice validation for value[x] in Observation
      expect(result).toContain("validateChoiceField");
      expect(result).toContain("ValidationErrorCodes.MISSING_CHOICE_VALUE");
      expect(result).toContain("ValidationErrorCodes.MULTIPLE_CHOICE_VALUES");
    });
  });

  describe("Performance Metrics", () => {
    test("should include metrics collection when enabled", () => {
      const options = { ...defaultOptions, collectMetrics: true };
      const result = generateValidators(schemas, options);
      
      expect(result).toContain("performance.now()");
      expect(result).toContain("fieldsValidated");
      expect(result).toContain("metrics:");
    });

    test("should not include metrics when disabled", () => {
      const options = { ...defaultOptions, collectMetrics: false };
      const result = generateValidators(schemas, options);
      
      expect(result).not.toContain("performance.now()");
    });
  });

  describe("Validation Options", () => {
    test("should respect includeCardinality option", () => {
      const options = { ...defaultOptions, includeCardinality: false };
      const result = generateValidators(schemas, options);
      
      expect(result).not.toContain("Array.isArray");
      expect(result).not.toContain("ValidationErrorCodes.ARRAY_REQUIRED");
    });

    test("should respect includeTypes option", () => {
      const options = { ...defaultOptions, includeTypes: false };
      const result = generateValidators(schemas, options);
      
      // Should still have basic validation but not detailed type checking
      expect(result).toContain("validatePatient"); // Function should exist
      // But less detailed type validation
    });

    test("should respect strict mode", () => {
      const options = { ...defaultOptions, strict: true };
      const result = generateValidators(schemas, options);
      
      expect(result).toContain("opts.strict");
      expect(result).toContain("warnings.length === 0");
    });
  });

  describe("Error Code Usage", () => {
    test("should use proper error codes", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      expect(result).toContain("ValidationErrorCodes.INVALID_TYPE");
      expect(result).toContain("ValidationErrorCodes.MISSING_REQUIRED_FIELD");
      expect(result).toContain("ValidationErrorCodes.INVALID_RESOURCE_TYPE");
      expect(result).toContain("ValidationErrorCodes.ARRAY_REQUIRED");
      expect(result).toContain("ValidationErrorCodes.PATTERN_MISMATCH");
    });
  });

  describe("Reference Validation", () => {
    test("should generate reference validation", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      expect(result).toContain("validateReference");
      expect(result).toContain("ValidationErrorCodes.INVALID_REFERENCE");
    });
  });

  describe("Generated Code Quality", () => {
    test("should generate valid TypeScript syntax", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      // Basic syntax checks
      expect(result).not.toContain("undefined,}"); // No trailing undefined in objects
      expect(result).not.toContain("undefined,]"); // No trailing undefined in arrays
      expect(result).not.toContain(",,"); // No double commas
      expect(result).toMatch(/export function \w+\(/); // Valid function exports
      expect(result).toMatch(/export class \w+/); // Valid class exports
    });

    test("should include proper header and metadata", () => {
      const result = generateValidators(schemas, defaultOptions);
      
      expect(result).toContain("FHIR Validation Functions");
      expect(result).toContain("Auto-generated");
      expect(result).toContain("WARNING: This file is auto-generated");
      expect(result).toContain("Generated at:");
    });
  });
});

describe("ValidationUtils", () => {
  describe("isValidId", () => {
    test("should validate FHIR ID format", () => {
      expect(ValidationUtils.isValidId("patient-123")).toBe(true);
      expect(ValidationUtils.isValidId("Patient.123")).toBe(true);
      expect(ValidationUtils.isValidId("123")).toBe(true);
      
      expect(ValidationUtils.isValidId("")).toBe(false);
      expect(ValidationUtils.isValidId("a".repeat(65))).toBe(false); // Too long
      expect(ValidationUtils.isValidId("patient@123")).toBe(false); // Invalid character
      expect(ValidationUtils.isValidId(123)).toBe(false); // Not a string
    });
  });

  describe("isValidDate", () => {
    test("should validate FHIR date format", () => {
      expect(ValidationUtils.isValidDate("2023")).toBe(true);
      expect(ValidationUtils.isValidDate("2023-12")).toBe(true);
      expect(ValidationUtils.isValidDate("2023-12-25")).toBe(true);
      
      expect(ValidationUtils.isValidDate("23-12-25")).toBe(false); // Wrong year format
      expect(ValidationUtils.isValidDate("2023-13-25")).toBe(false); // Invalid month
      expect(ValidationUtils.isValidDate("2023-12-32")).toBe(false); // Invalid day
      expect(ValidationUtils.isValidDate("not-a-date")).toBe(false);
    });
  });

  describe("isValidDateTime", () => {
    test("should validate FHIR dateTime format", () => {
      expect(ValidationUtils.isValidDateTime("2023-12-25T10:30:00Z")).toBe(true);
      expect(ValidationUtils.isValidDateTime("2023-12-25T10:30:00+05:00")).toBe(true);
      expect(ValidationUtils.isValidDateTime("2023-12-25T10:30:00.123Z")).toBe(true);
      
      expect(ValidationUtils.isValidDateTime("2023-12-25")).toBe(false); // Not dateTime
      expect(ValidationUtils.isValidDateTime("2023-12-25T25:30:00Z")).toBe(false); // Invalid hour
      expect(ValidationUtils.isValidDateTime("not-a-datetime")).toBe(false);
    });
  });

  describe("isValidUri", () => {
    test("should validate URI format", () => {
      expect(ValidationUtils.isValidUri("http://example.com")).toBe(true);
      expect(ValidationUtils.isValidUri("https://hl7.org/fhir")).toBe(true);
      expect(ValidationUtils.isValidUri("urn:uuid:12345")).toBe(true);
      expect(ValidationUtils.isValidUri("/relative/path")).toBe(true);
      
      expect(ValidationUtils.isValidUri("")).toBe(false);
      expect(ValidationUtils.isValidUri("not a uri")).toBe(false);
    });
  });

  describe("matchesPattern", () => {
    test("should validate pattern matching", () => {
      expect(ValidationUtils.matchesPattern("ABC123", "^[A-Z0-9]+$")).toBe(true);
      expect(ValidationUtils.matchesPattern("abc", "^[A-Z0-9]+$")).toBe(false);
      expect(ValidationUtils.matchesPattern(123, "^[A-Z0-9]+$")).toBe(false); // Not a string
    });
  });

  describe("getTypeName", () => {
    test("should return correct type names", () => {
      expect(ValidationUtils.getTypeName("string")).toBe("string");
      expect(ValidationUtils.getTypeName(123)).toBe("number");
      expect(ValidationUtils.getTypeName(true)).toBe("boolean");
      expect(ValidationUtils.getTypeName(null)).toBe("null");
      expect(ValidationUtils.getTypeName(undefined)).toBe("undefined");
      expect(ValidationUtils.getTypeName([])).toBe("array");
      expect(ValidationUtils.getTypeName({})).toBe("object");
    });
  });

  describe("formatPath", () => {
    test("should format paths correctly", () => {
      expect(ValidationUtils.formatPath([])).toBe("root");
      expect(ValidationUtils.formatPath(["patient"])).toBe("patient");
      expect(ValidationUtils.formatPath(["patient", "name", "0"])).toBe("patient.name.0");
    });
  });
});