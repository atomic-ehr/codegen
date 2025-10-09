/**
 * Nested Types (BackboneElement) Handling
 *
 * Functions for extracting and transforming nested types from FHIRSchema
 */

import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@root/typeschema/register";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { CanonicalUrl, Field, Identifier, Name, NestedIdentifier, NestedType, RichFHIRSchema } from "../types";
import { isNestedElement, mkField, mkNestedField } from "./field-builder";

export function mkNestedIdentifier(
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    logger?: CodegenLogger,
): NestedIdentifier {
    // NOTE: profiles should no redefine types, they should reuse already defined in previous specializations
    const nestedTypeOrigins = {} as Record<Name, CanonicalUrl>;
    if (fhirSchema.derivation === "constraint") {
        const specializations = register.resolveFsSpecializations(fhirSchema.url);
        const nestedTypeGenealogy = specializations
            .map((fs) => mkNestedTypes(register, fs, logger))
            .filter((e) => e !== undefined)
            .flat();
        for (const nt of nestedTypeGenealogy.reverse()) {
            nestedTypeOrigins[nt.identifier.name] = nt.identifier.url;
        }
    }
    const nestedName = path.join(".") as Name;
    const url = nestedTypeOrigins[nestedName] ?? (`${fhirSchema.url}#${nestedName}` as CanonicalUrl);
    return {
        kind: "nested",
        package: fhirSchema.package_meta.name,
        version: fhirSchema.package_meta.version,
        name: nestedName,
        url: url,
    };
}

function collectNestedElements(
    fhirSchema: FHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement>,
): [string[], FHIRSchemaElement][] {
    const nested: [string[], FHIRSchemaElement][] = [];

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
    register: Register,
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement>,
    logger?: CodegenLogger,
): Record<string, Field> {
    const fields: Record<string, Field> = {};

    for (const [key, element] of Object.entries(elements)) {
        const path = [...parentPath, key];

        if (isNestedElement(element)) {
            fields[key] = mkNestedField(register, fhirSchema, path, element, logger);
        } else {
            fields[key] = mkField(register, fhirSchema, path, element, logger);
        }
    }

    return fields;
}

export function mkNestedTypes(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): NestedType[] | undefined {
    if (!fhirSchema.elements) return undefined;

    const nested = collectNestedElements(fhirSchema, [], fhirSchema.elements).filter(
        ([_, element]) => element.elements && Object.keys(element.elements).length > 0,
    );

    const nestedTypes = [] as NestedType[];
    for (const [path, element] of nested) {
        const identifier = mkNestedIdentifier(register, fhirSchema, path, logger);

        let baseName: Name;
        if (element.type === "BackboneElement" || !element.type) {
            baseName = "BackboneElement" as Name;
        } else {
            baseName = element.type as Name;
        }
        const base: Identifier = {
            kind: "complex-type",
            package: fhirSchema.package_meta.name,
            version: fhirSchema.package_meta.version,
            name: baseName,
            url: register.ensureCanonicalUrl(baseName),
        };

        const fields = transformNestedElements(register, fhirSchema, path, element.elements!, logger);

        const nestedType: NestedType = {
            identifier,
            base,
            fields,
        };
        nestedTypes.push(nestedType);
    }

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
