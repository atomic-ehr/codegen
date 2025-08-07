/**
 * FHIR Search Parameter Type Generation
 *
 * Handles generation of TypeScript types for FHIR SearchParameters.
 * Creates type-safe search parameter interfaces with chaining and modifier support.
 */

import type { ResourceType } from "../types/base";
import type { TypeSchemaGenerator } from "../typeschema/generator";

/**
 * Search parameter types as defined in FHIR specification
 */
export type SearchParameterType =
	| "number"
	| "date"
	| "string"
	| "token"
	| "reference"
	| "composite"
	| "quantity"
	| "uri"
	| "special";

/**
 * Search parameter modifiers
 */
export type SearchParameterModifier =
	| "missing"
	| "exact"
	| "contains"
	| "not"
	| "above"
	| "below"
	| "in"
	| "not-in"
	| "of-type";

/**
 * Search parameter prefixes for quantity/date parameters
 */
export type SearchParameterPrefix =
	| "eq"
	| "ne"
	| "gt"
	| "ge"
	| "lt"
	| "le"
	| "sa"
	| "eb"
	| "ap";

/**
 * Processed search parameter definition
 */
export interface ProcessedSearchParameter {
	name: string;
	type: SearchParameterType;
	description?: string;
	target?: string[];
	chain?: string[];
	modifier?: SearchParameterModifier[];
	multipleOr?: boolean;
	multipleAnd?: boolean;
	comparator?: SearchParameterPrefix[];
}

/**
 * Resource search parameters mapping
 */
export interface ResourceSearchParameters {
	resourceType: string;
	parameters: Record<string, ProcessedSearchParameter>;
	chainableParameters: Record<string, string[]>; // parameter name -> target resource types
}

/**
 * Extract and process search parameters for all resource types
 */
export async function extractAllSearchParameters(
	generator: TypeSchemaGenerator,
): Promise<Map<string, ResourceSearchParameters>> {
	const resourceTypes = await generator.getResourceTypes();
	const searchParametersMap = new Map<string, ResourceSearchParameters>();
	for (const resourceType of resourceTypes) {
		const searchParams = await extractSearchParametersForResource(
			generator,
			resourceType,
		);
		if (
			searchParams.parameters &&
			Object.keys(searchParams.parameters).length > 0
		) {
			searchParametersMap.set(resourceType, searchParams);
		}
	}

	return searchParametersMap;
}

/**
 * Extract search parameters for a specific resource type
 */
export async function extractSearchParametersForResource(
	generator: TypeSchemaGenerator,
	resourceType: string,
): Promise<ResourceSearchParameters> {
	const searchParameters = await generator.getSearchParameters(resourceType);
	const processed: Record<string, ProcessedSearchParameter> = {};
	const chainable: Record<string, string[]> = {};

	for (const searchParam of searchParameters) {
		try {
			const processedParam = processSearchParameter(searchParam);
			if (processedParam) {
				processed[processedParam.name] = processedParam;

				// Track chainable parameters (references)
				if (processedParam.type === "reference" && processedParam.target) {
					chainable[processedParam.name] = processedParam.target;
				}
			}
		} catch (error) {
			console.warn(
				`Failed to process search parameter ${searchParam.code || searchParam.name}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	return {
		resourceType,
		parameters: processed,
		chainableParameters: chainable,
	};
}

/**
 * Process a single search parameter definition
 */
function processSearchParameter(
	searchParam: any,
): ProcessedSearchParameter | null {
	if (!searchParam.code) {
		return null;
	}

	const processed: ProcessedSearchParameter = {
		name: searchParam.code,
		type: searchParam.type as SearchParameterType,
		description: searchParam.description,
		target: searchParam.target,
		multipleOr: searchParam.multipleOr,
		multipleAnd: searchParam.multipleAnd,
	};

	// Extract chain information for reference parameters
	if (searchParam.type === "reference" && searchParam.chain) {
		processed.chain = Array.isArray(searchParam.chain)
			? searchParam.chain
			: [searchParam.chain];
	}

	// Extract modifiers
	if (searchParam.modifier) {
		processed.modifier = Array.isArray(searchParam.modifier)
			? searchParam.modifier
			: [searchParam.modifier];
	}

	// Extract comparators for quantity/date parameters
	if (searchParam.comparator) {
		processed.comparator = Array.isArray(searchParam.comparator)
			? searchParam.comparator
			: [searchParam.comparator];
	}

	return processed;
}

/**
 * Generate TypeScript types for search parameters
 */
export function generateSearchParameterTypes(
	searchParametersMap: Map<string, ResourceSearchParameters>,
): string {
	const typeDefinitions: string[] = [];

	// Generate base parameter types
	typeDefinitions.push(generateBaseParameterTypes());

	// Generate resource-specific search parameter interfaces
	for (const [resourceType, searchParams] of searchParametersMap) {
		const interfaceDefinition = generateResourceSearchInterface(
			resourceType,
			searchParams,
		);
		typeDefinitions.push(interfaceDefinition);
	}

	// Generate search parameters mapping type
	typeDefinitions.push(generateSearchParametersMapType(searchParametersMap));

	// Generate chainable parameters mapping
	typeDefinitions.push(generateChainableParametersType(searchParametersMap));

	// Generate chain target resource mapping
	typeDefinitions.push(generateChainTargetResourceMapping(searchParametersMap));

	// Generate resource mapping interface
	typeDefinitions.push(generateResourceMappingInterface(searchParametersMap));

	return typeDefinitions.join("\n\n");
}

/**
 * Generate base parameter types
 */
function generateBaseParameterTypes(): string {
	return `/**
 * Base types for FHIR search parameters
 */
export type TokenParam = string | { system?: string; code?: string; text?: string; };
export type DateParam = string | PrefixedParam<string>;
export type NumberParam = number | PrefixedParam<number>;
export type QuantityParam = number | { value: number; unit?: string; system?: string; code?: string; } | PrefixedParam<number>;
export type StringParam = string | ModifiedParam<string>;
export type ReferenceParam<T extends ResourceType = ResourceType> = string | { reference: \`\${T}/\${string}\`; } | { identifier: TokenParam; };
export type UriParam = string;
export type CompositeParam = string | Record<string, string | number>;

export type PrefixedParam<T> = {
	prefix: 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'sa' | 'eb' | 'ap';
	value: T;
};

export type ModifiedParam<T> = T | {
	modifier: 'exact' | 'contains' | 'not' | 'above' | 'below' | 'missing';
	value: T;
};

export type ChainedParam<K extends string, T> = {
	[P in keyof T as \`\${K}.\${string & P}\`]: T[P];
};`;
}

/**
 * Generate search interface for a specific resource type
 */
function generateResourceSearchInterface(
	resourceType: string,
	searchParams: ResourceSearchParameters,
): string {
	const parameterLines: string[] = [];

	// Add common search parameters
	parameterLines.push(`	/** Number of resources to return */`);
	parameterLines.push(`	_count?: number;`);
	parameterLines.push(`	/** Pagination offset */`);
	parameterLines.push(`	_offset?: number;`);
	parameterLines.push(`	/** Sort results */`);
	parameterLines.push(`	_sort?: string | string[];`);
	parameterLines.push(`	/** Include related resources */`);
	parameterLines.push(`	_include?: string | string[];`);
	parameterLines.push(`	/** Reverse include related resources */`);
	parameterLines.push(`	_revinclude?: string | string[];`);

	// Add resource-specific parameters
	for (const [paramName, param] of Object.entries(searchParams.parameters)) {
		const typeScript = getTypeScriptType(
			param,
			searchParams.chainableParameters,
		);
		const description = param.description
			? ` /** ${param.description.replace(/\*\//g, "*\\/")} */`
			: "";

		if (description) {
			parameterLines.push(description);
		}
		const formattedParamName = paramName.includes('-') ? `'${paramName}'` : paramName;
		parameterLines.push(`	${formattedParamName}?: ${typeScript};`);

		// Add chaining support for reference parameters
		if (param.type === "reference" && param.target && param.target.length > 0) {
			for (const targetType of param.target) {
				parameterLines.push(`	/** Chain search on ${targetType} resource */`);
				parameterLines.push(
					`	'${paramName}:${targetType}'?: ChainedParam<'${paramName}', ${targetType}SearchParams>;`,
				);
			}
		}
	}

	return `/**
 * Search parameters for ${resourceType} resource
 */
export interface ${resourceType}SearchParams {
${parameterLines.join("\n")}
}`;
}

/**
 * Get TypeScript type for a search parameter
 */
function getTypeScriptType(
	param: ProcessedSearchParameter,
	chainableParams: Record<string, string[]>,
): string {
	const baseType = getBaseTypeForSearchParam(param);

	// Add array support for parameters that support multiple values
	if (param.multipleOr) {
		return `${baseType} | ${baseType}[]`;
	}

	return baseType;
}

/**
 * Get base TypeScript type for search parameter type
 */
function getBaseTypeForSearchParam(param: ProcessedSearchParameter): string {
	switch (param.type) {
		case "string":
			return "StringParam";
		case "token":
			return "TokenParam";
		case "reference":
			if (param.target && param.target.length === 1) {
				return `ReferenceParam<'${param.target[0]}'>`;
			} else if (param.target && param.target.length > 1) {
				return `ReferenceParam<${param.target.map((t) => `'${t}'`).join(" | ")}>`;
			}
			return "ReferenceParam";
		case "date":
			return "DateParam";
		case "number":
			return "NumberParam";
		case "quantity":
			return "QuantityParam";
		case "uri":
			return "UriParam";
		case "composite":
			return "CompositeParam";
		case "special":
			return "string"; // Special parameters are usually strings
		default:
			return "string";
	}
}

/**
 * Generate the search parameters map type
 */
function generateSearchParametersMapType(
	searchParametersMap: Map<string, ResourceSearchParameters>,
): string {
	const resourceTypes = Array.from(searchParametersMap.keys()).sort();
	const mappingLines = resourceTypes.map(
		(resourceType) => `	${resourceType}: ${resourceType}SearchParams;`,
	);

	return `/**
 * Mapping of resource types to their search parameter interfaces
 */
export interface SearchParamsMap {
${mappingLines.join("\n")}
}`;
}

/**
 * Generate chainable parameters type
 */
function generateChainableParametersType(
	searchParametersMap: Map<string, ResourceSearchParameters>,
): string {
	const chainableLines: string[] = [];

	for (const [resourceType, searchParams] of searchParametersMap) {
		const chainableParams = Object.keys(searchParams.chainableParameters);
		if (chainableParams.length > 0) {
			chainableLines.push(
				`	${resourceType}: ${chainableParams.map((p) => `'${p}'`).join(" | ")};`,
			);
		} else {
			chainableLines.push(`	${resourceType}: never;`);
		}
	}

	return `/**
 * Mapping of resource types to their chainable parameters
 */
export interface ChainableParams {
${chainableLines.join("\n")}
}`;
}

/**
 * Generate chain target resource mapping using template literals
 */
function generateChainTargetResourceMapping(
	searchParametersMap: Map<string, ResourceSearchParameters>,
): string {
	const mappingLines: string[] = [];

	for (const [resourceType, searchParams] of searchParametersMap) {
		const chainMappings: string[] = [];

		for (const [paramName, targetResources] of Object.entries(
			searchParams.chainableParameters,
		)) {
			for (const targetResource of targetResources) {
				chainMappings.push(
					`	T extends '${resourceType}' ? ChainParam extends '${paramName}' ? '${targetResource}' :`,
				);
			}
		}

		if (chainMappings.length > 0) {
			mappingLines.push(...chainMappings);
		}
	}

	// Add the never fallback
	mappingLines.push("	never;");

	return `/**
 * Extract target resource type from chain parameter using template literals
 * This provides compile-time resolution of chaining relationships
 */
export type ChainTargetResource<T extends keyof SearchParamsMap, ChainParam extends string> = 
${mappingLines.join("\n")}`;
}

/**
 * Generate resource mapping interface for type safety
 */
function generateResourceMappingInterface(
	searchParametersMap: Map<string, ResourceSearchParameters>,
): string {
	const resourceTypes = Array.from(searchParametersMap.keys()).sort();
	const mappingLines = resourceTypes.map(
		(resourceType) =>
			"	" + resourceType + ': import("../types").' + resourceType + ";",
	);

	return (
		"/**\n" +
		" * Mapping of resource type strings to their TypeScript interfaces\n" +
		" * This enables type-safe resource operations across the client\n" +
		" */\n" +
		"export interface ResourceMap {\n" +
		mappingLines.join("\n") +
		"\n" +
		"}\n" +
		"\n" +
		"/**\n" +
		" * Union type of all available resource types\n" +
		" */\n" +
		"export type ResourceType = keyof ResourceMap;"
	);
}
