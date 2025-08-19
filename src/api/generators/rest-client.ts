/**
 * REST Client Generator
 *
 * Generates a fetch-based FHIR REST client with TypeScript autocompletion
 * and type safety for all FHIR resources.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RestClientConfig } from "../../config";
import type { TypeSchema, TypeSchemaIdentifier } from "../../typeschema/type-schema.types";
import type { CodegenLogger } from "../../utils/codegen-logger";
import { createLogger } from "../../utils/codegen-logger";
import { SearchParameterEnhancer } from "./search-parameter-enhancer";
import { ValidationGenerator } from "./validation-generator";

/**
 * Options for the REST Client generator
 * Extends RestClientConfig with outputDir
 */
export interface RestClientOptions extends RestClientConfig {
	outputDir: string;
	logger?: CodegenLogger;
}

/**
 * Generated file result
 */
export interface GeneratedRestClient {
	path: string;
	filename: string;
	content: string;
	exports: string[];
}

/**
 * REST Client Generator
 *
 * Generates a type-safe FHIR REST client with autocompletion for all
 * available resource types.
 */
export class RestClientGenerator {
	private options: Required<Omit<RestClientOptions, "logger">> & {
		logger?: CodegenLogger;
	};
	private resourceTypes = new Set<string>();
	private searchParameterEnhancer: SearchParameterEnhancer;
	private validationGenerator: ValidationGenerator;
	private logger: CodegenLogger;

	constructor(options: RestClientOptions) {
		this.options = {
			clientName: "FHIRClient",
			includeValidation: false,
			includeErrorHandling: true,
			includeRequestInterceptors: false,
			baseUrlOverride: "",
			enhancedSearch: false,
			includeUtilities: true,
			generateValidators: false,
			useCanonicalManager: true,
			defaultTimeout: 30000,
			defaultRetries: 0,
			includeDocumentation: true,
			generateExamples: false,
			chainedSearchBuilder: false,
			searchAutocomplete: true,
			generateValueSetEnums: true,
			...options,
		};
		this.logger = options.logger || createLogger({ prefix: "REST" });
		this.logger.debug(`REST client configured: ${this.options.clientName}`);

		this.searchParameterEnhancer = new SearchParameterEnhancer({
			autocomplete: this.options.searchAutocomplete ?? false,
			valueSetEnums: this.options.generateValueSetEnums ?? false,
			logger: this.logger.child("Search"),
		});
		this.validationGenerator = new ValidationGenerator();
	}

	/**
	 * Collect resource types from schemas
	 */
	private collectResourceTypes(schemas: TypeSchema[]): void {
		this.resourceTypes.clear();

		for (const schema of schemas) {
			if (
				schema.identifier.kind === "resource" &&
				schema.identifier.name !== "DomainResource" &&
				schema.identifier.name !== "Resource"
			) {
				this.resourceTypes.add(schema.identifier.name);
			}
		}

		// Also collect search parameter data if enhanced search is enabled
		if (this.options.enhancedSearch) {
			this.searchParameterEnhancer.collectResourceData(schemas);
		}

		// Collect validation data if validation is enabled
		if (this.options.includeValidation || this.options.generateValidators) {
			this.validationGenerator.collectResourceData(schemas);
		}
	}

	/**
	 * Generate the REST client from TypeSchema documents
	 */
	async generate(schemas: TypeSchema[]): Promise<GeneratedRestClient[]> {
		this.collectResourceTypes(schemas);

		// Ensure output directory exists
		await mkdir(this.options.outputDir, { recursive: true });

		const generatedFiles: GeneratedRestClient[] = [];

		// Generate main client file
		const clientFile = await this.generateClientFile();
		const clientPath = join(this.options.outputDir, clientFile.filename);
		await this.ensureDirectoryExists(clientPath);
		await writeFile(clientPath, clientFile.content, "utf-8");

		generatedFiles.push({
			...clientFile,
			path: clientPath,
		});

		// Generate types file
		const typesFile = await this.generateTypesFile();
		const typesPath = join(this.options.outputDir, typesFile.filename);
		await writeFile(typesPath, typesFile.content, "utf-8");

		generatedFiles.push({
			...typesFile,
			path: typesPath,
		});

		// Generate enhanced search parameters file if enabled
		if (this.options.enhancedSearch) {
			const searchParamsFile = await this.generateEnhancedSearchParamsFile();
			const searchParamsPath = join(
				this.options.outputDir,
				searchParamsFile.filename,
			);
			await writeFile(searchParamsPath, searchParamsFile.content, "utf-8");

			generatedFiles.push({
				...searchParamsFile,
				path: searchParamsPath,
			});
		}

		// Generate validation files if validation is enabled
		if (this.options.includeValidation || this.options.generateValidators) {
			const validationTypesFile = await this.generateValidationTypesFile();
			const validationTypesPath = join(
				this.options.outputDir,
				validationTypesFile.filename,
			);
			await writeFile(
				validationTypesPath,
				validationTypesFile.content,
				"utf-8",
			);

			generatedFiles.push({
				...validationTypesFile,
				path: validationTypesPath,
			});

			const validatorsFile = await this.generateValidatorsFile();
			const validatorsPath = join(
				this.options.outputDir,
				validatorsFile.filename,
			);
			await writeFile(validatorsPath, validatorsFile.content, "utf-8");

			generatedFiles.push({
				...validatorsFile,
				path: validatorsPath,
			});
		}

		// Generate utility file with ResourceTypeMap
		const utilityFile = await this.generateUtilityFile();
		const utilityPath = join(this.options.outputDir, utilityFile.filename);
		await writeFile(utilityPath, utilityFile.content, "utf-8");

		generatedFiles.push({
			...utilityFile,
			path: utilityPath,
		});

		return generatedFiles;
	}

	/**
	 * Generate the main client file
	 */
	private async generateClientFile(): Promise<
		Omit<GeneratedRestClient, "path">
	> {
		const resourceTypesArray = Array.from(this.resourceTypes).sort();
		const clientName = this.options.clientName;

		// Generate imports conditionally
		const enhancedSearchImports = this.options.enhancedSearch
			? `import type { 
	EnhancedSearchParams,
	SearchParameterValidator${(this.options as any).searchAutocomplete ? ",\n\tSearchParamName,\n\tBaseEnhancedSearchParams" : ""} 
} from './enhanced-search-params';`
			: "";

		const validationImports =
			this.options.includeValidation || this.options.generateValidators
				? `import type { 
	ValidationOptions,
	ValidationResult,
	ValidationException 
} from './validation-types';
import { ResourceValidator } from './resource-validators';`
				: "";

		// Always import SearchParams to keep backward compatibility typings
		const searchParamType = "SearchParams,";

		const content = `/**
 * FHIR REST Client
 * 
 * Type-safe FHIR REST client with autocompletion for all resource types.
 * Generated automatically from FHIR schemas.
 */

import type { 
	ResourceTypes,
	Bundle,
	OperationOutcome,
	${resourceTypesArray.join(",\n\t")}
} from '../types';
import type { 
	${clientName}Config,
	${searchParamType}
	CreateResponse,
	UpdateResponse,
	DeleteResponse,
	ReadResponse,
	SearchResponse,
	RequestOptions,
	HTTPMethod 
} from './client-types';
${enhancedSearchImports}
${validationImports}
import type { ResourceTypeMap } from './utility';

/**
 * Main FHIR REST Client
 * 
 * Provides type-safe operations for all FHIR resources with autocompletion.
 */
export class ${clientName} {
	private baseUrl: string;
	private config: Required<${clientName}Config>;

	constructor(baseUrl: string, config: ${clientName}Config = {}) {
		this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
		this.config = {
			timeout: 30000,
			retries: 0,
			headers: {},
			validateResponses: false,
			...config
		};
	}

${this.generateCRUDMethods()}

${this.generateSearchMethod()}

	/**
	 * Get server capability statement
	 */
	async getCapabilities(): Promise<any> {
		const url = \`\${this.baseUrl}/metadata\`;
		return this.request('GET', url);
	}

	/**
	 * Execute raw HTTP request with full control
	 */
	async request<T = any>(
		method: HTTPMethod,
		url: string,
		body?: any,
		options?: RequestOptions
	): Promise<T> {
		const requestOptions: RequestInit = {
			method,
			headers: {
				'Content-Type': 'application/fhir+json',
				'Accept': 'application/fhir+json',
				...this.config.headers,
				...options?.headers
			},
			signal: options?.signal || (this.config.timeout > 0 
				? AbortSignal.timeout(this.config.timeout) 
				: undefined
			)
		};

		if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
			requestOptions.body = JSON.stringify(body);
		}

		${this.options.includeErrorHandling ? this.generateErrorHandling() : "const response = await fetch(url, requestOptions);"}

		if (!response.ok) {
			await this.handleErrorResponse(response);
		}

		// Handle different response types
		const contentType = response.headers.get('content-type');
		if (contentType?.includes('application/json') || contentType?.includes('application/fhir+json')) {
			return response.json();
		} else if (method === 'DELETE') {
			return undefined as T;
		} else {
			return response.text() as T;
		}
	}

	${this.options.includeErrorHandling ? this.generateErrorHandlingMethods() : ""}

	/**
	 * Update client configuration
	 */
	updateConfig(config: Partial<${clientName}Config>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current configuration
	 */
	getConfig(): Required<${clientName}Config> {
		return { ...this.config };
	}

	/**
	 * Get base URL
	 */
	getBaseUrl(): string {
		return this.baseUrl;
	}${this.generateValidationMethods()}
}

export default ${clientName};`;

		return {
			filename: `${clientName.toLowerCase()}.ts`,
			content,
			exports: [clientName],
		};
	}

	/**
	 * Generate the types file
	 */
	private async generateTypesFile(): Promise<
		Omit<GeneratedRestClient, "path">
	> {
		const content = `/**
 * FHIR REST Client Types
 * 
 * Type definitions for the FHIR REST client.
 */

import type { Bundle } from '../types';
import type { ResourceTypeMap } from './utility';

/**
 * HTTP methods supported by the client
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Client configuration options
 */
export interface ${this.options.clientName}Config {
	/** Request timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Number of retries for failed requests (default: 0) */
	retries?: number;
	/** Default headers to include with all requests */
	headers?: Record<string, string>;
	/** Whether to validate response schemas (default: false) */
	validateResponses?: boolean;${this.generateValidationConfigFields()}
}

/**
 * Request options for individual operations
 */
export interface RequestOptions {
	/** Additional headers for this request */
	headers?: Record<string, string>;
	/** AbortSignal to cancel the request */
	signal?: AbortSignal;
}

/**
 * Generic search parameters
 */
export interface SearchParams {
	/** Number of results to return */
	_count?: number;
	/** Pagination offset */
	_offset?: number;
	/** Include related resources */
	_include?: string | string[];
	/** Reverse include */
	_revinclude?: string | string[];
	/** Summary mode */
	_summary?: 'true' | 'false' | 'text' | 'data' | 'count';
	/** Elements to include */
	_elements?: string | string[];
	/** Any other FHIR search parameters */
	[key: string]: any;
}

/**
 * Response type for create operations
 */
export interface CreateResponse<T extends keyof ResourceTypeMap> {
	/** The created resource */
	resource: ResourceTypeMap[T];
	/** Response status code */
	status: number;
	/** Response headers */
	headers: Headers;
}

/**
 * Response type for read operations
 */
export interface ReadResponse<T extends keyof ResourceTypeMap> {
	/** The retrieved resource */
	resource: ResourceTypeMap[T];
	/** Response status code */
	status: number;
	/** Response headers */
	headers: Headers;
}

/**
 * Response type for update operations
 */
export interface UpdateResponse<T extends keyof ResourceTypeMap> {
	/** The updated resource */
	resource: ResourceTypeMap[T];
	/** Response status code */
	status: number;
	/** Response headers */
	headers: Headers;
}

/**
 * Response type for delete operations
 */
export interface DeleteResponse {
	/** Response status code */
	status: number;
	/** Response headers */
	headers: Headers;
}

/**
 * Response type for search operations
 */
export interface SearchResponse<T extends keyof ResourceTypeMap> {
	/** The search result bundle */
	bundle: Bundle<ResourceTypeMap[T]>;
	/** Response status code */
	status: number;
	/** Response headers */
	headers: Headers;
}

/**
 * FHIR operation outcome for errors
 */
export interface FHIRError extends Error {
	/** FHIR OperationOutcome */
	operationOutcome?: import('../types').OperationOutcome;
	/** HTTP status code */
	status?: number;
	/** Response headers */
	headers?: Headers;
}`;

		return {
			filename: "client-types.ts",
			content,
			exports: [
				"HTTPMethod",
				`${this.options.clientName}Config`,
				"RequestOptions",
				"SearchParams",
				"CreateResponse",
				"ReadResponse",
				"UpdateResponse",
				"DeleteResponse",
				"SearchResponse",
				"FHIRError",
			],
		};
	}

	/**
	 * Generate error handling code
	 */
	private generateErrorHandling(): string {
		return `let response: Response;
		let retryCount = 0;
		
		while (retryCount <= this.config.retries) {
			try {
				response = await fetch(url, requestOptions);
				break;
			} catch (error) {
				if (retryCount === this.config.retries) {
					throw error;
				}
				retryCount++;
				await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
			}
		}`;
	}

	/**
	 * Generate error handling methods
	 */
	private generateErrorHandlingMethods(): string {
		return `
	/**
	 * Handle error responses from the FHIR server
	 */
	private async handleErrorResponse(response: Response): Promise<never> {
		let operationOutcome: any;
		
		try {
			const contentType = response.headers.get('content-type');
			if (contentType?.includes('application/json') || contentType?.includes('application/fhir+json')) {
				operationOutcome = await response.json();
			}
		} catch {
			// Ignore JSON parsing errors
		}

		const error = new Error(\`HTTP \${response.status}: \${response.statusText}\`) as any;
		error.status = response.status;
		error.headers = response.headers;
		error.operationOutcome = operationOutcome;

		throw error;
	}`;
	}

	/**
	 * Set output directory
	 */
	setOutputDir(directory: string): void {
		this.options.outputDir = directory;
	}

	/**
	 * Update generator options
	 */
	setOptions(options: Partial<RestClientOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Get current options
	 */
	getOptions(): RestClientOptions {
		return { ...this.options };
	}

	/**
	 * Generate enhanced search parameters file
	 */
	private async generateEnhancedSearchParamsFile(): Promise<
		Omit<GeneratedRestClient, "path">
	> {
		const content = this.searchParameterEnhancer.generateEnhancedSearchTypes();

		const baseExports = [
			"EnhancedSearchParams",
			"SearchParameterValidator",
			"SearchModifiers",
			"BaseEnhancedSearchParams",
			// Add all resource-specific search param interfaces
			...Array.from(this.resourceTypes)
				.sort()
				.map((type) => `${type}SearchParams`),
		];

		// If autocomplete is enabled, also export the search param name unions
		const autocompleteExports = (this.options as any).searchAutocomplete
			? [
					"BaseSearchParamName",
					"SearchParamName",
					...Array.from(this.resourceTypes)
						.sort()
						.map((type) => `${type}SearchParamName`),
				]
			: [];

		const valueSetEnumExports = (this.options as any).generateValueSetEnums
			? ["PatientGender", "ObservationStatus", "ImmunizationStatus"]
			: [];

		return {
			filename: "enhanced-search-params.ts",
			content,
			exports: [...baseExports, ...autocompleteExports, ...valueSetEnumExports],
		};
	}

	/**
	 * Generate validation configuration fields
	 */
	private generateValidationConfigFields(): string {
		if (this.options.includeValidation || this.options.generateValidators) {
			return `
	/** Client-side validation options */
	validation?: {
		/** Enable client-side validation (default: false) */
		enabled?: boolean;
		/** Validation profile to use (default: 'strict') */
		profile?: 'strict' | 'lenient' | 'minimal';
		/** Whether to throw on validation errors (default: false) */
		throwOnError?: boolean;
		/** Whether to validate before sending requests (default: true) */
		validateBeforeRequest?: boolean;
		/** Whether to validate received responses (default: false) */
		validateResponses?: boolean;
	};`;
		}
		return "";
	}

	/**
	 * Generate validation types file
	 */
	private async generateValidationTypesFile(): Promise<
		Omit<GeneratedRestClient, "path">
	> {
		const content = this.validationGenerator.generateValidationTypes();

		return {
			filename: "validation-types.ts",
			content,
			exports: [
				"ValidationOptions",
				"ValidationError",
				"ValidationWarning",
				"ValidationResult",
				"ValidationException",
			],
		};
	}

	/**
	 * Generate resource validators file
	 */
	private async generateValidatorsFile(): Promise<
		Omit<GeneratedRestClient, "path">
	> {
		const content = this.validationGenerator.generateResourceValidators();

		return {
			filename: "resource-validators.ts",
			content,
			exports: [
				"ResourceValidator",
				...Array.from(this.resourceTypes)
					.sort()
					.map((type) => `validate${type}`),
			],
		};
	}

	/**
	 * Generate CRUD methods with conditional validation support
	 */
	private generateCRUDMethods(): string {
		const validationEnabled =
			this.options.includeValidation || this.options.generateValidators;

		return `	/**
	 * Create a new FHIR resource
	 */
	async create<T extends ResourceTypes>(
		resource: ResourceTypeMap[T], 
		options?: RequestOptions
	): Promise<CreateResponse<ResourceTypeMap[T]>> {
		const resourceType = resource.resourceType as T;
		const url = \`\${this.baseUrl}/\${resourceType}\`;
		
		${validationEnabled ? this.generateValidationCode("create", "resource") : ""}
		
		return this.request<ResourceTypeMap[T]>('POST', url, resource, options);
	}

	/**
	 * Read a FHIR resource by ID
	 */
	async read<T extends ResourceTypes>(
		resourceType: T,
		id: string,
		options?: RequestOptions
	): Promise<ReadResponse<ResourceTypeMap[T]>> {
		const url = \`\${this.baseUrl}/\${resourceType}/\${id}\`;
		
		return this.request<ResourceTypeMap[T]>('GET', url, undefined, options);
	}

	/**
	 * Update a FHIR resource
	 */
	async update<T extends ResourceTypes>(
		resource: ResourceTypeMap[T],
		options?: RequestOptions
	): Promise<UpdateResponse<ResourceTypeMap[T]>> {
		const resourceType = resource.resourceType as T;
		const id = (resource as any).id;
		
		if (!id) {
			throw new Error('Resource must have an id to be updated');
		}

		const url = \`\${this.baseUrl}/\${resourceType}/\${id}\`;
		
		${validationEnabled ? this.generateValidationCode("update", "resource") : ""}
		
		return this.request<ResourceTypeMap[T]>('PUT', url, resource, options);
	}

	/**
	 * Delete a FHIR resource
	 */
	async delete<T extends ResourceTypes>(
		resourceType: T,
		id: string,
		options?: RequestOptions
	): Promise<DeleteResponse> {
		const url = \`\${this.baseUrl}/\${resourceType}/\${id}\`;
		
		return this.request<void>('DELETE', url, undefined, options);
	}`;
	}

	/**
	 * Generate validation code for CRUD operations
	 */
	private generateValidationCode(
		operation: string,
		resourceVar: string,
	): string {
		return `// Client-side validation if enabled
		if (this.config.validation?.enabled && this.config.validation?.validateBeforeRequest) {
			const validationResult = ResourceValidator.validate(${resourceVar}, {
				profile: this.config.validation.profile || 'strict',
				throwOnError: this.config.validation.throwOnError || false,
				validateRequired: true,
				validateTypes: true,
				validateConstraints: true
			});
			
			if (!validationResult.valid && this.config.validation.throwOnError) {
				throw new ValidationException(validationResult);
			} else if (!validationResult.valid) {
				console.warn(\`Validation warnings for \${operation}:\`, validationResult.errors);
			}
		}`;
	}

	/**
	 * Generate the search method with conditional enhanced search support
	 */
	private generateSearchMethod(): string {
		if (this.options.enhancedSearch) {
			const autocompleteOverload = (this.options as any).searchAutocomplete
				? `\n\tasync search<T extends ResourceTypes>(\n\t\tresourceType: T,\n\t\tparams?: Partial<Record<SearchParamName<T>, any>> & BaseEnhancedSearchParams,\n\t\toptions?: RequestOptions\n\t): Promise<SearchResponse<ResourceTypeMap[T]>>;`
				: "";
			return `\t/**
\t * Search for FHIR resources
\t */
\tasync search<T extends ResourceTypes>(
\t\tresourceType: T,
\t\tparams?: EnhancedSearchParams<T>,
\t\toptions?: RequestOptions
\t): Promise<SearchResponse<ResourceTypeMap[T]>>;${autocompleteOverload}
\tasync search<T extends ResourceTypes>(
\t\tresourceType: T,
\t\tparams?: SearchParams,
\t\toptions?: RequestOptions
\t): Promise<SearchResponse<ResourceTypeMap[T]>>;
\tasync search<T extends ResourceTypes>(
\t\tresourceType: T,
\t\tparams?: any,
\t\toptions?: RequestOptions
\t): Promise<SearchResponse<ResourceTypeMap[T]>> {
\t\tlet url = \`\${this.baseUrl}/\${resourceType}\`;
\t\t
\t\tif (params && Object.keys(params).length > 0) {
\t\t\tlet searchParams: URLSearchParams | undefined;
\t\t\ttry {
\t\t\t\tconst validation = SearchParameterValidator.validate(resourceType, params);
\t\t\t\tif (validation.valid) {
\t\t\t\t\tsearchParams = SearchParameterValidator.buildSearchParams(resourceType, params);
\t\t\t\t}
\t\t\t} catch {}
\t\t\tif (!searchParams) {
\t\t\t\tsearchParams = new URLSearchParams();
\t\t\t\tfor (const [key, value] of Object.entries(params)) {
\t\t\t\t\tif (Array.isArray(value)) {
\t\t\t\t\t\tvalue.forEach((v) => searchParams!.append(key, String(v)));
\t\t\t\t\t} else if (value !== undefined) {
\t\t\t\t\t\tsearchParams.append(key, String(value));
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t\turl += \`?\${searchParams.toString()}\`;
\t\t}
\t\t
\t\treturn this.request<Bundle<ResourceTypeMap[T]>>('GET', url, undefined, options);
\t}`;
		}
		// Non-enhanced search: keep original behavior
		const paramHandling = this.generateSearchParameterHandlingCode();
		return `\t/**
\t * Search for FHIR resources
\t */
\tasync search<T extends ResourceTypes>(
\t\tresourceType: T,
\t\tparams?: SearchParams,
\t\toptions?: RequestOptions
\t): Promise<SearchResponse<ResourceTypeMap[T]>> {
\t\tlet url = \`\${this.baseUrl}/\${resourceType}\`;
\t\t
\t\tif (params && Object.keys(params).length > 0) {
\t\t\t${paramHandling}
\t\t\turl += \`?\${searchParams.toString()}\`;
\t\t}
\t\t
\t\treturn this.request<Bundle<ResourceTypeMap[T]>>('GET', url, undefined, options);
\t}`;
	}

	/**
	 * Generate validation methods for the client
	 */
	private generateValidationMethods(): string {
		if (this.options.includeValidation || this.options.generateValidators) {
			return `

	/**
	 * Validate a FHIR resource without sending it to the server
	 */
	validate<T extends ResourceTypes>(
		resource: ResourceTypeMap[T],
		options?: ValidationOptions
	): ValidationResult {
		return ResourceValidator.validate(resource, options);
	}

	/**
	 * Check if validation is enabled for this client
	 */
	isValidationEnabled(): boolean {
		return this.config.validation?.enabled || false;
	}

	/**
	 * Update validation configuration
	 */
	updateValidationConfig(validationConfig: NonNullable<${this.options.clientName}Config['validation']>): void {
		this.config.validation = { ...this.config.validation, ...validationConfig };
	}`;
		}
		return "";
	}

	/**
	 * Generate search parameter handling code based on configuration
	 */
	private generateSearchParameterHandlingCode(): string {
		if (this.options.enhancedSearch) {
			return `// Use enhanced search parameter validation and building
			const validation = SearchParameterValidator.validate(resourceType, params);
			if (!validation.valid) {
				throw new Error(\`Invalid search parameters: \${validation.errors.join(', ')}\`);
			}
			
			const searchParams = SearchParameterValidator.buildSearchParams(resourceType, params);`;
		} else {
			return `const searchParams = new URLSearchParams();
			for (const [key, value] of Object.entries(params)) {
				if (Array.isArray(value)) {
					value.forEach(v => searchParams.append(key, String(v)));
				} else if (value !== undefined) {
					searchParams.append(key, String(value));
				}
			}`;
		}
	}

	/**
	 * Generate utility file with ResourceTypeMap
	 */
	private async generateUtilityFile(): Promise<
		Omit<GeneratedRestClient, "path">
	> {
		const resourceTypesArray = Array.from(this.resourceTypes).sort();

		const content = `/**
 * Utility types for FHIR REST Client
 * 
 * Shared type definitions and utilities.
 */

// Import all the resource types
${resourceTypesArray.map((type) => `import type { ${type} } from '../types/${type}';`).join("\n")}

export type ResourceTypes = ${resourceTypesArray.map((type) => `'${type}'`).join(" | ")};

/**
 * Resource type mapping from resource type strings to interfaces
 */
export type ResourceTypeMap = {
${resourceTypesArray.map((type) => `  '${type}': ${type};`).join("\n")}
};
`;

		return {
			filename: "utility.ts",
			content: content,
			exports: ["ResourceTypes", "ResourceTypeMap", ...resourceTypesArray],
		};
	}

	private async ensureDirectoryExists(filePath: string): Promise<void> {
		const dir = dirname(filePath);
		await mkdir(dir, { recursive: true });
	}
}
