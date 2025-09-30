/**
 * Nested Types (BackboneElement) Handling
 *
 * Functions for extracting and transforming nested types from FHIRSchema
 */

import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@root/typeschema/register";
import type {
    CanonicalUrl,
    Identifier,
    Name,
    PackageMeta,
    RichFHIRSchema,
    TypeSchemaField,
    TypeSchemaNestedType,
} from "../types";
import { buildField, isNestedElement, mkNestedField } from "./field-builder";
import { mkNestedIdentifier } from "./identifier";

/**
 * Collect all nested elements from a FHIRSchema
 */
export function collectNestedElements(
    fhirSchema: FHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement>,
): Array<[string[], FHIRSchemaElement]> {
    const nested: Array<[string[], FHIRSchemaElement]> = [];

    for (const [key, element] of Object.entries(elements)) {
        const path = [...parentPath, key];

        // Add this element if it's nested (BackboneElement or has elements)
        if (isNestedElement(element)) {
            nested.push([path, element]);
        }

        // Recursively collect from child elements
        if (element.elements) {
            nested.push(...collectNestedElements(fhirSchema, path, element.elements));
        }
    }

    return nested;
}

export async function transformNestedElements(
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement>,
    register: Register,
    packageInfo?: PackageMeta,
): Promise<Record<string, TypeSchemaField>> {
    const fields: Record<string, TypeSchemaField> = {};

    for (const [key, element] of Object.entries(elements)) {
        const path = [...parentPath, key];

        if (isNestedElement(element)) {
            // Reference to another nested type
            fields[key] = mkNestedField(fhirSchema, path, element, register, packageInfo);
        } else {
            // Regular field
            fields[key] = await buildField(fhirSchema, path, element, register, packageInfo);
        }
    }

    return fields;
}

/**
 * Build TypeSchema for all nested types in a FHIRSchema
 */
export async function buildNestedTypes(
    fhirSchema: RichFHIRSchema,
    register: Register,
    packageInfo?: PackageMeta,
): Promise<any[] | undefined> {
    if (!fhirSchema.elements) return undefined;

    const nestedTypes: any[] = [];
    const nestedElements = collectNestedElements(fhirSchema, [], fhirSchema.elements);

    // Filter to only include elements that have sub-elements (actual nested types)
    const actualNested = nestedElements.filter(
        ([_, element]) => element.elements && Object.keys(element.elements).length > 0,
    );

    for (const [path, element] of actualNested) {
        const identifier = mkNestedIdentifier(fhirSchema, path);

        // Base is usually BackboneElement - ensure all nested types have a base
        // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
        let base;
        if (element.type === "BackboneElement" || !element.type) {
            // For BackboneElement or undefined type, always use BackboneElement as base
            base = {
                kind: "complex-type" as const,
                package: packageInfo?.name || "hl7.fhir.r4.core",
                version: packageInfo?.version || "4.0.1",
                name: "BackboneElement" as Name,
                url: "http://hl7.org/fhir/StructureDefinition/BackboneElement" as CanonicalUrl,
            };
        } else {
            // Use the specified type as base
            base = {
                kind: "complex-type" as const,
                package: packageInfo?.name || "hl7.fhir.r4.core",
                version: packageInfo?.version || "4.0.1",
                name: element.type as Name,
                url: `http://hl7.org/fhir/StructureDefinition/${element.type}` as CanonicalUrl,
            };
        }

        // Transform sub-elements into fields
        const fields = await transformNestedElements(fhirSchema, path, element.elements!, register, packageInfo);

        const nestedType: TypeSchemaNestedType = {
            identifier,
            base, // Always include base
            fields,
        };

        nestedTypes.push(nestedType);
    }

    // Sort by URL for consistent output
    nestedTypes.sort((a, b) => a.identifier.url.localeCompare(b.identifier.url));

    return nestedTypes;
}

/**
 * Extract dependencies from nested types
 */
export function extractNestedDependencies(nestedTypes: TypeSchemaNestedType[]): Identifier[] {
    const deps: Identifier[] = [];

    for (const nested of nestedTypes) {
        // Add the nested type itself as a dependency
        deps.push(nested.identifier);

        // Add base dependency
        if (nested.base) {
            deps.push(nested.base);
        }

        // Add field type dependencies
        for (const field of Object.values(nested.fields || {})) {
            if ("type" in field && field.type) {
                deps.push(field.type);
            }
            if ("binding" in field && field.binding) {
                deps.push(field.binding);
            }
        }
    }

    return deps;
}
