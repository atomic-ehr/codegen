/**
 * Integration test for the complete generator system
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { TypeScriptGenerator } from '../../src/generator/typescript';
import { generateTypes } from '../../src/generator/index';
import { rm, readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

describe('Generator Integration Test', () => {
  const testDir = join(import.meta.dir, '../test-integration');
  const outputDir = join(testDir, 'generated');
  const schemaDir = join(testDir, 'schemas');
  
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await mkdir(schemaDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('should generate types from test schemas', async () => {
    // Create test NDJSON with a small set of schemas
    const testSchemas = [
      // Primitive types
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
        id: 'boolean',
        name: 'boolean',
        type: 'boolean',
        kind: 'primitive-type',
        url: 'http://hl7.org/fhir/StructureDefinition/boolean',
        elements: {}
      },
      // Complex types
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
          },
          extension: {
            type: 'Extension',
            min: 0,
            max: '*',
            isArray: true
          }
        }
      },
      {
        resourceType: 'StructureDefinition',
        id: 'BackboneElement',
        name: 'BackboneElement',
        type: 'BackboneElement',
        kind: 'complex-type',
        url: 'http://hl7.org/fhir/StructureDefinition/BackboneElement',
        base: 'Element',
        elements: {
          modifierExtension: {
            type: 'Extension',
            min: 0,
            max: '*',
            isArray: true
          }
        }
      },
      // A simple resource
      {
        resourceType: 'StructureDefinition',
        id: 'TestResource',
        name: 'TestResource',
        type: 'TestResource',
        kind: 'resource',
        url: 'http://example.com/StructureDefinition/TestResource',
        base: 'DomainResource',
        elements: {
          active: {
            type: 'boolean',
            min: 0,
            max: '1'
          },
          name: {
            type: 'string',
            min: 1,
            max: '1',
            isRequired: true
          },
          tags: {
            type: 'string',
            min: 0,
            max: '*',
            isArray: true
          }
        }
      }
    ];

    // Write test schemas
    const ndjsonPath = join(schemaDir, 'test-schemas.ndjson');
    const ndjsonContent = testSchemas.map(s => JSON.stringify(s)).join('\n');
    await writeFile(ndjsonPath, ndjsonContent);

    // Generate types using the main API
    const generator = new TypeScriptGenerator({
      outputDir,
      verbose: false
    });

    // Mock the loader to use our test file
    const loader = (generator as any).loader;
    const originalLoad = loader.load.bind(loader);
    loader.load = async () => {
      return await loader.loadFromNDJSON(ndjsonPath);
    };

    // Generate types
    await generator.generate();

    // Check that files were created
    const files = await readdir(outputDir);
    expect(files).toContain('index.ts');
    expect(files).toContain('types');
    expect(files).toContain('resources');

    // Check primitive types
    const primitivesPath = join(outputDir, 'types', 'primitives.ts');
    const primitivesContent = await readFile(primitivesPath, 'utf-8');
    expect(primitivesContent).toContain('export type string = string;');
    expect(primitivesContent).toContain('export type boolean = boolean;');

    // Check complex types
    const complexPath = join(outputDir, 'types', 'complex.ts');
    const complexContent = await readFile(complexPath, 'utf-8');
    expect(complexContent).toContain('export interface Element {');
    expect(complexContent).toContain('export interface BackboneElement extends Element {');

    // Check resource
    const resourcePath = join(outputDir, 'resources', 'TestResource.ts');
    const resourceContent = await readFile(resourcePath, 'utf-8');
    expect(resourceContent).toContain('export interface TestResource');
    expect(resourceContent).toContain('active?: boolean;');
    expect(resourceContent).toContain('name: string;');
    expect(resourceContent).toContain('tags?: string[];');

    // Check index file
    const indexPath = join(outputDir, 'index.ts');
    const indexContent = await readFile(indexPath, 'utf-8');
    expect(indexContent).toContain("export * as primitives from './types/primitives';");
    expect(indexContent).toContain("export * as complex from './types/complex';");
    expect(indexContent).toContain("export { TestResource } from './resources/TestResource';");
    expect(indexContent).toContain("'TestResource': true,");
  });

  test('should handle nested types correctly', async () => {
    // Test with a resource that has nested types
    const nestedSchema = {
      resourceType: 'StructureDefinition',
      id: 'NestedResource',
      name: 'NestedResource',
      type: 'NestedResource',
      kind: 'resource',
      url: 'http://example.com/StructureDefinition/NestedResource',
      elements: {
        contact: {
          type: 'BackboneElement',
          min: 0,
          max: '*',
          isArray: true,
          elements: {
            name: {
              type: 'string',
              min: 1,
              max: '1'
            },
            email: {
              type: 'string',
              min: 0,
              max: '1'
            }
          }
        }
      }
    };

    const ndjsonPath = join(schemaDir, 'nested-schema.ndjson');
    await writeFile(ndjsonPath, JSON.stringify(nestedSchema));

    const generator = new TypeScriptGenerator({
      outputDir: join(testDir, 'nested-output'),
      verbose: false
    });

    // Mock loader
    const loader = (generator as any).loader;
    loader.load = async () => {
      return await loader.loadFromNDJSON(ndjsonPath);
    };

    await generator.generate();

    // Check nested type generation
    const resourcePath = join(testDir, 'nested-output', 'resources', 'NestedResource.ts');
    const content = await readFile(resourcePath, 'utf-8');
    
    // Should have the main interface
    expect(content).toContain('export interface NestedResource');
    
    // Should have nested interface
    expect(content).toContain('export interface NestedResourceContact extends complex.BackboneElement {');
    expect(content).toContain('name: string;');
    expect(content).toContain('email?: string;');
  });
});

describe('Error Handling Integration', () => {
  test('should handle missing output directory', async () => {
    try {
      await generateTypes({
        outputDir: '',
        verbose: false
      });
      expect(false).toBe(true); // Should not reach here
    } catch (error: any) {
      expect(error).toBeDefined();
    }
  });

  test('should handle invalid schemas gracefully', async () => {
    const testDir = join(import.meta.dir, '../test-error');
    const invalidSchema = { invalid: 'schema' };
    
    try {
      await mkdir(testDir, { recursive: true });
      const schemaPath = join(testDir, 'invalid.ndjson');
      await writeFile(schemaPath, JSON.stringify(invalidSchema));
      
      const generator = new TypeScriptGenerator({
        outputDir: join(testDir, 'output'),
        verbose: false
      });
      
      const loader = (generator as any).loader;
      loader.load = async () => {
        return await loader.loadFromNDJSON(schemaPath);
      };
      
      await generator.generate();
      
      // Should complete even with invalid schema
      expect(true).toBe(true);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });
});