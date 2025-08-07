/**
 * FHIR Search Parameter Extractors
 *
 * Utilities for processing and extracting FHIR search parameters from TypeSchema.
 * Provides advanced parameter analysis and type generation capabilities.
 */

import type { TypeSchemaGenerator } from "../../../typeschema/generator";
import type {
	ProcessedSearchParameter,
	SearchParameterModifier,
	SearchParameterPrefix,
	SearchParameterType,
} from "./parameters";

/**
 * Enhanced search parameter with additional metadata
 */
export interface EnhancedSearchParameter extends ProcessedSearchParameter {
	/** Expression that defines what elements this parameter searches */
	expression?: string;
	/** XPath expression (legacy) */
	xpath?: string;
	/** Resource types this parameter can be applied to */
	base: string[];
	/** URL for this search parameter definition */
	url?: string;
	/** Version of the search parameter */
	version?: string;
	/** Status (draft, active, retired) */
	status?: string;
	/** Whether the parameter is experimental */
	experimental?: boolean;
	/** Date when this parameter was published */
	date?: string;
	/** Publisher of this search parameter */
	publisher?: string;
	/** Contacts for this search parameter */
	contact?: Array<{
		name?: string;
		telecom?: Array<{
			system?: string;
			value?: string;
		}>;
	}>;
	/** Use context for this search parameter */
	useContext?: Array<{
		code: {
			system?: string;
			code?: string;
		};
		valueCodeableConcept?: {
			coding?: Array<{
				system?: string;
				code?: string;
				display?: string;
			}>;
		};
	}>;
	/** Jurisdiction codes */
	jurisdiction?: Array<{
		coding?: Array<{
			system?: string;
			code?: string;
			display?: string;
		}>;
	}>;
	/** Purpose of this search parameter */
	purpose?: string;
	/** Components for composite search parameters */
	component?: Array<{
		definition: string;
		expression: string;
	}>;
}

/**
 * Search parameter extraction options
 */
export interface SearchParameterExtractionOptions {
	/** Include base FHIR search parameters */
	includeBase?: boolean;
	/** Include extension search parameters */
	includeExtensions?: boolean;
	/** Include experimental parameters */
	includeExperimental?: boolean;
	/** Filter by specific resource types */
	resourceTypes?: string[];
	/** Filter by parameter types */
	parameterTypes?: SearchParameterType[];
	/** Include derived parameters */
	includeDerived?: boolean;
	/** Maximum depth for parameter analysis */
	maxDepth?: number;
}

/**
 * Advanced search parameter extractor
 */
export class AdvancedSearchParameterExtractor {
	private generator: TypeSchemaGenerator;
	private options: SearchParameterExtractionOptions;

	constructor(
		generator: TypeSchemaGenerator,
		options: SearchParameterExtractionOptions = {},
	) {
		this.generator = generator;
		this.options = {
			includeBase: true,
			includeExtensions: true,
			includeExperimental: false,
			includeDerived: true,
			maxDepth: 5,
			...options,
		};
	}

	/**
	 * Extract enhanced search parameters for all resources
	 */
	async extractAllEnhancedParameters(): Promise<
		Map<string, EnhancedSearchParameter[]>
	> {
		const parameterMap = new Map<string, EnhancedSearchParameter[]>();

		const resourceTypes =
			this.options.resourceTypes || (await this.generator.getResourceTypes());

		for (const resourceType of resourceTypes) {
			try {
				const parameters =
					await this.extractParametersForResource(resourceType);
				if (parameters.length > 0) {
					parameterMap.set(resourceType, parameters);
				}
			} catch (error) {
				console.warn(
					`Failed to extract search parameters for ${resourceType}:`,
					error,
				);
			}
		}

		return parameterMap;
	}

	/**
	 * Extract parameters for a specific resource
	 */
	async extractParametersForResource(
		resourceType: string,
	): Promise<EnhancedSearchParameter[]> {
		const rawParameters =
			await this.generator.getSearchParameters(resourceType);
		const enhancedParameters: EnhancedSearchParameter[] = [];

		for (const rawParam of rawParameters) {
			try {
				const enhanced = this.enhanceSearchParameter(rawParam, resourceType);
				if (enhanced && this.shouldIncludeParameter(enhanced)) {
					enhancedParameters.push(enhanced);
				}
			} catch (error) {
				console.warn(`Failed to enhance parameter ${rawParam.code}:`, error);
			}
		}

		// Add base parameters if requested
		if (this.options.includeBase) {
			const baseParameters = this.getBaseSearchParameters(resourceType);
			enhancedParameters.push(...baseParameters);
		}

		// Add derived parameters if requested
		if (this.options.includeDerived) {
			const derivedParameters = await this.getDerivedParameters(resourceType);
			enhancedParameters.push(...derivedParameters);
		}

		return enhancedParameters;
	}

	/**
	 * Enhance a raw search parameter with additional metadata
	 */
	private enhanceSearchParameter(
		rawParam: any,
		resourceType: string,
	): EnhancedSearchParameter | null {
		if (!rawParam.code || !rawParam.type) {
			return null;
		}

		const enhanced: EnhancedSearchParameter = {
			name: rawParam.code,
			type: rawParam.type as SearchParameterType,
			description: rawParam.description,
			expression: rawParam.expression,
			xpath: rawParam.xpath,
			base: Array.isArray(rawParam.base) ? rawParam.base : [resourceType],
			url: rawParam.url,
			version: rawParam.version,
			status: rawParam.status,
			experimental: rawParam.experimental,
			date: rawParam.date,
			publisher: rawParam.publisher,
			contact: rawParam.contact,
			useContext: rawParam.useContext,
			jurisdiction: rawParam.jurisdiction,
			purpose: rawParam.purpose,
			component: rawParam.component,
			target: rawParam.target,
			chain: rawParam.chain,
			modifier: rawParam.modifier,
			multipleOr: rawParam.multipleOr,
			multipleAnd: rawParam.multipleAnd,
			comparator: rawParam.comparator,
		};

		// Enhance modifiers based on parameter type
		enhanced.modifier = this.getModifiersForType(enhanced.type);

		// Enhance comparators for appropriate types
		if (["date", "number", "quantity"].includes(enhanced.type)) {
			enhanced.comparator =
				enhanced.comparator || this.getComparatorsForType(enhanced.type);
		}

		// Extract chain information for reference parameters
		if (enhanced.type === "reference") {
			enhanced.chain = this.extractChainParameters(rawParam, resourceType);
			enhanced.target = this.extractTargetResources(rawParam);
		}

		return enhanced;
	}

	/**
	 * Get base search parameters available for all resources
	 */
	private getBaseSearchParameters(
		resourceType: string,
	): EnhancedSearchParameter[] {
		return [
			{
				name: "_id",
				type: "token",
				description: "Logical id of this artifact",
				base: [resourceType],
				multipleOr: true,
				multipleAnd: false,
			},
			{
				name: "_lastUpdated",
				type: "date",
				description: "When the resource version last changed",
				base: [resourceType],
				comparator: ["eq", "ne", "gt", "ge", "lt", "le", "sa", "eb"],
				multipleOr: false,
				multipleAnd: true,
			},
			{
				name: "_profile",
				type: "uri",
				description: "Profiles this resource claims to conform to",
				base: [resourceType],
				multipleOr: true,
				multipleAnd: false,
			},
			{
				name: "_security",
				type: "token",
				description: "Security Labels applied to this resource",
				base: [resourceType],
				multipleOr: true,
				multipleAnd: true,
			},
			{
				name: "_tag",
				type: "token",
				description: "Tags applied to this resource",
				base: [resourceType],
				multipleOr: true,
				multipleAnd: true,
			},
			{
				name: "_text",
				type: "string",
				description: "Search on the narrative of the resource",
				base: [resourceType],
				modifier: ["exact", "contains"],
			},
			{
				name: "_content",
				type: "string",
				description: "Search on the entire content of the resource",
				base: [resourceType],
				modifier: ["exact", "contains"],
			},
		];
	}

	/**
	 * Get derived parameters based on resource analysis
	 */
	private async getDerivedParameters(
		resourceType: string,
	): Promise<EnhancedSearchParameter[]> {
		const derivedParameters: EnhancedSearchParameter[] = [];

		// Add common derived parameters based on resource type
		switch (resourceType) {
			case "Patient":
				derivedParameters.push({
					name: "name",
					type: "string",
					description: "A portion of the given or family name",
					base: ["Patient"],
					expression: "Patient.name.given | Patient.name.family",
					modifier: ["exact", "contains"],
				});
				break;

			case "Observation":
				derivedParameters.push({
					name: "code-value-quantity",
					type: "composite",
					description: "Code and quantity value",
					base: ["Observation"],
					expression: "Observation.code & Observation.valueQuantity",
					component: [
						{
							definition: "http://hl7.org/fhir/SearchParameter/clinical-code",
							expression: "Observation.code",
						},
						{
							definition:
								"http://hl7.org/fhir/SearchParameter/Observation-value-quantity",
							expression: "Observation.valueQuantity",
						},
					],
				});
				break;
		}

		return derivedParameters;
	}

	/**
	 * Get appropriate modifiers for a parameter type
	 */
	private getModifiersForType(
		type: SearchParameterType,
	): SearchParameterModifier[] {
		switch (type) {
			case "string":
				return ["exact", "contains", "not", "missing"];
			case "token":
				return ["not", "above", "below", "in", "not-in", "of-type", "missing"];
			case "reference":
				return ["missing", "not"];
			case "uri":
				return ["above", "below", "missing"];
			case "date":
			case "number":
			case "quantity":
				return ["missing", "not"];
			default:
				return ["missing"];
		}
	}

	/**
	 * Get appropriate comparators for a parameter type
	 */
	private getComparatorsForType(
		type: SearchParameterType,
	): SearchParameterPrefix[] {
		switch (type) {
			case "date":
				return ["eq", "ne", "gt", "ge", "lt", "le", "sa", "eb", "ap"];
			case "number":
				return ["eq", "ne", "gt", "ge", "lt", "le"];
			case "quantity":
				return ["eq", "ne", "gt", "ge", "lt", "le", "ap"];
			default:
				return [];
		}
	}

	/**
	 * Extract chain parameters from reference parameter
	 */
	private extractChainParameters(
		rawParam: any,
		_resourceType: string,
	): string[] {
		const chains: string[] = [];

		// Extract from definition if available
		if (rawParam.chain) {
			chains.push(
				...(Array.isArray(rawParam.chain) ? rawParam.chain : [rawParam.chain]),
			);
		}

		// Extract from expression analysis
		if (rawParam.expression && rawParam.type === "reference") {
			// This is a simplified extraction - in a real implementation,
			// you would parse the FHIRPath expression to determine possible chains
			const commonChains = ["name", "identifier", "status", "active"];
			chains.push(...commonChains);
		}

		return [...new Set(chains)]; // Remove duplicates
	}

	/**
	 * Extract target resource types from reference parameter
	 */
	private extractTargetResources(rawParam: any): string[] {
		if (rawParam.target) {
			return Array.isArray(rawParam.target)
				? rawParam.target
				: [rawParam.target];
		}

		// Extract from expression if available
		if (rawParam.expression && rawParam.type === "reference") {
			// This would require FHIRPath parsing in a real implementation
			// For now, return common reference targets
			return ["Patient", "Practitioner", "Organization", "Location"];
		}

		return [];
	}

	/**
	 * Determine if a parameter should be included based on options
	 */
	private shouldIncludeParameter(param: EnhancedSearchParameter): boolean {
		// Filter by parameter type
		if (this.options.parameterTypes && this.options.parameterTypes.length > 0) {
			if (!this.options.parameterTypes.includes(param.type)) {
				return false;
			}
		}

		// Filter experimental parameters
		if (!this.options.includeExperimental && param.experimental) {
			return false;
		}

		// Filter by resource types
		if (this.options.resourceTypes && this.options.resourceTypes.length > 0) {
			const hasMatchingBase = param.base.some((base) =>
				this.options.resourceTypes?.includes(base),
			);
			if (!hasMatchingBase) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Generate comprehensive search parameter documentation
	 */
	generateParameterDocumentation(param: EnhancedSearchParameter): string {
		const parts: string[] = [];

		parts.push(`/**`);
		if (param.description) {
			parts.push(` * ${param.description}`);
		}
		if (param.expression) {
			parts.push(` * Expression: ${param.expression}`);
		}
		if (param.type) {
			parts.push(` * Type: ${param.type}`);
		}
		if (param.target && param.target.length > 0) {
			parts.push(` * Targets: ${param.target.join(", ")}`);
		}
		if (param.modifier && param.modifier.length > 0) {
			parts.push(` * Modifiers: ${param.modifier.join(", ")}`);
		}
		if (param.comparator && param.comparator.length > 0) {
			parts.push(` * Comparators: ${param.comparator.join(", ")}`);
		}
		if (param.multipleOr || param.multipleAnd) {
			const multiple = [];
			if (param.multipleOr) multiple.push("OR");
			if (param.multipleAnd) multiple.push("AND");
			parts.push(` * Multiple: ${multiple.join(", ")}`);
		}
		if (param.url) {
			parts.push(` * URL: ${param.url}`);
		}
		parts.push(` */`);

		return parts.join("\n");
	}

	/**
	 * Analyze parameter usage patterns
	 */
	async analyzeParameterUsage(resourceType: string): Promise<{
		mostCommon: string[];
		composite: string[];
		chainable: string[];
		experimental: string[];
	}> {
		const parameters = await this.extractParametersForResource(resourceType);

		const mostCommon = parameters
			.filter((p) => ["token", "string", "date", "reference"].includes(p.type))
			.slice(0, 10)
			.map((p) => p.name);

		const composite = parameters
			.filter((p) => p.type === "composite")
			.map((p) => p.name);

		const chainable = parameters
			.filter((p) => p.type === "reference" && p.chain && p.chain.length > 0)
			.map((p) => p.name);

		const experimental = parameters
			.filter((p) => p.experimental)
			.map((p) => p.name);

		return {
			mostCommon,
			composite,
			chainable,
			experimental,
		};
	}

	/**
	 * Generate search parameter statistics
	 */
	async generateStatistics(): Promise<{
		totalParameters: number;
		byType: Record<SearchParameterType, number>;
		byResourceType: Record<string, number>;
		withModifiers: number;
		withComparators: number;
		composite: number;
		chainable: number;
	}> {
		const allParameters = await this.extractAllEnhancedParameters();

		let totalParameters = 0;
		const byType: Record<string, number> = {};
		const byResourceType: Record<string, number> = {};
		let withModifiers = 0;
		let withComparators = 0;
		let composite = 0;
		let chainable = 0;

		for (const [resourceType, parameters] of allParameters) {
			byResourceType[resourceType] = parameters.length;
			totalParameters += parameters.length;

			for (const param of parameters) {
				byType[param.type] = (byType[param.type] || 0) + 1;

				if (param.modifier && param.modifier.length > 0) {
					withModifiers++;
				}
				if (param.comparator && param.comparator.length > 0) {
					withComparators++;
				}
				if (param.type === "composite") {
					composite++;
				}
				if (
					param.type === "reference" &&
					param.chain &&
					param.chain.length > 0
				) {
					chainable++;
				}
			}
		}

		return {
			totalParameters,
			byType: byType as Record<SearchParameterType, number>,
			byResourceType,
			withModifiers,
			withComparators,
			composite,
			chainable,
		};
	}
}

/**
 * Search parameter relationship analyzer
 */
export class SearchParameterRelationshipAnalyzer {
	private parameters: Map<string, EnhancedSearchParameter[]>;

	constructor(parameters: Map<string, EnhancedSearchParameter[]>) {
		this.parameters = parameters;
	}

	/**
	 * Find parameters that reference specific resource types
	 */
	findParametersReferencingResource(targetResourceType: string): Array<{
		resourceType: string;
		parameterName: string;
		parameter: EnhancedSearchParameter;
	}> {
		const references: Array<{
			resourceType: string;
			parameterName: string;
			parameter: EnhancedSearchParameter;
		}> = [];

		for (const [resourceType, params] of this.parameters) {
			for (const param of params) {
				if (
					param.type === "reference" &&
					param.target?.includes(targetResourceType)
				) {
					references.push({
						resourceType,
						parameterName: param.name,
						parameter: param,
					});
				}
			}
		}

		return references;
	}

	/**
	 * Build parameter dependency graph
	 */
	buildParameterDependencyGraph(): Map<string, Set<string>> {
		const graph = new Map<string, Set<string>>();

		for (const [resourceType, params] of this.parameters) {
			for (const param of params) {
				const key = `${resourceType}.${param.name}`;
				if (!graph.has(key)) {
					graph.set(key, new Set());
				}

				// Add dependencies for reference parameters
				if (param.type === "reference" && param.target) {
					for (const target of param.target) {
						if (param.chain) {
							for (const chainParam of param.chain) {
								graph.get(key)?.add(`${target}.${chainParam}`);
							}
						}
					}
				}

				// Add dependencies for composite parameters
				if (param.type === "composite" && param.component) {
					for (const _component of param.component) {
						// This would require parsing the component definition URL
						// to determine the actual parameter dependency
					}
				}
			}
		}

		return graph;
	}

	/**
	 * Find circular dependencies in search parameters
	 */
	findCircularDependencies(): Array<string[]> {
		const graph = this.buildParameterDependencyGraph();
		const circularDeps: Array<string[]> = [];
		const visited = new Set<string>();
		const recursionStack = new Set<string>();

		const detectCycle = (node: string, path: string[]): boolean => {
			if (recursionStack.has(node)) {
				const cycleStart = path.indexOf(node);
				circularDeps.push(path.slice(cycleStart));
				return true;
			}

			if (visited.has(node)) {
				return false;
			}

			visited.add(node);
			recursionStack.add(node);

			const dependencies = graph.get(node) || new Set();
			for (const dep of dependencies) {
				if (detectCycle(dep, [...path, dep])) {
					return true;
				}
			}

			recursionStack.delete(node);
			return false;
		};

		for (const node of graph.keys()) {
			if (!visited.has(node)) {
				detectCycle(node, [node]);
			}
		}

		return circularDeps;
	}
}

/**
 * Utility functions for search parameter processing
 */
export class SearchParameterUtils {
	/**
	 * Normalize parameter name for use in TypeScript interfaces
	 */
	static normalizeParameterName(name: string): string {
		// Handle parameter names with special characters
		return name.replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
	}

	/**
	 * Generate TypeScript type for search parameter
	 */
	static generateTypeScriptType(param: EnhancedSearchParameter): string {
		const baseType = SearchParameterUtils.getBaseTypeScriptType(param.type);

		// Add array support for parameters that support multiple values
		if (param.multipleOr) {
			return `${baseType} | ${baseType}[]`;
		}

		return baseType;
	}

	/**
	 * Get base TypeScript type for search parameter type
	 */
	private static getBaseTypeScriptType(type: SearchParameterType): string {
		switch (type) {
			case "string":
				return "StringParam";
			case "token":
				return "TokenParam";
			case "reference":
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
				return "SpecialParam";
			default:
				return "string";
		}
	}

	/**
	 * Generate parameter validation rules
	 */
	static generateValidationRules(param: EnhancedSearchParameter): {
		required: boolean;
		type: string;
		pattern?: string;
		enum?: string[];
		multipleValues: boolean;
	} {
		return {
			required: false, // FHIR search parameters are generally optional
			type: param.type,
			pattern: SearchParameterUtils.getValidationPattern(param),
			enum: SearchParameterUtils.getValidationEnum(param),
			multipleValues: param.multipleOr || false,
		};
	}

	/**
	 * Get validation pattern for parameter type
	 */
	private static getValidationPattern(
		param: EnhancedSearchParameter,
	): string | undefined {
		switch (param.type) {
			case "date":
				return "^\\d{4}(-\\d{2}(-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z?)?)?)?$";
			case "uri":
				return "^https?://[^\\s]+$";
			case "token":
				return "^([^|]+\\|)?[^|]+$";
			default:
				return undefined;
		}
	}

	/**
	 * Get validation enum for parameter
	 */
	private static getValidationEnum(
		_param: EnhancedSearchParameter,
	): string[] | undefined {
		// This would be populated from value sets in a real implementation
		return undefined;
	}
}
