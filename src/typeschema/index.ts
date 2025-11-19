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
import { packageMetaToFhir, type TypeSchema } from "./types";

// Re-export core dependencies
export { TypeSchemaGenerator } from "./generator";
export { TypeSchemaParser } from "./parser";
export type { Identifier, TypeSchema } from "./types";

const codeableReferenceInR4 = "Use CodeableReference which is not provided by FHIR R4.";
const availabilityInR4 = "Use Availability which is not provided by FHIR R4.";

const skipMe: Record<string, Record<string, string>> = {
    "hl7.fhir.uv.extensions.r4#1.0.0": {
        "http://hl7.org/fhir/StructureDefinition/extended-contact-availability": availabilityInR4,
        "http://hl7.org/fhir/StructureDefinition/immunization-procedure": codeableReferenceInR4,
        "http://hl7.org/fhir/StructureDefinition/specimen-additive": codeableReferenceInR4,
        "http://hl7.org/fhir/StructureDefinition/workflow-barrier": codeableReferenceInR4,
        "http://hl7.org/fhir/StructureDefinition/workflow-protectiveFactor": codeableReferenceInR4,
        "http://hl7.org/fhir/StructureDefinition/workflow-reason": codeableReferenceInR4,
    },
    "hl7.fhir.r5.core#5.0.0": {
        "http://hl7.org/fhir/StructureDefinition/shareablecodesystem":
            "FIXME: CodeSystem.concept.concept defined by ElementReference. FHIR Schema generator output broken value in it, so we just skip it for now.",
    },
};

export const generateTypeSchemas = async (register: Register, logger?: CodegenLogger): Promise<TypeSchema[]> => {
    const fhirSchemas = [] as TypeSchema[];
    for (const fhirSchema of register.allFs()) {
        const pkgId = packageMetaToFhir(fhirSchema.package_meta);
        if (skipMe[pkgId]?.[fhirSchema.url]) {
            logger?.dry_warn(`Skip ${fhirSchema.url} from ${pkgId}. Reason: ${skipMe[pkgId]?.[fhirSchema.url]}`);
            continue;
        }
        fhirSchemas.push(...(await transformFhirSchema(register, fhirSchema, logger)));
    }
    for (const vsSchema of register.allVs()) {
        fhirSchemas.push(await transformValueSet(register, vsSchema, logger));
    }
    return fhirSchemas;
};
