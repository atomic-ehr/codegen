/**
 * Tests for TypeScript Generator
 */

import { test, expect, describe } from 'bun:test';
import { TypeScriptGenerator } from './typescript';
import { TypeSchema, TypeSchemaField, TypeSchemaIdentifier } from '../typeschema';
import { rm, readdir, readFile } from 'fs/promises';
import { join } from 'path';

describe('TypeScriptGenerator', () => {
  const testOutputDir = join(import.meta.dir, '../../test-output');
  
  // Clean up test output before and after tests
  async function cleanup() {
    try {
      await rm(testOutputDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore if doesn't exist
    }
  }

  test('should generate primitive types', async () => {
    await cleanup();
    
    // Create a mock generator that only generates primitives
    const generator = new TypeScriptGenerator({
      outputDir: testOutputDir,
      verbose: false
    });
    
    // We need to mock the loader response
    const mockSchemas = {
      primitiveTypes: [
        {
          identifier: {
            kind: 'primitive-type',
            package: 'hl7.fhir.r4.core',
            version: '4.0.1',
            name: 'boolean',
            url: 'http://hl7.org/fhir/StructureDefinition/boolean'
          },
          description: 'A boolean value',
          dependencies: []
        } as TypeSchema,
        {
          identifier: {
            kind: 'primitive-type',
            package: 'hl7.fhir.r4.core',
            version: '4.0.1',
            name: 'string',
            url: 'http://hl7.org/fhir/StructureDefinition/string'
          },
          description: 'A string value',
          dependencies: []
        } as TypeSchema
      ],
      complexTypes: [],
      resources: [],
      bindings: [],
      valueSets: []
    };
    
    // Override the generate method to use mock data
    (generator as any).schemas = mockSchemas;
    await (generator as any).generatePrimitiveTypes();
    await (generator as any).writeFiles();
    
    // Check that files were created
    const files = await readdir(join(testOutputDir, 'types'));
    expect(files).toContain('primitives.ts');
    
    // Check content
    const content = await readFile(join(testOutputDir, 'types/primitives.ts'), 'utf-8');
    expect(content).toContain('export type boolean = boolean;');
    expect(content).toContain('export type string = string;');
    
    await cleanup();
  });

  test('should generate complex types with proper inheritance', async () => {
    await cleanup();
    
    const generator = new TypeScriptGenerator({
      outputDir: testOutputDir,
      verbose: false
    });
    
    const mockSchemas = {
      primitiveTypes: [],
      complexTypes: [
        {
          identifier: {
            kind: 'complex-type',
            package: 'hl7.fhir.r4.core',
            version: '4.0.1',
            name: 'Element',
            url: 'http://hl7.org/fhir/StructureDefinition/Element'
          },
          fields: {
            id: {
              type: {
                kind: 'primitive-type',
                package: 'hl7.fhir.r4.core',
                version: '4.0.1',
                name: 'string',
                url: 'http://hl7.org/fhir/StructureDefinition/string'
              },
              array: false,
              required: false,
              excluded: false
            } as TypeSchemaField
          },
          dependencies: []
        } as TypeSchema,
        {
          identifier: {
            kind: 'complex-type',
            package: 'hl7.fhir.r4.core',
            version: '4.0.1',
            name: 'BackboneElement',
            url: 'http://hl7.org/fhir/StructureDefinition/BackboneElement'
          },
          base: {
            kind: 'complex-type',
            package: 'hl7.fhir.r4.core',
            version: '4.0.1',
            name: 'Element',
            url: 'http://hl7.org/fhir/StructureDefinition/Element'
          },
          fields: {
            modifierExtension: {
              type: {
                kind: 'complex-type',
                package: 'hl7.fhir.r4.core',
                version: '4.0.1',
                name: 'Extension',
                url: 'http://hl7.org/fhir/StructureDefinition/Extension'
              },
              array: true,
              required: false,
              excluded: false
            } as TypeSchemaField
          },
          dependencies: []
        } as TypeSchema
      ],
      resources: [],
      bindings: [],
      valueSets: []
    };
    
    (generator as any).schemas = mockSchemas;
    await (generator as any).generateComplexTypes();
    await (generator as any).writeFiles();
    
    const content = await readFile(join(testOutputDir, 'types/complex.ts'), 'utf-8');
    expect(content).toContain('export interface Element {');
    expect(content).toContain('export interface BackboneElement extends Element {');
    expect(content).toContain('modifierExtension?: Extension[];');
    
    await cleanup();
  });

  test('should handle field arrays and optionality correctly', async () => {
    await cleanup();
    
    const generator = new TypeScriptGenerator({
      outputDir: testOutputDir,
      verbose: false
    });
    
    const mockResource: TypeSchema = {
      identifier: {
        kind: 'resource',
        package: 'hl7.fhir.r4.core',
        version: '4.0.1',
        name: 'TestResource',
        url: 'http://hl7.org/fhir/StructureDefinition/TestResource'
      },
      fields: {
        requiredString: {
          type: {
            kind: 'primitive-type',
            package: 'hl7.fhir.r4.core',
            version: '4.0.1',
            name: 'string',
            url: 'http://hl7.org/fhir/StructureDefinition/string'
          },
          array: false,
          required: true,
          excluded: false
        },
        optionalStringArray: {
          type: {
            kind: 'primitive-type',
            package: 'hl7.fhir.r4.core',
            version: '4.0.1',
            name: 'string',
            url: 'http://hl7.org/fhir/StructureDefinition/string'
          },
          array: true,
          required: false,
          excluded: false
        },
        excludedField: {
          type: {
            kind: 'primitive-type',
            package: 'hl7.fhir.r4.core',
            version: '4.0.1',
            name: 'string',
            url: 'http://hl7.org/fhir/StructureDefinition/string'
          },
          array: false,
          required: false,
          excluded: true
        }
      },
      dependencies: []
    };
    
    (generator as any).schemas = {
      primitiveTypes: [],
      complexTypes: [],
      resources: [mockResource],
      bindings: [],
      valueSets: []
    };
    
    await (generator as any).generateResources();
    await (generator as any).writeFiles();
    
    const content = await readFile(join(testOutputDir, 'resources/TestResource.ts'), 'utf-8');
    expect(content).toContain('requiredString: string;');
    expect(content).toContain('optionalStringArray?: string[];');
    expect(content).not.toContain('excludedField');
    
    await cleanup();
  });
});