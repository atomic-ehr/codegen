/**
 * FHIR Resource Type Generation
 *
 * Handles generation of TypeScript types for FHIR resources.
 * Provides specialized handling for FHIR resource-specific features like
 * backbone elements, choice types, and resource inheritance.
 */

import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { transformFHIRSchema } from "../typeschema/core/transformer";
import type {
	AnyTypeSchema,
	TypeSchemaField,
	TypeSchemaIdentifier,
} from "../typeschema/lib-types";
import type {
	BackboneElementInfo,
	ChoiceTypeInfo,
	FHIRGenerationContext,
	GenerationWarning,
	ResourceDependency,
} from "./types";
import {
	FHIR_R4_RESOURCE_TYPES,
	getFHIRTypeKind,
	isFHIRResourceType,
} from "./types";

/**
 * Generate TypeSchema for FHIR resource types
 */
export async function generateResourceTypes(
	schemas: FHIRSchema[],
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	const results: AnyTypeSchema[] = [];

	// Sort resources by dependency order (base types first)
	const sortedSchemas = sortResourcesByDependency(schemas);

	for (const schema of sortedSchemas) {
		try {
			const resourceResults = await generateResourceType(schema, context);
			results.push(...resourceResults);
		} catch (error) {
			addResourceGenerationWarning(context, schema, error as Error);
		}
	}

	return results;
}

/**
 * Generate TypeSchema for a single FHIR resource type
 */
export async function generateResourceType(
	schema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	// Prevent infinite recursion
	if (context.depth > context.options.maxDepth) {
		addResourceGenerationWarning(
			context,
			schema,
			new Error("Maximum recursion depth reached"),
		);
		return [];
	}

	const newContext = {
		...context,
		depth: context.depth + 1,
	};

	// Use the base transformer but enhance with resource-specific processing
	const baseResults = await transformFHIRSchema(
		schema,
		context.manager,
		context.packageInfo,
	);

	// Enhance results with resource-specific processing
	const enhancedResults: AnyTypeSchema[] = [];

	for (const result of baseResults) {
		if ("identifier" in result && result.identifier.kind === "resource") {
			const enhancedResult = await enhanceResourceSchema(
				result,
				schema,
				newContext,
			);
			enhancedResults.push(enhancedResult);
		} else {
			enhancedResults.push(result);
		}
	}

	return enhancedResults;
}

/**
 * Enhance a resource schema with FHIR-specific features
 */
async function enhanceResourceSchema(
	schema: AnyTypeSchema,
	fhirSchema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema> {
	if (!("fields" in schema) || !schema.fields) {
		return schema;
	}

	const enhanced = { ...schema };

	// Process choice types
	if (schema.fields) {
		enhanced.fields = await processChoiceTypes(
			schema.fields,
			fhirSchema,
			context,
		);
	}

	// Process backbone elements
	if ("nested" in enhanced && enhanced.nested) {
		enhanced.nested = await processBackboneElements(
			enhanced.nested,
			fhirSchema,
			context,
		);
	}

	// Add resource-specific metadata
	if ("metadata" in enhanced) {
		enhanced.metadata = {
			...enhanced.metadata,
			resourceType: fhirSchema.name || fhirSchema.id,
			fhirVersion: context.options.fhirVersion,
			isResource: true,
		};
	}

	return enhanced;
}

/**
 * Process choice types (e.g., value[x]) in resource fields
 */
async function processChoiceTypes(
	fields: Record<string, TypeSchemaField>,
	fhirSchema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<Record<string, TypeSchemaField>> {
	const processedFields: Record<string, TypeSchemaField> = {};
	const choiceTypes = new Map<string, ChoiceTypeInfo>();

	// First pass: identify choice types
	for (const [fieldName, field] of Object.entries(fields)) {
		if (isChoiceTypeDeclaration(fieldName, field)) {
			const choiceInfo = extractChoiceTypeInfo(fieldName, field, fhirSchema);
			if (choiceInfo) {
				choiceTypes.set(choiceInfo.baseName, choiceInfo);
			}
		}
	}

	// Second pass: process all fields
	for (const [fieldName, field] of Object.entries(fields)) {
		if (isChoiceTypeInstance(fieldName, field)) {
			const processed = await processChoiceTypeInstance(
				fieldName,
				field,
				choiceTypes,
				context,
			);
			processedFields[fieldName] = processed;
		} else if (isChoiceTypeDeclaration(fieldName, field)) {
			const processed = await processChoiceTypeDeclaration(
				fieldName,
				field,
				choiceTypes,
				context,
			);
			processedFields[fieldName] = processed;
		} else {
			processedFields[fieldName] = field;
		}
	}

	return processedFields;
}

/**
 * Process backbone elements in nested types
 */
async function processBackboneElements(
	nestedTypes: any[],
	fhirSchema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<any[]> {
	const processed: any[] = [];

	for (const nestedType of nestedTypes) {
		if (nestedType.base?.name === "BackboneElement") {
			const backboneInfo = extractBackboneElementInfo(nestedType, fhirSchema);
			const enhancedNested = await enhanceBackboneElement(
				nestedType,
				backboneInfo,
				context,
			);
			processed.push(enhancedNested);
		} else {
			processed.push(nestedType);
		}
	}

	return processed;
}

/**
 * Check if a field is a choice type declaration (e.g., value[x])
 */
function isChoiceTypeDeclaration(
	fieldName: string,
	field: TypeSchemaField,
): boolean {
	return (
		fieldName.endsWith("[x]") ||
		("choices" in field && field.choices !== undefined)
	);
}

/**
 * Check if a field is a choice type instance (e.g., valueString)
 */
function isChoiceTypeInstance(
	fieldName: string,
	field: TypeSchemaField,
): boolean {
	return "choiceOf" in field && field.choiceOf !== undefined;
}

/**
 * Extract choice type information from a field
 */
function extractChoiceTypeInfo(
	fieldName: string,
	field: TypeSchemaField,
	fhirSchema: FHIRSchema,
): ChoiceTypeInfo | null {
	if ("choices" in field && field.choices) {
		const baseName = fieldName.replace("[x]", "");
		return {
			baseName,
			types: field.choices,
			constraints: extractChoiceConstraints(baseName, fhirSchema),
		};
	}

	if (fieldName.endsWith("[x]")) {
		const baseName = fieldName.replace("[x]", "");
		return {
			baseName,
			types: inferChoiceTypes(baseName, fhirSchema),
			constraints: extractChoiceConstraints(baseName, fhirSchema),
		};
	}

	return null;
}

/**
 * Process a choice type instance field
 */
async function processChoiceTypeInstance(
	fieldName: string,
	field: TypeSchemaField,
	choiceTypes: Map<string, ChoiceTypeInfo>,
	context: FHIRGenerationContext,
): Promise<TypeSchemaField> {
	if (!("choiceOf" in field) || !field.choiceOf) {
		return field;
	}

	const choiceInfo = choiceTypes.get(field.choiceOf);
	if (!choiceInfo) {
		return field;
	}

	// Validate that this instance type is allowed
	const typeFromName = extractTypeFromChoiceInstanceName(
		fieldName,
		choiceInfo.baseName,
	);
	if (!choiceInfo.types.includes(typeFromName)) {
		addChoiceTypeWarning(context, fieldName, typeFromName, choiceInfo.types);
	}

	return field;
}

/**
 * Process a choice type declaration field
 */
async function processChoiceTypeDeclaration(
	fieldName: string,
	field: TypeSchemaField,
	choiceTypes: Map<string, ChoiceTypeInfo>,
	context: FHIRGenerationContext,
): Promise<TypeSchemaField> {
	if (!("choices" in field) || !field.choices) {
		return field;
	}

	// Validate choice types
	for (const choiceType of field.choices) {
		if (!isValidFHIRType(choiceType)) {
			addChoiceTypeWarning(context, fieldName, choiceType, field.choices);
		}
	}

	return field;
}

/**
 * Extract backbone element information
 */
function extractBackboneElementInfo(
	nestedType: any,
	fhirSchema: FHIRSchema,
): BackboneElementInfo {
	const path = nestedType.identifier?.url || nestedType.identifier?.name || "";
	const typeName = nestedType.identifier?.name || "UnknownBackboneElement";

	const fields = nestedType.fields ? Object.keys(nestedType.fields) : [];
	const nested: BackboneElementInfo[] = [];

	// Extract nested backbone elements recursively
	if (nestedType.nested) {
		for (const innerNested of nestedType.nested) {
			if (innerNested.base?.name === "BackboneElement") {
				nested.push(extractBackboneElementInfo(innerNested, fhirSchema));
			}
		}
	}

	return {
		path,
		typeName,
		fields,
		nested,
	};
}

/**
 * Enhance a backbone element with additional metadata
 */
async function enhanceBackboneElement(
	nestedType: any,
	backboneInfo: BackboneElementInfo,
	context: FHIRGenerationContext,
): Promise<any> {
	const enhanced = {
		...nestedType,
		metadata: {
			...nestedType.metadata,
			isBackboneElement: true,
			elementPath: backboneInfo.path,
			fieldCount: backboneInfo.fields.length,
			nestedElementCount: backboneInfo.nested.length,
		},
	};

	return enhanced;
}

/**
 * Sort resource schemas by dependency order
 */
function sortResourcesByDependency(schemas: FHIRSchema[]): FHIRSchema[] {
	const sorted: FHIRSchema[] = [];
	const processed = new Set<string>();
	const processing = new Set<string>();

	const processSchema = (schema: FHIRSchema) => {
		const key = schema.url || schema.name || schema.id || "";

		if (processed.has(key)) {
			return;
		}

		if (processing.has(key)) {
			// Circular dependency detected, add warning but continue
			return;
		}

		processing.add(key);

		// Process base resource first if it exists
		if (
			schema.base &&
			schema.base !== "Resource" &&
			schema.base !== "DomainResource"
		) {
			const baseSchema = schemas.find(
				(s) =>
					s.name === schema.base ||
					s.id === schema.base ||
					s.url === schema.base,
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
 * Infer choice types from field name and schema
 */
function inferChoiceTypes(baseName: string, fhirSchema: FHIRSchema): string[] {
	// Look for element definitions in the schema
	if (fhirSchema.elements) {
		for (const [key, element] of Object.entries(fhirSchema.elements)) {
			if (key === baseName && element.type) {
				return Array.isArray(element.type)
					? element.type.map((t) => t.code || t)
					: [element.type];
			}
		}
	}

	// Default FHIR choice types for common patterns
	const commonChoiceTypes: Record<string, string[]> = {
		value: [
			"string",
			"boolean",
			"integer",
			"decimal",
			"date",
			"dateTime",
			"time",
			"code",
			"uri",
		],
		effective: ["dateTime", "Period", "Timing", "instant"],
		onset: ["dateTime", "Age", "Period", "Range", "string"],
		abatement: ["dateTime", "Age", "Period", "Range", "string", "boolean"],
	};

	return commonChoiceTypes[baseName] || ["string", "integer", "boolean"];
}

/**
 * Extract choice constraints from schema
 */
function extractChoiceConstraints(
	baseName: string,
	fhirSchema: FHIRSchema,
): Record<string, any> {
	const constraints: Record<string, any> = {};

	if (fhirSchema.elements) {
		for (const [key, element] of Object.entries(fhirSchema.elements)) {
			if (key === baseName) {
				if (element.min !== undefined) constraints.min = element.min;
				if (element.max !== undefined) constraints.max = element.max;
				if (element.binding) constraints.binding = element.binding;
			}
		}
	}

	return constraints;
}

/**
 * Extract type from choice instance field name
 */
function extractTypeFromChoiceInstanceName(
	fieldName: string,
	baseName: string,
): string {
	if (!fieldName.startsWith(baseName)) {
		return "";
	}

	const typePart = fieldName.slice(baseName.length);
	return typePart.charAt(0).toLowerCase() + typePart.slice(1);
}

/**
 * Check if a type is a valid FHIR type
 */
function isValidFHIRType(type: string): boolean {
	return (
		isFHIRResourceType(type) ||
		getFHIRTypeKind(type) !== "complex-type" ||
		[
			"string",
			"boolean",
			"integer",
			"decimal",
			"date",
			"dateTime",
			"time",
			"code",
			"uri",
			"url",
			"canonical",
			"base64Binary",
			"instant",
			"oid",
			"id",
			"markdown",
			"unsignedInt",
			"positiveInt",
			"uuid",
			"xhtml",
		].includes(type)
	);
}

/**
 * Add a resource generation warning
 */
function addResourceGenerationWarning(
	context: FHIRGenerationContext,
	schema: FHIRSchema,
	error: Error,
): void {
	const warning: GenerationWarning = {
		message: `Failed to generate resource ${schema.name || schema.id}: ${error.message}`,
		path: schema.url,
		code: "RESOURCE_GENERATION_ERROR",
		severity: "high",
	};

	// Note: In a real implementation, you'd want to add this to the context or a warning collection
	if (context.options.verbose) {
		console.warn(`[FHIR Resources] ${warning.message}`);
	}
}

/**
 * Add a choice type warning
 */
function addChoiceTypeWarning(
	context: FHIRGenerationContext,
	fieldName: string,
	invalidType: string,
	validTypes: string[],
): void {
	const warning: GenerationWarning = {
		message: `Invalid choice type '${invalidType}' for field '${fieldName}'. Valid types: ${validTypes.join(", ")}`,
		path: fieldName,
		code: "INVALID_CHOICE_TYPE",
		severity: "medium",
	};

	if (context.options.verbose) {
		console.warn(`[FHIR Resources] ${warning.message}`);
	}
}

/**
 * Create a resource dependency
 */
export function createResourceDependency(
	type: ResourceDependency["type"],
	target: TypeSchemaIdentifier,
	sourcePath?: string,
	required = false,
): ResourceDependency {
	return {
		type,
		target,
		sourcePath,
		required,
	};
}
