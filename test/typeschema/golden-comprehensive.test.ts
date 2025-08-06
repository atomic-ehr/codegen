/**
 * Comprehensive golden tests for TypeSchema transformation
 *
 * Tests complex resources with bindings, nested types, etc.
 */

import { describe, test, expect } from "bun:test";
import { CanonicalManager } from '@atomic-ehr/fhir-canonical-manager';
import { transformFHIRSchema } from '../../src/lib/typeschema';
import * as fs from 'fs/promises';
import * as path from 'path';

// Helper to read JSON file
async function readJSON(filePath: string) {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

// Helper to compare schemas (ignoring certain fields that might differ)
function compareSchemas(actual: any, expected: any, path: string = '') {
  if (actual === expected) return;

  if (typeof actual !== typeof expected) {
    throw new Error(`Type mismatch at ${path}: ${typeof actual} vs ${typeof expected}`);
  }

  if (Array.isArray(actual)) {
    if (!Array.isArray(expected)) {
      throw new Error(`Expected array at ${path}`);
    }
    if (actual.length !== expected.length) {
      throw new Error(`Array length mismatch at ${path}: ${actual.length} vs ${expected.length}`);
    }
    for (let i = 0; i < actual.length; i++) {
      compareSchemas(actual[i], expected[i], `${path}[${i}]`);
    }
    return;
  }

  if (typeof actual === 'object' && actual !== null) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();

    if (actualKeys.join(',') !== expectedKeys.join(',')) {
      console.error('Key mismatch at', path);
      console.error('Actual keys:', actualKeys);
      console.error('Expected keys:', expectedKeys);
      throw new Error(`Object keys mismatch at ${path}`);
    }

    for (const key of actualKeys) {
      compareSchemas(actual[key], expected[key], path ? `${path}.${key}` : key);
    }
    return;
  }

  // For primitive values
  if (actual !== expected) {
    throw new Error(`Value mismatch at ${path}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
  }
}

describe("Comprehensive Golden Tests", () => {
  // Mock value sets for testing
  const mockValueSets: Record<string, any> = {
    'http://hl7.org/fhir/ValueSet/bundle-type': {
      resourceType: 'ValueSet',
      id: 'bundle-type',
      url: 'http://hl7.org/fhir/ValueSet/bundle-type',
      compose: {
        include: [{
          concept: [
            { code: 'document' },
            { code: 'message' },
            { code: 'transaction' },
            { code: 'transaction-response' },
            { code: 'batch' },
            { code: 'batch-response' },
            { code: 'history' },
            { code: 'searchset' },
            { code: 'collection' }
          ]
        }]
      }
    },
    'http://hl7.org/fhir/ValueSet/http-verb': {
      resourceType: 'ValueSet',
      id: 'http-verb',
      url: 'http://hl7.org/fhir/ValueSet/http-verb',
      compose: {
        include: [{
          concept: [
            { code: 'GET' },
            { code: 'HEAD' },
            { code: 'POST' },
            { code: 'PUT' },
            { code: 'DELETE' },
            { code: 'PATCH' }
          ]
        }]
      }
    },
    'http://hl7.org/fhir/ValueSet/search-entry-mode': {
      resourceType: 'ValueSet',
      id: 'search-entry-mode',
      url: 'http://hl7.org/fhir/ValueSet/search-entry-mode',
      compose: {
        include: [{
          concept: [
            { code: 'match' },
            { code: 'include' },
            { code: 'outcome' }
          ]
        }]
      }
    },
    'http://hl7.org/fhir/ValueSet/administrative-gender': {
      resourceType: 'ValueSet',
      id: 'administrative-gender',
      url: 'http://hl7.org/fhir/ValueSet/administrative-gender',
      compose: {
        include: [{
          concept: [
            { code: 'male' },
            { code: 'female' },
            { code: 'other' },
            { code: 'unknown' }
          ]
        }]
      }
    }
  };

  // Create a mock manager that can resolve value sets
  const mockManager = {
    resolveSync: (url: string) => undefined,
    resolve: async (url: string) => {
      // Handle version suffixes
      const cleanUrl = url.split('|')[0];
      return mockValueSets[cleanUrl];
    }
  } as any;

  // Default package info for tests
  const packageInfo = {
    name: 'hl7.fhir.r4.core',
    version: '4.0.1'
  };

  test("Bundle with multiple bindings", async () => {
    const goldenDir = path.join(__dirname, 'golden/bundle');

    // Read input and expected outputs
    const fhirSchema = await readJSON(path.join(goldenDir, 'bundle.fs.json'));
    const expectedBundle = await readJSON(path.join(goldenDir, 'bundle.ts.json'));
    const expectedBindings = [
      await readJSON(path.join(goldenDir, 'binding-BundleType.ts.json')),
      await readJSON(path.join(goldenDir, 'binding-HTTPVerb.ts.json')),
      await readJSON(path.join(goldenDir, 'binding-SearchEntryMode.ts.json'))
    ];

    // Transform
    const results = await transformFHIRSchema(fhirSchema, mockManager, packageInfo);

    // Should have main schema + 3 bindings
    expect(results.length).toBe(4);

    // Check main schema
    const actualBundle = results[0];
    try {
      compareSchemas(actualBundle, expectedBundle);
    } catch (e) {
      console.error('Bundle comparison failed');
      console.error('Actual:', JSON.stringify(actualBundle, null, 2));
      console.error('Expected:', JSON.stringify(expectedBundle, null, 2));
      throw e;
    }

    // Check bindings
    const actualBindings = results.slice(1).sort((a, b) =>
      a.identifier.name.localeCompare(b.identifier.name)
    );

    for (let i = 0; i < expectedBindings.length; i++) {
      try {
        compareSchemas(actualBindings[i], expectedBindings[i]);
      } catch (e) {
        console.error(`Binding ${i} comparison failed`);
        console.error('Actual:', JSON.stringify(actualBindings[i], null, 2));
        console.error('Expected:', JSON.stringify(expectedBindings[i], null, 2));
        throw e;
      }
    }
  });

  test("Patient resource", async () => {
    const goldenDir = path.join(__dirname, 'golden/patient');

    // Read input
    const fhirSchema = await readJSON(path.join(goldenDir, 'patient.fs.json'));
    const expectedPatient = await readJSON(path.join(goldenDir, 'patient.ts.json'));

    // Transform
    const results = await transformFHIRSchema(fhirSchema, mockManager, packageInfo);

    // Find the main Patient schema
    const actualPatient = results.find(r =>
      r.identifier.kind === 'resource' && r.identifier.name === 'Patient'
    );

    expect(actualPatient).toBeDefined();

    try {
      compareSchemas(actualPatient, expectedPatient);
    } catch (e) {
      console.error('Patient comparison failed');
      console.error('Actual:', JSON.stringify(actualPatient, null, 2));
      console.error('Expected:', JSON.stringify(expectedPatient, null, 2));
      throw e;
    }
  });

  test("Custom resource with nested types", async () => {
    const goldenDir = path.join(__dirname, 'golden/custom');

    // Read input
    const fhirSchema = await readJSON(path.join(goldenDir, 'TutorNotification.fs.json'));
    const expected = await readJSON(path.join(goldenDir, 'TutorNotification.ts.json'));

    // Transform - no package info for custom resource
    const results = await transformFHIRSchema(fhirSchema, mockManager);

    // Find the main schema
    const actual = results.find(r =>
      r.identifier.kind === 'resource' && r.identifier.name === 'TutorNotification'
    );

    expect(actual).toBeDefined();

    try {
      compareSchemas(actual, expected);
    } catch (e) {
      console.error('TutorNotification comparison failed');
      console.error('Actual:', JSON.stringify(actual, null, 2));
      console.error('Expected:', JSON.stringify(expected, null, 2));
      throw e;
    }
  });
});
