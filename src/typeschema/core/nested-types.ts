/**
 * Nested Types (BackboneElement) Handling
 *
 * Functions for extracting and transforming nested types from FHIRSchema
 */

import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@root/typeschema/register";
import type { CanonicalUrl, Field, Identifier, Name, NestedType, RichFHIRSchema } from "../types";
import { isNestedElement, mkField, mkNestedField } from "./field-builder";
import { mkNestedIdentifier } from "./identifier";

function collectNestedElements(
    fhirSchema: FHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement>,
): Array<[string[], FHIRSchemaElement]> {
    const nested: Array<[string[], FHIRSchemaElement]> = [];

    for (const [key, element] of Object.entries(elements)) {
        const path = [...parentPath, key];

        if (isNestedElement(element)) {
            nested.push([path, element]);
        }

        if (element.elements) {
            nested.push(...collectNestedElements(fhirSchema, path, element.elements));
        }
    }

    return nested;
}

function transformNestedElements(
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement>,
    register: Register,
): Record<string, Field> {
    const fields: Record<string, Field> = {};

    for (const [key, element] of Object.entries(elements)) {
        const path = [...parentPath, key];

        if (isNestedElement(element)) {
            fields[key] = mkNestedField(register, fhirSchema, path, element);
        } else {
            fields[key] = mkField(register, fhirSchema, path, element);
        }
    }

    return fields;
}

export function mkNestedTypes(register: Register, fhirSchema: RichFHIRSchema): NestedType[] | undefined {
    if (!fhirSchema.elements) return undefined;

    const nestedElements = collectNestedElements(fhirSchema, [], fhirSchema.elements);

    const actualNested = nestedElements.filter(
        ([_, element]) => element.elements && Object.keys(element.elements).length > 0,
    );

    const nestedTypes: NestedType[] = [];
    for (const [path, element] of actualNested) {
        const identifier = mkNestedIdentifier(fhirSchema, path);

        // Base is usually BackboneElement - ensure all nested types have a base
        // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
        let base;
        if (element.type === "BackboneElement" || !element.type) {
            // For BackboneElement or undefined type, always use BackboneElement as base
            base = {
                kind: "complex-type" as const,
                package: fhirSchema.package_meta.name,
                version: fhirSchema.package_meta.version,
                name: "BackboneElement" as Name,
                url: "http://hl7.org/fhir/StructureDefinition/BackboneElement" as CanonicalUrl,
            };
        } else {
            // Use the specified type as base
            base = {
                kind: "complex-type" as const,
                package: fhirSchema.package_meta.name,
                version: fhirSchema.package_meta.version,
                name: element.type as Name,
                url: `http://hl7.org/fhir/StructureDefinition/${element.type}` as CanonicalUrl,
            };
        }

        const fields = transformNestedElements(fhirSchema, path, element.elements!, register);

        const nestedType: NestedType = {
            identifier,
            base,
            fields,
        };

        nestedTypes.push(nestedType);
    }

    // Sort by URL for consistent output
    nestedTypes.sort((a, b) => a.identifier.url.localeCompare(b.identifier.url));

    return nestedTypes.length === 0 ? undefined : nestedTypes;
}

export function extractNestedDependencies(nestedTypes: NestedType[]): Identifier[] {
    const deps: Identifier[] = [];

    for (const nested of nestedTypes) {
        if (nested.base) {
            deps.push(nested.base);
        }

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
