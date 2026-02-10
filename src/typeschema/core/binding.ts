/**
 * Binding and Enum Handling
 *
 * Functions for processing value set bindings and generating enums
 */

import assert from "node:assert";
import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { CodeSystem, CodeSystemConcept } from "@root/fhir-types/hl7-fhir-r4-core";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { Register } from "@typeschema/register";
import type {
    BindingTypeSchema,
    CanonicalUrl,
    Concept,
    EnumDefinition,
    PackageMeta,
    RichFHIRSchema,
    RichValueSet,
} from "@typeschema/types";
import { dropVersionFromUrl, mkBindingIdentifier, mkValueSetIdentifierByUrl } from "./identifier";

export function extractValueSetConceptsByUrl(
    register: Register,
    pkg: PackageMeta,
    valueSetUrl: CanonicalUrl,
    logger?: CodegenLogger,
): Concept[] | undefined {
    const cleanUrl = dropVersionFromUrl(valueSetUrl) || valueSetUrl;
    const valueSet = register.resolveVs(pkg, cleanUrl as CanonicalUrl);
    if (!valueSet) return undefined;
    return extractValueSetConcepts(register, valueSet, logger);
}

function extractValueSetConcepts(
    register: Register,
    valueSet: RichValueSet,
    _logger?: CodegenLogger,
): Concept[] | undefined {
    if (valueSet.expansion?.contains) {
        return valueSet.expansion.contains
            .filter((item) => item.code !== undefined)
            .map((item) => {
                assert(item.code);
                return {
                    code: item.code,
                    display: item.display,
                    system: item.system,
                };
            });
    }

    const concepts = [] as Concept[];
    if (valueSet.compose?.include) {
        for (const include of valueSet.compose.include) {
            if (include.concept) {
                for (const concept of include.concept) {
                    concepts.push({
                        system: include.system,
                        code: concept.code,
                        display: concept.display,
                    });
                }
            } else if (include.system && !include.filter) {
                try {
                    const codeSystem: CodeSystem = register.resolveAny(include.system as CanonicalUrl);
                    if (codeSystem?.concept) {
                        const extractConcepts = (conceptList: CodeSystemConcept[], system: string) => {
                            for (const concept of conceptList) {
                                concepts.push({
                                    system,
                                    code: concept.code,
                                    display: concept.display,
                                });
                                if (concept.concept) {
                                    extractConcepts(concept.concept, system);
                                }
                            }
                        };
                        extractConcepts(codeSystem.concept, include.system);
                    }
                } catch {
                    // Ignore if we can't resolve the CodeSystem
                }
            }
        }
    }
    return concepts.length > 0 ? concepts : undefined;
}

const MAX_ENUM_LENGTH = 100;

// eld-11: Types that can have bindings
export const BINDABLE_TYPES = new Set([
    "code",
    "Coding",
    "CodeableConcept",
    "CodeableReference",
    "Quantity",
    "string",
    "uri",
    "Duration",
]);

export function buildEnum(
    register: Register,
    fhirSchema: RichFHIRSchema,
    element: FHIRSchemaElement,
    logger?: CodegenLogger,
): EnumDefinition | undefined {
    if (!element.binding) return undefined;

    const strength = element.binding.strength;
    const valueSetUrl = element.binding.valueSet as CanonicalUrl;
    if (!valueSetUrl) return undefined;

    if (!BINDABLE_TYPES.has(element.type ?? "")) {
        logger?.dryWarn(`eld-11: Binding on non-bindable type '${element.type}' (valueSet: ${valueSetUrl})`);
        return undefined;
    }

    // Generate enum for required/extensible/preferred bindings
    const shouldGenerateEnum = strength === "required" || strength === "extensible" || strength === "preferred";
    if (!shouldGenerateEnum) return undefined;

    const concepts = extractValueSetConceptsByUrl(register, fhirSchema.package_meta, valueSetUrl);
    if (!concepts || concepts.length === 0) return undefined;

    const codes = concepts
        .map((c) => c.code)
        .filter((code) => code && typeof code === "string" && code.trim().length > 0);

    if (codes.length > MAX_ENUM_LENGTH) {
        logger?.dryWarn(
            `Value set ${valueSetUrl} has ${codes.length} which is more than ${MAX_ENUM_LENGTH} codes, which may cause issues with code generation.`,
        );
        return undefined;
    }
    if (codes.length === 0) return undefined;

    return { isOpen: strength !== "required", values: codes };
}

function generateBindingSchema(
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
    logger?: CodegenLogger,
): BindingTypeSchema | undefined {
    if (!element.binding?.valueSet) return undefined;

    const identifier = mkBindingIdentifier(fhirSchema, path, element);
    const valueSetIdentifier = mkValueSetIdentifierByUrl(
        register,
        fhirSchema.package_meta,
        element.binding.valueSet as CanonicalUrl,
    );

    const enumResult = buildEnum(register, fhirSchema, element, logger);

    return {
        identifier,
        valueset: valueSetIdentifier,
        strength: element.binding.strength,
        enum: enumResult,
        dependencies: [valueSetIdentifier],
    };
}

export function collectBindingSchemas(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): BindingTypeSchema[] {
    const processedPaths = new Set<string>();
    if (!fhirSchema.elements) return [];

    const bindings: BindingTypeSchema[] = [];
    function collectBindings(elements: Record<string, FHIRSchemaElement>, parentPath: string[]) {
        for (const [key, element] of Object.entries(elements)) {
            const path = [...parentPath, key];
            const pathKey = path.join(".");
            const elemSnapshot = register.resolveElementSnapshot(fhirSchema, path);

            if (processedPaths.has(pathKey)) continue;
            processedPaths.add(pathKey);

            if (elemSnapshot.binding) {
                const binding = generateBindingSchema(register, fhirSchema, path, elemSnapshot, logger);
                if (binding) {
                    bindings.push(binding);
                }
            }

            if (element.elements) {
                collectBindings(element.elements, path);
            }
        }
    }
    collectBindings(fhirSchema.elements, []);

    bindings.sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));

    const uniqueBindings: BindingTypeSchema[] = [];
    const seenUrls = new Set<string>();

    for (const binding of bindings) {
        if (!seenUrls.has(binding.identifier.url)) {
            seenUrls.add(binding.identifier.url);
            uniqueBindings.push(binding);
        }
    }

    return uniqueBindings;
}
