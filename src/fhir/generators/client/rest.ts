/**
 * FHIR REST Client Generator
 *
 * Generates type-safe REST client code for FHIR APIs.
 * Provides methods for CRUD operations, search, and custom operations.
 */

import type { AnyTypeSchema } from "../../../typeschema/lib-types";

/**
 * REST client generation options
 */
export interface RestClientGenerationOptions {
	/** Include search methods */
	includeSearch?: boolean;
	/** Include operation methods */
	includeOperations?: boolean;
	/** Include batch/transaction methods */
	includeBatch?: boolean;
	/** Generate async/await methods */
	useAsync?: boolean;
	/** Include error handling */
	includeErrorHandling?: boolean;
	/** Base client class name */
	clientClassName?: string;
}

/**
 * Generate REST client from schemas
 */
export function generateRestClient(
	schemas: AnyTypeSchema[],
	options: RestClientGenerationOptions = {},
): string {
	const resourceSchemas = schemas.filter(
		(s) => s.identifier.kind === "resource",
	);

	const className = options.clientClassName || "FHIRRestClient";
	const methods = generateRestMethods(resourceSchemas, options);
	const helperMethods = generateHelperMethods(options);
	const interfaces = generateRestInterfaces();

	const header = generateRestClientHeader();

	return [
		header,
		interfaces,
		generateMainClass(className, methods, helperMethods, options),
	]
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Generate main client class
 */
function generateMainClass(
	className: string,
	methods: string,
	helperMethods: string,
	_options: RestClientGenerationOptions,
): string {
	return `/**
 * FHIR REST Client
 */
export class ${className} {
	private baseUrl: string;
	private defaultHeaders: Record<string, string>;
	private timeout: number;

	constructor(config: FHIRRestClientConfig) {
		this.baseUrl = config.baseUrl.replace(/\\/$/, '');
		this.defaultHeaders = {
			'Content-Type': 'application/fhir+json',
			'Accept': 'application/fhir+json',
			...config.headers,
		};
		this.timeout = config.timeout || 30000;
	}

${methods}

${helperMethods}
}`;
}

/**
 * Generate REST methods for resources
 */
function generateRestMethods(
	resourceSchemas: AnyTypeSchema[],
	options: RestClientGenerationOptions,
): string {
	const methods: string[] = [];

	for (const schema of resourceSchemas) {
		const resourceType = schema.identifier.name;

		// CRUD methods
		methods.push(generateReadMethod(resourceType, options));
		methods.push(generateCreateMethod(resourceType, options));
		methods.push(generateUpdateMethod(resourceType, options));
		methods.push(generateDeleteMethod(resourceType, options));

		// Search method
		if (options.includeSearch) {
			methods.push(generateSearchMethod(resourceType, options));
		}

		// Operation methods
		if (options.includeOperations) {
			methods.push(generateOperationMethod(resourceType, options));
		}
	}

	// Generic methods
	methods.push(generateGenericReadMethod(options));
	methods.push(generateGenericSearchMethod(options));

	return methods.join("\n\n");
}

/**
 * Generate read method for a resource type
 */
function generateReadMethod(
	resourceType: string,
	options: RestClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? `Promise<FHIRResponse<${resourceType}>>`
		: `FHIRResponse<${resourceType}>`;
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Read ${resourceType} by ID
	 */
	${asyncKeyword}read${resourceType}(id: string): ${returnType} {
		return ${awaitKeyword}this.request<${resourceType}>('GET', \`${resourceType}/\${id}\`);
	}`;
}

/**
 * Generate create method for a resource type
 */
function generateCreateMethod(
	resourceType: string,
	options: RestClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? `Promise<FHIRResponse<${resourceType}>>`
		: `FHIRResponse<${resourceType}>`;
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Create new ${resourceType}
	 */
	${asyncKeyword}create${resourceType}(resource: ${resourceType}): ${returnType} {
		return ${awaitKeyword}this.request<${resourceType}>('POST', '${resourceType}', resource);
	}`;
}

/**
 * Generate update method for a resource type
 */
function generateUpdateMethod(
	resourceType: string,
	options: RestClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? `Promise<FHIRResponse<${resourceType}>>`
		: `FHIRResponse<${resourceType}>`;
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Update ${resourceType} by ID
	 */
	${asyncKeyword}update${resourceType}(id: string, resource: ${resourceType}): ${returnType} {
		return ${awaitKeyword}this.request<${resourceType}>('PUT', \`${resourceType}/\${id}\`, resource);
	}`;
}

/**
 * Generate delete method for a resource type
 */
function generateDeleteMethod(
	resourceType: string,
	options: RestClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? "Promise<FHIRResponse<void>>"
		: "FHIRResponse<void>";
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Delete ${resourceType} by ID
	 */
	${asyncKeyword}delete${resourceType}(id: string): ${returnType} {
		return ${awaitKeyword}this.request<void>('DELETE', \`${resourceType}/\${id}\`);
	}`;
}

/**
 * Generate search method for a resource type
 */
function generateSearchMethod(
	resourceType: string,
	options: RestClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? `Promise<FHIRResponse<Bundle<${resourceType}>>>`
		: `FHIRResponse<Bundle<${resourceType}>>`;
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Search ${resourceType} resources
	 */
	${asyncKeyword}search${resourceType}(params?: ${resourceType}SearchParams): ${returnType} {
		const searchParams = new URLSearchParams();
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined) {
					if (Array.isArray(value)) {
						value.forEach(v => searchParams.append(key, String(v)));
					} else {
						searchParams.append(key, String(value));
					}
				}
			}
		}
		
		const url = \`${resourceType}?\${searchParams.toString()}\`;
		return ${awaitKeyword}this.request<Bundle<${resourceType}>>('GET', url);
	}`;
}

/**
 * Generate operation method for a resource type
 */
function generateOperationMethod(
	resourceType: string,
	options: RestClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? "Promise<FHIRResponse<any>>"
		: "FHIRResponse<any>";
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Execute operation on ${resourceType}
	 */
	${asyncKeyword}${resourceType.toLowerCase()}Operation(
		operation: string,
		id?: string,
		parameters?: any
	): ${returnType} {
		const url = id 
			? \`${resourceType}/\${id}/$\${operation}\`
			: \`${resourceType}/$\${operation}\`;
		return ${awaitKeyword}this.request<any>('POST', url, parameters);
	}`;
}

/**
 * Generate generic read method
 */
function generateGenericReadMethod(
	options: RestClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? "Promise<FHIRResponse<AnyResource>>"
		: "FHIRResponse<AnyResource>";
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Read any resource by type and ID
	 */
	${asyncKeyword}read<T extends AnyResource = AnyResource>(
		resourceType: string,
		id: string
	): ${returnType.replace("AnyResource", "T")} {
		return ${awaitKeyword}this.request<T>('GET', \`\${resourceType}/\${id}\`);
	}`;
}

/**
 * Generate generic search method
 */
function generateGenericSearchMethod(
	options: RestClientGenerationOptions,
): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? "Promise<FHIRResponse<Bundle<AnyResource>>>"
		: "FHIRResponse<Bundle<AnyResource>>";
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Search any resource type
	 */
	${asyncKeyword}search<T extends AnyResource = AnyResource>(
		resourceType: string,
		params?: Record<string, any>
	): ${returnType.replace("AnyResource", "T")} {
		const searchParams = new URLSearchParams();
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined) {
					if (Array.isArray(value)) {
						value.forEach(v => searchParams.append(key, String(v)));
					} else {
						searchParams.append(key, String(value));
					}
				}
			}
		}
		
		const url = \`\${resourceType}?\${searchParams.toString()}\`;
		return ${awaitKeyword}this.request<Bundle<T>>('GET', url);
	}`;
}

/**
 * Generate helper methods
 */
function generateHelperMethods(options: RestClientGenerationOptions): string {
	const methods: string[] = [];

	// Base request method
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? "Promise<FHIRResponse<T>>"
		: "FHIRResponse<T>";
	const awaitKeyword = options.useAsync ? "await " : "";

	methods.push(`	/**
	 * Make HTTP request to FHIR server
	 */
	private ${asyncKeyword}request<T>(
		method: string,
		path: string,
		body?: any,
		headers?: Record<string, string>
	): ${returnType} {
		const url = \`\${this.baseUrl}/\${path}\`;
		const requestHeaders = {
			...this.defaultHeaders,
			...headers,
		};

		const config: RequestInit = {
			method,
			headers: requestHeaders,
		};

		if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
			config.body = JSON.stringify(body);
		}

		${
			options.useAsync
				? `
		return fetch(url, config)
			.then(response => this.handleResponse<T>(response))
			.catch(error => this.handleError(error));`
				: `
		// Synchronous implementation would need a different HTTP library
		throw new Error('Synchronous requests not implemented');`
		}
	}`);

	// Response handler
	if (options.useAsync) {
		methods.push(`	/**
	 * Handle HTTP response
	 */
	private ${asyncKeyword}handleResponse<T>(response: Response): ${returnType} {
		const result: FHIRResponse<T> = {
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
		} as FHIRResponse<T>;

		if (response.ok) {
			if (response.status === 204) {
				result.data = null as any;
				return ${options.useAsync ? "Promise.resolve(result)" : "result"};
			}
			return ${awaitKeyword}response.json().then(data => {
				result.data = data;
				return result;
			});
		} else {
			return ${awaitKeyword}response.json().then(error => {
				result.error = error;
				${options.includeErrorHandling ? "this.handleError(result);" : ""}
				return result;
			}).catch(() => {
				result.error = { message: response.statusText };
				${options.includeErrorHandling ? "this.handleError(result);" : ""}
				return result;
			});
		}
	}`);
	}

	// Error handler
	if (options.includeErrorHandling) {
		methods.push(`	/**
	 * Handle errors
	 */
	private handleError(error: any): void {
		console.error('FHIR Client Error:', error);
		// Add custom error handling logic here
	}`);
	}

	// Batch/transaction methods
	if (options.includeBatch) {
		methods.push(generateBatchMethods(options));
	}

	return methods.join("\n\n");
}

/**
 * Generate batch and transaction methods
 */
function generateBatchMethods(options: RestClientGenerationOptions): string {
	const asyncKeyword = options.useAsync ? "async " : "";
	const returnType = options.useAsync
		? "Promise<FHIRResponse<Bundle>>"
		: "FHIRResponse<Bundle>";
	const awaitKeyword = options.useAsync ? "await " : "";

	return `	/**
	 * Execute batch request
	 */
	${asyncKeyword}batch(bundle: Bundle): ${returnType} {
		bundle.type = 'batch';
		return ${awaitKeyword}this.request<Bundle>('POST', '', bundle);
	}

	/**
	 * Execute transaction request
	 */
	${asyncKeyword}transaction(bundle: Bundle): ${returnType} {
		bundle.type = 'transaction';
		return ${awaitKeyword}this.request<Bundle>('POST', '', bundle);
	}`;
}

/**
 * Generate REST interfaces
 */
function generateRestInterfaces(): string {
	return `/**
 * FHIR REST Client configuration
 */
export interface FHIRRestClientConfig {
	/** Base URL of the FHIR server */
	baseUrl: string;
	/** Default headers to include with requests */
	headers?: Record<string, string>;
	/** Request timeout in milliseconds */
	timeout?: number;
	/** Authentication configuration */
	auth?: {
		type: 'bearer' | 'basic' | 'custom';
		token?: string;
		username?: string;
		password?: string;
		customHeaders?: Record<string, string>;
	};
}

/**
 * FHIR HTTP response wrapper
 */
export interface FHIRResponse<T> {
	/** Response status code */
	status: number;
	/** Response status text */
	statusText: string;
	/** Response headers */
	headers: Record<string, string>;
	/** Response data (if successful) */
	data?: T;
	/** Error data (if unsuccessful) */
	error?: any;
}

/**
 * Base resource type
 */
export interface AnyResource {
	resourceType: string;
	id?: string;
	meta?: any;
}

/**
 * FHIR Bundle resource
 */
export interface Bundle<T = AnyResource> {
	resourceType: 'Bundle';
	id?: string;
	meta?: any;
	type: 'searchset' | 'batch' | 'transaction' | 'batch-response' | 'transaction-response';
	total?: number;
	link?: Array<{
		relation: string;
		url: string;
	}>;
	entry?: Array<{
		fullUrl?: string;
		resource?: T;
		search?: {
			mode?: 'match' | 'include' | 'outcome';
			score?: number;
		};
		request?: {
			method: string;
			url: string;
		};
		response?: {
			status: string;
			location?: string;
		};
	}>;
}`;
}

/**
 * Generate file header
 */
function generateRestClientHeader(): string {
	const timestamp = new Date().toISOString();

	return `/**
 * FHIR REST Client
 * 
 * Auto-generated type-safe REST client for FHIR API.
 * Generated at: ${timestamp}
 * 
 * WARNING: This file is auto-generated. Do not modify manually.
 */

/* eslint-disable */`;
}
