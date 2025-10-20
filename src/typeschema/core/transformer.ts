/**
 * Main FHIRSchema to TypeSchema Transformer
 *
 * Core transformation logic for converting FHIRSchema to TypeSchema format
 */

import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { Register } from "@typeschema/register";
import {
    type Field,
    type Identifier,
    isNestedIdentifier,
    isProfileIdentifier,
    type NestedType,
    packageMetaToFhir,
    type RichFHIRSchema,
    type RichValueSet,
    type TypeSchema,
    type ValueSetTypeSchema,
} from "@typeschema/types";
import { collectBindingSchemas, extractValueSetConceptsByUrl } from "./binding";
import { isNestedElement, mkField, mkNestedField } from "./field-builder";
import { mkIdentifier, mkValueSetIdentifierByUrl } from "./identifier";
import { extractNestedDependencies, mkNestedTypes } from "./nested-types";

export function mkFields(
    register: Register,
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement> | undefined,
    logger?: CodegenLogger,
): Record<string, Field> | undefined {
    if (!elements) return undefined;

    const fields: Record<string, Field> = {};
    for (const key of register.getAllElementKeys(elements)) {
        const path = [...parentPath, key];
        const elemSnapshot = register.resolveElementSnapshot(fhirSchema, path);
        if (isNestedElement(elemSnapshot)) {
            fields[key] = mkNestedField(register, fhirSchema, path, elemSnapshot, logger);
        } else {
            fields[key] = mkField(register, fhirSchema, path, elemSnapshot, logger);
        }
    }

    return fields;
}

function extractFieldDependencies(fields: Record<string, Field>): Identifier[] {
    const deps: Identifier[] = [];

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

/**
 * Check if a FHIR schema represents an extension
 */
function isExtensionSchema(fhirSchema: FHIRSchema, _identifier: Identifier): boolean {
    // Check if this is based on Extension
    if (fhirSchema.base === "Extension" || fhirSchema.base === "http://hl7.org/fhir/StructureDefinition/Extension") {
        return true;
    }

    // Check if the URL indicates this is an extension
    if (fhirSchema.url?.includes("/extension/") || fhirSchema.url?.includes("-extension")) {
        return true;
    }

    // Check if the name indicates this is an extension
    if (fhirSchema.name?.toLowerCase().includes("extension")) {
        return true;
    }

    // Check if the type is Extension
    if (fhirSchema.type === "Extension") {
        return true;
    }

    return false;
}

export async function transformValueSet(
    register: Register,
    valueSet: RichValueSet,
    logger?: CodegenLogger,
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

function extractDependencies(
    identifier: Identifier,
    base: Identifier | undefined,
    fields: Record<string, Field> | undefined,
    nestedTypes: NestedType[] | undefined,
): Identifier[] | undefined {
    const deps = [];
    if (base) deps.push(base);
    if (fields) deps.push(...extractFieldDependencies(fields));
    if (nestedTypes) deps.push(...extractNestedDependencies(nestedTypes));

    const uniqDeps: Record<string, Identifier> = {};
    for (const dep of deps) {
        if (dep.url === identifier.url) continue;
        uniqDeps[dep.url] = dep;
    }

    const localNestedTypeUrls = new Set(nestedTypes?.map((nt) => nt.identifier.url));

    const result = Object.values(uniqDeps)
        .filter((e) => {
            if (isProfileIdentifier(identifier)) return true;
            if (!isNestedIdentifier(e)) return true;
            return !localNestedTypeUrls.has(e.url);
        })
        .sort((a, b) => a.url.localeCompare(b.url));

    return result.length > 0 ? result : undefined;
}

function transformFhirSchemaResource(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): TypeSchema[] {
    const identifier = mkIdentifier(fhirSchema);

    let base: Identifier | undefined;
    if (fhirSchema.base && fhirSchema.type !== "Element") {
        const baseFs = register.resolveFs(
            fhirSchema.package_meta,
            register.ensureSpecializationCanonicalUrl(fhirSchema.package_meta, fhirSchema.base),
        );
        if (!baseFs) {
            throw new Error(
                `Base resource not found '${fhirSchema.base}' for <${fhirSchema.url}> from ${packageMetaToFhir(fhirSchema.package_meta)}`,
            );
        }
        base = mkIdentifier(baseFs);
    }
    const fields = mkFields(register, fhirSchema, [], fhirSchema.elements, logger);
    const nested = mkNestedTypes(register, fhirSchema, logger);
    const dependencies = extractDependencies(identifier, base, fields, nested);

    const typeSchema: TypeSchema = {
        identifier,
        base,
        fields,
        nested,
        description: fhirSchema.description,
        dependencies,
    };

    const bindingSchemas = collectBindingSchemas(register, fhirSchema, logger);

    return [typeSchema, ...bindingSchemas];
}

export async function transformFhirSchema(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): Promise<TypeSchema[]> {
    const schemas = transformFhirSchemaResource(register, fhirSchema, logger);
    if (isExtensionSchema(fhirSchema, mkIdentifier(fhirSchema))) {
        const schema = schemas[0];
        if (!schema) throw new Error(`Expected schema to be defined`);
        (schema as any).metadata = {
            isExtension: true, // Mark as extension for file organization
        };
    }
    return schemas;
}
