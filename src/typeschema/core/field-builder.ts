/**
 * Field Building Utilities
 *
 * Functions for transforming FHIRSchema elements into TypeSchema fields
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type {
	PackageInfo,
	TypeSchemaField,
	TypeSchemaIdentifier,
} from "../types";
import { buildEnum } from "./binding";
import {
	buildBindingIdentifier,
	buildNestedIdentifier,
	buildSchemaIdentifier,
} from "./identifier";

/**
 * Get the full element hierarchy for a given path
 */
export function getElementHierarchy(
	fhirSchema: FHIRSchema,
	path: string[],
	_manager: ReturnType<typeof CanonicalManager>,
): FHIRSchemaElement[] {
	const hierarchy: FHIRSchemaElement[] = [];

	// Get element at path from current schema
	let element: any = fhirSchema.elements;
	for (const key of path) {
		element = element?.[key];
		if (!element) break;
	}

	if (element) {
		hierarchy.push(element);
	}

	// For now, we only use the current schema's element
	// TODO: Implement base schema traversal when we have proper schema loading

	return hierarchy;
}

/**
 * Merge element hierarchy into a snapshot
 */
export function mergeElementHierarchy(
	hierarchy: FHIRSchemaElement[],
): FHIRSchemaElement {
	// Start with the most specific (first) element
	const snapshot = { ...hierarchy[0] };

	// Merge properties from base elements (reverse order to apply from base to specific)
	for (let i = hierarchy.length - 1; i >= 0; i--) {
		const element = hierarchy[i];

		// Properties that should be taken from the most specific element
		const specificProps = [
			"choices",
			"short",
			"index",
			"elements",
			"required",
			"excluded",
			"binding",
			"refers",
			"elementReference",
			"mustSupport",
			"slices",
			"slicing",
			"url",
			"extensions",
		];

		// Merge non-specific properties
		for (const [key, value] of Object.entries(element as FHIRSchemaElement)) {
			if (!specificProps.includes(key) && value !== undefined) {
				(snapshot as any)[key] = value;
			}
		}
	}

	// Override with specific properties from the first element
	for (const prop of ["choices", "binding", "refers", "elementReference"]) {
		// @ts-ignore
		if (hierarchy[0][prop as keyof FHIRSchemaElement] !== undefined) {
			// @ts-ignore
			(snapshot as any)[prop] = hierarchy[0][prop as keyof FHIRSchemaElement];
		}
	}

	return snapshot;
}

/**
 * Check if a field is required based on parent required arrays
 */
export function isRequired(
	fhirSchema: FHIRSchema,
	path: string[],
	_manager: ReturnType<typeof CanonicalManager>,
): boolean {
	if (path.length === 0) return false;

	const fieldName = path[path.length - 1];
	const parentPath = path.slice(0, -1);

	// Navigate to parent element
	let parentElement: any = fhirSchema;
	for (const key of parentPath) {
		parentElement = parentElement.elements?.[key];
		if (!parentElement) break;
	}

	// Check if field is in required array
	if (parentElement?.required?.includes(fieldName)) {
		return true;
	}

	// Also check at root level
	if (
		parentPath.length === 0 &&
		fieldName &&
		fhirSchema.required?.includes(fieldName)
	) {
		return true;
	}

	return false;
}

/**
 * Check if a field is excluded
 */
export function isExcluded(
	fhirSchema: FHIRSchema,
	path: string[],
	_manager: ReturnType<typeof CanonicalManager>,
): boolean {
	if (path.length === 0) return false;

	const fieldName = path[path.length - 1];
	const parentPath = path.slice(0, -1);

	// Navigate to parent element
	let parentElement: any = fhirSchema;
	for (const key of parentPath) {
		parentElement = parentElement.elements?.[key];
		if (!parentElement) break;
	}

	// Check if field is in excluded array
	if (parentElement?.excluded?.includes(fieldName)) {
		return true;
	}

	// Also check at root level
	if (
		parentPath.length === 0 &&
		fieldName &&
		fhirSchema.excluded?.includes(fieldName)
	) {
		return true;
	}

	return false;
}

/**
 * Build reference array from element refers
 */
export function buildReferences(
	element: FHIRSchemaElement,
	manager: ReturnType<typeof CanonicalManager>,
	packageInfo?: PackageInfo,
): TypeSchemaIdentifier[] | undefined {
	if (!element.refers || element.refers.length === 0) {
		return undefined;
	}

	return element.refers.map((ref) => {
		try {
			const resource = manager.resolve(ref);
			if (resource) {
				return buildSchemaIdentifier(
					resource as unknown as FHIRSchema,
					packageInfo,
				);
			}
		} catch {
			// If we can't resolve, create a minimal identifier
		}

		// Build proper URL for reference
		const url = ref.includes("/")
			? ref
			: ref.match(/^[A-Z]/)
				? `http://hl7.org/fhir/StructureDefinition/${ref}`
				: ref.includes("TutorNotification")
					? `http://example.com/aidbox-sms-tutor/${ref}`
					: ref;

		const isStandardFhir = url.startsWith("http://hl7.org/fhir/");
		return {
			kind: "resource" as const,
			package: isStandardFhir
				? "hl7.fhir.r4.core"
				: packageInfo?.name || "undefined",
			version: isStandardFhir ? "4.0.1" : packageInfo?.version || "undefined",
			name: ref,
			url: url,
		};
	});
}

/**
 * Build field type identifier
 */
export function buildFieldType(
	fhirSchema: FHIRSchema,
	_path: string[],
	element: FHIRSchemaElement,
	_manager: ReturnType<typeof CanonicalManager>,
	packageInfo?: PackageInfo,
): TypeSchemaIdentifier | undefined {
	// Handle element reference (for slicing)
	if (element.elementReference) {
		const refPath = element.elementReference
			.filter((_, i) => i % 2 === 1) // Get odd indices (the actual path parts)
			.map((p) => p as string)
			.filter((p) => p !== "elements"); // Remove 'elements' which is just a container

		// Only return nested identifier if we have a non-empty path
		if (refPath.length > 0) {
			return buildNestedIdentifier(fhirSchema, refPath, packageInfo);
		}
	}

	// Handle normal type
	if (element.type) {
		const typeUrl = element.type.includes("/")
			? element.type
			: `http://hl7.org/fhir/StructureDefinition/${element.type}`;

		// Always create a type identifier, even if we can't resolve
		const kind = element.type.match(/^[a-z]/)
			? "primitive-type"
			: "complex-type";
		const isStandardFhir = typeUrl.startsWith("http://hl7.org/fhir/");
		return {
			kind: kind as any,
			package: isStandardFhir
				? "hl7.fhir.r4.core"
				: packageInfo?.name || "undefined",
			version: isStandardFhir ? "4.0.1" : packageInfo?.version || "undefined",
			name: element.type,
			url: typeUrl,
		};
	}

	return undefined;
}

/**
 * Build a TypeSchema field from a FHIRSchema element
 */
export async function buildField(
	fhirSchema: FHIRSchema,
	path: string[],
	element: FHIRSchemaElement,
	manager: ReturnType<typeof CanonicalManager>,
	packageInfo?: PackageInfo,
): Promise<TypeSchemaField> {
	const field: TypeSchemaField = {
		array: element.array || false,
		required: isRequired(fhirSchema, path, manager),
		excluded: isExcluded(fhirSchema, path, manager),
	};

	// Add type if present
	const type = buildFieldType(fhirSchema, path, element, manager, packageInfo);
	if (type) {
		field.type = type;
	}

	// Add cardinality
	if (element.min !== undefined) field.min = element.min;
	if (element.max !== undefined) field.max = element.max;

	// Add choices
	// @ts-ignore
	if (element.choices) field.choices = element.choices;
	// @ts-ignore
	if (element.choiceOf) field.choiceOf = element.choiceOf;

	// Add binding if present
	if (element.binding) {
		field.binding = buildBindingIdentifier(
			fhirSchema,
			path,
			element.binding.bindingName,
			packageInfo,
		);

		// Add enum for required bindings on code types
		if (element.binding.strength === "required" && element.type === "code") {
			const enumValues = await buildEnum(element, manager);
			if (enumValues && enumValues.length > 0) {
				field.enum = enumValues;
			}
		}
	}

	// Add references
	const references = buildReferences(element, manager, packageInfo);
	if (references) {
		field.reference = references;
	}

	// Remove empty/default values
	return removeEmptyValues(field);
}

/**
 * Remove empty values from an object
 */
function removeEmptyValues<T extends Record<string, any>>(obj: T): T {
	const result: any = {};

	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined && value !== null) {
			if (Array.isArray(value) && value.length === 0) {
				continue;
			}
			result[key] = value;
		}
	}

	return result;
}

/**
 * Check if an element represents a nested type (BackboneElement)
 */
export function isNestedElement(element: FHIRSchemaElement): boolean {
	return (
		element.type === "BackboneElement" ||
		(element.elements && Object.keys(element.elements).length > 0) ||
		false
	);
}

/**
 * Build a field reference to a nested type
 */
export function buildNestedField(
	fhirSchema: FHIRSchema,
	path: string[],
	element: FHIRSchemaElement,
	manager: ReturnType<typeof CanonicalManager>,
	packageInfo?: PackageInfo,
): TypeSchemaField {
	return {
		type: buildNestedIdentifier(fhirSchema, path, packageInfo),
		array: element.array || false,
		required: isRequired(fhirSchema, path, manager),
		excluded: isExcluded(fhirSchema, path, manager),
	};
}
