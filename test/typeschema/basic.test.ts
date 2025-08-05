/**
 * Basic tests for TypeSchema transformation
 */

import { describe, test, expect } from "bun:test";
import { CanonicalManager } from '@atomic-ehr/fhir-canonical-manager';
import { translate } from '@atomic-ehr/fhirschema';
import { transformFHIRSchema } from '../../src/typeschema';
import * as fs from 'fs/promises';
import * as path from 'path';

describe("TypeSchema Basic Tests", () => {
  test("Transform string primitive type", async () => {
    // Read the string FHIR Schema
    const fhirSchemaPath = path.join(__dirname, 'golden/element/element.fs.json');
    const fhirSchema = JSON.parse(await fs.readFile(fhirSchemaPath, 'utf-8'));
    
    // Create a mock manager (we don't need package loading for this test)
    const manager = {
      resolveSync: (url: string) => {
        // Return undefined for base types we can't resolve
        return undefined;
      },
      resolve: async (url: string) => {
        return undefined;
      }
    } as any;
    
    // Transform to TypeSchema
    const results = await transformFHIRSchema(fhirSchema, manager);
    
    // Should have one result (no bindings in Element)
    expect(results.length).toBe(1);
    
    const typeSchema = results[0];
    expect(typeSchema.identifier.kind).toBe('complex-type');
    expect(typeSchema.identifier.name).toBe('Element');
    expect(typeSchema.identifier.url).toBe('http://hl7.org/fhir/StructureDefinition/Element');
  });

  test("Transform with actual packages", async () => {
    // Skip if running in CI or no network
    if (process.env.CI || process.env.SKIP_NETWORK_TESTS) {
      console.log("Skipping network test");
      return;
    }

    // Create a real canonical manager
    const manager = CanonicalManager({
      packages: ["hl7.fhir.r4.core@4.0.1"],
      workingDir: "tmp/test-fhir"
    });

    console.log("Initializing canonical manager...");
    await manager.init();

    // Load Patient StructureDefinition
    console.log("Loading Patient StructureDefinition...");
    const patientSD = await manager.resolve('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(patientSD).toBeDefined();
    expect(patientSD.resourceType).toBe('StructureDefinition');

    // Convert to FHIRSchema
    console.log("Converting to FHIRSchema...");
    const fhirSchema = translate(patientSD);
    expect(fhirSchema).toBeDefined();
    expect(fhirSchema.name).toBe('Patient');

    // Transform to TypeSchema
    console.log("Transforming to TypeSchema...");
    const results = await transformFHIRSchema(fhirSchema, manager);
    
    // Should have multiple results (Patient + bindings)
    expect(results.length).toBeGreaterThan(1);
    
    const patientSchema = results[0];
    expect(patientSchema.identifier.kind).toBe('resource');
    expect(patientSchema.identifier.name).toBe('Patient');
    
    // Check some fields exist
    expect(patientSchema.fields).toBeDefined();
    expect(patientSchema.fields.gender).toBeDefined();
    expect(patientSchema.fields.name).toBeDefined();
    
    // Gender should have a binding
    expect(patientSchema.fields.gender.binding).toBeDefined();
    
    // Should have binding schemas
    const bindingSchemas = results.filter(r => r.identifier.kind === 'binding');
    expect(bindingSchemas.length).toBeGreaterThan(0);
    
    // Clean up
    await manager.destroy();
  }, 60000); // 60 second timeout for network operations
});