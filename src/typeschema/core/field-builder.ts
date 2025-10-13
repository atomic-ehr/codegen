/**
 * Field Building Utilities
 *
 * Functions for transforming FHIRSchema elements into TypeSchema fields
 */

import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@root/typeschema/register";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { BindingIdentifier, Field, Identifier, Name, PackageMeta, RegularField, RichFHIRSchema } from "../types";
import { buildEnum } from "./binding";
import { mkBindingIdentifier, mkIdentifier } from "./identifier";
import { mkNestedIdentifier } from "./nested-types";

function isRequired(register: Register, fhirSchema: RichFHIRSchema, path: string[]): boolean {
    const fieldName = path[path.length - 1]!;
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

function isExcluded(register: Register, fhirSchema: RichFHIRSchema, path: string[]): boolean {
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

const buildReferences = (
    element: FHIRSchemaElement,
    register: Register,
    _packageInfo?: PackageMeta,
): Identifier[] | undefined => {
    if (!element.refers) return undefined;
    return element.refers.map((ref) => {
        const curl = register.ensureSpecializationCanonicalUrl(ref as Name);
        const fs = register.resolveFs(curl)!;
        return mkIdentifier(fs);
    });
};

export function buildFieldType(
    register: Register,
    fhirSchema: RichFHIRSchema,
    element: FHIRSchemaElement,
    logger?: CodegenLogger,
): Identifier | undefined {
    if (element.elementReference) {
        const refPath = element.elementReference
            .slice(1) // drop canonicalUrl
            .filter((_, i) => i % 2 === 1); // drop `elements` from path
        return mkNestedIdentifier(register, fhirSchema, refPath, logger);
    } else if (element.type) {
        const url = register.ensureSpecializationCanonicalUrl(element.type);
        const fieldFs = register.resolveFs(url);
        if (!fieldFs) throw new Error(`Could not resolve field '${element.type}'`);
        return mkIdentifier(fieldFs);
    } else if (element.choices) {
        return undefined;
    } else if (fhirSchema.derivation === "constraint") {
        return undefined; // FIXME: should be removed
    } else {
        logger?.error(
            `Can't recognize element type '${fhirSchema.url}' (${fhirSchema.derivation}): ${JSON.stringify(element, undefined, 2)}`,
        );
        throw new Error(`Unrecognized element type`);
        // return undefined;
    }
}

export const mkField = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
    logger?: CodegenLogger,
): Field => {
    let binding: BindingIdentifier | undefined;
    let enumValues: string[] | undefined;
    if (element.binding) {
        binding = mkBindingIdentifier(fhirSchema, path, element.binding.bindingName);

        if (element.binding.strength === "required" && element.type === "code") {
            enumValues = buildEnum(register, element, logger);
        }
    }

    return {
        type: buildFieldType(register, fhirSchema, element, logger)!,
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
    logger?: CodegenLogger,
): RegularField {
    return {
        type: mkNestedIdentifier(register, fhirSchema, path, logger),
        array: element.array || false,
        required: isRequired(register, fhirSchema, path),
        excluded: isExcluded(register, fhirSchema, path),
    };
}
