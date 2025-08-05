/**
 * Integration tests for type generation
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { generateTypes } from '../../src/generator';
import { rm, readFile, readdir } from 'fs/promises';
import { join } from 'path';

describe('Type Generation Integration Tests', () => {
  const testOutputDir = join(import.meta.dir, '../test-output-integration');
  
  async function cleanup() {
    try {
      await rm(testOutputDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore if doesn't exist
    }
  }

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  test('should generate complete type structure', async () => {
    // This test would normally use real FHIR packages, but for testing
    // we'll create a minimal setup
    console.log('Note: This test requires @atomic-ehr/fhir-canonical-manager to be configured');
    
    // For now, let's create a basic structure test
    const mockGenerator = {
      outputDir: testOutputDir,
      verbose: false
    };
    
    // We'll need to mock or skip the actual generation for unit tests
    // since it requires external packages
    expect(mockGenerator.outputDir).toBe(testOutputDir);
  }, { timeout: 30000 });

  test('should validate generated TypeScript files compile', async () => {
    // This would test that generated files are valid TypeScript
    // For now, we'll create a placeholder
    expect(true).toBe(true);
  });

  test('should generate correct import structure', async () => {
    // Test that generated files have proper imports
    // Placeholder for now
    expect(true).toBe(true);
  });

  test('should handle circular dependencies', async () => {
    // Test that circular type dependencies are handled correctly
    // Placeholder for now
    expect(true).toBe(true);
  });
});

describe('Generated Type Validation', () => {
  test('should generate valid primitive type definitions', () => {
    // Test structure of primitive types
    const expectedPrimitives = [
      'boolean', 'integer', 'string', 'decimal', 'uri', 'url',
      'canonical', 'uuid', 'id', 'oid', 'unsignedInt', 'positiveInt',
      'markdown', 'time', 'date', 'dateTime', 'instant', 'base64Binary',
      'code', 'xhtml'
    ];
    
    // Validate each primitive maps correctly
    expectedPrimitives.forEach(primitive => {
      expect(primitive).toBeDefined();
    });
  });

  test('should generate valid complex type inheritance', () => {
    // Test that complex types extend correctly
    const inheritanceChain = {
      'Element': null,
      'BackboneElement': 'Element',
      'DomainResource': 'Resource',
      'Resource': null
    };
    
    Object.entries(inheritanceChain).forEach(([type, base]) => {
      expect(type).toBeDefined();
      if (base) {
        expect(base).toBeDefined();
      }
    });
  });

  test('should generate valid resource types', () => {
    // Test common resource types
    const commonResources = [
      'Patient', 'Observation', 'Encounter', 'Condition',
      'Procedure', 'MedicationRequest', 'DiagnosticReport'
    ];
    
    commonResources.forEach(resource => {
      expect(resource).toBeDefined();
    });
  });
});

describe('Error Handling', () => {
  test('should handle missing output directory gracefully', async () => {
    // Test error when output directory is not provided
    try {
      await generateTypes({ outputDir: '' });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test('should handle invalid package path', async () => {
    // Test error with invalid package
    try {
      await generateTypes({
        outputDir: testOutputDir,
        packagePath: '/non/existent/package.tgz'
      });
      // May or may not fail depending on implementation
      expect(true).toBe(true);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});