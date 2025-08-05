/**
 * TypeSchema Type Definitions
 * 
 * This file contains all TypeScript type definitions for the TypeSchema format,
 * which is an intermediate representation for FHIR SDK generation.
 */

import type { FHIRSchema, FHIRSchemaElement } from '@atomic-ehr/fhirschema';

/**
 * Identifier for any TypeSchema entity
 */
export interface TypeSchemaIdentifier {
  kind: 'primitive-type' | 'resource' | 'complex-type' | 'nested' | 'binding' | 'value-set' | 'constraint';
  package: string;
  version: string;
  name: string;
  url: string;
}

/**
 * Field definition in a TypeSchema
 */
export interface TypeSchemaField {
  type?: TypeSchemaIdentifier;
  array: boolean;
  required: boolean;
  excluded: boolean;
  min?: number;
  max?: number;
  choices?: string[];
  choiceOf?: string;
  enum?: string[];
  binding?: TypeSchemaIdentifier;
  reference?: TypeSchemaIdentifier[];
}

/**
 * Nested type (BackboneElement) definition
 */
export interface TypeSchemaNestedType {
  identifier: TypeSchemaIdentifier;
  base?: TypeSchemaIdentifier;
  fields: Record<string, TypeSchemaField>;
}

/**
 * Main TypeSchema for resources, complex types, and primitive types
 */
export interface TypeSchema {
  identifier: TypeSchemaIdentifier;
  base?: TypeSchemaIdentifier;
  description?: string;
  fields?: Record<string, TypeSchemaField>;
  nested?: TypeSchemaNestedType[];
  dependencies: TypeSchemaIdentifier[];
}

/**
 * Binding TypeSchema for value set bindings
 */
export interface TypeSchemaBinding {
  identifier: TypeSchemaIdentifier;
  type?: TypeSchemaIdentifier;
  valueset: TypeSchemaIdentifier;
  strength: string;
  enum?: string[];
  dependencies: TypeSchemaIdentifier[];
}

/**
 * Value Set TypeSchema
 */
export interface TypeSchemaValueSet {
  identifier: TypeSchemaIdentifier;
  description?: string;
  concept?: Array<{
    system: string;
    code: string;
    display?: string;
  }>;
  compose?: {
    include?: Array<{
      system?: string;
      concept?: Array<{
        code: string;
        display?: string;
      }>;
      filter?: Array<{
        property: string;
        op: string;
        value: string;
      }>;
      valueSet?: string[];
    }>;
    exclude?: Array<{
      system?: string;
      concept?: Array<{
        code: string;
        display?: string;
      }>;
      filter?: Array<{
        property: string;
        op: string;
        value: string;
      }>;
      valueSet?: string[];
    }>;
  };
  dependencies: TypeSchemaIdentifier[];
}

/**
 * Union type for all TypeSchema variants
 */
export type AnyTypeSchema = TypeSchema | TypeSchemaBinding | TypeSchemaValueSet;

/**
 * Type guards
 */
export function isTypeSchema(schema: AnyTypeSchema): schema is TypeSchema {
  return !('valueset' in schema) && !('concept' in schema && 'compose' in schema);
}

export function isTypeSchemaBinding(schema: AnyTypeSchema): schema is TypeSchemaBinding {
  return 'valueset' in schema && 'strength' in schema;
}

export function isTypeSchemaValueSet(schema: AnyTypeSchema): schema is TypeSchemaValueSet {
  return ('concept' in schema || 'compose' in schema) && !('valueset' in schema);
}

/**
 * Package metadata from fhir-canonical-manager
 */
export interface PackageInfo {
  name: string;
  version: string;
  canonical?: string;
  fhirVersions?: string[];
}

/**
 * Context for transformation operations
 */
export interface TransformContext {
  packageInfo?: PackageInfo;
  verbose?: boolean;
}