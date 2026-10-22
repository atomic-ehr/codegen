/**
 * Main FHIRSchema to TypeSchema Transformer
 *
 * Core transformation logic for converting FHIRSchema to TypeSchema format
 */

import assert from "node:assert";
import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { CodegenLog } from "@root/utils/log";
import { isVirtualFhirBaseCanonical, type Register } from "@typeschema/register";
import {
    type Field,
    type FieldSlicing,
    type Identifier,
    isNestedIdentifier,
    type ProfileTypeSchema,
    packageMetaToFhir,
    type RichFHIRSchema,
    type RichValueSet,
    type SpecializationTypeSchema,
    type TypeSchema,
    type ValueSetTypeSchema,
} from "@typeschema/types";
import { collectBindingSchemas, extractValueSetConceptsByUrl } from "./binding";
import { extractDependencies } from "./dependencies";
import { buildSlicing, mkField, mkNestedField } from "./field-builder";
import { mkIdentifier, mkValueSetIdentifierByUrl } from "./identifier";
import { assignRecommendedBaseNames } from "./name-candidates";
import { isNestedElement, mkNestedTypes, mkProfileNestedTypes } from "./nested-types";
import { extractProfileExtensions } from "./profile-extensions";

export function mkFields(
    register: Register,
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement> | undefined,
    logger?: CodegenLog,
): { fields?: Record<string, Field>; slicing?: Record<string, FieldSlicing> } {
    if (!elements) return {};

    const fields: Record<string, Field> = {};
    const slicing: Record<string, FieldSlicing> = {};
    for (const key of register.getAllElementKeys(elements)) {
        const path = [...parentPath, key];
        const elemSnapshot = register.resolveElementSnapshot(fhirSchema, path);
        if (isNestedElement(register, fhirSchema, path, elemSnapshot, elements[key])) {
            fields[key] = mkNestedField(register, fhirSchema, path, elemSnapshot);
        } else {
            fields[key] = mkField(register, fhirSchema, path, elemSnapshot, logger, elements[key]);
        }
        const fieldSlicing = buildSlicing(key, elemSnapshot);
        if (fieldSlicing) slicing[key] = fieldSlicing;
    }

    return { fields, slicing: Object.keys(slicing).length > 0 ? slicing : undefined };
}

export async function transformValueSet(
    register: Register,
    valueSet: RichValueSet,
    logger?: CodegenLog,
): Promise<ValueSetTypeSchema> {
    if (!valueSet.url) throw new Error("ValueSet URL is required");

    const identifier = mkValueSetIdentifierByUrl(register, valueSet.package_meta, valueSet.url);
    const concept = extractValueSetConceptsByUrl(register, valueSet.package_meta, valueSet.url, logger);
    return {
        identifier: identifier,
        description: valueSet.description,
        concept: concept,
        compose: !concept ? valueSet.compose : undefined,
    };
}

export const transformFhirSchema = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLog,
): TypeSchema[] => {
    let base: Identifier | undefined;
    if (fhirSchema.base) {
        const baseUrl = register.ensureSpecializationCanonicalUrl(fhirSchema.base);
        const baseFs = register.resolveFs(fhirSchema.package_meta, baseUrl);
        const isVirtualLogicalBase =
            fhirSchema.kind === "logical" &&
            fhirSchema.derivation === "specialization" &&
            isVirtualFhirBaseCanonical(fhirSchema.base);
        if (!baseFs && !isVirtualLogicalBase)
            throw new Error(
                `Base resource not found '${fhirSchema.base}' for <${fhirSchema.url}> from ${packageMetaToFhir(fhirSchema.package_meta)}`,
            );
        if (baseFs) {
            const baseId = mkIdentifier(baseFs);
            assert(!isNestedIdentifier(baseId), `Unexpected nested base for ${fhirSchema.url}`);
            base = baseId;
        }
    }

    const { fields, slicing } = mkFields(register, fhirSchema, [], fhirSchema.elements, logger);
    const bindingSchemas = collectBindingSchemas(register, fhirSchema, logger);

    if (fhirSchema.derivation === "constraint") {
        const identifier = mkIdentifier(fhirSchema);
        if (!base) throw new Error(`Profile ${fhirSchema.url} must have a base type`);
        const extensions = extractProfileExtensions(register, fhirSchema, logger);
        const nested = mkProfileNestedTypes(register, fhirSchema, logger);
        const profileSchema: ProfileTypeSchema = {
            identifier,
            base,
            fields,
            slicing,
            description: fhirSchema.description,
            dependencies: extractDependencies(identifier, base, fields, extensions),
            extensions,
        };
        assignRecommendedBaseNames(profileSchema);
        return [profileSchema, ...(nested ?? []), ...bindingSchemas];
    }

    const nested = mkNestedTypes(register, fhirSchema, logger);
    if (fhirSchema.kind === "primitive-type") {
        const identifier = mkIdentifier(fhirSchema);
        assert(base, `Primitive type ${fhirSchema.url} must have a base type`);
        return [
            {
                identifier,
                description: fhirSchema.description,
                base,
                dependencies: extractDependencies(identifier, base, fields),
            },
            ...bindingSchemas,
        ];
    }

    const identifier = mkIdentifier(fhirSchema);
    const schema = {
        identifier,
        base,
        fields,
        slicing,
        description: fhirSchema.description,
        ...(fhirSchema.abstract === true ? { abstractResource: true } : {}),
        dependencies: extractDependencies(identifier, base, fields),
        typeFamily: undefined,
    } as SpecializationTypeSchema;
    return [schema, ...(nested ?? []), ...bindingSchemas];
};
