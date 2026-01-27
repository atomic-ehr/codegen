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
import { shouldSkipCanonical } from "./skip-hack";
import { packageMetaToFhir, type TypeSchema } from "./types";

// Re-export core dependencies
export { TypeSchemaGenerator } from "./generator";
export { shouldSkipCanonical, skipList } from "./skip-hack";
export type { Identifier, TypeSchema } from "./types";

export const generateTypeSchemas = async (register: Register, logger?: CodegenLogger): Promise<TypeSchema[]> => {
    const fhirSchemas = [] as TypeSchema[];
    for (const fhirSchema of register.allFs()) {
        const pkgId = packageMetaToFhir(fhirSchema.package_meta);
        const skipCheck = shouldSkipCanonical(fhirSchema.package_meta, fhirSchema.url);
        if (skipCheck.shouldSkip) {
            logger?.dry_warn(`Skip ${fhirSchema.url} from ${pkgId}. Reason: ${skipCheck.reason}`);
            continue;
        }
        fhirSchemas.push(...(await transformFhirSchema(register, fhirSchema, logger)));
    }
    for (const vsSchema of register.allVs()) {
        fhirSchemas.push(await transformValueSet(register, vsSchema, logger));
    }
    return fhirSchemas;
};
