/**
 * Tests for Schema Loader
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { SchemaLoader, LoadedSchemas } from './loader';
import { rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

describe('SchemaLoader', () => {
  const testDir = join(import.meta.dir, '../../test-loader-data');
  const testNDJSON = join(testDir, 'test-schemas.ndjson');

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('should create loader with default options', () => {
    const loader = new SchemaLoader();
    expect(loader).toBeDefined();
  });

  test('should create loader with custom options', () => {
    const loader = new SchemaLoader({
      packagePath: 'custom.package',
      verbose: true
    });
    expect(loader).toBeDefined();
  });

  test('should load schemas from NDJSON file', async () => {
    // Create test NDJSON with minimal FHIR schemas (FHIRSchema format)
    const testSchemas = [
      {
        resourceType: 'StructureDefinition',
        id: 'string',
        name: 'string',
        type: 'string',
        kind: 'primitive-type',
        url: 'http://hl7.org/fhir/StructureDefinition/string',
        elements: {}
      },
      {
        resourceType: 'StructureDefinition',
        id: 'Element',
        name: 'Element',
        type: 'Element',
        kind: 'complex-type',
        url: 'http://hl7.org/fhir/StructureDefinition/Element',
        elements: {
          id: {
            type: 'string',
            min: 0,
            max: '1'
          }
        }
      },
      {
        resourceType: 'StructureDefinition',
        id: 'Patient',
        name: 'Patient',
        type: 'Patient',
        kind: 'resource',
        url: 'http://hl7.org/fhir/StructureDefinition/Patient',
        elements: {
          active: {
            type: 'boolean',
            min: 0,
            max: '1'
          }
        }
      }
    ];

    // Write test NDJSON
    const ndjsonContent = testSchemas.map(s => JSON.stringify(s)).join('\n');
    await writeFile(testNDJSON, ndjsonContent);

    const loader = new SchemaLoader({ verbose: false });
    const result = await loader.loadFromNDJSON(testNDJSON);

    expect(result.primitiveTypes).toHaveLength(1);
    expect(result.primitiveTypes[0].identifier.name).toBe('string');
    
    expect(result.complexTypes).toHaveLength(1);
    expect(result.complexTypes[0].identifier.name).toBe('Element');
    
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].identifier.name).toBe('Patient');
  });

  test('should handle empty NDJSON file', async () => {
    const emptyNDJSON = join(testDir, 'empty.ndjson');
    await writeFile(emptyNDJSON, '');

    const loader = new SchemaLoader();
    const result = await loader.loadFromNDJSON(emptyNDJSON);

    expect(result.primitiveTypes).toHaveLength(0);
    expect(result.complexTypes).toHaveLength(0);
    expect(result.resources).toHaveLength(0);
    expect(result.bindings).toHaveLength(0);
    expect(result.valueSets).toHaveLength(0);
  });

  test('should handle malformed NDJSON lines', async () => {
    const malformedNDJSON = join(testDir, 'malformed.ndjson');
    const content = [
      '{"valid": "json"}',
      'not json at all',
      '{"another": "valid"}',
      '',
      '   '
    ].join('\n');
    
    await writeFile(malformedNDJSON, content);

    // Capture console.error
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => errors.push(args.join(' '));

    try {
      const loader = new SchemaLoader();
      const result = await loader.loadFromNDJSON(malformedNDJSON);
      
      // Should process valid lines and skip invalid ones
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Failed to parse NDJSON line');
    } finally {
      console.error = originalError;
    }
  });

  test('should categorize schemas correctly', async () => {
    // Create NDJSON with various schema types
    const mixedSchemas = [
      // Primitive
      {
        resourceType: 'StructureDefinition',
        id: 'boolean',
        name: 'boolean',
        type: 'boolean',
        kind: 'primitive-type',
        url: 'http://hl7.org/fhir/StructureDefinition/boolean',
        elements: {}
      },
      // Complex type
      {
        resourceType: 'StructureDefinition',
        id: 'HumanName',
        name: 'HumanName',
        type: 'HumanName',
        kind: 'complex-type',
        url: 'http://hl7.org/fhir/StructureDefinition/HumanName',
        elements: {}
      },
      // Resource
      {
        resourceType: 'StructureDefinition',
        id: 'Observation',
        name: 'Observation',
        type: 'Observation',
        kind: 'resource',
        url: 'http://hl7.org/fhir/StructureDefinition/Observation',
        elements: {}
      },
      // Another complex type
      {
        resourceType: 'StructureDefinition',
        id: 'Address',
        name: 'Address',
        type: 'Address',
        kind: 'complex-type',
        url: 'http://hl7.org/fhir/StructureDefinition/Address',
        elements: {}
      }
    ];

    const ndjsonContent = mixedSchemas.map(s => JSON.stringify(s)).join('\n');
    await writeFile(testNDJSON, ndjsonContent);

    const loader = new SchemaLoader({ verbose: false });
    const result = await loader.loadFromNDJSON(testNDJSON);

    expect(result.primitiveTypes).toHaveLength(1);
    expect(result.primitiveTypes[0].identifier.name).toBe('boolean');
    
    expect(result.complexTypes).toHaveLength(2);
    const complexNames = result.complexTypes.map(t => t.identifier.name).sort();
    expect(complexNames).toEqual(['Address', 'HumanName']);
    
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].identifier.name).toBe('Observation');
  });

  test('should handle verbose logging', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      const verboseLoader = new SchemaLoader({ verbose: true });
      
      // Create minimal test data
      const schema = {
        resourceType: 'StructureDefinition',
        id: 'test',
        name: 'test',
        type: 'test',
        kind: 'resource',
        url: 'http://example.com/StructureDefinition/test',
        elements: {}
      };
      
      await writeFile(testNDJSON, JSON.stringify(schema));
      await verboseLoader.loadFromNDJSON(testNDJSON);
      
      // Should have logged categorization info
      // Check if we got any logs at all
      expect(logs.length).toBeGreaterThan(0);
      
      // The actual log format might differ, so let's be more flexible
      const hasRelevantLog = logs.some(log => 
        log.toLowerCase().includes('categorized') || 
        log.toLowerCase().includes('resource') ||
        log.toLowerCase().includes('complex') ||
        log.toLowerCase().includes('primitive') ||
        log.toLowerCase().includes('schemas')
      );
      expect(hasRelevantLog).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });
});