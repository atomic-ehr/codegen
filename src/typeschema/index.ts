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

import type { CodegenLog } from "@root/utils/log";
import { transformFhirSchema, transformValueSet } from "./core/transformer";
import type { ResolveCollisionsConf, TypeSchemaCollisions } from "./ir/types";
import type { Register } from "./register";
import { shouldSkipCanonical } from "./skip-hack";
import type { CanonicalUrl, PkgName } from "./types";
import { hashSchema, packageMetaToFhir, type TypeSchema } from "./types";

// Re-export core dependencies
export { shouldSkipCanonical, skipList } from "./skip-hack";
export type { TypeIdentifier as Identifier, TypeSchema } from "./types";

export interface GenerateTypeSchemasResult {
    schemas: TypeSchema[];
    collisions: TypeSchemaCollisions;
}

type SchemaWithSource = {
    schema: TypeSchema;
    sourcePackage: PkgName;
    sourceCanonical: CanonicalUrl;
};

const deduplicateSchemas = (
    schemasWithSources: SchemaWithSource[],
    resolveCollisions?: ResolveCollisionsConf,
    logger?: CodegenLog,
): GenerateTypeSchemasResult => {
    // key -> hash
    const groups: Record<string, Record<string, { typeSchema: TypeSchema; sources: SchemaWithSource[] }>> = {};

    for (const item of schemasWithSources) {
        const key = `${item.schema.identifier.url}|${item.schema.identifier.package}`;
        const hash = hashSchema(item.schema);

        groups[key] ??= {};
        groups[key][hash] ??= { typeSchema: item.schema, sources: [] };
        groups[key][hash].sources.push(item);
    }

    const schemas: TypeSchema[] = [];
    const collisions: TypeSchemaCollisions = {};

    for (const versions of Object.values(groups)) {
        const sorted = Object.values(versions).sort((a, b) => b.sources.length - a.sources.length);
        const best = sorted[0];
        if (!best) continue;

        if (sorted.length > 1) {
            const url = best.typeSchema.identifier.url;
            const pkg = best.typeSchema.identifier.package;
            const preferredCanonical = resolveCollisions?.[url];

            if (preferredCanonical) {
                const allSources = sorted.flatMap((v) => v.sources);
                const match = sorted.find((v) =>
                    v.sources.some(
                        (s) =>
                            s.sourceCanonical === preferredCanonical.canonical &&
                            s.sourcePackage === preferredCanonical.package,
                    ),
                );
                if (match) {
                    schemas.push(match.typeSchema);
                } else {
                    logger?.dryWarn(
                        "#resolveCollisionMiss",
                        `'${url}': preferred source '${preferredCanonical.canonical}' from '${preferredCanonical.package}' not found among variants: ${allSources.map((s) => `${s.sourceCanonical} (${s.sourcePackage})`).join(", ")}`,
                    );
                    schemas.push(best.typeSchema);
                }
            } else {
                logger?.dryWarn("#duplicateSchema", `'${url}' from '${pkg}' has ${sorted.length} versions`);
                schemas.push(best.typeSchema);
            }

            collisions[pkg] ??= {};
            collisions[pkg][url] = sorted.flatMap((v) =>
                v.sources.map((s) => ({
                    typeSchema: v.typeSchema,
                    sourcePackage: s.sourcePackage,
                    sourceCanonical: s.sourceCanonical,
                })),
            );
        } else {
            schemas.push(best.typeSchema);
        }
    }

    return { schemas, collisions };
};

export const generateTypeSchemas = async (
    register: Register,
    resolveCollisions?: ResolveCollisionsConf,
    logger?: CodegenLog,
): Promise<GenerateTypeSchemasResult> => {
    const schemasWithSources: { schema: TypeSchema; sourcePackage: PkgName; sourceCanonical: CanonicalUrl }[] = [];

    for (const fhirSchema of register.allFs()) {
        const pkgId = packageMetaToFhir(fhirSchema.package_meta);

        const skipCheck = shouldSkipCanonical(fhirSchema.package_meta, fhirSchema.url);
        if (skipCheck.shouldSkip) {
            logger?.dryWarn("#skipCanonical", `Skip ${fhirSchema.url} from ${pkgId}. Reason: ${skipCheck.reason}`);
            continue;
        }

        for (const schema of transformFhirSchema(register, fhirSchema, logger)) {
            schemasWithSources.push({
                schema,
                sourcePackage: pkgId,
                sourceCanonical: fhirSchema.url,
            });
        }
    }

    for (const vsSchema of register.allVs()) {
        schemasWithSources.push({
            schema: await transformValueSet(register, vsSchema, logger),
            sourcePackage: packageMetaToFhir(vsSchema.package_meta),
            sourceCanonical: vsSchema.url,
        });
    }

    return deduplicateSchemas(schemasWithSources, resolveCollisions, logger);
};
