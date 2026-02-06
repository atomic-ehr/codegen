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

import { createHash } from "node:crypto";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import { transformFhirSchema, transformValueSet } from "./core/transformer";
import type { TypeSchemaCollisions } from "./ir/types";
import type { Register } from "./register";
import { shouldSkipCanonical } from "./skip-hack";
import { packageMetaToFhir, type TypeSchema } from "./types";

const hashSchema = (schema: TypeSchema): string => {
    const json = JSON.stringify(schema);
    return createHash("sha256").update(json).digest("hex").slice(0, 16);
};

// Re-export core dependencies
export { TypeSchemaGenerator } from "./generator";
export { shouldSkipCanonical, skipList } from "./skip-hack";
export type { Identifier, TypeSchema } from "./types";

export interface GenerateTypeSchemasResult {
    schemas: TypeSchema[];
    collisions: TypeSchemaCollisions;
}

export const generateTypeSchemas = async (
    register: Register,
    logger?: CodegenLogger,
): Promise<GenerateTypeSchemasResult> => {
    const schemas = [] as TypeSchema[];
    for (const fhirSchema of register.allFs()) {
        const pkgId = packageMetaToFhir(fhirSchema.package_meta);
        const skipCheck = shouldSkipCanonical(fhirSchema.package_meta, fhirSchema.url);
        if (skipCheck.shouldSkip) {
            logger?.dry_warn(`Skip ${fhirSchema.url} from ${pkgId}. Reason: ${skipCheck.reason}`);
            continue;
        }
        schemas.push(...(await transformFhirSchema(register, fhirSchema, logger)));
    }
    for (const vsSchema of register.allVs()) {
        schemas.push(await transformValueSet(register, vsSchema, logger));
    }

    // Deduplicate schemas by (url, package) - same schema can be generated multiple times
    // when referenced from different FHIR schemas (e.g., shared bindings)
    // Structure: key -> { hash -> { count, schema } }
    const seen: Record<string, Record<string, { count: number; schema: TypeSchema }>> = {};
    const firstSchema: Record<string, TypeSchema> = {};
    let identicalCollisions = 0;
    let contentMismatchCollisions = 0;

    for (const schema of schemas) {
        const key = `${schema.identifier.url}|${schema.identifier.package}`;
        const hash = hashSchema(schema);

        if (!seen[key]) {
            seen[key] = {};
            firstSchema[key] = schema;
        }

        if (seen[key][hash] !== undefined) {
            // Same key, same hash - identical collision
            seen[key][hash].count++;
            identicalCollisions++;
        } else {
            // Same key, different hash - content mismatch
            const hashCount = Object.keys(seen[key]).length;
            if (hashCount > 0) {
                contentMismatchCollisions++;
            }
            seen[key][hash] = { count: 1, schema };
        }
    }

    if (identicalCollisions > 0) {
        logger?.info(`Deduplicated ${identicalCollisions} identical schema collisions`);
    }

    // Build collisions structure: Record<PkgName, Record<CanonicalUrl, TypeSchema[]>>
    const collisions: TypeSchemaCollisions = {};
    const keysWithMismatches = Object.entries(seen).filter(([_, hashes]) => Object.keys(hashes).length > 1);

    for (const [_, hashes] of keysWithMismatches) {
        const schemaVersions = Object.values(hashes).map((h) => h.schema);
        for (const schema of schemaVersions) {
            const pkg = schema.identifier.package;
            const canonical = schema.identifier.url;
            collisions[pkg] ??= {};
            collisions[pkg][canonical] ??= [];
            if (!collisions[pkg][canonical].some((s) => hashSchema(s) === hashSchema(schema))) {
                collisions[pkg][canonical].push(schema);
            }
        }
    }

    if (contentMismatchCollisions > 0) {
        // Report per-key collision details
        for (const [key, hashes] of keysWithMismatches) {
            const uniqueVersions = Object.keys(hashes).length;
            logger?.warn(`Content mismatch: ${key} has ${uniqueVersions} unique versions`);
        }
        const totalUniqueVersions = keysWithMismatches.reduce(
            (sum, [_, hashes]) => sum + Object.keys(hashes).length,
            0,
        );
        logger?.warn(
            `Total: ${contentMismatchCollisions} collisions with different content (${keysWithMismatches.length} keys with ${totalUniqueVersions} unique versions)`,
        );
    }

    return { schemas: Object.values(firstSchema), collisions };
};
