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

import assert from "node:assert";
import type { CodegenLog } from "@root/utils/log";
import { compareCollisionSources, compareCollisionVariants } from "./collision-order";
import { transformFhirSchema, transformValueSet } from "./core/transformer";
import type { ResolveCollisionsConf, TypeSchemaCollisions } from "./ir/types";
import type { Register } from "./register";
import type { CanonicalUrl, Identifier, PkgName } from "./types";
import { hashSchema, isNestedTypeSchema, isProfileNestedTypeSchema, packageMetaToFhir, type TypeSchema } from "./types";

// Re-export core dependencies
export type { Identifier, TypeSchema } from "./types";

export interface GenerateTypeSchemasResult {
    schemas: TypeSchema[];
    collisions: TypeSchemaCollisions;
}

type HashedSchema = { schema: TypeSchema; hash: string };

type SchemaWithSource = HashedSchema & {
    sourcePackage: PkgName;
    sourceCanonical: CanonicalUrl;
};

// The index holds one schema per url and package, so a variant of another kind collides too.
const collisionKey = (id: Identifier): string => `${id.url}|${id.package}`;

const sourceKey = (source: SchemaWithSource): string => `${source.sourcePackage}|${source.sourceCanonical}`;

export const deduplicateSchemas = (
    schemasWithSources: SchemaWithSource[],
    resolveCollisions?: ResolveCollisionsConf,
    logger?: CodegenLog,
): GenerateTypeSchemasResult => {
    // key -> hash
    const groups: Record<string, Record<string, { typeSchema: TypeSchema; sources: SchemaWithSource[] }>> = {};

    for (const item of schemasWithSources) {
        const key = collisionKey(item.schema.identifier);
        const { hash } = item;

        groups[key] ??= {};
        groups[key][hash] ??= { typeSchema: item.schema, sources: [] };
        groups[key][hash].sources.push(item);
    }

    // key -> variants, best first
    const ranked = Object.fromEntries(
        Object.entries(groups).map(([key, versions]) => [
            key,
            Object.entries(versions)
                .map(([schemaHash, version]) => ({
                    ...version,
                    schemaHash,
                    sources: [...version.sources].sort(compareCollisionSources),
                }))
                .sort(compareCollisionVariants),
        ]),
    );

    const keptSchemas: Record<string, TypeSchema> = {};
    const collisions: TypeSchemaCollisions = {};
    // Sources of the variant kept for each schema that declares nested types.
    const keptSources: Record<string, Set<string>> = {};

    for (const [key, sorted] of Object.entries(ranked)) {
        const best = sorted[0];
        if (!best || isNestedTypeSchema(best.typeSchema) || isProfileNestedTypeSchema(best.typeSchema)) continue;

        let kept = best;
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
                    kept = match;
                } else {
                    logger?.dryWarn(
                        "#resolveCollisionMiss",
                        `'${url}': preferred source '${preferredCanonical.canonical}' from '${preferredCanonical.package}' not found among variants: ${allSources.map((s) => `${s.sourceCanonical} (${s.sourcePackage})`).join(", ")}`,
                    );
                }
            } else {
                logger?.dryWarn("#duplicateSchema", `'${url}' from '${pkg}' has ${sorted.length} versions`);
            }

            collisions[pkg] ??= {};
            collisions[pkg][url] = sorted.flatMap((v) =>
                v.sources.map((s) => ({
                    typeSchema: v.typeSchema,
                    sourcePackage: s.sourcePackage,
                    sourceCanonical: s.sourceCanonical,
                })),
            );
        }
        keptSchemas[key] = kept.typeSchema;
        keptSources[key] = new Set(kept.sources.map(sourceKey));
    }

    // A nested type is part of the schema it is declared in: take the variant from the sources of
    // that schema's kept variant, or none when only its dropped variants declare it (but see below).
    for (const [key, sorted] of Object.entries(ranked)) {
        const schema = sorted[0]?.typeSchema;
        if (!isNestedTypeSchema(schema) && !isProfileNestedTypeSchema(schema)) continue;
        const declaredInSources = keptSources[collisionKey(schema.declaredIn)];
        assert(
            declaredInSources,
            `${schema.declaredIn.url}, which declares ${schema.identifier.url}, is not among the schemas`,
        );
        const variant = sorted.find((v) => v.sources.some((s) => declaredInSources.has(sourceKey(s))));
        if (variant) keptSchemas[key] = variant.typeSchema;
    }

    // A profile built on a dropped variant of its base points at that variant's nested types
    // (e.g. the base profile's own copy of `component`): keep the ones a kept schema depends on.
    const pending = Object.values(keptSchemas);
    for (const schema of pending) {
        for (const dep of "dependencies" in schema ? (schema.dependencies ?? []) : []) {
            const key = collisionKey(dep);
            const variants = ranked[key];
            // Only nested types can be left out above.
            if (keptSchemas[key] || !variants) continue;
            const variant = variants.find((v) => v.typeSchema.identifier.version === dep.version) ?? variants[0];
            if (!variant) continue;
            keptSchemas[key] = variant.typeSchema;
            pending.push(variant.typeSchema);
        }
    }

    const schemas = Object.keys(ranked).flatMap((key) => keptSchemas[key] ?? []);
    return { schemas, collisions };
};

export const generateTypeSchemas = async (
    register: Register,
    resolveCollisions?: ResolveCollisionsConf,
    logger?: CodegenLog,
): Promise<GenerateTypeSchemasResult> => {
    const schemasWithSources: SchemaWithSource[] = [];
    const withHash = (schema: TypeSchema): HashedSchema => ({ schema, hash: hashSchema(schema) });

    // allFs()/allVs() list a dependency's schema once per package whose closure reaches it, and every
    // listing counts as a collision source (the most-listed variant wins). Transform and hash it once.
    const transformedFs: Record<string, HashedSchema[]> = {};
    for (const fhirSchema of register.allFs()) {
        const pkgId = packageMetaToFhir(fhirSchema.package_meta);
        const transformed = (transformedFs[`${pkgId}|${fhirSchema.url}`] ??= transformFhirSchema(
            register,
            fhirSchema,
            logger,
        ).map(withHash));

        for (const { schema, hash } of transformed) {
            schemasWithSources.push({
                schema,
                hash,
                sourcePackage: pkgId,
                sourceCanonical: fhirSchema.url,
            });
        }
    }

    const transformedVs: Record<string, HashedSchema> = {};
    for (const vsSchema of register.allVs()) {
        const pkgId = packageMetaToFhir(vsSchema.package_meta);
        const { schema, hash } = (transformedVs[`${pkgId}|${vsSchema.url}`] ??= withHash(
            await transformValueSet(register, vsSchema, logger),
        ));
        schemasWithSources.push({
            schema,
            hash,
            sourcePackage: pkgId,
            sourceCanonical: vsSchema.url,
        });
    }

    return deduplicateSchemas(schemasWithSources, resolveCollisions, logger);
};
