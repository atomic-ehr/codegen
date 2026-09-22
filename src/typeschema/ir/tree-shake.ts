import assert from "node:assert";
import type { CodegenLog } from "@root/utils/log";
import { extractDependencies, extractProfileDependencies } from "../core/transformer";
import {
    type CanonicalUrl,
    concatIdentifiers,
    extractExtensionDeps,
    type Field,
    type Identifier,
    isBindingSchema,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNestedIdentifier,
    isNestedTypeSchema,
    isNotChoiceDeclarationField,
    isPrimitiveTypeSchema,
    isProfileTypeSchema,
    isResourceTypeSchema,
    isSnapshotProfileTypeSchema,
    isSpecializationTypeSchema,
    isTypeDiscriminated,
    isValueSetTypeSchema,
    type PkgName,
    type ProfileTypeSchema,
    type SpecializationTypeSchema,
    type TypeSchema,
} from "../types";
import type { TypeSchemaIndex } from "../utils";
import type { IrReport, TreeShakeConf, TreeShakeDefaults, TreeShakeReport, TreeShakeRule } from "./types";

const ensureIrReport = (indexOrReport: TypeSchemaIndex | IrReport): IrReport => {
    if ("irReport" in indexOrReport && typeof indexOrReport.irReport === "function") {
        return indexOrReport.irReport();
    }
    return indexOrReport as IrReport;
};

export const rootTreeShakeReadme = (report: TypeSchemaIndex | IrReport) => {
    const { treeShake: treeShakeReport } = ensureIrReport(report);
    assert(treeShakeReport);
    const lines = ["# Tree Shake Report", ""];
    if (treeShakeReport.skippedPackages.length === 0) lines.push("All packages are included.");
    else lines.push("Skipped packages:", "");
    for (const pkgName of treeShakeReport.skippedPackages) {
        lines.push(`- ${pkgName}`);
    }
    lines.push("");
    return lines.join("\n");
};

export const packageTreeShakeReadme = (report: TypeSchemaIndex | IrReport, pkgName: PkgName) => {
    const { treeShake: treeShakeReport } = ensureIrReport(report);
    assert(treeShakeReport);
    const lines = [`# Package: ${pkgName}`, ""];
    assert(treeShakeReport.packages[pkgName]);
    lines.push("## Canonical Fields Changes", "");
    if (Object.keys(treeShakeReport.packages[pkgName].canonicals).length === 0) {
        lines.push("All canonicals translated as is.", "");
    } else {
        for (const [canonicalUrl, { skippedFields }] of Object.entries(treeShakeReport.packages[pkgName].canonicals)) {
            lines.push(`- <${canonicalUrl}>`);
            if (skippedFields.length === 0) {
                lines.push("    - All fields translated as is.", "");
            } else {
                lines.push(`    - Skipped fields: ${skippedFields.map((f: string) => `\`${f}\``).join(", ")}`);
                lines.push("");
            }
        }
        lines.push("");
    }
    lines.push("## Skipped Canonicals", "");
    if (treeShakeReport.packages[pkgName].skippedCanonicals.length === 0) {
        lines.push("No skipped canonicals");
    } else {
        lines.push("Skipped canonicals:", "");
        for (const canonicalUrl of treeShakeReport.packages[pkgName].skippedCanonicals) {
            lines.push(`- <${canonicalUrl}>`);
        }
        lines.push("");
    }
    return lines.join("\n");
};

const mutableSelectFields = (schema: SpecializationTypeSchema | ProfileTypeSchema, selectFields: string[]) => {
    const selectedFields: Record<string, Field> = {};

    const selectPolimorphic: Record<string, { declaration?: string[]; instances?: string[] }> = {};
    for (const fieldName of selectFields) {
        const field = schema.fields?.[fieldName];
        if (!schema.fields || !field) throw new Error(`Field ${fieldName} not found`);

        if (isChoiceDeclarationField(field)) {
            if (!selectPolimorphic[fieldName]) selectPolimorphic[fieldName] = {};
            selectPolimorphic[fieldName].declaration = field.choices;
        } else if (isChoiceInstanceField(field)) {
            const choiceName = field.choiceOf;
            if (!selectPolimorphic[choiceName]) selectPolimorphic[choiceName] = {};
            selectPolimorphic[choiceName].instances = [...(selectPolimorphic[choiceName].instances ?? []), fieldName];
        } else {
            selectedFields[fieldName] = field;
        }
    }

    for (const [choiceName, { declaration, instances }] of Object.entries(selectPolimorphic)) {
        const choices = instances ?? declaration;
        assert(choices);
        for (const choiceInstanceName of choices) {
            const field = schema.fields?.[choiceInstanceName];
            assert(field);
            selectedFields[choiceInstanceName] = field;
        }
        const decl = schema.fields?.[choiceName];
        assert(decl);
        selectedFields[choiceName] = { ...decl, choices: choices };
    }
    schema.fields = selectedFields;
};

const mutableIgnoreFields = (schema: SpecializationTypeSchema | ProfileTypeSchema, ignoreFields: string[]) => {
    for (const fieldName of ignoreFields) {
        const field = schema.fields?.[fieldName];
        if (!schema.fields || !field) throw new Error(`Field ${fieldName} not found`);
        if (schema.fields) {
            if (isChoiceDeclarationField(field)) {
                for (const choiceName of field.choices) {
                    delete schema.fields[choiceName];
                }
            }

            if (isChoiceInstanceField(field)) {
                const choiceDeclaration = schema.fields[field.choiceOf];
                assert(isChoiceDeclarationField(choiceDeclaration));
                choiceDeclaration.choices = choiceDeclaration.choices.filter((c) => c !== fieldName);
                if (choiceDeclaration.choices.length === 0) {
                    delete schema.fields[field.choiceOf];
                }
            }

            delete schema.fields[fieldName];
        }
    }
};

const mutableIgnoreExtensions = (schema: ProfileTypeSchema, ignoreExtensions: string[]) => {
    if (!schema.extensions) return;
    for (const url of ignoreExtensions) {
        if (!schema.extensions.some((ext) => ext.url === url))
            throw new Error(`Extension ${url} not found in profile ${schema.identifier.url}`);
    }
    schema.extensions = schema.extensions.filter((ext) => !ext.url || !ignoreExtensions.includes(ext.url));
    if (schema.extensions.length === 0) schema.extensions = undefined;
};

const mutableFillReport = (report: TreeShakeReport, tsIndex: TypeSchemaIndex, shakedIndex: TypeSchemaIndex) => {
    const packages = Object.keys(tsIndex.schemasByPackage);
    const shakedPackages = Object.keys(shakedIndex.schemasByPackage);
    const skippedPackages = packages.filter((pkg) => !shakedPackages.includes(pkg));
    report.skippedPackages = skippedPackages;

    for (const [pkgName, shakedSchemas] of Object.entries(shakedIndex.schemasByPackage)) {
        if (skippedPackages.includes(pkgName)) continue;
        const tsSchemas = tsIndex.schemasByPackage[pkgName];
        assert(tsSchemas);
        report.packages[pkgName] = {
            skippedCanonicals: tsSchemas
                .filter((schema) => !shakedSchemas.includes(schema))
                .map((schema) => schema.identifier.url)
                .sort(),
            canonicals: Object.fromEntries(
                shakedSchemas
                    .map((shakedSchema) => {
                        const schema = tsIndex.resolve(shakedSchema.identifier);
                        assert(schema);
                        if (!isSpecializationTypeSchema(schema)) return undefined;
                        assert(isSpecializationTypeSchema(shakedSchema));
                        if (!schema.fields) return undefined;
                        if (!shakedSchema.fields) {
                            return [shakedSchema.identifier.url, Object.keys(schema.fields)];
                        }
                        const shakedFieldNames = Object.keys(shakedSchema.fields);
                        const skippedFields = Object.keys(schema.fields)
                            .filter((field) => !shakedFieldNames.includes(field))
                            .sort();
                        if (skippedFields.length === 0) return undefined;
                        return [shakedSchema.identifier.url, { skippedFields }] as const;
                    })
                    .filter((e): e is readonly [CanonicalUrl, { skippedFields: string[] }] => e !== undefined),
            ),
        };
    }
};

const treeShakeTypeSchemaWithResolver = (
    schema: TypeSchema,
    rule: TreeShakeRule,
    resolveType?: TypeSchemaIndex["resolveType"],
): TypeSchema => {
    schema = JSON.parse(JSON.stringify(schema));
    if (
        isPrimitiveTypeSchema(schema) ||
        isValueSetTypeSchema(schema) ||
        isBindingSchema(schema) ||
        isSnapshotProfileTypeSchema(schema)
    )
        return schema;

    if (rule.selectFields) {
        if (rule.ignoreFields) throw new Error("Cannot use both ignoreFields and selectFields in the same rule");
        mutableSelectFields(schema, rule.selectFields);
    }

    if (rule.ignoreFields) {
        if (rule.selectFields) throw new Error("Cannot use both ignoreFields and selectFields in the same rule");
        mutableIgnoreFields(schema, rule.ignoreFields);
    }

    if (isProfileTypeSchema(schema) && rule.ignoreExtensions) {
        mutableIgnoreExtensions(schema, rule.ignoreExtensions);
    }

    // Slicing entries follow their fields: drop slicing for fields removed above.
    if (schema.slicing) {
        const kept = Object.fromEntries(Object.entries(schema.slicing).filter(([name]) => schema.fields?.[name]));
        schema.slicing = Object.keys(kept).length > 0 ? kept : undefined;
    }

    if (schema.nested) {
        const nestedIdentity = (identifier: { package: PkgName; url: CanonicalUrl }) =>
            JSON.stringify([identifier.package, identifier.url]);
        const usedTypes = new Set<string>();
        const collectUsedNestedTypes = (s: { fields?: Record<string, Field> }) => {
            Object.values(s.fields ?? {})
                .filter(isNotChoiceDeclarationField)
                .filter((f) => isNestedIdentifier(f.type))
                .forEach((f) => {
                    const identity = nestedIdentity(f.type);
                    if (!usedTypes.has(identity)) {
                        usedTypes.add(identity);
                        const nestedTypeDef = schema.nested?.find(
                            (nested) => nestedIdentity(nested.identifier) === identity,
                        );
                        if (nestedTypeDef) {
                            collectUsedNestedTypes(nestedTypeDef);
                        } else if (!resolveType || !isNestedTypeSchema(resolveType(f.type))) {
                            throw new Error(
                                `Nested schema ${JSON.stringify(f.type)} not found for ${JSON.stringify(schema.identifier)}`,
                            );
                        }
                    }
                });
        };
        collectUsedNestedTypes(schema);
        schema.nested = schema.nested.filter((nested) => usedTypes.has(nestedIdentity(nested.identifier)));
    }

    if (isProfileTypeSchema(schema)) {
        const extDeps = schema.extensions?.flatMap(extractExtensionDeps);
        schema.dependencies = concatIdentifiers(
            extractProfileDependencies(schema.identifier, schema.base, schema.fields, schema.nested),
            extDeps,
        );
    } else {
        assert(!isNestedIdentifier(schema.identifier));
        schema.dependencies = extractDependencies(schema.identifier, schema.base, schema.fields, schema.nested);
    }
    return schema;
};

export const treeShakeTypeSchema = (schema: TypeSchema, rule: TreeShakeRule, _logger?: CodegenLog): TypeSchema =>
    treeShakeTypeSchemaWithResolver(schema, rule);

/** Reference target identifiers (base resources and target profiles) of a schema's fields, including nested types. */
const collectReferenceTargets = (schema: TypeSchema): Identifier[] => {
    if (!isSpecializationTypeSchema(schema) && !isProfileTypeSchema(schema)) return [];
    const fieldSets = [schema.fields, ...(schema.nested ?? []).map((n) => n.fields)];
    return fieldSets.flatMap((fields) =>
        Object.values(fields ?? {})
            .filter(isNotChoiceDeclarationField)
            .flatMap((f) => [...(f.reference?.resource ?? []), ...(f.reference?.profiles ?? [])])
            .filter((id): id is Identifier => !isNestedIdentifier(id)),
    );
};

const extractResourceTypeFromMatch = (match: Record<string, unknown>): string | undefined => {
    for (const value of Object.values(match)) {
        if (typeof value !== "object" || value === null) continue;
        const nestedMatch = value as Record<string, unknown>;
        if (typeof nestedMatch.resourceType === "string") return nestedMatch.resourceType;
        const nestedResourceType = extractResourceTypeFromMatch(nestedMatch);
        if (nestedResourceType) return nestedResourceType;
    }
    return undefined;
};

const collectSliceMatchResourceTargets = (schema: TypeSchema, tsIndex: TypeSchemaIndex): TypeSchema[] => {
    if (!isSpecializationTypeSchema(schema) && !isProfileTypeSchema(schema)) return [];
    return Object.values(schema.slicing ?? {})
        .filter(isTypeDiscriminated)
        .flatMap((slicing) => Object.values(slicing.slices ?? {}))
        .flatMap((slice) => {
            const resourceType = extractResourceTypeFromMatch(slice.match ?? {});
            if (!resourceType) return [];
            const candidates = tsIndex.collectResources().filter(({ identifier }) => identifier.name === resourceType);
            if (candidates.length === 0)
                throw new Error(
                    `Slice match resource type ${resourceType} not found for ${JSON.stringify(schema.identifier)}`,
                );

            const candidateIds = new Set(candidates.map(({ identifier }) => JSON.stringify(identifier)));
            const candidateUrls = [...new Set(candidates.map(({ identifier }) => identifier.url))];
            const resolveInPackages = (packages: PkgName[]): TypeSchema[] => {
                const resolved: Record<string, TypeSchema> = {};
                const resolutionTree = tsIndex.register?.resolutionTree();
                for (const pkgName of packages) {
                    for (const url of candidateUrls) {
                        const hasDirectCandidate = candidates.some(
                            ({ identifier }) => identifier.package === pkgName && identifier.url === url,
                        );
                        if (!hasDirectCandidate && !resolutionTree?.[pkgName]?.[url]?.[0]) continue;
                        const target = tsIndex.resolveByUrl(pkgName, url);
                        if (!isResourceTypeSchema(target) || !candidateIds.has(JSON.stringify(target.identifier)))
                            continue;
                        resolved[JSON.stringify(target.identifier)] = target;
                    }
                }
                return Object.values(resolved);
            };

            const ownerTargets = resolveInPackages([schema.identifier.package]);
            if (ownerTargets.length === 1) return ownerTargets;

            const dependencyPackages = [
                ...new Set(
                    (schema.dependencies ?? [])
                        .filter((dependency) => !isNestedIdentifier(dependency))
                        .map((dependency) => dependency.package)
                        .filter((pkgName) => pkgName !== schema.identifier.package),
                ),
            ];
            const dependencyTargets = resolveInPackages(dependencyPackages);
            if (ownerTargets.length === 0 && dependencyTargets.length === 1) return dependencyTargets;
            if (ownerTargets.length === 0 && dependencyTargets.length === 0 && candidates.length === 1)
                return candidates;

            throw new Error(
                `Slice match resource type ${resourceType} is ambiguous for ${JSON.stringify(schema.identifier)}: ${candidates.map(({ identifier }) => JSON.stringify(identifier)).join(", ")}`,
            );
        });
};

export const treeShake = (
    tsIndex: TypeSchemaIndex,
    treeShake: TreeShakeConf,
    defaults?: TreeShakeDefaults,
): TypeSchemaIndex => {
    const focusedSchemas: TypeSchema[] = [];
    const followedSchemas: TypeSchema[] = [];
    for (const [pkgId, requires] of Object.entries(treeShake)) {
        for (const [url, rule] of Object.entries(requires)) {
            const schema = tsIndex.resolveByUrl(pkgId, url as CanonicalUrl);
            if (!schema || isNestedTypeSchema(schema)) throw new Error(`Schema not found for ${pkgId} ${url}`);
            const shaked = treeShakeTypeSchemaWithResolver(schema, rule, tsIndex.resolveType);
            focusedSchemas.push(shaked);
            if (rule.followReferences ?? defaults?.followReferences) {
                for (const refId of collectReferenceTargets(shaked)) {
                    const refSchema = tsIndex.resolve(refId);
                    if (!refSchema)
                        throw new Error(`Reference target ${JSON.stringify(refId)} not found for ${pkgId} ${url}`);
                    followedSchemas.push(refSchema);
                }
            }
        }
    }
    // Explicit roots win over followed reference targets: a root's rule must not
    // be overridden by the untouched schema pulled in via followReferences.
    const rootIds = new Set(focusedSchemas.map((s) => JSON.stringify(s.identifier)));
    for (const schema of followedSchemas) {
        if (!rootIds.has(JSON.stringify(schema.identifier))) focusedSchemas.push(schema);
    }
    const collectDeps = (schemas: TypeSchema[], acc: Record<string, TypeSchema>): TypeSchema[] => {
        if (schemas.length === 0) return Object.values(acc);
        for (const schema of schemas) {
            acc[JSON.stringify(schema.identifier)] = schema;
        }

        const newSchemas: TypeSchema[] = [];

        for (const schema of schemas) {
            if (isSpecializationTypeSchema(schema) || isProfileTypeSchema(schema)) {
                const dependencies = [
                    ...(schema.dependencies ?? []),
                    ...collectSliceMatchResourceTargets(schema, tsIndex).map(({ identifier }) => identifier),
                ];
                dependencies.forEach((dep) => {
                    if (isNestedIdentifier(dep)) return;
                    const depSchema = tsIndex.resolve(dep);
                    if (!depSchema)
                        throw new Error(
                            `Dependent schema ${JSON.stringify(dep)} not found for ${JSON.stringify(schema.identifier)}`,
                        );
                    const id = JSON.stringify(depSchema.identifier);
                    if (!acc[id]) newSchemas.push(depSchema);
                });
                // NOTE: nested types' deps are already included in the parent's dependencies
                // via extractNestedDependencies, so no need to collect them separately.
            }
        }
        return collectDeps(newSchemas, acc);
    };

    const shaked = collectDeps(focusedSchemas, {});

    const shakedIndex = tsIndex.replaceSchemas(shaked);
    const treeShakeReport: TreeShakeReport = { skippedPackages: [], packages: {} };
    const irReport = shakedIndex.irReport();
    irReport.treeShake = treeShakeReport;
    mutableFillReport(treeShakeReport, tsIndex, shakedIndex);
    return shakedIndex;
};
