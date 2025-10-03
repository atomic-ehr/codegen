/**
 * Value Set Processing
 *
 * Functions for transforming FHIR ValueSets into TypeSchema format
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import { mkValueSetIdentifier } from "../core/identifier";
import type { Register } from "../register";
import type { Identifier, PackageMeta, ValueSetTypeSchema } from "../types";

/**
 * Extract concepts from a CodeSystem
 */
async function extractCodeSystemConcepts(
    codeSystemUrl: string,
    manager: ReturnType<typeof CanonicalManager>,
): Promise<Array<{ system: string; code: string; display?: string }> | undefined> {
    try {
        const codeSystem = await manager.resolve(codeSystemUrl);
        if (!codeSystem || codeSystem.resourceType !== "CodeSystem") {
            return undefined;
        }

        const concepts: Array<{ system: string; code: string; display?: string }> = [];

        // Recursive function to extract concepts (including nested ones)
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

        if (codeSystem.concept) {
            extractConcepts(codeSystem.concept, codeSystemUrl);
        }

        return concepts;
    } catch {
        return undefined;
    }
}

/**
 * Process ValueSet compose include/exclude
 */
async function processComposeItem(
    item: any,
    manager: ReturnType<typeof CanonicalManager>,
): Promise<Array<{ system: string; code: string; display?: string }>> {
    const concepts: Array<{ system: string; code: string; display?: string }> = [];

    // Direct concept list
    if (item.concept) {
        for (const concept of item.concept) {
            concepts.push({
                system: item.system,
                code: concept.code,
                display: concept.display,
            });
        }
        return concepts;
    }

    // Include all from CodeSystem (no filter)
    if (item.system && !item.filter) {
        const csConcepts = await extractCodeSystemConcepts(item.system, manager);
        if (csConcepts) {
            concepts.push(...csConcepts);
        }
    }

    // Include from another ValueSet
    if (item.valueSet) {
        for (const vsUrl of item.valueSet) {
            try {
                const vs = await manager.resolve(vsUrl);
                if (vs) {
                    const vsConcepts = await extractValueSetConcepts(vs, manager);
                    if (vsConcepts) {
                        concepts.push(...vsConcepts);
                    }
                }
            } catch {
                // Ignore if we can't resolve
            }
        }
    }

    return concepts;
}

/**
 * Extract all concepts from a ValueSet
 */
export async function extractValueSetConcepts(
    valueSet: any,
    manager: ReturnType<typeof CanonicalManager>,
): Promise<Array<{ system: string; code: string; display?: string }> | undefined> {
    try {
        const concepts: Array<{ system: string; code: string; display?: string }> = [];

        if (valueSet.compose) {
            // Process includes
            if (valueSet.compose.include) {
                for (const include of valueSet.compose.include) {
                    const includeConcepts = await processComposeItem(include, manager);
                    concepts.push(...includeConcepts);
                }
            }

            // Process excludes (remove them from the list)
            if (valueSet.compose.exclude) {
                const excludeConcepts: Set<string> = new Set();

                for (const exclude of valueSet.compose.exclude) {
                    const excludeList = await processComposeItem(exclude, manager);
                    for (const concept of excludeList) {
                        excludeConcepts.add(`${concept.system}|${concept.code}`);
                    }
                }

                // Filter out excluded concepts
                return concepts.filter((c) => !excludeConcepts.has(`${c.system}|${c.code}`));
            }
        }

        return concepts.length > 0 ? concepts : undefined;
    } catch (error) {
        console.error("Error extracting ValueSet concepts:", error);
        return undefined;
    }
}

/**
 * Transform a FHIR ValueSet to TypeSchema format
 */
export async function transformValueSet(
    valueSet: any,
    register: Register,
    packageInfo?: PackageMeta,
): Promise<ValueSetTypeSchema> {
    const identifier = mkValueSetIdentifier(valueSet.url, valueSet);

    const typeSchemaValueSet: ValueSetTypeSchema = {
        identifier,
    };

    // Add description if present
    if (valueSet.description) {
        typeSchemaValueSet.description = valueSet.description;
    }

    // Try to extract concepts
    const concepts = await extractValueSetConcepts(valueSet, register);

    if (concepts && concepts.length > 0) {
        // If we can expand, include the concepts
        typeSchemaValueSet.concept = concepts;
    } else if (valueSet.compose) {
        // If we can't expand, include the compose structure
        typeSchemaValueSet.compose = valueSet.compose;
    }

    // Extract dependencies from compose
    if (valueSet.compose) {
        const deps: Identifier[] = [];

        // Helper to process include/exclude
        const processCompose = (items: any[]) => {
            for (const item of items) {
                if (item.system) {
                    deps.push({
                        kind: "value-set",
                        package: packageInfo?.name || "undefined",
                        version: packageInfo?.version || "undefined",
                        name: item.system.split("/").pop() || "unknown",
                        url: item.system,
                    });
                }
                if (item.valueSet) {
                    for (const vsUrl of item.valueSet) {
                        deps.push(mkValueSetIdentifier(register, vsUrl));
                    }
                }
            }
        };

        if (valueSet.compose.include) {
            processCompose(valueSet.compose.include);
        }
        if (valueSet.compose.exclude) {
            processCompose(valueSet.compose.exclude);
        }
    }

    return typeSchemaValueSet;
}
