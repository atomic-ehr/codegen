/**
 * Field Building Utilities
 *
 * Functions for transforming FHIRSchema elements into TypeSchema fields
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@root/typeschema/register";
import type {
    BindingIdentifier,
    CanonicalUrl,
    Field,
    Identifier,
    Name,
    PackageMeta,
    RegularField,
    RichFHIRSchema,
} from "../types";
import { buildEnum } from "./binding";
import { mkBindingIdentifier, mkIdentifier, mkNestedIdentifier } from "./identifier";

export function isRequired(fhirSchema: FHIRSchema, path: string[]): boolean {
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

export function isExcluded(fhirSchema: FHIRSchema, path: string[]): boolean {
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

export const mkField = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
): Field => {
    let binding: BindingIdentifier | undefined;
    let enumValues: string[] | undefined;
    if (element.binding) {
        binding = mkBindingIdentifier(fhirSchema, path, element.binding.bindingName, fhirSchema.package_meta);

        if (element.binding.strength === "required" && element.type === "code") {
            enumValues = buildEnum(element, register);
        }
    }

    return {
        type: buildFieldType(fhirSchema, path, element, register, fhirSchema.package_meta)!,
        required: isRequired(fhirSchema, path),
        excluded: isExcluded(fhirSchema, path),

        reference: buildReferences(element, register, fhirSchema.package_meta),

        array: element.array || false,
        min: element.min,
        max: element.max,

        choices: element.choices,
        choiceOf: element.choiceOf,

        binding: binding,
        enum: enumValues,
    };
};

export function isNestedElement(element: FHIRSchemaElement): boolean {
    const isBackbone = element.type === "BackboneElement";
    const isElement =
        element.type === "Element" && element.elements !== undefined && Object.keys(element.elements).length > 0;

    // TODO: Observation <- vitalsigns <- bodyweight
    // In Observation we have value[x] with choices
    // In bodyweight we have valueQuantity with additional constaraints on it's elements
    // So we need to build nested type from Quantity for here, but don't do that right now.
    const elementsWithoutType =
        element.type === undefined &&
        element.choiceOf === undefined &&
        element.elements !== undefined &&
        Object.keys(element.elements).length > 0;
    return isBackbone || isElement || elementsWithoutType;
}

export function mkNestedField(
    _register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
): RegularField {
    return {
        type: mkNestedIdentifier(fhirSchema, path),
        array: element.array || false,
        required: isRequired(fhirSchema, path),
        excluded: isExcluded(fhirSchema, path),
    };
}
