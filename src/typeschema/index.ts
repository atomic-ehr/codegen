/**
 * TypeSchema - FHIR Type Schema Generator
 * 
 * Main entry point for the TypeSchema library
 */

// Export all types
export * from './types';

// Export core utilities
export { 
  buildSchemaIdentifier,
  buildNestedIdentifier,
  buildValueSetIdentifier,
  buildBindingIdentifier,
  dropVersionFromUrl
} from './core/identifier';

export {
  buildField,
  buildNestedField,
  isNestedElement,
  getElementHierarchy,
  mergeElementHierarchy,
  isRequired,
  isExcluded
} from './core/field-builder';

export {
  extractValueSetConcepts,
  buildEnum,
  generateBindingSchema,
  collectBindingSchemas
} from './core/binding';

export {
  collectNestedElements,
  buildNestedTypes,
  extractNestedDependencies
} from './core/nested-types';

// Export main transformer
export {
  transformFHIRSchema,
  transformFHIRSchemas
} from './core/transformer';

// Export value set processor
export {
  transformValueSet
} from './value-set/processor';

// Re-export useful types from dependencies
export type { FHIRSchema, FHIRSchemaElement } from '@atomic-ehr/fhirschema';
export { CanonicalManager } from '@atomic-ehr/fhir-canonical-manager';