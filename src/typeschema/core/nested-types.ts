/**
 * Nested Types (BackboneElement) Handling
 *
 * Functions for extracting and transforming nested types from FHIRSchema
 */

import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import { mergeFsElementProps, type Register, resolveFsElementGenealogy } from "@root/typeschema/register";
import type { CodegenLog } from "@root/utils/log";
import type {
    CanonicalUrl,
    Field,
    Name,
    NestedIdentifier,
    NestedTypeSchema,
    RichFHIRSchema,
    TypeIdentifier,
} from "../types";
import { mkField, mkNestedField } from "./field-builder";

/**
 * Check whether the specialization chain defines structural sub-elements at `path`.
 * "Structural" means the sub-elements define new fields, not just constrain
 * fields of the element's own type. For example:
 * - EN.item (type Base) has sub-elements family/given that Base doesn't define → structural
 * - typeId (type II) has sub-elements root/extension that II itself defines → constraining
 * - bodyweight.code (type CodeableConcept) has coding only in the constraint → not in specializations
 */
const hasStructuralElements = (register: Register, fhirSchema: RichFHIRSchema, path: string[]): boolean => {
    const specializations = register.resolveFsSpecializations(fhirSchema.package_meta, fhirSchema.url);
    const elemGens = resolveFsElementGenealogy(specializations, path);
    const elemType = mergeFsElementProps(elemGens).type;

    let typeKeys: Set<string> | undefined;
    if (elemType) {
        const typeUrl = register.ensureSpecializationCanonicalUrl(elemType);
        const typeGenealogy = register.resolveFsGenealogy(fhirSchema.package_meta, typeUrl);
        const keys = typeGenealogy.flatMap((fs) => Object.keys(fs.elements ?? {}));
        if (keys.length > 0) typeKeys = new Set(keys);
    }

    for (const elem of elemGens) {
        if (!elem.elements || Object.keys(elem.elements).length === 0) continue;
        if (typeKeys && !Object.keys(elem.elements).some((k) => !typeKeys.has(k))) continue;
        return true;
    }
    return false;
};

/**
 * Check if an element is structurally nested, using both the snapshot
 * (for BackboneElement detection) and specialization-chain element analysis.
 */
export const isNestedElement = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    snapshot: FHIRSchemaElement,
    raw?: FHIRSchemaElement,
): boolean => {
    if (snapshot.type === "BackboneElement") return true;
    if (!raw?.elements || raw.choiceOf !== undefined) return false;
    return hasStructuralElements(register, fhirSchema, path);
};

const collectNestedPaths = (fs: RichFHIRSchema): Set<string> => {
    if (!fs.elements) return new Set();
    return new Set(
        collectNestedElements(fs, [], fs.elements)
            .filter(([_, el]) => el.elements && Object.keys(el.elements).length > 0)
            .map(([path]) => path.join(".")),
    );
};

export function mkNestedIdentifier(register: Register, fhirSchema: RichFHIRSchema, path: string[]): NestedIdentifier {
    // Resolve nested type origins from the genealogy so inherited nested types
    // (e.g. PN.item from EN) resolve to the defining type's nested type (EN#item).
    const nestedTypeOrigins = {} as Record<Name, CanonicalUrl>;
    const genealogy =
        fhirSchema.derivation === "constraint"
            ? register.resolveFsSpecializations(fhirSchema.package_meta, fhirSchema.url)
            : register.resolveFsGenealogy(fhirSchema.package_meta, fhirSchema.url);
    // Walk base-first so most-derived wins
    for (const fs of [...genealogy].reverse()) {
        const paths = collectNestedPaths(fs);
        for (const p of paths) {
            nestedTypeOrigins[p as Name] = `${fs.url}#${p}` as CanonicalUrl;
        }
    }
    const nestedName = path.join(".") as Name;
    const url = nestedTypeOrigins[nestedName] ?? (`${fhirSchema.url}#${nestedName}` as CanonicalUrl);
    const baseUrl = url.split("#")[0] as CanonicalUrl;
    const baseFs = register.resolveFs(fhirSchema.package_meta, baseUrl);
    const packageMeta = baseFs?.package_meta ?? fhirSchema.package_meta;
    return {
        kind: "nested",
        package: packageMeta.name,
        version: packageMeta.version,
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
        if (element.elements && element.choiceOf === undefined) nested.push([path, element]);
        if (element.elements) nested.push(...collectNestedElements(fhirSchema, path, element.elements));
    }

    return nested;
}

function transformNestedElements(
    register: Register,
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement>,
    logger?: CodegenLog,
): Record<string, Field> {
    const fields: Record<string, Field> = {};

    // Collect all sub-element keys from the genealogy chain, not just the current type.
    // This ensures constraint profiles include inherited sub-elements from base types.
    const genealogy = register.resolveFsGenealogy(fhirSchema.package_meta, fhirSchema.url);
    const elemGenealogy = resolveFsElementGenealogy(genealogy, parentPath);
    const allKeys = new Set<string>();
    for (const elem of elemGenealogy) {
        if (elem.elements) {
            for (const k of Object.keys(elem.elements)) {
                allKeys.add(k);
            }
        }
    }

    for (const key of allKeys) {
        const path = [...parentPath, key];
        const elemSnapshot = register.resolveElementSnapshot(fhirSchema, path);

        if (isNestedElement(register, fhirSchema, path, elemSnapshot, elements[key])) {
            fields[key] = mkNestedField(register, fhirSchema, path, elemSnapshot);
        } else {
            fields[key] = mkField(register, fhirSchema, path, elemSnapshot, logger);
        }
    }

    return fields;
}

export function mkNestedTypes(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLog,
): NestedTypeSchema[] | undefined {
    if (!fhirSchema.elements) return undefined;

    const nested = collectNestedElements(fhirSchema, [], fhirSchema.elements).filter(([path, element]) => {
        if (!element.elements || Object.keys(element.elements).length === 0) return false;
        // Verify the specialization chain also defines sub-elements for this path.
        // This filters out false positives from constraint profiles that add sub-elements
        // for constraining (e.g. bodyweight constraining code.coding — the base
        // Observation.code has no sub-elements, so it's not a nested type).
        if (element.type !== "BackboneElement") {
            return hasStructuralElements(register, fhirSchema, path);
        }
        return true;
    });

    const nestedTypes = [] as NestedTypeSchema[];
    for (const [path, element] of nested) {
        const identifier = mkNestedIdentifier(register, fhirSchema, path);

        let baseName: Name;
        if (element.type === "BackboneElement" || !element.type) {
            baseName = "BackboneElement" as Name;
        } else {
            baseName = element.type as Name;
        }
        const baseUrl = register.ensureSpecializationCanonicalUrl(baseName);
        const baseFs = register.resolveFs(fhirSchema.package_meta, baseUrl);
        if (!baseFs) throw new Error(`Could not resolve base type ${baseName}`);
        const base: TypeIdentifier = {
            kind: "complex-type",
            package: baseFs.package_meta.name,
            version: baseFs.package_meta.version,
            name: baseName,
            url: baseUrl,
        };

        const fields = transformNestedElements(register, fhirSchema, path, element.elements ?? {}, logger);

        const nestedType: NestedTypeSchema = {
            identifier,
            base,
            fields,
        };
        nestedTypes.push(nestedType);
    }

    nestedTypes.sort((a, b) => a.identifier.url.localeCompare(b.identifier.url));

    return nestedTypes.length === 0 ? undefined : nestedTypes;
}

export function extractNestedDependencies(nestedTypes: NestedTypeSchema[]): TypeIdentifier[] {
    const deps: TypeIdentifier[] = [];

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
