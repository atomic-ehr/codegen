import assert from "node:assert";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import { extractDependencies } from "./core/transformer";
import type { ResolutionTree } from "./register";
import {
    type CanonicalUrl,
    type Field,
    isBindingSchema,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNestedIdentifier,
    isNotChoiceDeclarationField,
    isPrimitiveTypeSchema,
    isSpecializationTypeSchema,
    isValueSetTypeSchema,
    type NestedType,
    type RegularTypeSchema,
    type TypeSchema,
} from "./types";
import { mkTypeSchemaIndex, type TypeSchemaIndex } from "./utils";

export type TreeShake = Record<string, Record<string, TreeShakeRule>>;

export type TreeShakeRule = { ignoreFields?: string[]; selectFields?: string[] };

const mutableSelectFields = (schema: RegularTypeSchema, selectFields: string[]) => {
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

const mutableIgnoreFields = (schema: RegularTypeSchema, ignoreFields: string[]) => {
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

export const treeShakeTypeSchema = (schema: TypeSchema, rule: TreeShakeRule, _logger?: CodegenLogger): TypeSchema => {
    schema = structuredClone(schema);
    if (isPrimitiveTypeSchema(schema) || isValueSetTypeSchema(schema) || isBindingSchema(schema)) return schema;

    if (rule.selectFields) {
        if (rule.ignoreFields) throw new Error("Cannot use both ignoreFields and selectFields in the same rule");
        mutableSelectFields(schema, rule.selectFields);
    }

    if (rule.ignoreFields) {
        if (rule.selectFields) throw new Error("Cannot use both ignoreFields and selectFields in the same rule");
        mutableIgnoreFields(schema, rule.ignoreFields);
    }

    if (schema.nested) {
        const usedTypes = new Set<CanonicalUrl>();
        const collectUsedNestedTypes = (s: RegularTypeSchema | NestedType) => {
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

    schema.dependencies = extractDependencies(schema.identifier, schema.base, schema.fields, schema.nested);
    return schema;
};

export const treeShake = (
    tsIndex: TypeSchemaIndex,
    treeShake: TreeShake,
    { resolutionTree, logger }: { resolutionTree?: ResolutionTree; logger?: CodegenLogger },
): TypeSchemaIndex => {
    const focusedSchemas: TypeSchema[] = [];
    for (const [pkgId, requires] of Object.entries(treeShake)) {
        for (const [url, rule] of Object.entries(requires)) {
            const schema = tsIndex.resolveByUrl(pkgId, url as CanonicalUrl);
            if (!schema) throw new Error(`Schema not found for ${pkgId} ${url}`);
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
            if (isSpecializationTypeSchema(schema)) {
                if (!schema.dependencies) continue;
                schema.dependencies.forEach((dep) => {
                    const depSchema = tsIndex.resolve(dep);
                    if (!depSchema)
                        throw new Error(
                            `Dependent schema ${JSON.stringify(dep)} not found for ${JSON.stringify(schema.identifier)}`,
                        );
                    const id = JSON.stringify(depSchema.identifier);
                    if (!acc[id]) newSchemas.push(depSchema);
                });
                if (schema.nested) {
                    for (const nest of schema.nested) {
                        if (isNestedIdentifier(nest.identifier)) continue;
                        const id = JSON.stringify(nest.identifier);
                        if (!acc[id]) newSchemas.push(nest);
                    }
                }
            }
        }
        return collectDeps(newSchemas, acc);
    };

    const shaked = collectDeps(focusedSchemas, {});
    return mkTypeSchemaIndex(shaked, { resolutionTree, logger });
};
