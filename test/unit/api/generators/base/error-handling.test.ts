/**
 * Comprehensive tests for enhanced error handling system
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { 
  EnhancedSchemaValidationError,
  EnhancedFileOperationError,
  EnhancedTemplateError
} from '../../../../../src/api/generators/base/enhanced-errors';
import { 
  ErrorHandler,
  GeneratorErrorBoundary
} from '../../../../../src/api/generators/base/error-handler';
import { createMockSchema } from '../../../../helpers/schema-helpers';
import { MockLogger } from '../../../../helpers/mock-generators';

describe('Enhanced Error Handling', () => {
  describe('EnhancedSchemaValidationError', () => {
    test('provides helpful suggestions for beginners', () => {
      const schema = createMockSchema();
      const error = new EnhancedSchemaValidationError(
        'Schema validation failed',
        schema,
        ['identifier.name is missing'],
        { isBeginnerMode: true }
      );

      const suggestions = error.getSuggestions();
      
      expect(suggestions).toContain('Add missing identifier.name field to the schema');
      expect(suggestions.some(s => s.includes('📚 Review the TypeSchema documentation'))).toBe(true);
    });

    test('provides context-aware suggestions', () => {
      const schema = createMockSchema();
      const error = new EnhancedSchemaValidationError(
        'Invalid kind',
        schema,
        ['identifier.kind must be one of: resource, complex-type, profile']
      );

      const suggestions = error.getSuggestions();
      
      expect(suggestions.some(s => s.includes('identifier.kind'))).toBe(true);
      expect(suggestions.some(s => s.includes('resource, complex-type, profile'))).toBe(true);
    });

    test('formats error message nicely', () => {
      const schema = createMockSchema({ 
        identifier: { name: 'TestSchema', kind: 'resource', package: 'test.package' } 
      });
      const error = new EnhancedSchemaValidationError(
        'Test validation error',
        schema,
        ['Field missing', 'Type invalid']
      );

      const formatted = error.getFormattedMessage();
      
      expect(formatted).toContain('❌ Schema Validation Failed');
      expect(formatted).toContain('TestSchema');
      expect(formatted).toContain('Field missing');
      expect(formatted).toContain('💡 Suggestions');
    });

    test('includes beginner-specific guidance', () => {
      const schema = createMockSchema();
      const error = new EnhancedSchemaValidationError(
        'Schema validation failed',
        schema,
        ['identifier.name is missing'],
        { 
          isBeginnerMode: true,
          previousSuccessfulSchemas: ['Patient', 'Observation']
        }
      );

      const suggestions = error.getSuggestions();
      
      expect(suggestions.some(s => s.includes('Patient'))).toBe(true);
      expect(suggestions.some(s => s.includes('--verbose flag'))).toBe(true);
    });
  });

  describe('EnhancedFileOperationError', () => {
    test('provides operation-specific suggestions for write errors', () => {
      const error = new EnhancedFileOperationError(
        'Failed to write file',
        'write',
        '/test/path/file.ts',
        new Error('EACCES: permission denied'),
        { 
          canRetry: true,
          alternativePaths: ['/tmp/output', '/home/user/output']
        }
      );

      const suggestions = error.getSuggestions();
      
      expect(suggestions.some(s => s.includes('directory exists and is writable'))).toBe(true);
      expect(suggestions.some(s => s.includes('/tmp/output'))).toBe(true);
      expect(suggestions.some(s => s.includes('permission'))).toBe(true);
    });

    test('provides recovery actions', () => {
      const error = new EnhancedFileOperationError(
        'Permission denied',
        'write',
        '/test/path/file.ts',
        new Error('EACCES: permission denied')
      );

      const actions = error.getRecoveryActions();
      
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].action).toContain('permissions');
      expect(actions[0].command).toContain('chmod');
    });

    test('detects missing directory errors', () => {
      const error = new EnhancedFileOperationError(
        'Directory not found',
        'write',
        '/nonexistent/path/file.ts',
        new Error('ENOENT: no such file or directory')
      );

      const actions = error.getRecoveryActions();
      
      expect(actions.some(a => a.action.includes('directory'))).toBe(true);
      expect(actions.some(a => a.command?.includes('mkdir'))).toBe(true);
    });
  });

  describe('EnhancedTemplateError', () => {
    test('suggests similar template names', () => {
      const error = new EnhancedTemplateError(
        'Template not found',
        'interfac', // typo
        { schema: createMockSchema() },
        {
          availableTemplates: ['interface', 'enum', 'type-alias'],
          missingVariables: []
        }
      );

      const suggestions = error.getSuggestions();
      
      expect(suggestions.some(s => s.includes('Did you mean'))).toBe(true);
      expect(suggestions.some(s => s.includes('interface'))).toBe(true);
    });

    test('identifies missing variables', () => {
      const error = new EnhancedTemplateError(
        'Missing variables',
        'interface',
        { schema: createMockSchema(), typeMaper: 'typo' }, // typo in typeMapper
        {
          availableTemplates: ['interface'],
          missingVariables: ['typeMapper', 'imports']
        }
      );

      const suggestions = error.getSuggestions();
      
      expect(suggestions.some(s => s.includes('Missing template variables'))).toBe(true);
      expect(suggestions.some(s => s.includes('typeMapper'))).toBe(true);
      expect(suggestions.some(s => s.includes('imports'))).toBe(true);
    });
  });

  describe('ErrorHandler', () => {
    let logger: MockLogger;
    let handler: ErrorHandler;

    beforeEach(() => {
      logger = new MockLogger();
      handler = new ErrorHandler({ 
        logger: logger as any, 
        outputFormat: 'console',
        verbose: true
      });
    });

    test('handles single error appropriately', () => {
      const schema = createMockSchema();
      const error = new EnhancedSchemaValidationError(
        'Test error',
        schema,
        ['test validation error']
      );

      // Should not throw, just handle and log
      expect(() => handler.handleError(error)).not.toThrow();
    });

    test('handles unknown errors gracefully', () => {
      const unknownError = new Error('Unexpected error');
      
      expect(() => handler.handleError(unknownError)).not.toThrow();
    });

    test('batches similar errors efficiently', () => {
      const errors = [
        new EnhancedSchemaValidationError('Error 1', createMockSchema(), ['validation 1']),
        new EnhancedSchemaValidationError('Error 2', createMockSchema(), ['validation 2']),
        new Error('Unknown error')
      ];

      expect(() => handler.handleBatchErrors(errors)).not.toThrow();
    });

    test('formats errors as JSON when requested', () => {
      const jsonHandler = new ErrorHandler({
        logger: logger as any,
        outputFormat: 'json'
      });

      const error = new EnhancedSchemaValidationError(
        'Test error',
        createMockSchema(),
        ['test validation error']
      );

      // Capture console output
      const originalError = console.error;
      let jsonOutput = '';
      console.error = (output: string) => {
        jsonOutput = output;
      };

      jsonHandler.handleError(error);

      console.error = originalError;

      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.type).toBe('EnhancedSchemaValidationError');
      expect(parsed.suggestions).toBeDefined();
    });
  });

  describe('GeneratorErrorBoundary', () => {
    let logger: MockLogger;
    let handler: ErrorHandler;
    let boundary: GeneratorErrorBoundary;

    beforeEach(() => {
      logger = new MockLogger();
      handler = new ErrorHandler({ logger: logger as any });
      boundary = new GeneratorErrorBoundary(handler);
    });

    test('catches and re-throws errors from async operations', async () => {
      const operation = async () => {
        throw new Error('Test error');
      };

      await expect(
        boundary.withErrorBoundary(operation)
      ).rejects.toThrow('Test error');
    });

    test('returns result when operation succeeds', async () => {
      const operation = async () => {
        return 'success';
      };

      const result = await boundary.withErrorBoundary(operation);
      expect(result).toBe('success');
    });

    test('handles batch operations with mixed results', async () => {
      const operations = [
        async () => 'success1',
        async () => { throw new Error('batch error'); },
        async () => 'success2'
      ];

      await expect(
        boundary.withBatchErrorBoundary(operations)
      ).rejects.toThrow();
    });

    test('returns all results when batch operations succeed', async () => {
      const operations = [
        async () => 'result1',
        async () => 'result2',
        async () => 'result3'
      ];

      const results = await boundary.withBatchErrorBoundary(operations);
      expect(results).toEqual(['result1', 'result2', 'result3']);
    });
  });

  describe('Error Context and Suggestions', () => {
    test('provides relevant suggestions based on error type', () => {
      const schemaError = new EnhancedSchemaValidationError(
        'Missing identifier',
        createMockSchema(),
        ['identifier.name is missing']
      );

      const suggestions = schemaError.getSuggestions();
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.includes('identifier.name'))).toBe(true);
    });

    test('includes error context for debugging', () => {
      const schema = createMockSchema({ 
        identifier: { name: 'TestSchema', kind: 'resource' } 
      });
      const error = new EnhancedSchemaValidationError(
        'Test error',
        schema,
        ['test error']
      );

      expect(error.context).toBeDefined();
      expect(error.context?.schemaName).toBe('TestSchema');
      expect(error.context?.schemaKind).toBe('resource');
    });

    test('provides recovery actions where applicable', () => {
      const fileError = new EnhancedFileOperationError(
        'Permission denied',
        'write',
        '/test/file.ts',
        new Error('EACCES')
      );

      const actions = fileError.getRecoveryActions();
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].command).toBeDefined();
    });
  });
});