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
export type { FHIRSchema } from "@atomic-ehr/fhirschema";
export { TypeSchemaCache } from "./cache.js";
export { TypeSchemaGenerator } from "./generator.js";
export { TypeSchemaParser } from "./parser.js";
export type { Identifier, TypeSchema } from "./types";
