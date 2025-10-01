/**
 * Field Building Utilities
 *
 * Functions for transforming FHIRSchema elements into TypeSchema fields
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@root/typeschema/register";
import type { CanonicalUrl, Identifier, Name, PackageMeta, RichFHIRSchema, TypeSchemaField } from "../types";
import { buildEnum } from "./binding";
import { mkBindingIdentifier, mkIdentifier, mkNestedIdentifier } from "./identifier";

export function isRequired(
    fhirSchema: FHIRSchema,
    path: string[],
    _manager: ReturnType<typeof CanonicalManager>,
): boolean {
    if (path.length === 0) return false;

    const fieldName = path[path.length - 1];
    const parentPath = path.slice(0, -1);

    // Navigate to parent element
    let parentElement: any = fhirSchema;
    for (const key of parentPath) {
        parentElement = parentElement.elements?.[key];
        if (!parentElement) break;
    }

    // Check if field is in required array
    if (parentElement?.required?.includes(fieldName)) {
        return true;
    }

    // Also check at root level
    if (parentPath.length === 0 && fieldName && fhirSchema.required?.includes(fieldName)) {
        return true;
    }

    return false;
}

/**
 * Check if a field is excluded
 */
export function isExcluded(
    fhirSchema: FHIRSchema,
    path: string[],
    _manager: ReturnType<typeof CanonicalManager>,
): boolean {
    if (path.length === 0) return false;

    const fieldName = path[path.length - 1];
    const parentPath = path.slice(0, -1);

    // Navigate to parent element
    let parentElement: any = fhirSchema;
    for (const key of parentPath) {
        parentElement = parentElement.elements?.[key];
        if (!parentElement) break;
    }

    // Check if field is in excluded array
    if (parentElement?.excluded?.includes(fieldName)) {
        return true;
    }

    // Also check at root level
    if (parentPath.length === 0 && fieldName && fhirSchema.excluded?.includes(fieldName)) {
        return true;
    }

    return false;
}

export const buildReferences = (
    element: FHIRSchemaElement,
    register: Register,
    _packageInfo?: PackageMeta,
): Identifier[] | undefined => {
    if (!element.refers) return undefined;
    return element.refers.map((ref) => {
        const curl = register.ensureCanonicalUrl(ref as Name);
        const fs = register.resolveFs(curl)!;
        return mkIdentifier(fs);
    });
};

/**
 * Build field type identifier
 */
export function buildFieldType(
    fhirSchema: RichFHIRSchema,
    _path: string[],
    element: FHIRSchemaElement,
    _manager: ReturnType<typeof CanonicalManager>,
    packageInfo?: PackageMeta,
): Identifier | undefined {
    // Handle element reference (for slicing)
    if (element.elementReference) {
        const refPath = element.elementReference
            .filter((_, i) => i % 2 === 1) // Get odd indices (the actual path parts)
            .map((p) => p as string)
            .filter((p) => p !== "elements"); // Remove 'elements' which is just a container

        // Only return nested identifier if we have a non-empty path
        if (refPath.length > 0) {
            return mkNestedIdentifier(fhirSchema, refPath);
        }
    }

    // Handle normal type
    if (element.type) {
        const typeUrl = element.type.includes("/")
            ? element.type
            : `http://hl7.org/fhir/StructureDefinition/${element.type}`;

        // Always create a type identifier, even if we can't resolve
        const kind = element.type.match(/^[a-z]/) ? "primitive-type" : "complex-type";
        const isStandardFhir = typeUrl.startsWith("http://hl7.org/fhir/");
        return {
            kind: kind as any,
            package: isStandardFhir ? "hl7.fhir.r4.core" : packageInfo?.name || "undefined",
            version: isStandardFhir ? "4.0.1" : packageInfo?.version || "undefined",
            name: element.type as Name,
            url: typeUrl as CanonicalUrl,
        };
    }

    return undefined;
}

export const buildField = (
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
    register: Register,
    packageInfo?: PackageMeta,
): TypeSchemaField => {
    let binding;
    let _enumValues;
    if (element.binding) {
        binding = mkBindingIdentifier(fhirSchema, path, element.binding.bindingName, packageInfo);

        if (element.binding.strength === "required" && element.type === "code") {
            _enumValues = buildEnum(element, register);
        }
    }

    return {
        type: buildFieldType(fhirSchema, path, element, register, packageInfo)!,
        required: isRequired(fhirSchema, path, register),
        excluded: isExcluded(fhirSchema, path, register),

        reference: buildReferences(element, register, packageInfo),

        array: element.array || false,
        min: element.min,
        max: element.max,

        choices: element.choices,
        choiceOf: element.choiceOf,

        binding: binding,
    };
};

function _removeEmptyValues<T extends Record<string, any>>(obj: T): T {
    const result: any = {};

    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined && value !== null) {
            if (Array.isArray(value) && value.length === 0) {
                continue;
            }
            result[key] = value;
        }
    }

    return result;
}

/**
 * Check if an element represents a nested type (BackboneElement)
 */
export function isNestedElement(element: FHIRSchemaElement): boolean {
    return (
        element.type === "BackboneElement" || (element.elements && Object.keys(element.elements).length > 0) || false
    );
}

export function mkNestedField(
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
    manager: ReturnType<typeof CanonicalManager>,
    _packageInfo?: PackageMeta,
): TypeSchemaField {
    return {
        type: mkNestedIdentifier(fhirSchema, path),
        array: element.array || false,
        required: isRequired(fhirSchema, path, manager),
        excluded: isExcluded(fhirSchema, path, manager),
    };
}
