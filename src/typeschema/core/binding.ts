/**
 * Binding and Enum Handling
 *
 * Functions for processing value set bindings and generating enums
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import {
	type PackageInfo,
	type TypeSchemaBinding,
	TypeSchemaIdentifier,
} from "../types";
import { buildFieldType } from "./field-builder";
import {
	buildBindingIdentifier,
	buildSchemaIdentifier,
	buildValueSetIdentifier,
	dropVersionFromUrl,
} from "./identifier";

/**
 * Extract concepts from a ValueSet
 */
export async function extractValueSetConcepts(
	valueSetUrl: string,
	manager: CanonicalManager,
): Promise<
	Array<{ system: string; code: string; display?: string }> | undefined
> {
	try {
		const cleanUrl = dropVersionFromUrl(valueSetUrl) || valueSetUrl;
		const valueSet = await manager.resolve(cleanUrl);

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
		const concepts: Array<{ system: string; code: string; display?: string }> =
			[];

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
						const codeSystem = await manager.resolve(include.system);
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
export async function buildEnum(
	element: FHIRSchemaElement,
	manager: CanonicalManager,
): Promise<string[] | undefined> {
	if (!element.binding) return undefined;

	const { strength, valueSet } = element.binding;

	if (!valueSet) return undefined;

	// Enhanced support for more binding strengths and types
	// Generate enum for:
	// 1. Required bindings (always)
	// 2. Extensible bindings on code types (for better type safety)
	// 3. Preferred bindings on code types (for common usage patterns)
	const shouldGenerateEnum =
		strength === "required" ||
		(strength === "extensible" && element.type === "code") ||
		(strength === "preferred" && element.type === "code");

	if (!shouldGenerateEnum) {
		return undefined;
	}

	// Check if manager is available and functional
	if (!manager.resolve) {
		return undefined;
	}

	try {
		const concepts = await extractValueSetConcepts(valueSet, manager);
		if (!concepts || concepts.length === 0) return undefined;

		// Extract just the codes and filter out any empty/invalid ones
		const codes = concepts
			.map((c) => c.code)
			.filter(
				(code) => code && typeof code === "string" && code.trim().length > 0,
			);

		// Only return if we have valid codes and not too many (avoid huge enums)
		return codes.length > 0 && codes.length <= 50 ? codes : undefined;
	} catch (error) {
		// Log the error for debugging but don't fail the generation
		console.debug(`Failed to extract enum values for ${valueSet}: ${error}`);
		return undefined;
	}
}

/**
 * Generate a binding TypeSchema
 */
export async function generateBindingSchema(
	fhirSchema: FHIRSchema,
	path: string[],
	element: FHIRSchemaElement,
	manager: CanonicalManager,
	packageInfo?: PackageInfo,
): Promise<TypeSchemaBinding | undefined> {
	if (!element.binding?.valueSet) return undefined;

	const identifier = buildBindingIdentifier(
		fhirSchema,
		path,
		element.binding.bindingName,
		packageInfo,
	);

	const fieldType = buildFieldType(
		fhirSchema,
		path,
		element,
		manager,
		packageInfo,
	);
	const valueSetIdentifier = buildValueSetIdentifier(
		element.binding.valueSet,
		undefined,
		packageInfo,
	);

	const binding: TypeSchemaBinding = {
		identifier,
		type: fieldType,
		valueset: valueSetIdentifier,
		strength: element.binding.strength,
		dependencies: [],
	};

	// Add dependencies in specific order: type first, then value set
	if (fieldType) {
		binding.dependencies.push(fieldType);
	}
	binding.dependencies.push(valueSetIdentifier);

	// Add enum if applicable
	const enumValues = await buildEnum(element, manager);
	if (enumValues) {
		binding.enum = enumValues;
	}

	// Don't sort dependencies - keep them in the order: type, then value set

	return binding;
}

/**
 * Collect all binding schemas from a FHIRSchema
 */
export async function collectBindingSchemas(
	fhirSchema: FHIRSchema,
	manager: CanonicalManager,
	packageInfo?: PackageInfo,
): Promise<TypeSchemaBinding[]> {
	const bindings: TypeSchemaBinding[] = [];
	const processedPaths = new Set<string>();

	// Recursive function to process elements
	async function processElement(
		elements: Record<string, FHIRSchemaElement>,
		parentPath: string[],
	) {
		for (const [key, element] of Object.entries(elements)) {
			const path = [...parentPath, key];
			const pathKey = path.join(".");

			// Skip if already processed
			if (processedPaths.has(pathKey)) continue;
			processedPaths.add(pathKey);

			// Generate binding if present
			if (element.binding) {
				const binding = await generateBindingSchema(
					fhirSchema,
					path,
					element,
					manager,
					packageInfo,
				);
				if (binding) {
					bindings.push(binding);
				}
			}

			// Process nested elements
			if (element.elements) {
				await processElement(element.elements, path);
			}
		}
	}

	// Start processing from root elements
	if (fhirSchema.elements) {
		await processElement(fhirSchema.elements, []);
	}

	// Sort bindings by identifier name for consistent output
	bindings.sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));

	// Remove duplicates (same identifier URL)
	const uniqueBindings: TypeSchemaBinding[] = [];
	const seenUrls = new Set<string>();

	for (const binding of bindings) {
		if (!seenUrls.has(binding.identifier.url)) {
			seenUrls.add(binding.identifier.url);
			uniqueBindings.push(binding);
		}
	}

	return uniqueBindings;
}
