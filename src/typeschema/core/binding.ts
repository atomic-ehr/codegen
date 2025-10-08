/**
 * Binding and Enum Handling
 *
 * Functions for processing value set bindings and generating enums
 */

import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { Register } from "@typeschema/register";
import type {
    BindingTypeSchema,
    CanonicalUrl,
    CodeSystem,
    CodeSystemConcept,
    Concept,
    Identifier,
    RichFHIRSchema,
    RichValueSet,
} from "@typeschema/types";
import { buildFieldType } from "./field-builder";
import { dropVersionFromUrl, mkBindingIdentifier, mkValueSetIdentifierByUrl } from "./identifier";

export function extractValueSetConceptsByUrl(
    register: Register,
    valueSetUrl: CanonicalUrl,
    logger?: CodegenLogger,
): Concept[] | undefined {
    const cleanUrl = dropVersionFromUrl(valueSetUrl) || valueSetUrl;
    const valueSet = register.resolveVs(cleanUrl as CanonicalUrl);
    if (!valueSet) return undefined;
    return extractValueSetConcepts(register, valueSet, logger);
}

function extractValueSetConcepts(
    register: Register,
    valueSet: RichValueSet,
    _logger?: CodegenLogger,
): Concept[] | undefined {
    if (valueSet.expansion?.contains) return valueSet.expansion.contains;

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

export function buildEnum(
    register: Register,
    element: FHIRSchemaElement,
    logger?: CodegenLogger,
): string[] | undefined {
    if (!element.binding) return undefined;

    const strength = element.binding.strength;
    const valueSetUrl = element.binding.valueSet as CanonicalUrl;
    if (!valueSetUrl) return undefined;

    // Enhanced support for more binding strengths and types
    // Generate enum for:
    // 1. Required bindings (always)
    // 2. Extensible bindings on code types (for better type safety)
    // 3. Preferred bindings on code types (for common usage patterns)
    // 4. Extensible bindings on Coding types (broader coverage)
    const shouldGenerateEnum =
        strength === "required" ||
        (strength === "extensible" && (element.type === "code" || element.type === "Coding")) ||
        (strength === "preferred" && (element.type === "code" || element.type === "Coding"));

    if (!shouldGenerateEnum) return undefined;

    const concepts = extractValueSetConceptsByUrl(register, valueSetUrl);
    if (!concepts || concepts.length === 0) return undefined;

    const codes = concepts
        .map((c) => c.code)
        .filter((code) => code && typeof code === "string" && code.trim().length > 0);

    if (codes.length > MAX_ENUM_LENGTH) {
        logger?.dry_warn(
            `Value set ${valueSetUrl} has ${codes.length} which is more than ${MAX_ENUM_LENGTH} codes, which may cause issues with code generation.`,
        );
        return undefined;
    }
    return codes.length > 0 ? codes : undefined;
}

function generateBindingSchema(
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
    logger?: CodegenLogger,
): BindingTypeSchema | undefined {
    if (!element.binding?.valueSet) return undefined;

    const identifier = mkBindingIdentifier(fhirSchema, path, element.binding.bindingName);
    const fieldType = buildFieldType(register, fhirSchema, element, logger);
    const valueSetIdentifier = mkValueSetIdentifierByUrl(register, element.binding.valueSet as CanonicalUrl);

    const dependencies: Identifier[] = [];
    if (fieldType) {
        dependencies.push(fieldType);
    }
    dependencies.push(valueSetIdentifier);

    const enumValues = buildEnum(register, element, logger);

    return {
        identifier,
        type: fieldType,
        valueset: valueSetIdentifier,
        strength: element.binding.strength,
        enum: enumValues,
        dependencies,
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

            if (processedPaths.has(pathKey)) continue;
            processedPaths.add(pathKey);

            if (element.binding) {
                const binding = generateBindingSchema(register, fhirSchema, path, element, logger);
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
