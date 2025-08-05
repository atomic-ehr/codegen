/**
 * Main FHIRSchema to TypeSchema Transformer
 *
 * Core transformation logic for converting FHIRSchema to TypeSchema format
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import { transformProfile } from "../profile/processor";
import type {
	AnyTypeSchema,
	PackageInfo,
	TypeSchema,
	TypeSchemaField,
	TypeSchemaIdentifier,
} from "../types";
import { collectBindingSchemas } from "./binding";
import {
	buildField,
	buildNestedField,
	getElementHierarchy,
	isNestedElement,
	mergeElementHierarchy,
} from "./field-builder";
import { buildSchemaIdentifier } from "./identifier";
import { buildNestedTypes, extractNestedDependencies } from "./nested-types";

/**
 * Transform elements into fields
 */
async function transformElements(
	fhirSchema: FHIRSchema,
	parentPath: string[],
	elements: Record<string, FHIRSchemaElement>,
	manager: CanonicalManager,
	packageInfo?: PackageInfo,
): Promise<Record<string, TypeSchemaField>> {
	const fields: Record<string, TypeSchemaField> = {};

	for (const [key, element] of Object.entries(elements)) {
		const path = [...parentPath, key];

		// Get element snapshot from hierarchy
		const hierarchy = getElementHierarchy(fhirSchema, path, manager);
		const snapshot =
			hierarchy.length > 0 ? mergeElementHierarchy(hierarchy) : element;

		if (isNestedElement(snapshot)) {
			// Reference to nested type
			fields[key] = buildNestedField(
				fhirSchema,
				path,
				snapshot,
				manager,
				packageInfo,
			);
		} else {
			// Regular field
			fields[key] = await buildField(
				fhirSchema,
				path,
				snapshot,
				manager,
				packageInfo,
			);
		}
	}

	return fields;
}

/**
 * Extract dependencies from fields
 */
function extractFieldDependencies(
	fields: Record<string, TypeSchemaField>,
): TypeSchemaIdentifier[] {
	const deps: TypeSchemaIdentifier[] = [];

	for (const field of Object.values(fields)) {
		if (field.type) {
			deps.push(field.type);
		}
		if (field.binding) {
			deps.push(field.binding);
		}
		// References are not included in dependencies
	}

	return deps;
}

/**
 * Remove duplicate dependencies
 */
function deduplicateDependencies(
	deps: TypeSchemaIdentifier[],
): TypeSchemaIdentifier[] {
	const seen = new Set<string>();
	const unique: TypeSchemaIdentifier[] = [];

	for (const dep of deps) {
		const key = dep.url;
		if (!seen.has(key)) {
			seen.add(key);
			unique.push(dep);
		}
	}

	// Sort by name for consistent output (matching Clojure implementation)
	unique.sort((a, b) => a.name.localeCompare(b.name));

	return unique;
}

/**
 * Transform a single FHIRSchema to TypeSchema(s)
 * Returns the main schema plus any binding schemas
 */
export async function transformFHIRSchema(
	fhirSchema: FHIRSchema,
	manager: CanonicalManager,
	packageInfo?: PackageInfo,
): Promise<AnyTypeSchema[]> {
	const results: AnyTypeSchema[] = [];

	// Extract package info from schema if not provided
	if (!packageInfo && (fhirSchema.package_name || fhirSchema.package_id)) {
		packageInfo = {
			name: fhirSchema.package_name || fhirSchema.package_id || "undefined",
			version: fhirSchema.package_version || "undefined",
		};
	}

	// Build main identifier
	const identifier = buildSchemaIdentifier(fhirSchema, packageInfo);

	// Handle profiles with specialized processor
	if (identifier.kind === "profile") {
		const profileSchema = await transformProfile(
			fhirSchema,
			manager,
			packageInfo,
		);
		results.push(profileSchema);

		// Collect binding schemas for profiles too
		const bindingSchemas = await collectBindingSchemas(
			fhirSchema,
			manager,
			packageInfo,
		);
		results.push(...bindingSchemas);

		return results;
	}

	// Build base identifier if present
	let base: TypeSchemaIdentifier | undefined;
	if (fhirSchema.base && fhirSchema.type !== "Element") {
		// Create base identifier directly
		const baseUrl = fhirSchema.base.includes("/")
			? fhirSchema.base
			: `http://hl7.org/fhir/StructureDefinition/${fhirSchema.base}`;
		const baseName = fhirSchema.base.split("/").pop() || fhirSchema.base;
		const kind =
			baseName === "Element" || baseName === "BackboneElement"
				? "complex-type"
				: "resource";
		// For standard FHIR types, use the standard package even if no package info
		const isStandardFhir = baseUrl.startsWith("http://hl7.org/fhir/");
		base = {
			kind: kind as any,
			package: isStandardFhir
				? "hl7.fhir.r4.core"
				: packageInfo?.name || fhirSchema.package_name || "undefined",
			version: isStandardFhir
				? "4.0.1"
				: packageInfo?.version || fhirSchema.package_version || "undefined",
			name: baseName,
			url: baseUrl,
		};
	}

	// Initialize the main schema
	const mainSchema: TypeSchema = {
		identifier,
		dependencies: [],
	};

	// Collect dependencies in the same order as Clojure implementation
	const allDependencies: TypeSchemaIdentifier[] = [];

	// Add base if present (first in dependencies)
	if (base) {
		mainSchema.base = base;
		allDependencies.push(base);
	}

	// Add description if present
	if (fhirSchema.description) {
		mainSchema.description = fhirSchema.description;
	}

	// Transform elements into fields (for non-primitive types)
	if (fhirSchema.kind !== "primitive-type" && fhirSchema.elements) {
		const fields = await transformElements(
			fhirSchema,
			[],
			fhirSchema.elements,
			manager,
			packageInfo,
		);

		if (Object.keys(fields).length > 0) {
			mainSchema.fields = fields;
		}

		// Extract field dependencies (types and bindings)
		allDependencies.push(...extractFieldDependencies(fields));

		// Build nested types
		const nestedTypes = await buildNestedTypes(
			fhirSchema,
			manager,
			packageInfo,
		);
		if (nestedTypes.length > 0) {
			mainSchema.nested = nestedTypes;

			// Add nested type dependencies
			allDependencies.push(...extractNestedDependencies(nestedTypes));
		}
	}

	// Set all dependencies at once
	mainSchema.dependencies = allDependencies;

	// Deduplicate and sort dependencies
	mainSchema.dependencies = deduplicateDependencies(mainSchema.dependencies);

	// Remove self-reference from dependencies
	mainSchema.dependencies = mainSchema.dependencies.filter(
		(dep) => dep.url !== identifier.url,
	);

	// Add main schema to results
	results.push(mainSchema);

	// Collect and add binding schemas
	const bindingSchemas = await collectBindingSchemas(
		fhirSchema,
		manager,
		packageInfo,
	);
	results.push(...bindingSchemas);

	return results;
}

/**
 * Transform multiple FHIRSchemas
 */
export async function transformFHIRSchemas(
	fhirSchemas: FHIRSchema[],
	manager: CanonicalManager,
	packageInfo?: PackageInfo,
): Promise<AnyTypeSchema[]> {
	const allResults: AnyTypeSchema[] = [];

	for (const fhirSchema of fhirSchemas) {
		const results = await transformFHIRSchema(fhirSchema, manager, packageInfo);
		allResults.push(...results);
	}

	return allResults;
}
