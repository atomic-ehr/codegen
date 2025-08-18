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
} from "../typeschema";
// Re-export core TypeSchema types for convenience
export type {
	PackageInfo,
	TypeSchemaField,
	TypeSchemaIdentifier,
} from "../typeschema/types";
// Export types and interfaces
export type {
	APIBuilderOptions,
	GenerationResult,
	ProgressCallback,
} from "./builder";
// Export main API builder and utilities
export {
	APIBuilder,
	createAPI,
	createAPIFromConfig,
	generateTypesFromFiles,
	generateTypesFromPackage,
} from "./builder";
export type {
	GeneratedRestClient,
	RestClientOptions,
} from "./generators/rest-client";
export { RestClientGenerator } from "./generators/rest-client";
export type {
	GeneratedFile,
	TypeScriptGeneratorOptions,
} from "./generators/typescript";
// Export generator classes for advanced usage
export { TypeScriptGenerator } from "./generators/typescript";

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
