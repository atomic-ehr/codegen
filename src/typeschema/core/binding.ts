/**
 * Binding and Enum Handling
 *
 * Functions for processing value set bindings and generating enums
 */

import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@typeschema/register";
import type { BindingTypeSchema, CanonicalUrl, Identifier, PackageMeta, RichFHIRSchema } from "@typeschema/types";
import { buildFieldType } from "./field-builder";
import { dropVersionFromUrl, mkBindingIdentifier, mkValueSetIdentifier } from "./identifier";

/**
 * Extract concepts from a ValueSet
 */
export function extractValueSetConcepts(
    valueSetUrl: CanonicalUrl,
    register: Register,
): { system: string; code: string; display?: string }[] | undefined {
    try {
        const cleanUrl = dropVersionFromUrl(valueSetUrl) || valueSetUrl;
        const valueSet = register.resolveVs(cleanUrl as CanonicalUrl);
        if (!valueSet) return undefined;

        // If expansion is available, use it
        if (valueSet.expansion?.contains) {
            return valueSet.expansion.contains.map((concept: any) => ({
                system: concept.system,
                code: concept.code,
                display: concept.display,
            }));
        }

        // Otherwise try to extract from compose
        const concepts: Array<{ system: string; code: string; display?: string }> = [];

        if (valueSet.compose?.include) {
            for (const include of valueSet.compose.include) {
                if (include.concept) {
                    // Direct concept list
                    for (const concept of include.concept) {
                        concepts.push({
                            system: include.system,
                            code: concept.code,
                            display: concept.display,
                        });
                    }
                } else if (include.system && !include.filter) {
                    // Include all from CodeSystem
                    try {
                        const codeSystem = register.resolveAny(include.system);
                        if (codeSystem?.concept) {
                            const extractConcepts = (conceptList: any[], system: string) => {
                                for (const concept of conceptList) {
                                    concepts.push({
                                        system,
                                        code: concept.code,
                                        display: concept.display,
                                    });
                                    // Handle nested concepts
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
    } catch {
        return undefined;
    }
}

/**
 * Build enum values from binding if applicable
 */
export function buildEnum(element: FHIRSchemaElement, register: Register): string[] | undefined {
    if (!element.binding) return undefined;

    const { strength, valueSet } = element.binding;

    if (!valueSet) return undefined;

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

    if (!shouldGenerateEnum) {
        return undefined;
    }

    try {
        const concepts = extractValueSetConcepts(valueSet as CanonicalUrl, register);
        if (!concepts || concepts.length === 0) return undefined;

        // Extract just the codes and filter out any empty/invalid ones
        const codes = concepts
            .map((c) => c.code)
            .filter((code) => code && typeof code === "string" && code.trim().length > 0);

        // Only return if we have valid codes and not too many (avoid huge enums)
        // Increased limit from 50 to 100 for better value set coverage
        return codes.length > 0 && codes.length <= 100 ? codes : undefined;
    } catch (error) {
        // Log the error for debugging but don't fail the generation
        console.debug(`Failed to extract enum values for ${valueSet}: ${error}`);
        return undefined;
    }
}

export async function generateBindingSchema(
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
    register: Register,
    packageInfo?: PackageMeta,
): Promise<BindingTypeSchema | undefined> {
    if (!element.binding?.valueSet) return undefined;

    const identifier = mkBindingIdentifier(fhirSchema, path, element.binding.bindingName, packageInfo);

    const fieldType = buildFieldType(fhirSchema, path, element, register, packageInfo);
    const valueSetIdentifier = mkValueSetIdentifier(element.binding.valueSet as CanonicalUrl, undefined, packageInfo);

    const dependencies: Identifier[] = [];
    if (fieldType) {
        dependencies.push(fieldType);
    }
    dependencies.push(valueSetIdentifier);

    const enumValues = await buildEnum(element, register);

    return {
        identifier,
        type: fieldType,
        valueset: valueSetIdentifier,
        strength: element.binding.strength,
        enum: enumValues,
        dependencies,
    };
}

/**
 * Collect all binding schemas from a FHIRSchema
 */
export async function collectBindingSchemas(
    fhirSchema: RichFHIRSchema,
    register: Register,
): Promise<BindingTypeSchema[]> {
    const packageInfo = fhirSchema.package_meta;
    const bindings: BindingTypeSchema[] = [];
    const processedPaths = new Set<string>();

    // Recursive function to process elements
    async function processElement(elements: Record<string, FHIRSchemaElement>, parentPath: string[]) {
        for (const [key, element] of Object.entries(elements)) {
            const path = [...parentPath, key];
            const pathKey = path.join(".");

            // Skip if already processed
            if (processedPaths.has(pathKey)) continue;
            processedPaths.add(pathKey);

            // Generate binding if present
            if (element.binding) {
                const binding = await generateBindingSchema(fhirSchema, path, element, register, packageInfo);
                if (binding) {
                    bindings.push(binding);
                }
            }

            if (element.elements) {
                await processElement(element.elements, path);
            }
        }
    }

    if (fhirSchema.elements) {
        await processElement(fhirSchema.elements, []);
    }

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
