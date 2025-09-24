/**
 * High-Level API Module
 *
 * Main entry point for the atomic-codegen high-level API.
 * Provides convenient access to all generators and utilities.
 *
 * @packageDocumentation
 */

// Re-export core utilities
export {
  TypeSchemaCache,
  TypeSchemaGenerator,
  TypeSchemaParser,
} from "../typeschema/index.js";
// Re-export core TypeSchema types for convenience
export type {
  TypeSchema,
  TypeSchemaField,
  TypeSchemaIdentifier,
} from "../typeschema/type-schema.types.js";
export type { PackageInfo } from "../typeschema/types.js";
// Export types and interfaces
export type {
  APIBuilderOptions,
  GenerationResult,
  ProgressCallback,
} from "./builder.js";
// Export main API builder and utilities
export {
  APIBuilder,
  createAPI,
  createAPIFromConfig,
  generateTypesFromFiles,
  generateTypesFromPackage,
} from "./builder.js";
export type { GeneratedFile } from "./generators/base/index.js";
export type { TypeScriptGeneratorOptions } from "./generators/typescript.js";
// Export generator classes for advanced usage
export { TypeScriptGenerator } from "./generators/typescript.js";

/**
 * Quick start examples:
 *
 * @example
 * Generate TypeScript types from a FHIR package:
 * ```typescript
 * import { createAPI } from '@atomic-codegen/api';
 *
 * const result = await createAPI()
 *   .fromPackage('hl7.fhir.r4.core')
 *   .typescript()
 *   .generate();
 * ```
 *
 * @example
 * Generate TypeScript types from TypeSchema files:
 * ```typescript
 * import { createAPI } from '@atomic-codegen/api';
 *
 * const result = await createAPI()
 *   .fromFiles('./schemas/*.ndjson')
 *   .typescript()
 *   .generate();
 * ```
 *
 * @example
 * Build in-memory without writing files:
 * ```typescript
 * import { createAPI } from '@atomic-codegen/api';
 *
 * const results = await createAPI()
 *   .fromPackage('hl7.fhir.r4.core')
 *   .typescript()
 *   .build();
 * ```
 */
