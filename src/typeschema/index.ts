/**
 * TypeSchema Core Module
 *
 * Main entry point for the TypeSchema library providing core functions
 * for FHIR-to-TypeSchema generation, parsing, and validation.
 *
 * This module focuses on:
 * - Converting FHIR to TypeSchema format
 * - Reading TypeSchema documents
 * - Validating TypeSchema documents
 */

// Re-export core dependencies
export { TypeSchemaCache } from "./cache";
export { TypeSchemaGenerator } from "./generator";
export { TypeSchemaParser } from "./parser";
export type { Identifier, TypeSchema } from "./types";
