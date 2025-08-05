/**
 * Tests for Naming Utilities
 */

import { test, expect, describe } from 'bun:test';
import {
  toTypeScriptIdentifier,
  toPropertyName,
  getReferenceType,
  getChoiceBaseName,
  isChoiceField,
  getModuleName,
  generateImport,
  sortImports
} from './naming';

describe('Naming Utilities', () => {
  describe('toTypeScriptIdentifier', () => {
    test('should capitalize first letter', () => {
      expect(toTypeScriptIdentifier('patient')).toBe('Patient');
      expect(toTypeScriptIdentifier('humanName')).toBe('HumanName');
    });

    test('should handle underscore prefixed names', () => {
      expect(toTypeScriptIdentifier('_patient')).toBe('ElementPatient');
      expect(toTypeScriptIdentifier('_value')).toBe('ElementValue');
    });

    test('should preserve already capitalized names', () => {
      expect(toTypeScriptIdentifier('Patient')).toBe('Patient');
      expect(toTypeScriptIdentifier('CodeableConcept')).toBe('CodeableConcept');
    });
  });

  describe('toPropertyName', () => {
    test('should preserve normal names', () => {
      expect(toPropertyName('active')).toBe('active');
      expect(toPropertyName('telecom')).toBe('telecom');
    });

    test('should handle extension property', () => {
      expect(toPropertyName('extension')).toBe('extension');
    });

    test('should handle underscore prefixed fields', () => {
      expect(toPropertyName('_value')).toBe('_value');
      expect(toPropertyName('_id')).toBe('_id');
    });
  });

  describe('getReferenceType', () => {
    test('should return Reference for empty array', () => {
      expect(getReferenceType([])).toBe('Reference');
    });

    test('should generate single reference type', () => {
      expect(getReferenceType(['Patient'])).toBe('Reference<Patient>');
    });

    test('should generate union of reference types', () => {
      expect(getReferenceType(['Patient', 'Group'])).toBe('Reference<Patient> | Reference<Group>');
      expect(getReferenceType(['Practitioner', 'Organization', 'Patient']))
        .toBe('Reference<Practitioner> | Reference<Organization> | Reference<Patient>');
    });
  });

  describe('getChoiceBaseName', () => {
    test('should extract base name from primitive choice fields', () => {
      expect(getChoiceBaseName('valueString')).toBe('value');
      expect(getChoiceBaseName('valueBoolean')).toBe('value');
      expect(getChoiceBaseName('valueInteger')).toBe('value');
      expect(getChoiceBaseName('onsetDateTime')).toBe('onset');
    });

    test('should extract base name from complex type choice fields', () => {
      expect(getChoiceBaseName('valueCodeableConcept')).toBe('value');
      expect(getChoiceBaseName('valueQuantity')).toBe('value');
      expect(getChoiceBaseName('timingTiming')).toBe('timing');
    });

    test('should return original name if not a choice field', () => {
      expect(getChoiceBaseName('name')).toBe('name');
      expect(getChoiceBaseName('active')).toBe('active');
    });
  });

  describe('isChoiceField', () => {
    test('should identify choice fields with [x]', () => {
      expect(isChoiceField('value[x]')).toBe(true);
      expect(isChoiceField('onset[x]')).toBe(true);
    });

    test('should identify typed choice fields', () => {
      expect(isChoiceField('valueString')).toBe(true);
      expect(isChoiceField('valueCodeableConcept')).toBe(true);
      expect(isChoiceField('onsetDateTime')).toBe(true);
    });

    test('should return false for non-choice fields', () => {
      expect(isChoiceField('name')).toBe(false);
      expect(isChoiceField('active')).toBe(false);
      expect(isChoiceField('telecom')).toBe(false);
    });
  });

  describe('getModuleName', () => {
    test('should identify primitive types', () => {
      expect(getModuleName('boolean')).toBe('primitives');
      expect(getModuleName('string')).toBe('primitives');
      expect(getModuleName('decimal')).toBe('primitives');
      expect(getModuleName('instant')).toBe('primitives');
    });

    test('should identify complex types', () => {
      expect(getModuleName('Element')).toBe('complex');
      expect(getModuleName('CodeableConcept')).toBe('complex');
      expect(getModuleName('HumanName')).toBe('complex');
      expect(getModuleName('Reference')).toBe('complex');
    });

    test('should default to resources for unknown types', () => {
      expect(getModuleName('Patient')).toBe('resources');
      expect(getModuleName('Observation')).toBe('resources');
      expect(getModuleName('CustomResource')).toBe('resources');
    });
  });

  describe('generateImport', () => {
    test('should generate primitive imports', () => {
      expect(generateImport('string', 'someModule'))
        .toBe("import * as primitives from '../types/primitives';");
    });

    test('should generate complex type imports', () => {
      expect(generateImport('CodeableConcept', 'someModule'))
        .toBe("import * as complex from '../types/complex';");
    });

    test('should generate resource imports', () => {
      expect(generateImport('Patient', 'someModule'))
        .toBe("import { Patient } from './Patient';");
    });
  });

  describe('sortImports', () => {
    test('should sort imports with primitives first', () => {
      const imports = [
        "import { Patient } from './Patient';",
        "import * as primitives from '../types/primitives';",
        "import * as complex from '../types/complex';"
      ];
      
      const sorted = sortImports(imports);
      expect(sorted[0]).toContain('primitives');
      expect(sorted[1]).toContain('complex');
      expect(sorted[2]).toContain('Patient');
    });

    test('should sort resource imports alphabetically', () => {
      const imports = [
        "import { Observation } from './Observation';",
        "import { Patient } from './Patient';",
        "import { Encounter } from './Encounter';"
      ];
      
      const sorted = sortImports(imports);
      expect(sorted[0]).toContain('Encounter');
      expect(sorted[1]).toContain('Observation');
      expect(sorted[2]).toContain('Patient');
    });

    test('should handle empty array', () => {
      expect(sortImports([])).toEqual([]);
    });
  });
});