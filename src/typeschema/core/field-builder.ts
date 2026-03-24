/**
 * Field Building Utilities
 *
 * Functions for transforming FHIRSchema elements into TypeSchema fields
 */

import type { FHIRSchemaDiscriminator, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@root/typeschema/register";
import type { CodegenLog } from "@root/utils/log";
import { packageMetaToFhir } from "@typeschema/types";
import type {
    BindingIdentifier,
    EnumDefinition,
    Field,
    FieldSlice,
    FieldSlicing,
    Name,
    RegularField,
    RichFHIRSchema,
    TypeIdentifier,
    ValueConstraint,
} from "../types";
import { BINDABLE_TYPES, buildEnum } from "./binding";
import { mkBindingIdentifier, mkIdentifier } from "./identifier";
import { mkNestedIdentifier } from "./nested-types";

function isRequired(register: Register, fhirSchema: RichFHIRSchema, path: string[]): boolean {
    const fieldName = path[path.length - 1];
    if (!fieldName) throw new Error(`Internal error: fieldName is missing for path ${path.join("/")}`);
    const parentPath = path.slice(0, -1);

    const requires = register.resolveFsGenealogy(fhirSchema.package_meta, fhirSchema.url).flatMap((fs) => {
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

    const requires = register.resolveFsGenealogy(fhirSchema.package_meta, fhirSchema.url).flatMap((fs) => {
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
    register: Register,
    fhirSchema: RichFHIRSchema,
    element: FHIRSchemaElement,
): TypeIdentifier[] | undefined => {
    if (!element.refers) return undefined;
    return element.refers.map((ref) => {
        const curl = register.ensureSpecializationCanonicalUrl(ref as Name);
        const fs = register.resolveFs(fhirSchema.package_meta, curl);
        if (!fs) throw new Error(`Failed to resolve fs for ${curl}`);
        return mkIdentifier(fs);
    });
};

const extractSliceFieldNames = (schema: FHIRSchemaElement): Pick<FieldSlice, "required" | "excluded" | "elements"> => {
    const required = new Set<string>();
    const excluded = new Set<string>();

    if (schema.required) {
        for (const name of schema.required) required.add(name);
    }
    if (schema.excluded) {
        for (const name of schema.excluded) excluded.add(name);
    }
    if (schema.elements) {
        for (const [name, element] of Object.entries(schema.elements)) {
            if (element.min !== undefined && element.min > 0) {
                required.add(name);
            }
        }
    }

    const elements = schema.elements ? Object.keys(schema.elements) : undefined;

    return {
        required: required.size > 0 ? Array.from(required) : undefined,
        excluded: excluded.size > 0 ? Array.from(excluded) : undefined,
        elements: elements && elements.length > 0 ? elements : undefined,
    };
};

const isEmptyMatch = (match: unknown): boolean => {
    if (!match) return true;
    if (typeof match === "object" && Object.keys(match as object).length === 0) return true;
    return false;
};

const setNestedValue = (obj: Record<string, unknown>, path: string[], value: unknown): void => {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i] as string;
        if (!current[key] || typeof current[key] !== "object") {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }
    const lastKey = path[path.length - 1] as string;
    current[lastKey] = value;
};

/** Navigate a remaining path through a match object to extract a leaf value */
const navigateMatch = (match: Record<string, unknown>, remainingPath: string[]): unknown => {
    let value: unknown = match;
    for (const seg of remainingPath) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            value = (value as Record<string, unknown>)[seg];
        } else {
            return undefined;
        }
    }
    return value;
};

const collectDiscriminatorValue = (
    schema: FHIRSchemaElement,
    segments: string[],
    index: number,
    result: Record<string, unknown>,
): void => {
    if (index >= segments.length || !schema.elements) return;

    const segment = segments[index] as string;
    const element = schema.elements[segment];
    if (!element) return;

    // Leaf: element has a fixed value
    if (index === segments.length - 1 && element.fixed?.value !== undefined) {
        setNestedValue(result, segments, element.fixed.value);
        return;
    }

    // Element has slicing with sub-slices — collect match values from required slices
    if (element.slicing?.slices) {
        const remainingSegments = segments.slice(index + 1);
        for (const subSlice of Object.values(element.slicing.slices)) {
            if (!subSlice.min || subSlice.min < 1 || !subSlice.match || typeof subSlice.match !== "object") continue;
            const match = subSlice.match as Record<string, unknown>;
            if (Object.keys(match).length === 0) continue;

            if (remainingSegments.length > 0) {
                const value = navigateMatch(match, remainingSegments);
                if (value !== undefined) setNestedValue(result, segments, value);
            } else {
                setNestedValue(result, segments.slice(0, index + 1), match);
            }
        }
        return;
    }

    // Continue navigating deeper
    collectDiscriminatorValue(element, segments, index + 1, result);
};

/**
 * For type discriminators, navigate the discriminator path through schema.elements
 * and read the `type` field. If type is a simple name (not a URL), treat as FHIR
 * resource type and set `{ <path>: { resourceType: "<type>" } }`.
 */
const computeTypeDiscriminatorMatch = (
    path: string,
    schema: FHIRSchemaElement,
    result: Record<string, unknown>,
): void => {
    if (path === "$this") return;
    const segments = path.split(".");
    let elem: FHIRSchemaElement | undefined = schema;
    for (const seg of segments) {
        elem = elem?.elements?.[seg];
        if (!elem) return;
    }
    const typeName = elem.type;
    if (!typeName || typeName.includes("/")) return;
    setNestedValue(result, segments, { resourceType: typeName });
};

/**
 * Computes match values by navigating the slice's schema elements along discriminator paths.
 * Used when a slice has an empty match but the discriminator values are nested deeper
 * (e.g., component slices in BP where the discriminator crosses a nested slicing boundary).
 */

const computeMatchFromSchema = (
    discriminators: FHIRSchemaDiscriminator[],
    schema: FHIRSchemaElement | undefined,
): Record<string, unknown> | undefined => {
    if (!schema || !discriminators || discriminators.length === 0) return undefined;

    const result: Record<string, unknown> = {};
    for (const disc of discriminators) {
        if (disc.type === "type") {
            computeTypeDiscriminatorMatch(disc.path, schema, result);
        } else {
            if (!schema.elements) continue;
            const segments = disc.path.split(".");
            collectDiscriminatorValue(schema, segments, 0, result);
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
};

const buildSlicing = (element: FHIRSchemaElement): FieldSlicing | undefined => {
    const slicing = element.slicing;
    if (!slicing) return undefined;

    const slices: Record<string, FieldSlice> = {};
    for (const [name, slice] of Object.entries(slicing.slices ?? {})) {
        if (!slice) continue;
        const { required, excluded, elements } = slice.schema ? extractSliceFieldNames(slice.schema) : {};
        slices[name] = {
            min: slice.min,
            max: slice.max,
            match: isEmptyMatch(slice.match)
                ? computeMatchFromSchema(slicing.discriminator ?? [], slice.schema)
                : (slice.match as Record<string, unknown> | undefined),
            required,
            excluded,
            elements,
        };
    }

    return {
        discriminator: slicing.discriminator ?? [],
        rules: slicing.rules,
        ordered: slicing.ordered,
        slices: Object.keys(slices).length > 0 ? slices : undefined,
    };
};

export function buildFieldType(
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
    logger?: CodegenLog,
): TypeIdentifier | undefined {
    if (element.elementReference) {
        const refPath = element.elementReference
            .slice(1) // drop canonicalUrl
            .filter((_, i) => i % 2 === 1); // drop `elements` from path
        return mkNestedIdentifier(register, fhirSchema, refPath);
    } else if (element.type) {
        const url = register.ensureSpecializationCanonicalUrl(element.type);
        const fieldFs = register.resolveFs(fhirSchema.package_meta, url);
        if (!fieldFs)
            throw new Error(
                `Could not resolve field type: <${fhirSchema.url}>.${path.join(".")}: <${element.type}> (pkg: '${packageMetaToFhir(fhirSchema.package_meta)}'))`,
            );
        return mkIdentifier(fieldFs);
    } else if (element.choices) {
        return undefined;
    } else if (fhirSchema.derivation === "constraint") {
        return undefined; // FIXME: should be removed
    } else {
        // Some packages (e.g., simplifier.core.r4.*) have incomplete element definitions
        // Log a warning but continue processing instead of throwing
        logger?.dryWarn(
            "#fieldTypeNotFound",
            `Can't recognize element type: <${fhirSchema.url}>.${path.join(".")} (pkg: '${packageMetaToFhir(fhirSchema.package_meta)}'): missing type info`,
        );
        return undefined;
    }
}

export const mkField = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
    logger?: CodegenLog,
    rawElement?: FHIRSchemaElement,
): Field => {
    let binding: BindingIdentifier | undefined;
    let enumResult: EnumDefinition | undefined;
    if (element.binding) {
        binding = mkBindingIdentifier(fhirSchema, path, element);

        if (BINDABLE_TYPES.has(element.type ?? "")) {
            enumResult = buildEnum(register, fhirSchema, element, logger);
        }
    }

    const fieldType = buildFieldType(register, fhirSchema, path, element, logger);
    // TODO: should be an exception
    if (!fieldType)
        logger?.dryWarn(
            "#fieldTypeNotFound",
            `Field type not found for '${fhirSchema.url}#${path.join(".")}' (${fhirSchema.derivation})`,
        );

    let valueConstraint: ValueConstraint | undefined;
    if (element.pattern) {
        valueConstraint = { kind: "pattern", type: element.pattern.type, value: element.pattern.value };
    } else if (element.fixed) {
        valueConstraint = { kind: "fixed", type: element.fixed.type, value: element.fixed.value };
    }

    // Auto-populate valueConstraint for CodeableConcept fields with fixed coding slices.
    // Uses rawElement because the resolved element snapshot has sub-elements stripped.
    const elemForCodingCheck = rawElement ?? element;
    if (!valueConstraint && elemForCodingCheck.elements?.coding?.slicing?.slices) {
        const codingSlices = elemForCodingCheck.elements.coding.slicing.slices;
        const allSliceValues = Object.values(codingSlices);
        const allRequired =
            allSliceValues.length > 0 &&
            allSliceValues.every(
                (s) =>
                    s.min !== undefined &&
                    s.min >= 1 &&
                    s.match &&
                    typeof s.match === "object" &&
                    Object.keys(s.match as object).length > 0,
            );
        if (allRequired) {
            const codingValues = allSliceValues.map((s) => s.match as import("@atomic-ehr/fhirschema").FHIRValue);
            valueConstraint = {
                kind: "fixed",
                type: "CodeableConcept",
                value: {
                    coding: codingValues.length === 1 ? [codingValues[0]] : codingValues,
                } as unknown as import("@atomic-ehr/fhirschema").FHIRValue,
            };
        }
    }

    return {
        type: fieldType as TypeIdentifier,
        required: isRequired(register, fhirSchema, path),
        excluded: isExcluded(register, fhirSchema, path),

        reference: buildReferences(register, fhirSchema, element),

        array: element.array || false,
        min: element.min,
        max: element.max,
        slicing: buildSlicing(element),

        choices: element.choices,
        choiceOf: element.choiceOf,

        binding: binding,
        enum: enumResult,
        valueConstraint,
        mustSupport: element.mustSupport,
    };
};

export function mkNestedField(
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
): RegularField {
    const nestedIdentifier = mkNestedIdentifier(register, fhirSchema, path);
    return {
        type: nestedIdentifier,
        array: element.array || false,
        required: isRequired(register, fhirSchema, path),
        excluded: isExcluded(register, fhirSchema, path),
        slicing: buildSlicing(element),
    };
}
