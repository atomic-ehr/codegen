/**
 * Unit tests for base generator types and interfaces
 */

import { describe, test, expect } from 'bun:test';
import { 
  DEFAULT_GENERATOR_OPTIONS,
  DEFAULT_FILE_BUILDER_OPTIONS,
  validateGeneratorOptions,
  isGeneratedFile,
  isGeneratorError,
  VERSION
} from '../../../../../src/api/generators/base';
import { GeneratorError } from '../../../../../src/api/generators/base/errors';
import type { 
  GeneratedFile, 
  BaseGeneratorOptions,
  LanguageType 
} from '../../../../../src/api/generators/base/types';

describe('Base Generator Types', () => {
  describe('Default Options', () => {
    test('DEFAULT_GENERATOR_OPTIONS contains all required fields', () => {
      expect(DEFAULT_GENERATOR_OPTIONS).toEqual({
        outputDir: './generated',
        overwrite: true,
        validate: true,
        verbose: false,
        beginnerMode: false,
        errorFormat: 'console'
      });
    });

    test('DEFAULT_FILE_BUILDER_OPTIONS contains all formatting options', () => {
      expect(DEFAULT_FILE_BUILDER_OPTIONS.formatting).toEqual({
        indentSize: 2,
        useTabs: false,
        maxLineLength: 100
      });

      expect(DEFAULT_FILE_BUILDER_OPTIONS.importStrategy).toBe('auto');
      expect(DEFAULT_FILE_BUILDER_OPTIONS.validation).toBe('strict');
      expect(DEFAULT_FILE_BUILDER_OPTIONS.prettify).toBe(true);
      expect(DEFAULT_FILE_BUILDER_OPTIONS.encoding).toBe('utf-8');
    });
  });

  describe('Option Validation', () => {
    test('validateGeneratorOptions accepts valid options', () => {
      const validOptions: BaseGeneratorOptions = {
        outputDir: '/tmp/test-output',
        overwrite: true,
        validate: true
      };

      const result = validateGeneratorOptions(validOptions);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateGeneratorOptions rejects missing outputDir', () => {
      const invalidOptions = {} as BaseGeneratorOptions;

      const result = validateGeneratorOptions(invalidOptions);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('outputDir is required');
      expect(result.suggestions).toContain('Provide a valid output directory path');
    });

    test('validateGeneratorOptions warns about relative paths', () => {
      const options: BaseGeneratorOptions = {
        outputDir: './relative-path'
      };

      const result = validateGeneratorOptions(options);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Using relative path for outputDir - consider using absolute path');
    });

    test('validateGeneratorOptions rejects invalid types', () => {
      const invalidOptions = {
        outputDir: 123, // Should be string
        overwrite: 'yes', // Should be boolean
        validate: 'true' // Should be boolean
      } as any;

      const result = validateGeneratorOptions(invalidOptions);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('outputDir must be a string');
      expect(result.errors).toContain('overwrite must be a boolean');
      expect(result.errors).toContain('validate must be a boolean');
    });
  });

  describe('Type Guards', () => {
    test('isGeneratedFile identifies valid GeneratedFile objects', () => {
      const validFile: GeneratedFile = {
        path: '/test/path/file.ts',
        filename: 'file.ts',
        content: 'export interface Test {}',
        exports: ['Test'],
        size: 100,
        timestamp: new Date()
      };

      expect(isGeneratedFile(validFile)).toBe(true);
    });

    test('isGeneratedFile rejects invalid objects', () => {
      expect(isGeneratedFile(null)).toBe(false);
      expect(isGeneratedFile(undefined)).toBe(false);
      expect(isGeneratedFile({})).toBe(false);
      expect(isGeneratedFile('string')).toBe(false);
      expect(isGeneratedFile(123)).toBe(false);

      // Missing required fields
      expect(isGeneratedFile({
        path: '/test/path',
        filename: 'test.ts'
        // Missing other required fields
      })).toBe(false);
    });

    test('isGeneratorError identifies GeneratorError instances', () => {
      class TestError extends GeneratorError {
        getSuggestions(): string[] {
          return ['Test suggestion'];
        }
      }

      const error = new TestError('Test error', 'generation');
      const normalError = new Error('Normal error');

      expect(isGeneratorError(error)).toBe(true);
      expect(isGeneratorError(normalError)).toBe(false);
      expect(isGeneratorError(null)).toBe(false);
      expect(isGeneratorError('string')).toBe(false);
    });
  });

  describe('LanguageType Interface', () => {
    test('LanguageType can represent primitive types', () => {
      const primitiveType: LanguageType = {
        name: 'string',
        isPrimitive: true,
        nullable: false
      };

      expect(primitiveType.isPrimitive).toBe(true);
      expect(primitiveType.name).toBe('string');
      expect(primitiveType.importPath).toBeUndefined();
    });

    test('LanguageType can represent complex types with imports', () => {
      const complexType: LanguageType = {
        name: 'Patient',
        isPrimitive: false,
        importPath: './Patient',
        nullable: true,
        generics: ['T'],
        metadata: {
          isResource: true,
          package: 'fhir-types'
        }
      };

      expect(complexType.isPrimitive).toBe(false);
      expect(complexType.importPath).toBe('./Patient');
      expect(complexType.generics).toEqual(['T']);
      expect(complexType.metadata?.isResource).toBe(true);
    });
  });

  describe('Version Information', () => {
    test('VERSION is properly defined', () => {
      expect(VERSION).toBeDefined();
      expect(typeof VERSION).toBe('string');
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning pattern
    });
  });

  describe('Generated File Metadata', () => {
    test('GeneratedFile supports optional metadata', () => {
      const fileWithMetadata: GeneratedFile = {
        path: '/test/Patient.ts',
        filename: 'Patient.ts',
        content: 'interface Patient {}',
        exports: ['Patient'],
        size: 20,
        timestamp: new Date(),
        metadata: {
          generationTime: 150,
          schemaCount: 1,
          templateName: 'interface',
          warnings: ['Missing description']
        }
      };

      expect(fileWithMetadata.metadata?.generationTime).toBe(150);
      expect(fileWithMetadata.metadata?.templateName).toBe('interface');
      expect(fileWithMetadata.metadata?.warnings).toContain('Missing description');
    });
  });

  describe('Configuration Merging', () => {
    test('partial options merge correctly with defaults', () => {
      const partialOptions: BaseGeneratorOptions = {
        outputDir: '/custom/output'
      };

      // Simulate merging with defaults (this would happen in BaseGenerator constructor)
      const merged = {
        ...DEFAULT_GENERATOR_OPTIONS,
        ...partialOptions
      };

      expect(merged.outputDir).toBe('/custom/output');
      expect(merged.overwrite).toBe(true); // From defaults
      expect(merged.validate).toBe(true); // From defaults
      expect(merged.verbose).toBe(false); // From defaults
    });
  });
});