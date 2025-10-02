/**
 * Field Building Utilities
 *
 * Functions for transforming FHIRSchema elements into TypeSchema fields
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
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

export function isRequired(register: Register, fhirSchema: RichFHIRSchema, path: string[]): boolean {
    const fieldName = path[path.length - 1];
    if (!fieldName) throw new Error(`Internal error: fieldName is missing for path ${path.join("/")}`);
    const parentPath = path.slice(0, -1);

    const requires = register.resolveFsGenealogy(fhirSchema.url).flatMap((fs) => {
        if (parentPath.length === 0) return fs.required || [];
        if (!fs.elements) return [];
        let elem: RichFHIRSchema | FHIRSchemaElement | undefined = fs;
        for (const k of parentPath) {
            elem = elem?.elements?.[k];
        }
        return elem?.required || [];
    });
    return new Set(requires).has(fieldName);
}

export function isExcluded(register: Register, fhirSchema: RichFHIRSchema, path: string[]): boolean {
    const fieldName = path[path.length - 1];
    if (!fieldName) throw new Error(`Internal error: fieldName is missing for path ${path.join("/")}`);
    const parentPath = path.slice(0, -1);

    const requires = register.resolveFsGenealogy(fhirSchema.url).flatMap((fs) => {
        if (parentPath.length === 0) return fs.excluded || [];
        if (!fs.elements) return [];
        let elem: RichFHIRSchema | FHIRSchemaElement | undefined = fs;
        for (const k of parentPath) {
            elem = elem?.elements?.[k];
        }
        return elem?.excluded || [];
    });

    return new Set(requires).has(fieldName);
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

    const fieldType = buildFieldType(fhirSchema, path, element, register, fhirSchema.package_meta);
    return {
        type: fieldType!,
        required: isRequired(register, fhirSchema, path),
        excluded: isExcluded(register, fhirSchema, path),

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
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
): RegularField {
    return {
        type: mkNestedIdentifier(fhirSchema, path),
        array: element.array || false,
        required: isRequired(register, fhirSchema, path),
        excluded: isExcluded(register, fhirSchema, path),
    };
}
