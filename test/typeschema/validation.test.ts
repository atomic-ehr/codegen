/**
 * TypeSchema Validation Tests
 *
 * Tests the JSON schema validation functionality
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { 
  validateTypeSchema, 
  validateTypeSchemas,
  validateTypeSchemaOrThrow,
  isValidatorAvailable 
} from "../../src/lib/validation/typeschema-validator";
import type { 
  TypeSchemaPrimitiveType, 
  TypeSchemaResourceType,
  TypeSchemaProfile,
  TypeSchemaValueSet,
  TypeSchemaBinding 
} from "../../src/lib/typeschema/types";

describe("TypeSchema Validation", () => {
  beforeAll(async () => {
    const available = await isValidatorAvailable();
    if (!available) {
      throw new Error("TypeSchema validator is not available - JSON schema file missing");
    }
  });

  test("validates a valid primitive type schema", async () => {
    const primitiveType: TypeSchemaPrimitiveType = {
      identifier: {
        kind: "primitive-type",
        package: "hl7.fhir.r4.core",
        version: "4.0.1",
        name: "string",
        url: "http://hl7.org/fhir/StructureDefinition/string"
      },
      description: "A sequence of Unicode characters"
    };

    const result = await validateTypeSchema(primitiveType);
    if (!result.valid) {
      console.log("Primitive type validation errors:", result.errors);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test("validates a valid resource type schema", async () => {
    const resourceType: TypeSchemaResourceType = {
      identifier: {
        kind: "resource",
        package: "hl7.fhir.r4.core", 
        version: "4.0.1",
        name: "Patient",
        url: "http://hl7.org/fhir/StructureDefinition/Patient"
      },
      base: {
        kind: "resource",
        package: "hl7.fhir.r4.core",
        version: "4.0.1", 
        name: "DomainResource",
        url: "http://hl7.org/fhir/StructureDefinition/DomainResource"
      },
      description: "Information about an individual or animal receiving care",
      fields: {
        "active": {
          type: {
            kind: "primitive-type",
            package: "hl7.fhir.r4.core",
            version: "4.0.1",
            name: "boolean",
            url: "http://hl7.org/fhir/StructureDefinition/boolean"
          },
          required: false,
          array: false
        }
      }
    };

    const result = await validateTypeSchema(resourceType);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test("validates a valid value set schema", async () => {
    const valueSet: TypeSchemaValueSet = {
      identifier: {
        kind: "value-set",
        package: "hl7.fhir.r4.core",
        version: "4.0.1", 
        name: "administrative-gender",
        url: "http://hl7.org/fhir/ValueSet/administrative-gender"
      },
      description: "The gender of a person used for administrative purposes",
      concept: [
        { code: "male", display: "Male" },
        { code: "female", display: "Female" },
        { code: "other", display: "Other" },
        { code: "unknown", display: "Unknown" }
      ]
    };

    const result = await validateTypeSchema(valueSet);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test("validates a valid profile schema", async () => {
    const profile: TypeSchemaProfile = {
      identifier: {
        kind: "profile",
        package: "us.nlm.vsac",
        version: "1.0.0",
        name: "USCorePatient",
        url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"
      },
      base: {
        kind: "resource",
        package: "hl7.fhir.r4.core",
        version: "4.0.1",
        name: "Patient", 
        url: "http://hl7.org/fhir/StructureDefinition/Patient"
      },
      description: "US Core Patient Profile",
      fields: {
        "race": {
          type: {
            kind: "complex-type",
            package: "us.nlm.vsac",
            version: "1.0.0",
            name: "Extension",
            url: "http://hl7.org/fhir/StructureDefinition/Extension"
          },
          required: false,
          array: true
        }
      },
      constraints: {
        "race.extension": {
          mustSupport: true
        }
      }
    };

    const result = await validateTypeSchema(profile);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test("validates a valid binding schema", async () => {
    const binding: TypeSchemaBinding = {
      identifier: {
        kind: "binding",
        package: "hl7.fhir.r4.core",
        version: "4.0.1",
        name: "AdministrativeGender", 
        url: "http://hl7.org/fhir/ValueSet/administrative-gender"
      },
      valueset: {
        kind: "value-set",
        package: "hl7.fhir.r4.core",
        version: "4.0.1",
        name: "administrative-gender",
        url: "http://hl7.org/fhir/ValueSet/administrative-gender"
      },
      strength: "required",
      enum: ["male", "female", "other", "unknown"]
    };

    const result = await validateTypeSchema(binding);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test("rejects schema with invalid URL pattern", async () => {
    const invalidSchema: TypeSchemaPrimitiveType = {
      identifier: {
        kind: "primitive-type",
        package: "hl7.fhir.r4.core",
        version: "4.0.1",
        name: "string",
        url: "invalid-url" // Invalid URL pattern
      }
    };

    const result = await validateTypeSchema(invalidSchema);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain("url");
  });

  test("rejects schema with missing required fields", async () => {
    const invalidSchema = {
      identifier: {
        kind: "primitive-type",
        package: "hl7.fhir.r4.core",
        version: "4.0.1",
        name: "string"
        // Missing required 'url' field
      }
    };

    const result = await validateTypeSchema(invalidSchema as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  test("validates multiple schemas", async () => {
    const schemas = [
      {
        identifier: {
          kind: "primitive-type",
          package: "hl7.fhir.r4.core", 
          version: "4.0.1",
          name: "string",
          url: "http://hl7.org/fhir/StructureDefinition/string"
        }
      } as TypeSchemaPrimitiveType,
      {
        identifier: {
          kind: "primitive-type",
          package: "hl7.fhir.r4.core",
          version: "4.0.1", 
          name: "boolean",
          url: "invalid-url" // This one should fail
        }
      } as TypeSchemaPrimitiveType
    ];

    const results = await validateTypeSchemas(schemas);
    
    expect(results).toHaveLength(2);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[1].errors).toBeDefined();
  });

  test("validateTypeSchemaOrThrow throws on invalid schema", async () => {
    const invalidSchema: TypeSchemaPrimitiveType = {
      identifier: {
        kind: "primitive-type",
        package: "hl7.fhir.r4.core",
        version: "4.0.1",
        name: "string",
        url: "invalid-url"
      }
    };

    await expect(validateTypeSchemaOrThrow(invalidSchema)).rejects.toThrow(/validation failed/);
  });

  test("validateTypeSchemaOrThrow succeeds on valid schema", async () => {
    const validSchema: TypeSchemaPrimitiveType = {
      identifier: {
        kind: "primitive-type",
        package: "hl7.fhir.r4.core",
        version: "4.0.1",
        name: "string", 
        url: "http://hl7.org/fhir/StructureDefinition/string"
      }
    };

    await expect(async () => {
      await validateTypeSchemaOrThrow(validSchema);
    }).not.toThrow();
  });
});