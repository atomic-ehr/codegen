/**
 * Nested Types (BackboneElement) Handling
 *
 * Functions for extracting and transforming nested types from FHIRSchema
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type {
	PackageInfo,
	TypeSchemaField,
	TypeSchemaNestedType,
} from "../types";
import { buildField, buildNestedField, isNestedElement } from "./field-builder";
import { buildNestedIdentifier, buildSchemaIdentifier } from "./identifier";

/**
 * Collect all nested elements from a FHIRSchema
 */
export function collectNestedElements(
	fhirSchema: FHIRSchema,
	parentPath: string[],
	elements: Record<string, FHIRSchemaElement>,
): Array<[string[], FHIRSchemaElement]> {
	const nested: Array<[string[], FHIRSchemaElement]> = [];

	for (const [key, element] of Object.entries(elements)) {
		const path = [...parentPath, key];

		// Add this element if it's nested (BackboneElement or has elements)
		if (isNestedElement(element)) {
			nested.push([path, element]);
		}

		// Recursively collect from child elements
		if (element.elements) {
			nested.push(...collectNestedElements(fhirSchema, path, element.elements));
		}
	}

	return nested;
}

/**
 * Transform elements into fields for a nested type
 */
export async function transformNestedElements(
	fhirSchema: FHIRSchema,
	parentPath: string[],
	elements: Record<string, FHIRSchemaElement>,
	manager: CanonicalManager,
	packageInfo?: PackageInfo,
): Promise<Record<string, TypeSchemaField>> {
	const fields: Record<string, TypeSchemaField> = {};

	for (const [key, element] of Object.entries(elements)) {
		const path = [...parentPath, key];

		if (isNestedElement(element)) {
			// Reference to another nested type
			fields[key] = buildNestedField(
				fhirSchema,
				path,
				element,
				manager,
				packageInfo,
			);
		} else {
			// Regular field
			fields[key] = await buildField(
				fhirSchema,
				path,
				element,
				manager,
				packageInfo,
			);
		}
	}

	return fields;
}

/**
 * Build TypeSchema for all nested types in a FHIRSchema
 */
export async function buildNestedTypes(
	fhirSchema: FHIRSchema,
	manager: CanonicalManager,
	packageInfo?: PackageInfo,
): Promise<TypeSchemaNestedType[]> {
	if (!fhirSchema.elements) return [];

	const nestedTypes: TypeSchemaNestedType[] = [];
	const nestedElements = collectNestedElements(
		fhirSchema,
		[],
		fhirSchema.elements,
	);

	// Filter to only include elements that have sub-elements (actual nested types)
	const actualNested = nestedElements.filter(
		([_, element]) =>
			element.elements && Object.keys(element.elements).length > 0,
	);

	for (const [path, element] of actualNested) {
		const identifier = buildNestedIdentifier(fhirSchema, path, packageInfo);

		// Base is usually BackboneElement
		let base;
		if (element.type === "BackboneElement") {
			// For BackboneElement, always use default since mock manager can't resolve
			base = {
				kind: "complex-type" as const,
				package: packageInfo?.name || "hl7.fhir.r4.core",
				version: packageInfo?.version || "4.0.1",
				name: "BackboneElement",
				url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
			};
		}

		// Transform sub-elements into fields
		const fields = await transformNestedElements(
			fhirSchema,
			path,
			element.elements!,
			manager,
			packageInfo,
		);

		const nestedType: TypeSchemaNestedType = {
			identifier,
			fields,
		};

		if (base) {
			nestedType.base = base;
		}

		nestedTypes.push(nestedType);
	}

	// Sort by URL for consistent output
	nestedTypes.sort((a, b) => a.identifier.url.localeCompare(b.identifier.url));

	return nestedTypes;
}

/**
 * Extract dependencies from nested types
 */
export function extractNestedDependencies(
	nestedTypes: TypeSchemaNestedType[],
): TypeSchemaIdentifier[] {
	const deps: TypeSchemaIdentifier[] = [];

	for (const nested of nestedTypes) {
		// Add the nested type itself as a dependency
		deps.push(nested.identifier);

		// Add base dependency
		if (nested.base) {
			deps.push(nested.base);
		}

		// Add field type dependencies
		for (const field of Object.values(nested.fields)) {
			if (field.type) {
				deps.push(field.type);
			}
			if (field.binding) {
				deps.push(field.binding);
			}
		}
	}

	return deps;
}
