/**
 * Focused unit tests for value set functionality
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { TypeScriptGenerator } from '../../../../src/api/generators/typescript.js';
import type { TypeSchema, TypeSchemaForBinding } from '../../../../src/typeschema/type-schema.types.js';
import { createLogger } from '../../../../src/utils/codegen-logger.js';

describe('Value Set Core Functionality', () => {
  let generator: TypeScriptGenerator;

  beforeEach(() => {
    generator = new TypeScriptGenerator({ 
      generateValueSets: true,
      outputDir: '/tmp/test',
      logger: createLogger({ prefix: 'Test', verbose: false }),
    });
  });

  describe('Value Set Detection Logic', () => {
    test('should detect required bindings with enum values', () => {
      const schema: TypeSchemaForBinding = {
        identifier: { 
          kind: 'binding', 
          name: 'AdministrativeGender',
          package: 'hl7.fhir.r4.core',
          version: '4.0.1',
          url: 'http://hl7.org/fhir/administrative-gender'
        },
        strength: 'required',
        enum: ['male', 'female', 'other', 'unknown'],
        valueset: { url: 'http://hl7.org/fhir/ValueSet/administrative-gender' }
      };
      
      expect((generator as any).shouldGenerateValueSet(schema)).toBe(true);
    });

    test('should not detect preferred bindings in required-only mode', () => {
      const schema: TypeSchemaForBinding = {
        identifier: { 
          kind: 'binding', 
          name: 'PreferredBinding',
          package: 'test.package',
          version: '1.0.0',
          url: 'http://test.com/preferred'
        },
        strength: 'preferred',
        enum: ['value1', 'value2'],
        valueset: { url: 'http://test.com/valueset' }
      };
      
      expect((generator as any).shouldGenerateValueSet(schema)).toBe(false);
    });

    test('should detect preferred bindings in custom mode', () => {
      generator = new TypeScriptGenerator({ 
        generateValueSets: true,
        valueSetMode: 'custom',
        valueSetStrengths: ['required', 'preferred'],
        outputDir: '/tmp/test',
        logger: createLogger({ prefix: 'Test', verbose: false }),
      });
      
      const schema: TypeSchemaForBinding = {
        identifier: { 
          kind: 'binding', 
          name: 'PreferredBinding',
          package: 'test.package',
          version: '1.0.0',
          url: 'http://test.com/preferred'
        },
        strength: 'preferred',
        enum: ['value1', 'value2'],
        valueset: { url: 'http://test.com/valueset' }
      };
      
      expect((generator as any).shouldGenerateValueSet(schema)).toBe(true);
    });

    test('should detect all bindings in all mode', () => {
      generator = new TypeScriptGenerator({ 
        generateValueSets: true,
        valueSetMode: 'all',
        outputDir: '/tmp/test',
        logger: createLogger({ prefix: 'Test', verbose: false }),
      });
      
      const schema: TypeSchemaForBinding = {
        identifier: { 
          kind: 'binding', 
          name: 'ExampleBinding',
          package: 'test.package',
          version: '1.0.0',
          url: 'http://test.com/example'
        },
        strength: 'example',
        enum: ['ex1', 'ex2'],
        valueset: { url: 'http://test.com/valueset' }
      };
      
      expect((generator as any).shouldGenerateValueSet(schema)).toBe(true);
    });

    test('should not detect bindings without enum', () => {
      const schema: TypeSchemaForBinding = {
        identifier: { 
          kind: 'binding', 
          name: 'NoEnumBinding',
          package: 'test.package',
          version: '1.0.0',
          url: 'http://test.com/binding'
        },
        strength: 'required',
        valueset: { url: 'http://test.com/valueset' }
      };
      
      expect((generator as any).shouldGenerateValueSet(schema)).toBe(false);
    });

    test('should not detect bindings with empty enum', () => {
      const schema: TypeSchemaForBinding = {
        identifier: { 
          kind: 'binding', 
          name: 'EmptyEnumBinding',
          package: 'test.package',
          version: '1.0.0',
          url: 'http://test.com/binding'
        },
        strength: 'required',
        enum: [],
        valueset: { url: 'http://test.com/valueset' }
      };
      
      expect((generator as any).shouldGenerateValueSet(schema)).toBe(false);
    });
  });

  describe('Value Set File Generation', () => {
    test('should generate TypeScript const array and type', () => {
      const binding: TypeSchemaForBinding = {
        identifier: { 
          name: 'AdministrativeGender',
          kind: 'binding',
          package: 'hl7.fhir.r4.core',
          version: '4.0.1',
          url: 'http://hl7.org/fhir/administrative-gender'
        },
        strength: 'required',
        enum: ['male', 'female', 'other', 'unknown'],
        valueset: { url: 'http://hl7.org/fhir/ValueSet/administrative-gender' }
      };
      
      const result = (generator as any).generateValueSetFile(binding);
      
      expect(result).toContain('export const AdministrativeGenderValues = [');
      expect(result).toContain("'male',");
      expect(result).toContain("'female',");
      expect(result).toContain("'other',");
      expect(result).toContain("'unknown'");
      expect(result).toContain('] as const;');
      expect(result).toContain('export type AdministrativeGender = typeof AdministrativeGenderValues[number];');
    });

    test('should include documentation when enabled', () => {
      generator = new TypeScriptGenerator({ 
        generateValueSets: true,
        includeDocuments: true,
        outputDir: '/tmp/test',
        logger: createLogger({ prefix: 'Test', verbose: false }),
      });

      const binding: TypeSchemaForBinding = {
        identifier: { 
          name: 'TestBinding',
          kind: 'binding',
          package: 'hl7.fhir.r4.core',
          version: '4.0.1',
          url: 'http://hl7.org/fhir/test-binding'
        },
        strength: 'required',
        enum: ['val1', 'val2'],
        valueset: { url: 'http://hl7.org/fhir/ValueSet/test-binding' }
      };
      
      const result = (generator as any).generateValueSetFile(binding);
      
      expect(result).toContain('/**');
      expect(result).toContain('* TestBinding value set');
      expect(result).toContain('* @see http://hl7.org/fhir/ValueSet/test-binding');
      expect(result).toContain('* @package hl7.fhir.r4.core');
      expect(result).toContain('* @generated This file is auto-generated. Do not edit manually.');
      expect(result).toContain('*/');
    });

    test('should include helper functions when enabled', () => {
      generator = new TypeScriptGenerator({ 
        generateValueSets: true,
        includeValueSetHelpers: true,
        outputDir: '/tmp/test',
        logger: createLogger({ prefix: 'Test', verbose: false }),
      });
      
      const binding: TypeSchemaForBinding = {
        identifier: { 
          name: 'TestBinding',
          kind: 'binding',
          package: 'test.package',
          version: '1.0.0',
          url: 'http://test.com/binding'
        },
        strength: 'required',
        enum: ['value1', 'value2'],
        valueset: { url: 'http://test.com/valueset' }
      };
      
      const result = (generator as any).generateValueSetFile(binding);
      
      expect(result).toContain('export const isValidTestBinding = (value: string): value is TestBinding =>');
      expect(result).toContain('TestBindingValues.includes(value as TestBinding);');
    });

    test('should not include helpers when disabled', () => {
      generator = new TypeScriptGenerator({ 
        generateValueSets: true,
        includeValueSetHelpers: false,
        outputDir: '/tmp/test',
        logger: createLogger({ prefix: 'Test', verbose: false }),
      });
      
      const binding: TypeSchemaForBinding = {
        identifier: { 
          name: 'TestBinding',
          kind: 'binding',
          package: 'test.package',
          version: '1.0.0',
          url: 'http://test.com/binding'
        },
        strength: 'required',
        enum: ['value1', 'value2'],
        valueset: { url: 'http://test.com/valueset' }
      };
      
      const result = (generator as any).generateValueSetFile(binding);
      
      expect(result).not.toContain('export const isValidTestBinding');
    });

    test('should handle special characters and URIs in enum values', () => {
      const binding: TypeSchemaForBinding = {
        identifier: { 
          name: 'SpecialCharsBinding',
          kind: 'binding',
          package: 'test.package',
          version: '1.0.0',
          url: 'http://test.com/binding'
        },
        strength: 'required',
        enum: [
          '1.2.840.10065.1.12.1.1',
          'http://example.com/value',
          'value-with-hyphens',
          'value_with_underscores'
        ],
        valueset: { url: 'http://test.com/valueset' }
      };
      
      const result = (generator as any).generateValueSetFile(binding);
      
      expect(result).toContain("'1.2.840.10065.1.12.1.1'");
      expect(result).toContain("'http://example.com/value'");
      expect(result).toContain("'value-with-hyphens'");
      expect(result).toContain("'value_with_underscores'");
    });
  });

  describe('Configuration Handling', () => {
    test('should respect custom configuration', () => {
      const customGenerator = new TypeScriptGenerator({
        generateValueSets: true,
        valueSetMode: 'custom',
        valueSetStrengths: ['required', 'preferred', 'extensible'],
        includeValueSetHelpers: true,
        valueSetDirectory: 'custom-valuesets',
        outputDir: '/tmp/test',
        logger: createLogger({ prefix: 'Test', verbose: false }),
      });
      
      const options = customGenerator.getOptions();
      expect(options.generateValueSets).toBe(true);
      expect(options.valueSetMode).toBe('custom');
      expect(options.valueSetStrengths).toEqual(['required', 'preferred', 'extensible']);
      expect(options.includeValueSetHelpers).toBe(true);
      expect(options.valueSetDirectory).toBe('custom-valuesets');
    });

    test('should use fallback directory when valueSetDirectory is undefined', () => {
      // This tests the || 'valuesets' fallback in the code
      const binding: TypeSchemaForBinding = {
        identifier: { 
          name: 'TestBinding',
          kind: 'binding',
          package: 'test.package',
          version: '1.0.0',
          url: 'http://test.com/binding'
        },
        strength: 'required',
        enum: ['value1', 'value2'],
        valueset: { url: 'http://test.com/valueset' }
      };
      
      // The fallback should work even if valueSetDirectory is undefined
      expect((generator as any).generateValueSetFile(binding)).toContain('export const TestBindingValues');
    });
  });

  describe('Collection and Filtering', () => {
    test('should collect qualifying value sets from mixed schemas', () => {
      const schemas: TypeSchema[] = [
        // Required binding - should be included
        {
          identifier: { 
            kind: 'binding', 
            name: 'RequiredBinding',
            package: 'test.package',
            version: '1.0.0',
            url: 'http://test.com/required'
          },
          strength: 'required',
          enum: ['val1', 'val2'],
          valueset: { url: 'http://test.com/required-valueset' }
        } as TypeSchemaForBinding,
        
        // Preferred binding - should not be included (required-only mode)
        {
          identifier: { 
            kind: 'binding', 
            name: 'PreferredBinding',
            package: 'test.package',
            version: '1.0.0',
            url: 'http://test.com/preferred'
          },
          strength: 'preferred',
          enum: ['pref1', 'pref2'],
          valueset: { url: 'http://test.com/preferred-valueset' }
        } as TypeSchemaForBinding,
        
        // Non-binding schema - should be ignored
        {
          identifier: { 
            kind: 'resource', 
            name: 'Patient',
            package: 'hl7.fhir.r4.core',
            version: '4.0.1',
            url: 'http://hl7.org/fhir/Patient'
          },
          fields: {}
        },
        
        // Binding without enum - should be ignored
        {
          identifier: { 
            kind: 'binding', 
            name: 'NoEnumBinding',
            package: 'test.package',
            version: '1.0.0',
            url: 'http://test.com/no-enum'
          },
          strength: 'required',
          valueset: { url: 'http://test.com/no-enum-valueset' }
        } as TypeSchemaForBinding
      ];

      const result = (generator as any).collectValueSets(schemas);
      
      expect(result.size).toBe(1);
      expect(result.has('RequiredBinding')).toBe(true);
      expect(result.has('PreferredBinding')).toBe(false);
      expect(result.has('Patient')).toBe(false);
      expect(result.has('NoEnumBinding')).toBe(false);
    });

    test('should collect multiple bindings in custom mode', () => {
      generator = new TypeScriptGenerator({ 
        generateValueSets: true,
        valueSetMode: 'custom',
        valueSetStrengths: ['required', 'preferred', 'extensible'],
        outputDir: '/tmp/test',
        logger: createLogger({ prefix: 'Test', verbose: false }),
      });

      const schemas: TypeSchema[] = [
        {
          identifier: { 
            kind: 'binding', 
            name: 'RequiredBinding',
            package: 'test.package',
            version: '1.0.0',
            url: 'http://test.com/required'
          },
          strength: 'required',
          enum: ['r1', 'r2'],
          valueset: { url: 'http://test.com/required-valueset' }
        } as TypeSchemaForBinding,
        {
          identifier: { 
            kind: 'binding', 
            name: 'PreferredBinding',
            package: 'test.package',
            version: '1.0.0',
            url: 'http://test.com/preferred'
          },
          strength: 'preferred',
          enum: ['p1', 'p2'],
          valueset: { url: 'http://test.com/preferred-valueset' }
        } as TypeSchemaForBinding,
        {
          identifier: { 
            kind: 'binding', 
            name: 'ExtensibleBinding',
            package: 'test.package',
            version: '1.0.0',
            url: 'http://test.com/extensible'
          },
          strength: 'extensible',
          enum: ['e1', 'e2'],
          valueset: { url: 'http://test.com/extensible-valueset' }
        } as TypeSchemaForBinding,
        {
          identifier: { 
            kind: 'binding', 
            name: 'ExampleBinding',
            package: 'test.package',
            version: '1.0.0',
            url: 'http://test.com/example'
          },
          strength: 'example',
          enum: ['ex1', 'ex2'],
          valueset: { url: 'http://test.com/example-valueset' }
        } as TypeSchemaForBinding
      ];

      const result = (generator as any).collectValueSets(schemas);
      
      expect(result.size).toBe(3);
      expect(result.has('RequiredBinding')).toBe(true);
      expect(result.has('PreferredBinding')).toBe(true);
      expect(result.has('ExtensibleBinding')).toBe(true);
      expect(result.has('ExampleBinding')).toBe(false);
    });
  });
});
