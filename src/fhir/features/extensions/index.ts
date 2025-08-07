/**
 * FHIR Extension Type Generation
 *
 * Handles generation of TypeScript types for FHIR extensions.
 * Extensions allow adding structured data to any FHIR element,
 * requiring specialized handling for value types and nesting.
 */

import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { buildSchemaIdentifier } from "../typeschema/core/identifier";
import type {
	AnyTypeSchema,
	TypeSchema,
	TypeSchemaField,
	TypeSchemaIdentifier,
} from "../typeschema/lib-types";
import type {
	ExtensionContext,
	ExtensionDefinitionInfo,
	FHIRGenerationContext,
	GenerationWarning,
} from "./types";
import { getFHIRTypeKind } from "./types";

/**
 * Generate TypeSchema for FHIR extensions
 */
export async function generateExtensionTypes(
	schemas: FHIRSchema[],
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	const results: AnyTypeSchema[] = [];

	for (const schema of schemas) {
		// Check for circular dependencies
		const extensionUrl = schema.url || schema.name || "";
		if (context.processingExtensions.has(extensionUrl)) {
			addExtensionGenerationWarning(
				context,
				schema,
				new Error("Circular extension dependency detected"),
			);
			continue;
		}

		try {
			const extensionResults = await generateExtensionType(schema, context);
			results.push(...extensionResults);
		} catch (error) {
			addExtensionGenerationWarning(context, schema, error as Error);
		}
	}

	return results;
}

/**
 * Generate TypeSchema for a single FHIR extension
 */
export async function generateExtensionType(
	schema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	const extensionUrl = schema.url || schema.name || "";

	// Prevent infinite recursion
	if (context.depth > context.options.maxDepth) {
		addExtensionGenerationWarning(
			context,
			schema,
			new Error("Maximum recursion depth reached"),
		);
		return [];
	}

	// Track processing to detect cycles
	context.processingExtensions.add(extensionUrl);

	try {
		const newContext = {
			...context,
			depth: context.depth + 1,
		};

		const extensionInfo = extractExtensionDefinitionInfo(schema);
		const extensionSchema = await buildExtensionSchema(
			schema,
			extensionInfo,
			newContext,
		);

		return [extensionSchema];
	} finally {
		context.processingExtensions.delete(extensionUrl);
	}
}

/**
 * Build TypeSchema for an extension
 */
async function buildExtensionSchema(
	schema: FHIRSchema,
	info: ExtensionDefinitionInfo,
	context: FHIRGenerationContext,
): Promise<TypeSchema> {
	const identifier = buildSchemaIdentifier(schema, context.packageInfo);

	// Ensure this is marked as an extension
	identifier.kind = "complex-type";

	const extensionSchema: TypeSchema = {
		identifier,
		base: {
			kind: "complex-type",
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			name: "Extension",
			url: "http://hl7.org/fhir/StructureDefinition/Extension",
		},
		dependencies: [],
		fields: {},
		metadata: {
			isExtension: true,
			extensionUrl: info.url,
			valueTypes: info.valueTypes,
			cardinality: info.cardinality,
			context: info.context,
		},
	};

	// Add description if available
	if (schema.description) {
		extensionSchema.description = schema.description;
	}

	// Build fields for the extension
	const fields = await buildExtensionFields(schema, info, context);
	if (Object.keys(fields).length > 0) {
		extensionSchema.fields = fields;
	}

	// Add value fields based on allowed types
	const valueFields = await buildExtensionValueFields(info, context);
	if (Object.keys(valueFields).length > 0) {
		extensionSchema.fields = {
			...extensionSchema.fields,
			...valueFields,
		};
	}

	// Extract dependencies
	const dependencies = extractExtensionDependencies(extensionSchema, context);
	extensionSchema.dependencies = dependencies;

	return extensionSchema;
}

/**
 * Build fields for an extension
 */
async function buildExtensionFields(
	schema: FHIRSchema,
	info: ExtensionDefinitionInfo,
	context: FHIRGenerationContext,
): Promise<Record<string, TypeSchemaField>> {
	const fields: Record<string, TypeSchemaField> = {};

	// Standard extension fields
	fields.url = {
		type: {
			kind: "primitive-type",
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			name: "uri",
			url: "http://hl7.org/fhir/StructureDefinition/uri",
		},
		required: true,
		enum: [info.url], // Fix the URL for this specific extension
		description: "Extension URL",
	};

	// Process elements from the schema if available
	if (schema.elements) {
		for (const [path, element] of Object.entries(schema.elements)) {
			if (
				path.startsWith("Extension.") &&
				path !== "Extension.url" &&
				path !== "Extension.value[x]"
			) {
				const fieldName = path.replace("Extension.", "");
				fields[fieldName] = await buildExtensionFieldFromElement(
					element,
					context,
				);
			}
		}
	}

	return fields;
}

/**
 * Build value fields for an extension based on allowed types
 */
async function buildExtensionValueFields(
	info: ExtensionDefinitionInfo,
	context: FHIRGenerationContext,
): Promise<Record<string, TypeSchemaField>> {
	const fields: Record<string, TypeSchemaField> = {};

	if (info.valueTypes.length === 0) {
		// Extension with no value (only nested extensions)
		fields.extension = {
			type: {
				kind: "complex-type",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				name: "Extension",
				url: "http://hl7.org/fhir/StructureDefinition/Extension",
			},
			array: true,
			description: "Nested extensions",
		};
	} else if (info.valueTypes.length === 1) {
		// Single value type
		const valueType = info.valueTypes[0];
		fields[`value${capitalize(valueType)}`] = {
			type: await createTypeIdentifier(valueType, context),
			description: `Value of type ${valueType}`,
		};
	} else {
		// Multiple value types - create choice
		fields["value[x]"] = {
			choices: info.valueTypes,
			description: "Extension value",
		};

		// Create individual typed value fields
		for (const valueType of info.valueTypes) {
			fields[`value${capitalize(valueType)}`] = {
				choiceOf: "value[x]",
				type: await createTypeIdentifier(valueType, context),
				description: `Value of type ${valueType}`,
			};
		}
	}

	return fields;
}

/**
 * Build a field from an element definition
 */
async function buildExtensionFieldFromElement(
	element: any,
	context: FHIRGenerationContext,
): Promise<TypeSchemaField> {
	const field: TypeSchemaField = {
		description: element.short || element.definition,
	};

	// Set cardinality
	if (element.min !== undefined) {
		field.min = element.min;
		field.required = element.min > 0;
	}

	if (element.max !== undefined) {
		if (element.max === "*") {
			field.array = true;
		} else {
			const maxNum = parseInt(element.max, 10);
			if (!Number.isNaN(maxNum)) {
				field.max = maxNum;
				field.array = maxNum > 1;
			}
		}
	}

	// Set type
	if (element.type && element.type.length > 0) {
		const firstType = element.type[0];
		const typeName = firstType.code || firstType;
		field.type = await createTypeIdentifier(typeName, context);
	}

	// Set binding
	if (element.binding) {
		field.binding = await createBindingIdentifier(element.binding, context);
	}

	return field;
}

/**
 * Extract extension definition information from schema
 */
function extractExtensionDefinitionInfo(
	schema: FHIRSchema,
): ExtensionDefinitionInfo {
	const info: ExtensionDefinitionInfo = {
		url: schema.url || "",
		name: schema.name || "",
		valueTypes: [],
		cardinality: { min: 0, max: "*" },
		context: [],
	};

	// Extract value types from elements
	if (schema.elements?.["Extension.value[x]"]) {
		const valueElement = schema.elements["Extension.value[x]"];
		if (valueElement.type) {
			info.valueTypes = valueElement.type.map((t: any) => t.code || t);
		}

		// Extract cardinality
		if (valueElement.min !== undefined) info.cardinality.min = valueElement.min;
		if (valueElement.max !== undefined) info.cardinality.max = valueElement.max;
	}

	// Extract context from schema metadata or context elements
	if (schema.context) {
		info.context = schema.context.map((ctx: any) => ({
			type: ctx.type || "element",
			expression: ctx.expression || ctx,
		}));
	}

	// Fallback: infer from common patterns
	if (info.valueTypes.length === 0) {
		info.valueTypes = inferExtensionValueTypes(schema);
	}

	return info;
}

/**
 * Infer extension value types from schema
 */
function inferExtensionValueTypes(schema: FHIRSchema): string[] {
	// Look for type constraints in elements
	if (schema.elements) {
		for (const [path, element] of Object.entries(schema.elements)) {
			if (path.includes("value") && element.type) {
				return element.type.map((t: any) => t.code || t);
			}
		}
	}

	// Default to string if no specific type found
	return ["string"];
}

/**
 * Create a type identifier for a given type name
 */
async function createTypeIdentifier(
	typeName: string,
	context: FHIRGenerationContext,
): Promise<TypeSchemaIdentifier> {
	const kind = getFHIRTypeKind(typeName);

	return {
		kind,
		package: context.packageInfo?.name || "hl7.fhir.r4.core",
		version: context.packageInfo?.version || "4.0.1",
		name: typeName,
		url: `http://hl7.org/fhir/StructureDefinition/${typeName}`,
	};
}

/**
 * Create a binding identifier from binding information
 */
async function createBindingIdentifier(
	binding: any,
	context: FHIRGenerationContext,
): Promise<TypeSchemaIdentifier | undefined> {
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
 * Extract dependencies from extension schema
 */
function extractExtensionDependencies(
	schema: TypeSchema,
	_context: FHIRGenerationContext,
): TypeSchemaIdentifier[] {
	const dependencies: TypeSchemaIdentifier[] = [];

	// Add base Extension dependency
	if (schema.base) {
		dependencies.push(schema.base);
	}

	// Add field type dependencies
	if (schema.fields) {
		for (const field of Object.values(schema.fields)) {
			if ("type" in field && field.type) {
				dependencies.push(field.type);
			}
			if ("binding" in field && field.binding) {
				dependencies.push(field.binding);
			}
		}
	}

	// Remove duplicates
	const seen = new Set<string>();
	return dependencies.filter((dep) => {
		const key = dep.url;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

/**
 * Capitalize the first letter of a string
 */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Extract ValueSet name from URL
 */
function extractValueSetName(valueSetUrl: string): string {
	return valueSetUrl.split("/").pop() || "UnknownValueSet";
}

/**
 * Add an extension generation warning
 */
function addExtensionGenerationWarning(
	context: FHIRGenerationContext,
	schema: FHIRSchema,
	error: Error,
): void {
	const warning: GenerationWarning = {
		message: `Failed to generate extension ${schema.name || schema.url}: ${error.message}`,
		path: schema.url,
		code: "EXTENSION_GENERATION_ERROR",
		severity: "high",
	};

	if (context.options.verbose) {
		console.warn(`[FHIR Extensions] ${warning.message}`);
	}
}

/**
 * Create extension definition information
 */
export function createExtensionDefinitionInfo(
	url: string,
	name: string,
	valueTypes: string[],
	cardinality: { min: number; max: string } = { min: 0, max: "*" },
	context: ExtensionContext[] = [],
): ExtensionDefinitionInfo {
	return {
		url,
		name,
		valueTypes,
		cardinality,
		context,
	};
}
