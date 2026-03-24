import assert from "node:assert";
import type { CodegenLog } from "@root/utils/log";
import { extractDependencies, extractProfileDependencies } from "../core/transformer";
import {
    type CanonicalUrl,
    concatIdentifiers,
    extractExtensionDeps,
    type Field,
    isBindingSchema,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNestedIdentifier,
    isNestedTypeSchema,
    isNotChoiceDeclarationField,
    isPrimitiveTypeSchema,
    isProfileTypeSchema,
    isSpecializationTypeSchema,
    isValueSetTypeSchema,
    type PkgName,
    type ProfileTypeSchema,
    type SpecializationTypeSchema,
    type TypeSchema,
} from "../types";
import type { TypeSchemaIndex } from "../utils";
import type { IrReport, TreeShakeConf, TreeShakeReport, TreeShakeRule } from "./types";

const ensureIrReport = (indexOrReport: TypeSchemaIndex | IrReport): IrReport => {
    if ("irReport" in indexOrReport && typeof indexOrReport.irReport === "function") {
        return indexOrReport.irReport();
    } else {
        return indexOrReport as IrReport;
    }
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

export const treeShakeTypeSchema = (schema: TypeSchema, rule: TreeShakeRule, _logger?: CodegenLog): TypeSchema => {
    schema = JSON.parse(JSON.stringify(schema));
    if (isPrimitiveTypeSchema(schema) || isValueSetTypeSchema(schema) || isBindingSchema(schema)) return schema;

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

    if (schema.nested) {
        const usedTypes = new Set<CanonicalUrl>();
        const collectUsedNestedTypes = (s: { fields?: Record<string, Field> }) => {
            Object.values(s.fields ?? {})
                .filter(isNotChoiceDeclarationField)
                .filter((f) => isNestedIdentifier(f.type))
                .forEach((f) => {
                    const url = f.type.url;
                    if (!usedTypes.has(url)) {
                        usedTypes.add(url);
                        const nestedTypeDef = schema.nested?.find((f) => f.identifier.url === url);
                        assert(nestedTypeDef);
                        collectUsedNestedTypes(nestedTypeDef);
                    }
                });
        };
        collectUsedNestedTypes(schema);
        schema.nested = schema.nested.filter((n) => usedTypes.has(n.identifier.url));
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

export const treeShake = (tsIndex: TypeSchemaIndex, treeShake: TreeShakeConf): TypeSchemaIndex => {
    const focusedSchemas: TypeSchema[] = [];
    for (const [pkgId, requires] of Object.entries(treeShake)) {
        for (const [url, rule] of Object.entries(requires)) {
            const schema = tsIndex.resolveByUrl(pkgId, url as CanonicalUrl);
            if (!schema || isNestedTypeSchema(schema)) throw new Error(`Schema not found for ${pkgId} ${url}`);
            const shaked = treeShakeTypeSchema(schema, rule);
            focusedSchemas.push(shaked);
        }
    }
    const collectDeps = (schemas: TypeSchema[], acc: Record<string, TypeSchema>): TypeSchema[] => {
        if (schemas.length === 0) return Object.values(acc);
        for (const schema of schemas) {
            acc[JSON.stringify(schema.identifier)] = schema;
        }

        const newSchemas: TypeSchema[] = [];

        for (const schema of schemas) {
            if (isSpecializationTypeSchema(schema) || isProfileTypeSchema(schema)) {
                if (!schema.dependencies) continue;
                schema.dependencies.forEach((dep) => {
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
