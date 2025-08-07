/**
 * FHIR Operation Definition Type Generation
 *
 * Handles generation of TypeScript types for FHIR OperationDefinitions.
 * Operations define custom endpoints and their input/output parameters,
 * requiring specialized handling for parameter types and nesting.
 */

import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { buildSchemaIdentifier } from "../typeschema/core/identifier";
import type {
	AnyTypeSchema,
	TypeSchema,
	TypeSchemaField,
	TypeSchemaIdentifier,
	TypeSchemaNestedType,
} from "../typeschema/lib-types";
import type {
	FHIRGenerationContext,
	GenerationWarning,
	OperationDefinitionInfo,
	OperationParameter,
} from "./types";
import { getFHIRTypeKind } from "./types";

/**
 * Generate TypeSchema for FHIR OperationDefinitions
 */
export async function generateOperationTypes(
	schemas: FHIRSchema[],
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	const results: AnyTypeSchema[] = [];

	for (const schema of schemas) {
		try {
			const operationResults = await generateOperationType(schema, context);
			results.push(...operationResults);
		} catch (error) {
			addOperationGenerationWarning(context, schema, error as Error);
		}
	}

	return results;
}

/**
 * Generate TypeSchema for a single FHIR OperationDefinition
 */
export async function generateOperationType(
	schema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	// Prevent infinite recursion
	if (context.depth > context.options.maxDepth) {
		addOperationGenerationWarning(
			context,
			schema,
			new Error("Maximum recursion depth reached"),
		);
		return [];
	}

	const operationInfo = extractOperationDefinitionInfo(schema);
	if (!operationInfo) {
		addOperationGenerationWarning(
			context,
			schema,
			new Error("Could not extract OperationDefinition information"),
		);
		return [];
	}

	const results: AnyTypeSchema[] = [];
	const newContext = {
		...context,
		depth: context.depth + 1,
	};

	// Generate input parameters type
	const inputSchema = await generateOperationInputType(
		schema,
		operationInfo,
		newContext,
	);
	if (inputSchema) {
		results.push(inputSchema);
	}

	// Generate output parameters type
	const outputSchema = await generateOperationOutputType(
		schema,
		operationInfo,
		newContext,
	);
	if (outputSchema) {
		results.push(outputSchema);
	}

	// Generate main operation type that references input/output
	const operationSchema = await generateOperationMainType(
		schema,
		operationInfo,
		newContext,
	);
	if (operationSchema) {
		results.push(operationSchema);
	}

	return results;
}

/**
 * Generate input parameters type for an operation
 */
async function generateOperationInputType(
	schema: FHIRSchema,
	operationInfo: OperationDefinitionInfo,
	context: FHIRGenerationContext,
): Promise<TypeSchema | null> {
	const inputParams =
		operationInfo.parameter?.filter((p) => p.use === "in") || [];
	if (inputParams.length === 0) {
		return null;
	}

	const identifier = buildSchemaIdentifier(schema, context.packageInfo);
	identifier.name = `${identifier.name}Input`;
	identifier.kind = "complex-type";

	const inputSchema: TypeSchema = {
		identifier,
		base: {
			kind: "complex-type",
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			name: "Parameters",
			url: "http://hl7.org/fhir/StructureDefinition/Parameters",
		},
		description: `Input parameters for ${operationInfo.name} operation`,
		dependencies: [],
		metadata: {
			isOperationInput: true,
			operationUrl: operationInfo.url,
			operationCode: operationInfo.code,
		},
	};

	// Generate fields for input parameters
	const fields = await generateParameterFields(inputParams, context);
	if (Object.keys(fields).length > 0) {
		inputSchema.fields = fields;
	}

	// Generate nested types for complex parameters
	const nestedTypes = await generateParameterNestedTypes(
		inputParams,
		context,
		"Input",
	);
	if (nestedTypes.length > 0) {
		inputSchema.nested = nestedTypes;
	}

	// Extract dependencies
	inputSchema.dependencies = extractParameterDependencies(inputSchema);

	return inputSchema;
}

/**
 * Generate output parameters type for an operation
 */
async function generateOperationOutputType(
	schema: FHIRSchema,
	operationInfo: OperationDefinitionInfo,
	context: FHIRGenerationContext,
): Promise<TypeSchema | null> {
	const outputParams =
		operationInfo.parameter?.filter((p) => p.use === "out") || [];
	if (outputParams.length === 0) {
		return null;
	}

	const identifier = buildSchemaIdentifier(schema, context.packageInfo);
	identifier.name = `${identifier.name}Output`;
	identifier.kind = "complex-type";

	const outputSchema: TypeSchema = {
		identifier,
		base: {
			kind: "complex-type",
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			name: "Parameters",
			url: "http://hl7.org/fhir/StructureDefinition/Parameters",
		},
		description: `Output parameters for ${operationInfo.name} operation`,
		dependencies: [],
		metadata: {
			isOperationOutput: true,
			operationUrl: operationInfo.url,
			operationCode: operationInfo.code,
		},
	};

	// Generate fields for output parameters
	const fields = await generateParameterFields(outputParams, context);
	if (Object.keys(fields).length > 0) {
		outputSchema.fields = fields;
	}

	// Generate nested types for complex parameters
	const nestedTypes = await generateParameterNestedTypes(
		outputParams,
		context,
		"Output",
	);
	if (nestedTypes.length > 0) {
		outputSchema.nested = nestedTypes;
	}

	// Extract dependencies
	outputSchema.dependencies = extractParameterDependencies(outputSchema);

	return outputSchema;
}

/**
 * Generate main operation type
 */
async function generateOperationMainType(
	schema: FHIRSchema,
	operationInfo: OperationDefinitionInfo,
	context: FHIRGenerationContext,
): Promise<TypeSchema | null> {
	const identifier = buildSchemaIdentifier(schema, context.packageInfo);
	identifier.kind = "complex-type";

	const operationSchema: TypeSchema = {
		identifier,
		description:
			schema.description || `${operationInfo.name} operation definition`,
		dependencies: [],
		metadata: {
			isOperation: true,
			operationUrl: operationInfo.url,
			operationCode: operationInfo.code,
			system: operationInfo.system,
			type: operationInfo.type,
			instance: operationInfo.instance,
			resource: operationInfo.resource,
		},
	};

	// Add operation-specific fields
	const fields: Record<string, TypeSchemaField> = {};

	// Add code field
	fields.code = {
		type: {
			kind: "primitive-type",
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			name: "code",
			url: "http://hl7.org/fhir/StructureDefinition/code",
		},
		required: true,
		enum: [operationInfo.code],
		description: "Operation code",
	};

	// Add resource field if operation applies to specific resources
	if (operationInfo.resource && operationInfo.resource.length > 0) {
		if (operationInfo.resource.length === 1) {
			fields.resource = {
				type: {
					kind: "primitive-type",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "code",
					url: "http://hl7.org/fhir/StructureDefinition/code",
				},
				enum: operationInfo.resource,
				description: "Resource type this operation applies to",
			};
		} else {
			fields.resource = {
				type: {
					kind: "primitive-type",
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "code",
					url: "http://hl7.org/fhir/StructureDefinition/code",
				},
				enum: operationInfo.resource,
				description: "Resource types this operation applies to",
			};
		}
	}

	operationSchema.fields = fields;

	return operationSchema;
}

/**
 * Generate fields for operation parameters
 */
async function generateParameterFields(
	parameters: OperationParameter[],
	context: FHIRGenerationContext,
): Promise<Record<string, TypeSchemaField>> {
	const fields: Record<string, TypeSchemaField> = {};

	for (const param of parameters) {
		const field = await generateParameterField(param, context);
		if (field) {
			fields[param.name] = field;
		}
	}

	return fields;
}

/**
 * Generate a field for a single operation parameter
 */
async function generateParameterField(
	parameter: OperationParameter,
	context: FHIRGenerationContext,
): Promise<TypeSchemaField | null> {
	const field: TypeSchemaField = {
		description: parameter.documentation,
	};

	// Set cardinality
	field.min = parameter.min;
	field.required = parameter.min > 0;

	if (parameter.max === "*") {
		field.array = true;
	} else {
		const maxNum = parseInt(parameter.max, 10);
		if (!Number.isNaN(maxNum)) {
			field.max = maxNum;
			field.array = maxNum > 1;
		}
	}

	// Set type
	if (parameter.type) {
		field.type = await createParameterTypeIdentifier(parameter.type, context);
	}

	// Handle target profiles for Reference types
	if (parameter.targetProfile && parameter.targetProfile.length > 0) {
		field.reference = [];
		for (const profileUrl of parameter.targetProfile) {
			const profileIdentifier = await createProfileIdentifier(
				profileUrl,
				context,
			);
			field.reference.push(profileIdentifier);
		}
	}

	// Handle nested parameters (part)
	if (parameter.part && parameter.part.length > 0) {
		// This parameter has nested structure - will be handled by nested types
		field.type = {
			kind: "nested",
			package: context.packageInfo?.name || "generated",
			version: context.packageInfo?.version || "1.0.0",
			name: `${capitalize(parameter.name)}Parameters`,
			url: `#${parameter.name}Parameters`,
		};
	}

	return field;
}

/**
 * Generate nested types for complex parameters
 */
async function generateParameterNestedTypes(
	parameters: OperationParameter[],
	context: FHIRGenerationContext,
	suffix: string,
): Promise<TypeSchemaNestedType[]> {
	const nestedTypes: TypeSchemaNestedType[] = [];

	for (const param of parameters) {
		if (param.part && param.part.length > 0) {
			const nestedType = await generateParameterNestedType(
				param,
				context,
				suffix,
			);
			if (nestedType) {
				nestedTypes.push(nestedType);
			}
		}
	}

	return nestedTypes;
}

/**
 * Generate a nested type for a parameter with parts
 */
async function generateParameterNestedType(
	parameter: OperationParameter,
	context: FHIRGenerationContext,
	suffix: string,
): Promise<TypeSchemaNestedType | null> {
	if (!parameter.part) {
		return null;
	}

	const identifier: TypeSchemaIdentifier = {
		kind: "nested",
		package: context.packageInfo?.name || "generated",
		version: context.packageInfo?.version || "1.0.0",
		name: `${capitalize(parameter.name)}Parameters${suffix}`,
		url: `#${parameter.name}Parameters${suffix}`,
	};

	const base: TypeSchemaIdentifier = {
		kind: "complex-type",
		package: "hl7.fhir.r4.core",
		version: "4.0.1",
		name: "BackboneElement",
		url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
	};

	const fields = await generateParameterFields(parameter.part, context);

	return {
		identifier,
		base,
		fields,
	};
}

/**
 * Extract OperationDefinition information from schema
 */
function extractOperationDefinitionInfo(
	schema: FHIRSchema,
): OperationDefinitionInfo | null {
	// Check if this is actually an OperationDefinition
	if (
		schema.name !== "OperationDefinition" &&
		schema.type !== "OperationDefinition"
	) {
		return null;
	}

	const info: OperationDefinitionInfo = {
		url: schema.url || "",
		name: schema.name || "",
		code: "",
		system: false,
		type: false,
		instance: false,
	};

	// Extract from resource content if available
	if (schema.content) {
		const content =
			typeof schema.content === "string"
				? JSON.parse(schema.content)
				: schema.content;

		if (content.resourceType === "OperationDefinition") {
			info.code = content.code || "";
			info.system = content.system || false;
			info.type = content.type || false;
			info.instance = content.instance || false;
			info.resource = content.resource || [];

			// Extract parameters
			if (content.parameter && Array.isArray(content.parameter)) {
				info.parameter = processOperationParameters(content.parameter);
			}
		}
	}

	// Extract from elements if no content available
	if (!info.parameter && schema.elements) {
		info.parameter = extractParametersFromElements(schema.elements);
	}

	return info.code ? info : null;
}

/**
 * Process operation parameters recursively
 */
function processOperationParameters(parameters: any[]): OperationParameter[] {
	return parameters.map((param) => {
		const result: OperationParameter = {
			name: param.name,
			use: param.use,
			min: param.min,
			max: param.max,
			documentation: param.documentation,
			type: param.type,
			targetProfile: param.targetProfile,
			searchType: param.searchType,
		};

		// Process nested parameters
		if (param.part && Array.isArray(param.part)) {
			result.part = processOperationParameters(param.part);
		}

		return result;
	});
}

/**
 * Extract parameters from elements (fallback method)
 */
function extractParametersFromElements(
	elements: Record<string, any>,
): OperationParameter[] {
	const parameters: OperationParameter[] = [];

	// This is a simplified implementation
	// In practice, you'd need more sophisticated parsing
	for (const [path, element] of Object.entries(elements)) {
		if (path.includes("parameter")) {
			const param = extractParameterFromElement(path, element);
			if (param) {
				parameters.push(param);
			}
		}
	}

	return parameters;
}

/**
 * Extract parameter from element definition
 */
function extractParameterFromElement(
	_path: string,
	element: any,
): OperationParameter | null {
	// This is a simplified implementation
	const param: OperationParameter = {
		name: "",
		use: "in",
		min: 0,
		max: "*",
	};

	// Extract basic information from element
	if (element.min !== undefined) param.min = element.min;
	if (element.max !== undefined) param.max = element.max;
	if (element.type) param.type = element.type[0]?.code || element.type;

	return param.name ? param : null;
}

/**
 * Create type identifier for parameter type
 */
async function createParameterTypeIdentifier(
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
 * Create profile identifier from profile URL
 */
async function createProfileIdentifier(
	profileUrl: string,
	context: FHIRGenerationContext,
): Promise<TypeSchemaIdentifier> {
	const profileName = profileUrl.split("/").pop() || "UnknownProfile";

	return {
		kind: "profile",
		package: context.packageInfo?.name || "hl7.fhir.r4.core",
		version: context.packageInfo?.version || "4.0.1",
		name: profileName,
		url: profileUrl,
	};
}

/**
 * Extract dependencies from parameter schema
 */
function extractParameterDependencies(
	schema: TypeSchema,
): TypeSchemaIdentifier[] {
	const dependencies: TypeSchemaIdentifier[] = [];

	// Add base dependency
	if (schema.base) {
		dependencies.push(schema.base);
	}

	// Add field type dependencies
	if (schema.fields) {
		for (const field of Object.values(schema.fields)) {
			if ("type" in field && field.type) {
				dependencies.push(field.type);
			}
			if ("reference" in field && field.reference) {
				dependencies.push(...field.reference);
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
 * Add an operation generation warning
 */
function addOperationGenerationWarning(
	context: FHIRGenerationContext,
	schema: FHIRSchema,
	error: Error,
): void {
	const warning: GenerationWarning = {
		message: `Failed to generate OperationDefinition ${schema.name || schema.url}: ${error.message}`,
		path: schema.url,
		code: "OPERATION_GENERATION_ERROR",
		severity: "medium",
	};

	if (context.options.verbose) {
		console.warn(`[FHIR Operations] ${warning.message}`);
	}
}
