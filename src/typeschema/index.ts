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

import type { CodegenLogger } from "@root/utils/codegen-logger";
import { transformFhirSchema, transformValueSet } from "./core/transformer";
import type { Register } from "./register";
import type { TypeSchema } from "./types";

// Re-export core dependencies
export { TypeSchemaCache } from "./cache";
export { TypeSchemaGenerator } from "./generator";
export { TypeSchemaParser } from "./parser";
export type { CanonicalUrl, Field, Identifier, Name, RegularField, TypeSchema } from "./types";

export const generateTypeSchemas = async (register: Register, logger?: CodegenLogger): Promise<TypeSchema[]> => {
    const fhirSchemas = [] as TypeSchema[];
    for (const fhirSchema of register.allFs()) {
        fhirSchemas.push(...(await transformFhirSchema(register, fhirSchema, logger)));
    }
    for (const vsSchema of register.allVs()) {
        fhirSchemas.push(await transformValueSet(register, vsSchema, logger));
    }
    return fhirSchemas;
};
