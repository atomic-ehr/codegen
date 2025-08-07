/**
 * FHIR Search Types
 *
 * Type definitions specific to FHIR search functionality.
 * Provides types for search parameters, chaining, and result handling.
 */

import type { ResourceType } from "../../types/base";

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
 * Base parameter types for type-safe search
 */
export type TokenParam =
	| string
	| {
			system?: string;
			code?: string;
			text?: string;
	  };

export type DateParam = string | Date | PrefixedParam<string | Date>;
export type NumberParam = number | PrefixedParam<number>;
export type QuantityParam =
	| number
	| {
			value: number;
			unit?: string;
			system?: string;
			code?: string;
	  }
	| PrefixedParam<number>;

export type StringParam = string | ModifiedParam<string>;
export type ReferenceParam<T extends ResourceType = ResourceType> =
	| string
	| {
			reference: `${T}/${string}`;
	  }
	| {
			identifier: TokenParam;
	  };

export type UriParam = string;
export type CompositeParam = string | Record<string, string | number>;
export type SpecialParam = string | number | boolean;

/**
 * Date range helper type
 */
export type DateRangeParam = {
	start?: string | Date;
	end?: string | Date;
};

/**
 * Multiple values with OR logic
 */
export type MultipleValues<T> = T | T[];

/**
 * Search parameter with modifiers
 */
export type SearchParamWithModifiers<T> =
	| T
	| {
			value: T;
			modifier?: string;
			count?: number;
	  };

/**
 * Parameter with prefix (for quantity/date comparisons)
 */
export type PrefixedParam<T> = {
	prefix: "eq" | "ne" | "gt" | "ge" | "lt" | "le" | "sa" | "eb" | "ap";
	value: T;
};

/**
 * Parameter with modifier
 */
export type ModifiedParam<T> =
	| T
	| {
			modifier:
				| "exact"
				| "contains"
				| "not"
				| "above"
				| "below"
				| "missing"
				| "in"
				| "not-in"
				| "of-type";
			value: T;
	  };

/**
 * Chained parameter type for reference chaining
 */
export type ChainedParam<K extends string, T> = {
	[P in keyof T as `${K}.${string & P}`]: T[P];
};

/**
 * Common search parameters available for all resources
 */
export interface CommonSearchParams {
	/** Number of resources to return */
	_count?: number;
	/** Pagination offset */
	_offset?: number;
	/** Sort results */
	_sort?: string | string[];
	/** Include related resources */
	_include?: string | string[];
	/** Reverse include related resources */
	_revinclude?: string | string[];
	/** Filter by last updated time */
	_lastUpdated?: DateParam;
	/** Filter by profile */
	_profile?: string | string[];
	/** Filter by security label */
	_security?: TokenParam | TokenParam[];
	/** Filter by tag */
	_tag?: TokenParam | TokenParam[];
	/** Filter by text */
	_text?: string;
	/** Filter by content */
	_content?: string;
	/** Return specific elements only */
	_elements?: string | string[];
	/** Summary mode */
	_summary?: "true" | "text" | "data" | "count" | "false";
	/** Pretty print */
	_pretty?: boolean;
	/** Response format */
	_format?: "json" | "xml" | "turtle";
}

/**
 * Search bundle entry
 */
export interface SearchBundleEntry<T = any> {
	fullUrl?: string;
	resource: T;
	search?: {
		mode?: "match" | "include" | "outcome";
		score?: number;
	};
}

/**
 * Search result bundle
 */
export interface SearchBundle<T = any> {
	resourceType: "Bundle";
	id?: string;
	meta?: any;
	implicitRules?: string;
	language?: string;
	type: "searchset";
	timestamp?: string;
	total?: number;
	link?: Array<{
		relation: "self" | "first" | "previous" | "next" | "last";
		url: string;
	}>;
	entry?: SearchBundleEntry<T>[];
}

/**
 * Search operation outcome
 */
export interface SearchOperationOutcome {
	resourceType: "OperationOutcome";
	issue: Array<{
		severity: "fatal" | "error" | "warning" | "information";
		code: string;
		details?: {
			text?: string;
		};
		diagnostics?: string;
		location?: string[];
		expression?: string[];
	}>;
}

/**
 * Search response wrapper
 */
export interface SearchResponse<T = any> {
	data: SearchBundle<T> | SearchOperationOutcome;
	status: number;
	headers: Record<string, string>;
	request?: {
		url: string;
		method: string;
		params: Record<string, any>;
	};
}

/**
 * Search parameter definition
 */
export interface SearchParameterDefinition {
	name: string;
	type: SearchParameterType;
	description?: string;
	target?: string[];
	chain?: string[];
	modifier?: SearchParameterModifier[];
	multipleOr?: boolean;
	multipleAnd?: boolean;
	comparator?: SearchParameterPrefix[];
	xpath?: string;
	expression?: string;
}

/**
 * Resource search parameters mapping (to be extended by generated types)
 */
export type SearchParamsMap = {};

/**
 * Chainable parameters mapping (to be extended by generated types)
 */
export type ChainableParams = {};

/**
 * Resource mapping interface (to be extended by generated types)
 */
export type ResourceMap = {};

/**
 * Extract chain target resource type
 */
export type ChainTargetResource<
	_T extends keyof SearchParamsMap,
	_ChainParam extends string,
> = never;

/**
 * Search builder configuration
 */
export interface SearchBuilderConfig {
	/** Base URL for FHIR server */
	baseUrl: string;
	/** Default timeout for requests */
	timeout?: number;
	/** Default headers */
	headers?: Record<string, string>;
	/** Enable strict type checking */
	strict?: boolean;
	/** Maximum number of resources to return by default */
	defaultCount?: number;
}

/**
 * Search execution options
 */
export interface SearchExecutionOptions {
	/** Request timeout override */
	timeout?: number;
	/** Additional headers */
	headers?: Record<string, string>;
	/** Cache the response */
	cache?: boolean;
	/** Retry policy */
	retry?: {
		attempts: number;
		delay: number;
	};
}

/**
 * Advanced search builder interface
 */
export interface AdvancedSearchBuilder<T extends keyof ResourceMap> {
	// String parameters with modifiers
	whereString(
		param: string,
		value: string,
		modifier?: "exact" | "contains",
	): AdvancedSearchBuilder<T>;

	// Token parameters with system|code format
	whereToken(
		param: string,
		system?: string,
		code?: string,
	): AdvancedSearchBuilder<T>;

	// Date parameters with comparators
	whereDate(
		param: string,
		value: string | Date,
		comparator?: SearchParameterPrefix,
	): AdvancedSearchBuilder<T>;

	// Number parameters with comparators
	whereNumber(
		param: string,
		value: number,
		comparator?: SearchParameterPrefix,
	): AdvancedSearchBuilder<T>;

	// Quantity parameters
	whereQuantity(
		param: string,
		value: number,
		unit?: string,
		system?: string,
	): AdvancedSearchBuilder<T>;

	// Reference parameters
	whereReference(param: string, reference: string): AdvancedSearchBuilder<T>;

	// Date range helpers
	dateRange(
		param: string,
		start: string | Date,
		end: string | Date,
	): AdvancedSearchBuilder<T>;

	// Multiple values with OR logic
	whereMultiple(param: string, values: any[]): AdvancedSearchBuilder<T>;

	// Composite search parameters
	composite(
		param: string,
		values: Record<string, any>,
	): AdvancedSearchBuilder<T>;

	// Text search across all fields
	text(query: string): AdvancedSearchBuilder<T>;

	// Content search in narrative
	content(query: string): AdvancedSearchBuilder<T>;

	// Profile filtering
	profile(profileUrl: string): AdvancedSearchBuilder<T>;

	// Security label filtering
	security(system: string, code: string): AdvancedSearchBuilder<T>;

	// Tag filtering
	tag(system: string, code: string): AdvancedSearchBuilder<T>;

	// Summary modes
	summary(mode: "true" | "text" | "data" | "count"): AdvancedSearchBuilder<T>;

	// Elements filtering
	elements(...elements: string[]): AdvancedSearchBuilder<T>;

	// Last updated filtering
	lastUpdated(
		date: string | Date,
		comparator?: SearchParameterPrefix,
	): AdvancedSearchBuilder<T>;

	// ID search
	id(id: string): AdvancedSearchBuilder<T>;

	// Multiple ID search
	ids(...ids: string[]): AdvancedSearchBuilder<T>;
}

/**
 * Search result processor interface
 */
export interface SearchResultProcessor<T> {
	getResources(): T[];
	first(): T | undefined;
	total(): number;
	hasNext(): boolean;
	hasPrevious(): boolean;
	getNextUrl(): string | undefined;
	getPreviousUrl(): string | undefined;
	filter(predicate: (resource: T) => boolean): T[];
	map<U>(mapper: (resource: T) => U): U[];
	groupBy<K extends keyof T>(property: K): Record<string, T[]>;
	getIncluded(): any[];
	getOutcome(): any[];
}

/**
 * Search validation result
 */
export interface SearchValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Search parameter validator interface
 */
export interface SearchParameterValidator {
	validate<T extends keyof ResourceMap>(
		resourceType: T,
		parameters: Record<string, any>,
	): SearchValidationResult;

	validateParameter(
		resourceType: keyof ResourceMap,
		paramName: string,
		value: any,
	): SearchValidationResult;
}

/**
 * Special search operations for specific resources
 */
export interface SpecialSearchOperations {
	// Patient $everything operation
	patientEverything(
		patientId: string,
		params?: {
			start?: string;
			end?: string;
			_count?: number;
			_since?: string;
		},
	): Promise<SearchResponse<any>>;

	// Observation $lastn operation
	observationLastN(params: {
		subject?: string;
		category?: string;
		code?: string;
		max?: number;
	}): Promise<SearchResponse<any>>;

	// ValueSet $expand operation
	valueSetExpand(
		valueSetId: string,
		params?: {
			filter?: string;
			offset?: number;
			count?: number;
		},
	): Promise<SearchResponse<any>>;

	// CodeSystem $lookup operation
	codeSystemLookup(params: {
		system: string;
		code: string;
		version?: string;
		displayLanguage?: string;
	}): Promise<SearchResponse<any>>;
}

/**
 * Search metrics for performance monitoring
 */
export interface SearchMetrics {
	totalExecutionTime: number;
	networkTime: number;
	processingTime: number;
	resultCount: number;
	bundleSize: number;
	cacheHit: boolean;
}

/**
 * Paginated search result
 */
export interface PaginatedSearchResult<T> {
	resources: T[];
	total: number;
	hasNext: boolean;
	hasPrevious: boolean;
	nextUrl?: string;
	previousUrl?: string;
	currentPage: number;
	totalPages: number;
	pageSize: number;
}
