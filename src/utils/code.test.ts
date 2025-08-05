/**
 * Tests for Code Generation Utilities
 */

import { test, expect, describe } from 'bun:test';
import {
  formatMultiline,
  generateJSDoc,
  escapeString,
  generateUnionType,
  generateEnum,
  toEnumKey,
  generateInterfaceField,
  needsImport,
  extractTypeNames,
  generateTypeAlias,
  generateConstAssertion,
  cleanupCode
} from './code';

describe('Code Generation Utilities', () => {
  describe('formatMultiline', () => {
    test('should format with correct indentation', () => {
      const text = 'line1\nline2\nline3';
      expect(formatMultiline(text, 0)).toBe('line1\nline2\nline3');
      expect(formatMultiline(text, 2)).toBe('  line1\n  line2\n  line3');
      expect(formatMultiline(text, 4)).toBe('    line1\n    line2\n    line3');
    });

    test('should handle empty lines', () => {
      const text = 'line1\n\nline3';
      expect(formatMultiline(text, 2)).toBe('  line1\n\n  line3');
    });
  });

  describe('generateJSDoc', () => {
    test('should generate simple JSDoc', () => {
      const result = generateJSDoc('This is a description');
      expect(result).toEqual([
        '/**',
        ' * This is a description',
        ' */'
      ]);
    });

    test('should handle multi-line descriptions', () => {
      const result = generateJSDoc('Line 1\nLine 2\nLine 3');
      expect(result).toEqual([
        '/**',
        ' * Line 1',
        ' * Line 2',
        ' * Line 3',
        ' */'
      ]);
    });

    test('should include tags', () => {
      const result = generateJSDoc('Description', {
        param: 'name The name parameter',
        returns: 'string'
      });
      expect(result).toContain(' * @param name The name parameter');
      expect(result).toContain(' * @returns string');
    });

    test('should handle no description with tags', () => {
      const result = generateJSDoc(undefined, { since: '1.0.0' });
      expect(result).toEqual([
        '/**',
        ' * @since 1.0.0',
        ' */'
      ]);
    });
  });

  describe('escapeString', () => {
    test('should escape special characters', () => {
      expect(escapeString('normal')).toBe('normal');
      expect(escapeString("it's")).toBe("it\\'s");
      expect(escapeString('say "hello"')).toBe('say \\"hello\\"');
      expect(escapeString('line1\nline2')).toBe('line1\\nline2');
      expect(escapeString('tab\there')).toBe('tab\\there');
      expect(escapeString('back\\slash')).toBe('back\\\\slash');
    });
  });

  describe('generateUnionType', () => {
    test('should handle empty array', () => {
      expect(generateUnionType([])).toBe('never');
    });

    test('should handle single value', () => {
      expect(generateUnionType(['active'])).toBe("'active'");
    });

    test('should handle multiple values', () => {
      expect(generateUnionType(['draft', 'active', 'retired']))
        .toBe("'draft' | 'active' | 'retired'");
    });

    test('should escape values', () => {
      expect(generateUnionType(["don't", 'say "hello"']))
        .toBe("'don\\'t' | 'say \\\"hello\\\"'");
    });
  });

  describe('generateEnum', () => {
    test('should generate valid enum', () => {
      const result = generateEnum('Status', ['draft', 'active', 'retired']);
      expect(result).toEqual([
        'export enum Status {',
        "  DRAFT = 'draft',",
        "  ACTIVE = 'active',",
        "  RETIRED = 'retired'",
        '}'
      ]);
    });

    test('should handle empty enum', () => {
      const result = generateEnum('Empty', []);
      expect(result).toEqual([
        'export enum Empty {',
        '}'
      ]);
    });
  });

  describe('toEnumKey', () => {
    test('should convert to valid enum keys', () => {
      expect(toEnumKey('simple')).toBe('SIMPLE');
      expect(toEnumKey('with-dash')).toBe('WITH_DASH');
      expect(toEnumKey('with.dot')).toBe('WITH_DOT');
      expect(toEnumKey('with space')).toBe('WITH_SPACE');
      expect(toEnumKey('123start')).toBe('_123START');
      expect(toEnumKey('__multiple__')).toBe('MULTIPLE');
    });
  });

  describe('generateInterfaceField', () => {
    test('should generate required field', () => {
      const result = generateInterfaceField('name', 'string', true);
      expect(result).toEqual(['name: string;']);
    });

    test('should generate optional field', () => {
      const result = generateInterfaceField('name', 'string', false);
      expect(result).toEqual(['name?: string;']);
    });

    test('should include description', () => {
      const result = generateInterfaceField('name', 'string', true, 'The name field');
      expect(result).toEqual([
        '/**',
        ' * The name field',
        ' */',
        'name: string;'
      ]);
    });
  });

  describe('needsImport', () => {
    test('should return false for built-in types', () => {
      expect(needsImport('string')).toBe(false);
      expect(needsImport('number')).toBe(false);
      expect(needsImport('boolean')).toBe(false);
      expect(needsImport('any')).toBe(false);
      expect(needsImport('Array')).toBe(false);
    });

    test('should return false for complex types with operators', () => {
      expect(needsImport('string | number')).toBe(false);
      expect(needsImport('Array<string>')).toBe(false);
    });

    test('should return true for custom types', () => {
      expect(needsImport('Patient')).toBe(true);
      expect(needsImport('CodeableConcept')).toBe(true);
    });
  });

  describe('extractTypeNames', () => {
    test('should extract simple type names', () => {
      expect(extractTypeNames('Patient')).toEqual(['Patient']);
      expect(extractTypeNames('CodeableConcept')).toEqual(['CodeableConcept']);
    });

    test('should extract from union types', () => {
      const types = extractTypeNames('Patient | Practitioner | Organization');
      expect(types).toContain('Patient');
      expect(types).toContain('Practitioner');
      expect(types).toContain('Organization');
    });

    test('should extract from generic types', () => {
      expect(extractTypeNames('Reference<Patient>')).toEqual(['Reference', 'Patient']);
      expect(extractTypeNames('Array<CodeableConcept>')).toEqual(['CodeableConcept']);
    });

    test('should filter out built-in types', () => {
      expect(extractTypeNames('string | Patient')).toEqual(['Patient']);
      expect(extractTypeNames('Array<string>')).toEqual([]);
    });
  });

  describe('generateTypeAlias', () => {
    test('should generate simple type alias', () => {
      const result = generateTypeAlias('Id', 'string');
      expect(result).toEqual(['export type Id = string;']);
    });

    test('should include description', () => {
      const result = generateTypeAlias('Id', 'string', 'Unique identifier');
      expect(result).toEqual([
        '/**',
        ' * Unique identifier',
        ' */',
        'export type Id = string;'
      ]);
    });
  });

  describe('generateConstAssertion', () => {
    test('should generate const assertion', () => {
      const result = generateConstAssertion('CONFIG', { foo: 'bar', num: 42 });
      expect(result[0]).toBe('export const CONFIG = {\n  "foo": "bar",\n  "num": 42\n} as const;');
    });

    test('should handle arrays', () => {
      const result = generateConstAssertion('ITEMS', ['a', 'b', 'c']);
      expect(result[0]).toBe('export const ITEMS = [\n  "a",\n  "b",\n  "c"\n] as const;');
    });
  });

  describe('cleanupCode', () => {
    test('should remove multiple blank lines', () => {
      expect(cleanupCode('line1\n\n\n\nline2')).toBe('line1\n\nline2\n');
    });

    test('should ensure file ends with newline', () => {
      expect(cleanupCode('no newline')).toBe('no newline\n');
      expect(cleanupCode('has newline\n')).toBe('has newline\n');
    });

    test('should remove trailing whitespace', () => {
      expect(cleanupCode('line1   \nline2  ')).toBe('line1\nline2\n');
    });

    test('should handle complex cleanup', () => {
      const input = 'line1   \n\n\n\nline2  \n\nline3';
      const expected = 'line1\n\nline2\n\nline3\n';
      expect(cleanupCode(input)).toBe(expected);
    });
  });
});