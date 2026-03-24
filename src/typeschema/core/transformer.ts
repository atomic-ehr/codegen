/**
 * Main FHIRSchema to TypeSchema Transformer
 *
 * Core transformation logic for converting FHIRSchema to TypeSchema format
 */

import assert from "node:assert";
import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import { shouldSkipCanonical } from "@root/typeschema/skip-hack";
import type { CodegenLog } from "@root/utils/log";
import type { Register } from "@typeschema/register";
import {
    concatIdentifiers,
    extractExtensionDeps,
    type Field,
    type Identifier,
    isNestedIdentifier,
    type NestedTypeSchema,
    type ProfileIdentifier,
    packageMetaToFhir,
    type RichFHIRSchema,
    type RichValueSet,
    type SpecializationTypeSchema,
    type TypeIdentifier,
    type TypeSchema,
    type ValueSetTypeSchema,
} from "@typeschema/types";

import { collectBindingSchemas, extractValueSetConceptsByUrl } from "./binding";
import { mkField, mkNestedField } from "./field-builder";
import { mkIdentifier, mkValueSetIdentifierByUrl } from "./identifier";
import { extractNestedDependencies, isNestedElement, mkNestedTypes } from "./nested-types";
import { extractProfileExtensions } from "./profile-extensions";

export function mkFields(
    register: Register,
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement> | undefined,
    logger?: CodegenLog,
): Record<string, Field> | undefined {
    if (!elements) return undefined;

    const fields: Record<string, Field> = {};
    for (const key of register.getAllElementKeys(elements)) {
        const path = [...parentPath, key];
        const elemSnapshot = register.resolveElementSnapshot(fhirSchema, path);
        const fcurl = elemSnapshot.type ? register.ensureSpecializationCanonicalUrl(elemSnapshot.type) : undefined;
        if (fcurl && shouldSkipCanonical(fhirSchema.package_meta, fcurl).shouldSkip) {
            logger?.warn(
                "#skipCanonical",
                `Skipping field ${path} for ${fcurl} due to skip hack ${shouldSkipCanonical(fhirSchema.package_meta, fcurl).reason}`,
            );
            continue;
        }
        if (isNestedElement(register, fhirSchema, path, elemSnapshot, elements[key])) {
            fields[key] = mkNestedField(register, fhirSchema, path, elemSnapshot);
        } else {
            fields[key] = mkField(register, fhirSchema, path, elemSnapshot, logger, elements[key]);
        }
    }

    return fields;
}

function extractFieldDependencies(fields: Record<string, Field>): TypeIdentifier[] {
    const deps: TypeIdentifier[] = [];

    for (const field of Object.values(fields)) {
        if ("type" in field && field.type) {
            deps.push(field.type);
        }
        if ("binding" in field && field.binding) {
            deps.push(field.binding);
        }
    }

    return deps;
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

const collectRawDeps = (
    base: TypeIdentifier | undefined,
    fields: Record<string, Field> | undefined,
    nestedTypes: NestedTypeSchema[] | undefined,
): TypeIdentifier[] => {
    const deps: TypeIdentifier[] = [];
    if (base) deps.push(base);
    if (fields) deps.push(...extractFieldDependencies(fields));
    if (nestedTypes) deps.push(...extractNestedDependencies(nestedTypes));
    return deps;
};

export const extractDependencies = (
    identifier: Identifier,
    base: TypeIdentifier | undefined,
    fields: Record<string, Field> | undefined,
    nestedTypes: NestedTypeSchema[] | undefined,
): Identifier[] | undefined => {
    const deps = collectRawDeps(base, fields, nestedTypes);

    const filtered = deps.filter((dep): dep is Identifier => {
        if (dep.url === identifier.url) return false;
        if (isNestedIdentifier(dep)) return false;
        return true;
    });

    return concatIdentifiers(filtered);
};

export const extractProfileDependencies = (
    identifier: ProfileIdentifier,
    base: TypeIdentifier | undefined,
    fields: Record<string, Field> | undefined,
    nestedTypes: NestedTypeSchema[] | undefined,
): TypeIdentifier[] | undefined => {
    const deps = collectRawDeps(base, fields, nestedTypes);
    const filtered = deps.filter((dep) => dep.url !== identifier.url);
    return concatIdentifiers(filtered);
};

export function transformFhirSchema(register: Register, fhirSchema: RichFHIRSchema, logger?: CodegenLog): TypeSchema[] {
    let base: Identifier | undefined;
    if (fhirSchema.base) {
        const baseFs = register.resolveFs(
            fhirSchema.package_meta,
            register.ensureSpecializationCanonicalUrl(fhirSchema.base),
        );
        if (!baseFs)
            throw new Error(
                `Base resource not found '${fhirSchema.base}' for <${fhirSchema.url}> from ${packageMetaToFhir(fhirSchema.package_meta)}`,
            );
        const baseId = mkIdentifier(baseFs);
        assert(!isNestedIdentifier(baseId), `Unexpected nested base for ${fhirSchema.url}`);
        base = baseId;
    }

    const fields = mkFields(register, fhirSchema, [], fhirSchema.elements, logger);
    const nested = mkNestedTypes(register, fhirSchema, logger);
    const bindingSchemas = collectBindingSchemas(register, fhirSchema, logger);

    if (fhirSchema.derivation === "constraint") {
        const identifier = mkIdentifier(fhirSchema);
        if (!base) throw new Error(`Profile ${fhirSchema.url} must have a base type`);
        const extensions = extractProfileExtensions(register, fhirSchema, logger);
        const extensionDeps = extensions?.flatMap(extractExtensionDeps);
        const rawDeps = extractProfileDependencies(identifier, base, fields, nested);
        return [
            {
                identifier,
                base,
                fields,
                nested,
                description: fhirSchema.description,
                dependencies: concatIdentifiers(rawDeps, extensionDeps),
                extensions,
            },
            ...bindingSchemas,
        ];
    }

    if (fhirSchema.kind === "primitive-type") {
        const identifier = mkIdentifier(fhirSchema);
        assert(base, `Primitive type ${fhirSchema.url} must have a base type`);
        return [
            {
                identifier,
                description: fhirSchema.description,
                base,
                dependencies: extractDependencies(identifier, base, fields, nested),
            },
            ...bindingSchemas,
        ];
    }

    const identifier = mkIdentifier(fhirSchema);
    const schema = {
        identifier,
        base,
        fields,
        nested,
        description: fhirSchema.description,
        dependencies: extractDependencies(identifier, base, fields, nested),
        typeFamily: undefined,
    } as SpecializationTypeSchema;
    return [schema, ...bindingSchemas];
}
