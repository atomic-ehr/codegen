/**
 * FHIR GraphQL Client Generator
 *
 * Generates GraphQL client code for FHIR APIs.
 * Provides type-safe GraphQL queries and mutations.
 */

import type { AnyTypeSchema } from "../../../typeschema/lib-types";

/**
 * GraphQL client generation options
 */
export interface GraphQLClientGenerationOptions {
	/** Include query methods */
	includeQueries?: boolean;
	/** Include mutation methods */
	includeMutations?: boolean;
	/** Generate subscription methods */
	includeSubscriptions?: boolean;
	/** Use fragments for reusability */
	useFragments?: boolean;
	/** Generate async/await methods */
	useAsync?: boolean;
	/** Client class name */
	clientClassName?: string;
}

/**
 * Generate GraphQL client from schemas
 */
export function generateGraphQLClient(
	schemas: AnyTypeSchema[],
	options: GraphQLClientGenerationOptions = {},
): string {
	const resourceSchemas = schemas.filter(
		(s) => s.identifier.kind === "resource",
	);

	const className = options.clientClassName || "FHIRGraphQLClient";
	const fragments = options.useFragments
		? generateFragments(resourceSchemas)
		: "";
	const queries = options.includeQueries
		? generateQueries(resourceSchemas, options)
		: "";
	const mutations = options.includeMutations
		? generateMutations(resourceSchemas, options)
		: "";
	const subscriptions = options.includeSubscriptions
		? generateSubscriptions(resourceSchemas, options)
		: "";
	const helperMethods = generateGraphQLHelperMethods(options);
	const interfaces = generateGraphQLInterfaces();

	const header = generateGraphQLClientHeader();

	return [
		header,
		interfaces,
		fragments,
		generateGraphQLMainClass(
			className,
			queries,
			mutations,
			subscriptions,
			helperMethods,
			options,
		),
	]
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Generate main GraphQL client class
 */
function generateGraphQLMainClass(
	className: string,
	queries: string,
	mutations: string,
	subscriptions: string,
	helperMethods: string,
	_options: GraphQLClientGenerationOptions,
): string {
	return `/**
 * FHIR GraphQL Client
 */
export class ${className} {
	private endpoint: string;
	private defaultHeaders: Record<string, string>;
	private timeout: number;

	constructor(config: FHIRGraphQLClientConfig) {
		this.endpoint = config.endpoint;
		this.defaultHeaders = {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			...config.headers,
		};
		this.timeout = config.timeout || 30000;
	}

${queries}

${mutations}

${subscriptions}

${helperMethods}
}`;
}

/**
 * Generate GraphQL fragments
 */
function generateFragments(resourceSchemas: AnyTypeSchema[]): string {
	const fragments: string[] = [];

	fragments.push(`/**
 * GraphQL Fragments
 */
export const GraphQLFragments = {`);

	for (const schema of resourceSchemas) {
		if ("fields" in schema && schema.fields) {
			const resourceType = schema.identifier.name;
			const fields = Object.keys(schema.fields).slice(0, 10); // Limit fields for example

			fragments.push(`	${resourceType}: \`
		fragment ${resourceType}Fields on ${resourceType} {
			id
			resourceType
			${fields.join("\n\t\t\t")}
		}
	\`,`);
		}
	}

	fragments.push(`};`);

	return fragments.join("\n");
}

/**
 * Generate GraphQL queries
 */
function generateQueries(
	resourceSchemas: AnyTypeSchema[],
	options: GraphQLClientGenerationOptions,
): string {
	const queries: string[] = [];

	for (const schema of resourceSchemas) {
		const resourceType = schema.identifier.name;
		queries.push(generateResourceQuery(resourceType, options));
		queries.push(generateResourceListQuery(resourceType, options));
		queries.push(generateResourceSearchQuery(resourceType, options));
	}

	return queries.join("\n\n");
}

/**
 * Generate single resource query
 */
function generateResourceQuery(
	resourceType: string,
	options: GraphQLClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? `Promise<GraphQLResponse<${resourceType}>>`
		: `GraphQLResponse<${resourceType}>`;
	const awaitKeyword = options.useAsync ? "await " : "";

	const fragment = options.useFragments
		? `...${resourceType}Fields`
		: `
			id
			resourceType
			# Add specific fields as needed`;

	return `	/**
	 * Get ${resourceType} by ID
	 */
	${asyncKeyword}get${resourceType}(id: string): ${returnType} {
		const query = \`
			query Get${resourceType}($id: ID!) {
				${resourceType}(id: $id) {
					${fragment}
				}
			}
			${options.useFragments ? `\${GraphQLFragments.${resourceType}}` : ""}
		\`;
		
		return ${awaitKeyword}this.request<${resourceType}>(query, { id });
	}`;
}

/**
 * Generate resource list query
 */
function generateResourceListQuery(
	resourceType: string,
	options: GraphQLClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? `Promise<GraphQLResponse<${resourceType}[]>>`
		: `GraphQLResponse<${resourceType}[]>`;
	const awaitKeyword = options.useAsync ? "await " : "";

	const fragment = options.useFragments
		? `...${resourceType}Fields`
		: `
				id
				resourceType
				# Add specific fields as needed`;

	return `	/**
	 * List ${resourceType} resources
	 */
	${asyncKeyword}list${resourceType}(first?: number, after?: string): ${returnType} {
		const query = \`
			query List${resourceType}($first: Int, $after: String) {
				${resourceType}List(first: $first, after: $after) {
					edges {
						node {
							${fragment}
						}
						cursor
					}
					pageInfo {
						hasNextPage
						hasPreviousPage
						startCursor
						endCursor
					}
				}
			}
			${options.useFragments ? `\${GraphQLFragments.${resourceType}}` : ""}
		\`;
		
		return ${awaitKeyword}this.request<${resourceType}[]>(query, { first, after });
	}`;
}

/**
 * Generate resource search query
 */
function generateResourceSearchQuery(
	resourceType: string,
	options: GraphQLClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? `Promise<GraphQLResponse<${resourceType}[]>>`
		: `GraphQLResponse<${resourceType}[]>`;
	const awaitKeyword = options.useAsync ? "await " : "";

	const fragment = options.useFragments
		? `...${resourceType}Fields`
		: `
				id
				resourceType
				# Add specific fields as needed`;

	return `	/**
	 * Search ${resourceType} resources
	 */
	${asyncKeyword}search${resourceType}(params: ${resourceType}SearchParams): ${returnType} {
		const query = \`
			query Search${resourceType}($params: ${resourceType}SearchInput!) {
				${resourceType}Search(params: $params) {
					total
					results {
						${fragment}
					}
				}
			}
			${options.useFragments ? `\${GraphQLFragments.${resourceType}}` : ""}
		\`;
		
		return ${awaitKeyword}this.request<${resourceType}[]>(query, { params });
	}`;
}

/**
 * Generate GraphQL mutations
 */
function generateMutations(
	resourceSchemas: AnyTypeSchema[],
	options: GraphQLClientGenerationOptions,
): string {
	const mutations: string[] = [];

	for (const schema of resourceSchemas) {
		const resourceType = schema.identifier.name;
		mutations.push(generateCreateMutation(resourceType, options));
		mutations.push(generateUpdateMutation(resourceType, options));
		mutations.push(generateDeleteMutation(resourceType, options));
	}

	return mutations.join("\n\n");
}

/**
 * Generate create mutation
 */
function generateCreateMutation(
	resourceType: string,
	options: GraphQLClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? `Promise<GraphQLResponse<${resourceType}>>`
		: `GraphQLResponse<${resourceType}>`;
	const awaitKeyword = options.useAsync ? "await " : "";

	const fragment = options.useFragments
		? `...${resourceType}Fields`
		: `
				id
				resourceType
				# Add specific fields as needed`;

	return `	/**
	 * Create new ${resourceType}
	 */
	${asyncKeyword}create${resourceType}(input: ${resourceType}Input): ${returnType} {
		const mutation = \`
			mutation Create${resourceType}($input: ${resourceType}Input!) {
				create${resourceType}(input: $input) {
					${fragment}
				}
			}
			${options.useFragments ? `\${GraphQLFragments.${resourceType}}` : ""}
		\`;
		
		return ${awaitKeyword}this.request<${resourceType}>(mutation, { input });
	}`;
}

/**
 * Generate update mutation
 */
function generateUpdateMutation(
	resourceType: string,
	options: GraphQLClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? `Promise<GraphQLResponse<${resourceType}>>`
		: `GraphQLResponse<${resourceType}>`;
	const awaitKeyword = options.useAsync ? "await " : "";

	const fragment = options.useFragments
		? `...${resourceType}Fields`
		: `
				id
				resourceType
				# Add specific fields as needed`;

	return `	/**
	 * Update ${resourceType}
	 */
	${asyncKeyword}update${resourceType}(id: string, input: Partial<${resourceType}Input>): ${returnType} {
		const mutation = \`
			mutation Update${resourceType}($id: ID!, $input: ${resourceType}UpdateInput!) {
				update${resourceType}(id: $id, input: $input) {
					${fragment}
				}
			}
			${options.useFragments ? `\${GraphQLFragments.${resourceType}}` : ""}
		\`;
		
		return ${awaitKeyword}this.request<${resourceType}>(mutation, { id, input });
	}`;
}

/**
 * Generate delete mutation
 */
function generateDeleteMutation(
	resourceType: string,
	options: GraphQLClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? "Promise<GraphQLResponse<boolean>>"
		: "GraphQLResponse<boolean>";
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Delete ${resourceType}
	 */
	${asyncKeyword}delete${resourceType}(id: string): ${returnType} {
		const mutation = \`
			mutation Delete${resourceType}($id: ID!) {
				delete${resourceType}(id: $id)
			}
		\`;
		
		return ${awaitKeyword}this.request<boolean>(mutation, { id });
	}`;
}

/**
 * Generate GraphQL subscriptions
 */
function generateSubscriptions(
	resourceSchemas: AnyTypeSchema[],
	options: GraphQLClientGenerationOptions,
): string {
	const subscriptions: string[] = [];

	for (const schema of resourceSchemas) {
		const resourceType = schema.identifier.name;
		subscriptions.push(generateResourceSubscription(resourceType, options));
	}

	return subscriptions.join("\n\n");
}

/**
 * Generate resource subscription
 */
function generateResourceSubscription(
	resourceType: string,
	options: GraphQLClientGenerationOptions,
): string {
	const fragment = options.useFragments
		? `...${resourceType}Fields`
		: `
				id
				resourceType
				# Add specific fields as needed`;

	return `	/**
	 * Subscribe to ${resourceType} changes
	 */
	subscribe${resourceType}(callback: (data: ${resourceType}) => void): () => void {
		const subscription = \`
			subscription ${resourceType}Changes {
				${resourceType}Changed {
					${fragment}
				}
			}
			${options.useFragments ? `\${GraphQLFragments.${resourceType}}` : ""}
		\`;
		
		return this.subscribe<${resourceType}>(subscription, {}, callback);
	}`;
}

/**
 * Generate helper methods
 */
function generateGraphQLHelperMethods(
	options: GraphQLClientGenerationOptions,
): string {
	const methods: string[] = [];

	// Base request method
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? "Promise<GraphQLResponse<T>>"
		: "GraphQLResponse<T>";
	const _awaitKeyword = options.useAsync ? "await " : "";

	methods.push(`	/**
	 * Execute GraphQL request
	 */
	private ${asyncKeyword}request<T>(
		query: string,
		variables?: Record<string, any>,
		headers?: Record<string, string>
	): ${returnType} {
		const requestHeaders = {
			...this.defaultHeaders,
			...headers,
		};

		const body = JSON.stringify({
			query,
			variables: variables || {},
		});

		const config: RequestInit = {
			method: 'POST',
			headers: requestHeaders,
			body,
		};

		${
			options.useAsync
				? `
		return fetch(this.endpoint, config)
			.then(response => response.json())
			.then(result => this.handleGraphQLResponse<T>(result))
			.catch(error => this.handleGraphQLError(error));`
				: `
		// Synchronous implementation would need a different HTTP library
		throw new Error('Synchronous requests not implemented');`
		}
	}`);

	// Response handler
	if (options.useAsync) {
		methods.push(`	/**
	 * Handle GraphQL response
	 */
	private handleGraphQLResponse<T>(result: any): GraphQLResponse<T> {
		if (result.errors && result.errors.length > 0) {
			return {
				data: null,
				errors: result.errors,
				extensions: result.extensions,
			};
		}

		return {
			data: result.data,
			errors: null,
			extensions: result.extensions,
		};
	}`);

		// Error handler
		methods.push(`	/**
	 * Handle GraphQL errors
	 */
	private handleGraphQLError(error: any): GraphQLResponse<any> {
		console.error('GraphQL Error:', error);
		return {
			data: null,
			errors: [{ message: error.message || 'Unknown error' }],
			extensions: null,
		};
	}`);

		// Subscription method
		methods.push(`	/**
	 * Subscribe to GraphQL subscription
	 */
	private subscribe<T>(
		subscription: string,
		variables: Record<string, any>,
		callback: (data: T) => void
	): () => void {
		// WebSocket subscription implementation would go here
		// This is a placeholder for subscription functionality
		console.log('Subscription:', subscription, variables);
		
		// Return unsubscribe function
		return () => {
			console.log('Unsubscribing...');
		};
	}`);
	}

	return methods.join("\n\n");
}

/**
 * Generate GraphQL interfaces
 */
function generateGraphQLInterfaces(): string {
	return `/**
 * GraphQL client configuration
 */
export interface FHIRGraphQLClientConfig {
	/** GraphQL endpoint URL */
	endpoint: string;
	/** Default headers */
	headers?: Record<string, string>;
	/** Request timeout */
	timeout?: number;
	/** WebSocket URL for subscriptions */
	wsEndpoint?: string;
	/** Authentication */
	auth?: {
		type: 'bearer' | 'basic';
		token?: string;
		username?: string;
		password?: string;
	};
}

/**
 * GraphQL response wrapper
 */
export interface GraphQLResponse<T> {
	/** Response data */
	data: T | null;
	/** GraphQL errors */
	errors: GraphQLError[] | null;
	/** Extensions */
	extensions?: any;
}

/**
 * GraphQL error
 */
export interface GraphQLError {
	/** Error message */
	message: string;
	/** Error locations in query */
	locations?: Array<{
		line: number;
		column: number;
	}>;
	/** Error path */
	path?: (string | number)[];
	/** Extensions */
	extensions?: any;
}

/**
 * Base input type for mutations
 */
export interface ResourceInput {
	[key: string]: any;
}

/**
 * Search parameters base interface
 */
export interface SearchParams {
	_count?: number;
	_offset?: number;
	_sort?: string;
	[key: string]: any;
}`;
}

/**
 * Generate file header
 */
function generateGraphQLClientHeader(): string {
	const timestamp = new Date().toISOString();

	return `/**
 * FHIR GraphQL Client
 * 
 * Auto-generated type-safe GraphQL client for FHIR API.
 * Generated at: ${timestamp}
 * 
 * WARNING: This file is auto-generated. Do not modify manually.
 */

/* eslint-disable */`;
}
