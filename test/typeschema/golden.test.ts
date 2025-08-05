/**
 * Golden tests for TypeSchema transformation
 * 
 * Compares transformation output with expected golden files
 */

import { describe, test, expect } from "bun:test";
import { CanonicalManager } from '@atomic-ehr/fhir-canonical-manager';
import { transformFHIRSchema } from '../../src/typeschema';
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

describe("Golden Tests", () => {
  // Create a mock manager that doesn't resolve external dependencies
  const mockManager = {
    resolveSync: (url: string) => undefined,
    resolve: async (url: string) => undefined
  } as any;
  
  // Default package info for tests
  const packageInfo = {
    name: 'hl7.fhir.r4.core',
    version: '4.0.1'
  };

  test("Element type", async () => {
    const goldenDir = path.join(__dirname, 'golden/element');
    
    // Read input and expected output
    const fhirSchema = await readJSON(path.join(goldenDir, 'element.fs.json'));
    const expected = await readJSON(path.join(goldenDir, 'element.ts.json'));
    
    // Transform
    const results = await transformFHIRSchema(fhirSchema, mockManager, packageInfo);
    expect(results.length).toBe(1);
    
    const actual = results[0];
    
    // Compare with golden
    try {
      compareSchemas(actual, expected);
    } catch (e) {
      console.error('Actual:', JSON.stringify(actual, null, 2));
      console.error('Expected:', JSON.stringify(expected, null, 2));
      throw e;
    }
  });

  test("BackboneElement type", async () => {
    const goldenDir = path.join(__dirname, 'golden/backbone-element');
    
    // Read input and expected output
    const fhirSchema = await readJSON(path.join(goldenDir, 'backbone-element.fs.json'));
    const expected = await readJSON(path.join(goldenDir, 'backbone-element.ts.json'));
    
    // Transform
    const results = await transformFHIRSchema(fhirSchema, mockManager, packageInfo);
    expect(results.length).toBe(1);
    
    const actual = results[0];
    
    // Compare with golden
    try {
      compareSchemas(actual, expected);
    } catch (e) {
      console.error('Actual:', JSON.stringify(actual, null, 2));
      console.error('Expected:', JSON.stringify(expected, null, 2));
      throw e;
    }
  });
});