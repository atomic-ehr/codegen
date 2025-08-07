/**
 * FHIR ValueSet Type Generation
 *
 * Handles generation of TypeScript types for FHIR ValueSets.
 * ValueSets define collections of codes that can be used in FHIR elements,
 * requiring specialized handling for concept expansion and composition.
 */

import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { buildSchemaIdentifier } from "../typeschema/core/identifier";
import type {
	AnyTypeSchema,
	TypeSchemaValueSet,
} from "../typeschema/lib-types";
import type {
	FHIRGenerationContext,
	GenerationWarning,
	ValueSetCompose,
	ValueSetConcept,
	ValueSetExpansion,
	ValueSetFilter,
	ValueSetInclude,
	ValueSetInfo,
} from "./types";

/**
 * Generate TypeSchema for FHIR ValueSets
 */
export async function generateValueSetTypes(
	schemas: FHIRSchema[],
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	const results: AnyTypeSchema[] = [];

	for (const schema of schemas) {
		try {
			const valueSetResult = await generateValueSetType(schema, context);
			if (valueSetResult) {
				results.push(valueSetResult);
			}
		} catch (error) {
			addValueSetGenerationWarning(context, schema, error as Error);
		}
	}

	return results;
}

/**
 * Generate TypeSchema for a single FHIR ValueSet
 */
export async function generateValueSetType(
	schema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<TypeSchemaValueSet | null> {
	// Prevent infinite recursion
	if (context.depth > context.options.maxDepth) {
		addValueSetGenerationWarning(
			context,
			schema,
			new Error("Maximum recursion depth reached"),
		);
		return null;
	}

	const valueSetInfo = extractValueSetInfo(schema);
	if (!valueSetInfo) {
		addValueSetGenerationWarning(
			context,
			schema,
			new Error("Could not extract ValueSet information"),
		);
		return null;
	}

	const identifier = buildSchemaIdentifier(schema, context.packageInfo);
	identifier.kind = "value-set";

	const valueSetSchema: TypeSchemaValueSet = {
		identifier,
		description: schema.description,
	};

	// Process expansion if available
	if (valueSetInfo.expansion) {
		valueSetSchema.concept = valueSetInfo.expansion.contains;
	}

	// Process compose if available
	if (valueSetInfo.compose) {
		valueSetSchema.compose = await processValueSetCompose(
			valueSetInfo.compose,
			context,
		);
	}

	return valueSetSchema;
}

/**
 * Extract ValueSet information from FHIR schema
 */
function extractValueSetInfo(schema: FHIRSchema): ValueSetInfo | null {
	// Check if this is actually a ValueSet
	if (schema.name !== "ValueSet" && schema.type !== "ValueSet") {
		return null;
	}

	const info: ValueSetInfo = {
		url: schema.url || "",
		name: schema.name || "",
		status: "active", // default
	};

	// Extract from resource content if available
	if (schema.content) {
		const content =
			typeof schema.content === "string"
				? JSON.parse(schema.content)
				: schema.content;

		if (content.resourceType === "ValueSet") {
			info.status = content.status || "active";

			// Extract expansion
			if (content.expansion) {
				info.expansion = processExpansion(content.expansion);
			}

			// Extract compose
			if (content.compose) {
				info.compose = processCompose(content.compose);
			}
		}
	}

	// Extract from elements if no content available
	if (!info.expansion && !info.compose && schema.elements) {
		info.compose = extractComposeFromElements(schema.elements);
	}

	return info;
}

/**
 * Process ValueSet expansion
 */
function processExpansion(expansion: any): ValueSetExpansion {
	const result: ValueSetExpansion = {
		contains: [],
	};

	if (expansion.total !== undefined) {
		result.total = expansion.total;
	}

	if (expansion.contains && Array.isArray(expansion.contains)) {
		result.contains = expansion.contains.map((concept: any) => ({
			code: concept.code,
			display: concept.display,
			system: concept.system,
			version: concept.version,
		}));
	}

	return result;
}

/**
 * Process ValueSet compose
 */
function processCompose(compose: any): ValueSetCompose {
	const result: ValueSetCompose = {
		include: [],
	};

	if (compose.include && Array.isArray(compose.include)) {
		result.include = compose.include.map((include: any) =>
			processInclude(include),
		);
	}

	if (compose.exclude && Array.isArray(compose.exclude)) {
		result.exclude = compose.exclude.map((exclude: any) =>
			processInclude(exclude),
		);
	}

	return result;
}

/**
 * Process ValueSet include/exclude
 */
function processInclude(include: any): ValueSetInclude {
	const result: ValueSetInclude = {};

	if (include.system) result.system = include.system;
	if (include.version) result.version = include.version;

	if (include.concept && Array.isArray(include.concept)) {
		result.concept = include.concept.map((concept: any) => ({
			code: concept.code,
			display: concept.display,
		}));
	}

	if (include.filter && Array.isArray(include.filter)) {
		result.filter = include.filter.map((filter: any) => ({
			property: filter.property,
			op: filter.op,
			value: filter.value,
		}));
	}

	if (include.valueSet && Array.isArray(include.valueSet)) {
		result.valueSet = include.valueSet;
	}

	return result;
}

/**
 * Extract compose from elements (fallback method)
 */
function extractComposeFromElements(
	elements: Record<string, any>,
): ValueSetCompose | undefined {
	const compose: ValueSetCompose = {
		include: [],
	};

	// Look for include elements
	for (const [path, element] of Object.entries(elements)) {
		if (path.includes("compose.include")) {
			const include = extractIncludeFromElement(path, element);
			if (include) {
				compose.include.push(include);
			}
		}
	}

	return compose.include.length > 0 ? compose : undefined;
}

/**
 * Extract include from element definition
 */
function extractIncludeFromElement(
	_path: string,
	element: any,
): ValueSetInclude | null {
	const include: ValueSetInclude = {};

	if (element.fixedUri) {
		include.system = element.fixedUri;
	}

	if (element.fixedString) {
		include.version = element.fixedString;
	}

	// This is a simplified extraction - in a real implementation,
	// you'd need more sophisticated parsing of the element structure
	return Object.keys(include).length > 0 ? include : null;
}

/**
 * Process ValueSet compose for TypeSchema
 */
async function processValueSetCompose(
	compose: ValueSetCompose,
	context: FHIRGenerationContext,
): Promise<TypeSchemaValueSet["compose"]> {
	const result: TypeSchemaValueSet["compose"] = {};

	if (compose.include) {
		result.include = [];
		for (const include of compose.include) {
			const processedInclude = await processValueSetInclude(include, context);
			result.include.push(processedInclude);
		}
	}

	if (compose.exclude) {
		result.exclude = [];
		for (const exclude of compose.exclude) {
			const processedExclude = await processValueSetInclude(exclude, context);
			result.exclude.push(processedExclude);
		}
	}

	return result;
}

/**
 * Process ValueSet include for TypeSchema
 */
async function processValueSetInclude(
	include: ValueSetInclude,
	_context: FHIRGenerationContext,
): Promise<TypeSchemaValueSet["compose"]["include"][0]> {
	const result: any = {};

	if (include.system) result.system = include.system;
	if (include.version) result.version = include.version;

	if (include.concept) {
		result.concept = include.concept.map((concept) => ({
			code: concept.code,
			display: concept.display,
		}));
	}

	if (include.filter) {
		result.filter = include.filter.map((filter) => ({
			property: filter.property,
			op: filter.op,
			value: filter.value,
		}));
	}

	if (include.valueSet) {
		result.valueSet = include.valueSet;
	}

	return result;
}

/**
 * Generate enumeration values from ValueSet
 */
export function generateEnumFromValueSet(
	valueSet: TypeSchemaValueSet,
): string[] {
	const enumValues: string[] = [];

	// Extract from direct concepts
	if (valueSet.concept) {
		for (const concept of valueSet.concept) {
			enumValues.push(concept.code);
		}
	}

	// Extract from compose.include
	if (valueSet.compose?.include) {
		for (const include of valueSet.compose.include) {
			if (include.concept) {
				for (const concept of include.concept) {
					enumValues.push(concept.code);
				}
			}
		}
	}

	// Remove duplicates and sort
	return [...new Set(enumValues)].sort();
}

/**
 * Create a ValueSet concept
 */
export function createValueSetConcept(
	code: string,
	display?: string,
	system?: string,
	version?: string,
): ValueSetConcept {
	return {
		code,
		display,
		system,
		version,
	};
}

/**
 * Create a ValueSet filter
 */
export function createValueSetFilter(
	property: string,
	op: ValueSetFilter["op"],
	value: string,
): ValueSetFilter {
	return {
		property,
		op,
		value,
	};
}

/**
 * Create a ValueSet include
 */
export function createValueSetInclude(
	system?: string,
	version?: string,
	concept?: ValueSetConcept[],
	filter?: ValueSetFilter[],
	valueSet?: string[],
): ValueSetInclude {
	const include: ValueSetInclude = {};

	if (system) include.system = system;
	if (version) include.version = version;
	if (concept) include.concept = concept;
	if (filter) include.filter = filter;
	if (valueSet) include.valueSet = valueSet;

	return include;
}

/**
 * Validate ValueSet composition
 */
export function validateValueSetCompose(compose: ValueSetCompose): string[] {
	const errors: string[] = [];

	// Check that includes exist
	if (!compose.include || compose.include.length === 0) {
		errors.push("ValueSet compose must have at least one include");
	}

	// Validate each include
	if (compose.include) {
		for (let i = 0; i < compose.include.length; i++) {
			const include = compose.include[i];
			const includeErrors = validateValueSetInclude(include, `include[${i}]`);
			errors.push(...includeErrors);
		}
	}

	// Validate each exclude
	if (compose.exclude) {
		for (let i = 0; i < compose.exclude.length; i++) {
			const exclude = compose.exclude[i];
			const excludeErrors = validateValueSetInclude(exclude, `exclude[${i}]`);
			errors.push(...excludeErrors);
		}
	}

	return errors;
}

/**
 * Validate ValueSet include/exclude
 */
function validateValueSetInclude(
	include: ValueSetInclude,
	path: string,
): string[] {
	const errors: string[] = [];

	// Must have either system or valueSet
	if (!include.system && (!include.valueSet || include.valueSet.length === 0)) {
		errors.push(`${path}: must have either system or valueSet`);
	}

	// If no concept, filter, or valueSet, then includes all concepts from system
	if (!include.concept && !include.filter && !include.valueSet) {
		// This is valid - includes all concepts from the system
	}

	// Validate concepts
	if (include.concept) {
		for (let i = 0; i < include.concept.length; i++) {
			const concept = include.concept[i];
			if (!concept.code) {
				errors.push(`${path}.concept[${i}]: code is required`);
			}
		}
	}

	// Validate filters
	if (include.filter) {
		for (let i = 0; i < include.filter.length; i++) {
			const filter = include.filter[i];
			if (!filter.property) {
				errors.push(`${path}.filter[${i}]: property is required`);
			}
			if (!filter.op) {
				errors.push(`${path}.filter[${i}]: op is required`);
			}
			if (!filter.value) {
				errors.push(`${path}.filter[${i}]: value is required`);
			}
		}
	}

	return errors;
}

/**
 * Add a ValueSet generation warning
 */
function addValueSetGenerationWarning(
	context: FHIRGenerationContext,
	schema: FHIRSchema,
	error: Error,
): void {
	const warning: GenerationWarning = {
		message: `Failed to generate ValueSet ${schema.name || schema.url}: ${error.message}`,
		path: schema.url,
		code: "VALUESET_GENERATION_ERROR",
		severity: "medium",
	};

	if (context.options.verbose) {
		console.warn(`[FHIR ValueSets] ${warning.message}`);
	}
}
