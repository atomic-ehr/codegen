/**
 * FHIR Profile Type Generation
 *
 * Handles generation of TypeScript types for FHIR profiles.
 * Profiles define constraints and extensions on base FHIR resources,
 * requiring specialized handling for type narrowing and constraint application.
 */

import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import type {
	AnyTypeSchema,
	TypeSchemaField,
	TypeSchemaProfile,
} from "../typeschema/lib-types";
import { transformProfile } from "../typeschema/profile/processor";
import type {
	FHIRGenerationContext,
	GenerationWarning,
	ProfileConstraintInfo,
	ProfileExtension,
} from "./types";

/**
 * Generate TypeSchema for FHIR profiles
 */
export async function generateProfileTypes(
	schemas: FHIRSchema[],
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	const results: AnyTypeSchema[] = [];

	// Sort profiles by dependency order (base profiles first)
	const sortedSchemas = sortProfilesByDependency(schemas);

	for (const schema of sortedSchemas) {
		// Check for circular dependencies
		if (context.processingProfiles.has(schema.url || schema.name || "")) {
			addProfileGenerationWarning(
				context,
				schema,
				new Error("Circular profile dependency detected"),
			);
			continue;
		}

		try {
			const profileResults = await generateProfileType(schema, context);
			results.push(...profileResults);
		} catch (error) {
			addProfileGenerationWarning(context, schema, error as Error);
		}
	}

	return results;
}

/**
 * Generate TypeSchema for a single FHIR profile
 */
export async function generateProfileType(
	schema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	const profileUrl = schema.url || schema.name || "";

	// Prevent infinite recursion
	if (context.depth > context.options.maxDepth) {
		addProfileGenerationWarning(
			context,
			schema,
			new Error("Maximum recursion depth reached"),
		);
		return [];
	}

	// Track processing to detect cycles
	context.processingProfiles.add(profileUrl);

	try {
		const newContext = {
			...context,
			depth: context.depth + 1,
		};

		// Use the specialized profile transformer
		const profileSchema = await transformProfile(
			schema,
			context.manager,
			context.packageInfo,
		);

		// Enhance with profile-specific processing
		const enhancedProfile = await enhanceProfileSchema(
			profileSchema,
			schema,
			newContext,
		);

		return [enhancedProfile];
	} finally {
		context.processingProfiles.delete(profileUrl);
	}
}

/**
 * Enhance a profile schema with profile-specific features
 */
async function enhanceProfileSchema(
	schema: TypeSchemaProfile,
	fhirSchema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<TypeSchemaProfile> {
	const enhanced = { ...schema };

	// Apply profile constraints
	if (fhirSchema.elements && enhanced.fields) {
		enhanced.fields = await applyProfileConstraints(
			enhanced.fields,
			fhirSchema.elements,
			context,
		);

		// Extract constraint information
		enhanced.constraints = extractProfileConstraints(
			fhirSchema.elements,
			fhirSchema,
		);
	}

	// Process profile extensions
	enhanced.extensions = extractProfileExtensions(fhirSchema);

	// Add validation rules
	enhanced.validation = extractValidationRules(fhirSchema);

	// Add profile metadata
	enhanced.metadata = {
		...enhanced.metadata,
		profileType: fhirSchema.type || "Unknown",
		derivation: fhirSchema.derivation || "constraint",
		status: fhirSchema.status || "unknown",
		experimental: fhirSchema.experimental || false,
		publisher: fhirSchema.publisher,
		contact: fhirSchema.contact,
		date: fhirSchema.date,
		fhirVersion: fhirSchema.fhirVersion || context.options.fhirVersion,
	};

	return enhanced;
}

/**
 * Apply profile constraints to fields
 */
async function applyProfileConstraints(
	fields: Record<string, TypeSchemaField>,
	elements: Record<string, any>,
	context: FHIRGenerationContext,
): Promise<Record<string, TypeSchemaField>> {
	const constrainedFields: Record<string, TypeSchemaField> = {};

	for (const [fieldName, field] of Object.entries(fields)) {
		let constrainedField = { ...field };

		// Find corresponding element definition
		const element = findElementForField(fieldName, elements);
		if (element) {
			constrainedField = await applyElementConstraints(
				constrainedField,
				element,
				context,
			);
		}

		constrainedFields[fieldName] = constrainedField;
	}

	return constrainedFields;
}

/**
 * Apply constraints from a single element definition
 */
async function applyElementConstraints(
	field: TypeSchemaField,
	element: any,
	context: FHIRGenerationContext,
): Promise<TypeSchemaField> {
	const constrained = { ...field };

	// Apply cardinality constraints
	if (element.min !== undefined) {
		constrained.min = Math.max(element.min, constrained.min || 0);
		constrained.required = element.min > 0;
	}

	if (element.max !== undefined) {
		if (element.max === "*") {
			constrained.array = true;
		} else {
			const maxNum = parseInt(element.max, 10);
			if (!Number.isNaN(maxNum)) {
				constrained.max = Math.min(maxNum, constrained.max || Infinity);
				constrained.array = maxNum > 1;
			}
		}
	}

	// Apply type constraints
	if (element.type && element.type.length > 0) {
		const allowedTypes = element.type.map((t: any) => t.code || t);
		constrained.type = await constrainFieldType(
			constrained.type,
			allowedTypes,
			context,
		);
	}

	// Apply binding constraints
	if (element.binding) {
		constrained.binding = await createBindingIdentifier(
			element.binding,
			context,
		);
	}

	// Apply fixed values
	if (element.fixedValue !== undefined) {
		constrained.enum = [element.fixedValue];
		constrained.required = true;
	}

	// Apply pattern values
	if (element.patternValue !== undefined) {
		// Pattern values constrain but don't fix - add as validation metadata
		if (!constrained.description) {
			constrained.description = "";
		}
		constrained.description += ` Pattern: ${JSON.stringify(element.patternValue)}`;
	}

	// Mark mustSupport fields
	if (element.mustSupport) {
		if (!constrained.description) {
			constrained.description = "";
		}
		constrained.description += " [Must Support]";
	}

	return constrained;
}

/**
 * Constrain a field type based on allowed types
 */
async function constrainFieldType(
	currentType: any,
	allowedTypes: string[],
	_context: FHIRGenerationContext,
): Promise<any> {
	if (!currentType || !allowedTypes.length) {
		return currentType;
	}

	// If current type is already more specific, keep it
	if (currentType.name && allowedTypes.includes(currentType.name)) {
		return currentType;
	}

	// If only one allowed type, use it
	if (allowedTypes.length === 1) {
		return {
			...currentType,
			name: allowedTypes[0],
			url: `http://hl7.org/fhir/StructureDefinition/${allowedTypes[0]}`,
		};
	}

	// Multiple types - create union type or choice
	return currentType; // Keep original for now, could enhance with union types
}

/**
 * Create a binding identifier from binding information
 */
async function createBindingIdentifier(
	binding: any,
	context: FHIRGenerationContext,
): Promise<any> {
	if (!binding.valueSet) {
		return undefined;
	}

	return {
		kind: "value-set",
		package: context.packageInfo?.name || "hl7.fhir.r4.core",
		version: context.packageInfo?.version || "4.0.1",
		name: extractValueSetName(binding.valueSet),
		url: binding.valueSet,
	};
}

/**
 * Extract profile constraints from elements
 */
function extractProfileConstraints(
	elements: Record<string, any>,
	_fhirSchema: FHIRSchema,
): Record<string, any> {
	const constraints: Record<string, any> = {};

	for (const [path, element] of Object.entries(elements)) {
		const constraint: any = {};

		if (element.min !== undefined) constraint.min = element.min;
		if (element.max !== undefined) constraint.max = element.max;
		if (element.mustSupport) constraint.mustSupport = element.mustSupport;
		if (element.fixedValue !== undefined)
			constraint.fixedValue = element.fixedValue;
		if (element.patternValue !== undefined)
			constraint.patternValue = element.patternValue;
		if (element.binding) constraint.binding = element.binding;
		if (element.type) constraint.types = element.type;
		if (element.slicing) constraint.slicing = element.slicing;

		if (Object.keys(constraint).length > 0) {
			constraints[path] = constraint;
		}
	}

	return constraints;
}

/**
 * Extract profile extensions
 */
function extractProfileExtensions(fhirSchema: FHIRSchema): ProfileExtension[] {
	const extensions: ProfileExtension[] = [];

	if (fhirSchema.elements) {
		for (const [path, element] of Object.entries(fhirSchema.elements)) {
			if (path.includes("extension") && element.type) {
				const profiles = element.type
					.filter((t: any) => t.code === "Extension" && t.profile)
					.flatMap((t: any) => t.profile || []);

				if (profiles.length > 0) {
					extensions.push({
						path,
						profile: profiles,
						min: element.min,
						max: element.max,
						mustSupport: element.mustSupport,
					});
				}
			}
		}
	}

	return extensions;
}

/**
 * Extract validation rules from profile
 */
function extractValidationRules(fhirSchema: FHIRSchema): any[] {
	const rules: any[] = [];

	if (fhirSchema.elements) {
		for (const [path, element] of Object.entries(fhirSchema.elements)) {
			if (element.constraint) {
				for (const constraint of element.constraint) {
					rules.push({
						path,
						key: constraint.key,
						severity: constraint.severity,
						human: constraint.human,
						expression: constraint.expression,
					});
				}
			}
		}
	}

	return rules;
}

/**
 * Sort profiles by dependency order
 */
function sortProfilesByDependency(schemas: FHIRSchema[]): FHIRSchema[] {
	const sorted: FHIRSchema[] = [];
	const processed = new Set<string>();
	const processing = new Set<string>();

	const processSchema = (schema: FHIRSchema) => {
		const key = schema.url || schema.name || schema.id || "";

		if (processed.has(key)) {
			return;
		}

		if (processing.has(key)) {
			// Circular dependency - add warning and continue
			return;
		}

		processing.add(key);

		// Process base profile first if it exists and is also a profile
		if (schema.baseDefinition && !isBaseFHIRResource(schema.baseDefinition)) {
			const baseSchema = schemas.find(
				(s) =>
					s.url === schema.baseDefinition ||
					s.name === getNameFromUrl(schema.baseDefinition),
			);
			if (baseSchema) {
				processSchema(baseSchema);
			}
		}

		processing.delete(key);
		processed.add(key);
		sorted.push(schema);
	};

	for (const schema of schemas) {
		processSchema(schema);
	}

	return sorted;
}

/**
 * Find element definition for a field
 */
function findElementForField(
	fieldName: string,
	elements: Record<string, any>,
): any {
	// Direct match
	if (elements[fieldName]) {
		return elements[fieldName];
	}

	// Try with resource type prefix
	for (const [path, element] of Object.entries(elements)) {
		const pathParts = path.split(".");
		if (pathParts[pathParts.length - 1] === fieldName) {
			return element;
		}
	}

	return null;
}

/**
 * Check if a URL represents a base FHIR resource
 */
function isBaseFHIRResource(url: string): boolean {
	const baseFHIRResources = [
		"http://hl7.org/fhir/StructureDefinition/Resource",
		"http://hl7.org/fhir/StructureDefinition/DomainResource",
	];

	return (
		baseFHIRResources.includes(url) ||
		(url.startsWith("http://hl7.org/fhir/StructureDefinition/") &&
			!url.includes("/"))
	);
}

/**
 * Extract name from FHIR URL
 */
function getNameFromUrl(url: string): string {
	return url.split("/").pop() || "";
}

/**
 * Extract ValueSet name from URL
 */
function extractValueSetName(valueSetUrl: string): string {
	return getNameFromUrl(valueSetUrl);
}

/**
 * Add a profile generation warning
 */
function addProfileGenerationWarning(
	context: FHIRGenerationContext,
	schema: FHIRSchema,
	error: Error,
): void {
	const warning: GenerationWarning = {
		message: `Failed to generate profile ${schema.name || schema.id}: ${error.message}`,
		path: schema.url,
		code: "PROFILE_GENERATION_ERROR",
		severity: "high",
	};

	if (context.options.verbose) {
		console.warn(`[FHIR Profiles] ${warning.message}`);
	}
}

/**
 * Create profile constraint information
 */
export function createProfileConstraintInfo(
	path: string,
	type: ProfileConstraintInfo["type"],
	original: any,
	applied: any,
	profileUrl: string,
): ProfileConstraintInfo {
	return {
		path,
		type,
		original,
		applied,
		profileUrl,
	};
}
