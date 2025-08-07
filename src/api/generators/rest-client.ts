/**
 * High-Level REST API Client Generator
 *
 * Generates REST API client code from TypeSchema documents for FHIR resources.
 * Supports both TypeScript and JavaScript with various HTTP client libraries.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	extractAllSearchParameters,
	generateSearchParameterTypes,
} from "../../fhir/search-parameters";
import type { TypeSchemaGenerator } from "../../typeschema/generator";
import type { AnyTypeSchema, TypeSchema } from "../../typeschema/types";

/**
 * Options for the REST API client generator
 */
export interface RESTClientAPIOptions {
	outputDir: string;
	language?: "typescript" | "javascript";
	httpClient?: "fetch" | "axios" | "node-fetch";
	generateTypes?: boolean;
	includeValidation?: boolean;
	baseUrl?: string;
	apiVersion?: string;
	authentication?: "bearer" | "basic" | "none";
}

/**
 * Generated REST client file result
 */
export interface GeneratedRESTClientFile {
	path: string;
	filename: string;
	content: string;
	exports: string[];
}

/**
 * High-Level REST API Client Generator
 *
 * Generates type-safe REST API clients for FHIR resources with full CRUD operations
 * and search capabilities.
 */
export class RESTClientAPIGenerator {
	private options: Required<RESTClientAPIOptions>;

	constructor(options: RESTClientAPIOptions) {
		this.options = {
			language: "typescript",
			httpClient: "fetch",
			generateTypes: true,
			includeValidation: false,
			baseUrl: "https://api.example.com/fhir/R4",
			apiVersion: "R4",
			authentication: "none",
			...options,
		};
	}

	/**
	 * Generate REST client files from TypeSchema documents
	 */
	async generate(
		schemas: AnyTypeSchema[],
		generator?: TypeSchemaGenerator,
	): Promise<GeneratedRESTClientFile[]> {
		const generatedFiles: GeneratedRESTClientFile[] = [];

		// Ensure output directory exists
		await mkdir(this.options.outputDir, { recursive: true });

		// Filter to only resources
		const resources = schemas.filter(
			(schema) => schema.identifier.kind === "resource",
		) as TypeSchema[];

		// Generate search parameter types if generator provided and TypeScript
		let searchParametersMap: Map<string, any> | undefined;
		if (generator && this.options.language === "typescript") {
			searchParametersMap = await extractAllSearchParameters(generator);
			const searchTypesContent =
				generateSearchParameterTypes(searchParametersMap);

			const searchTypesPath = join(this.options.outputDir, "search-types.ts");
			await writeFile(searchTypesPath, searchTypesContent, "utf-8");
			generatedFiles.push({
				path: searchTypesPath,
				filename: "search-types.ts",
				content: searchTypesContent,
				exports: [],
			});
		}

		// Generate single generic FHIR client
		const clientFile = await this.generateGenericFHIRClient(
			resources,
			searchParametersMap,
		);
		const clientPath = join(
			this.options.outputDir,
			`fhir-client.${this.getFileExtension()}`,
		);
		await this.ensureDirectoryExists(clientPath);
		await writeFile(clientPath, clientFile.content, "utf-8");
		generatedFiles.push({
			path: clientPath,
			filename: `fhir-client.${this.getFileExtension()}`,
			content: clientFile.content,
			exports: clientFile.exports,
		});

		// Generate types if TypeScript and requested
		if (this.options.language === "typescript" && this.options.generateTypes) {
			const typesFile = await this.generateClientTypes(resources);
			const typesPath = join(this.options.outputDir, "types.ts");
			await writeFile(typesPath, typesFile.content, "utf-8");
			generatedFiles.push({
				path: typesPath,
				filename: "types.ts",
				content: typesFile.content,
				exports: typesFile.exports,
			});
		}

		// Generate package.json
		const packageJsonFile = await this.generatePackageJson();
		const packagePath = join(this.options.outputDir, "package.json");
		await writeFile(packagePath, packageJsonFile, "utf-8");
		generatedFiles.push({
			path: packagePath,
			filename: "package.json",
			content: packageJsonFile,
			exports: [],
		});

		return generatedFiles;
	}

	/**
	 * Generate and return results without writing to files
	 */
	async build(schemas: AnyTypeSchema[]): Promise<GeneratedRESTClientFile[]> {
		const generatedFiles: GeneratedRESTClientFile[] = [];

		// Filter to only resources
		const resources = schemas.filter(
			(schema) => schema.identifier.kind === "resource",
		) as TypeSchema[];

		// Generate single generic FHIR client
		const clientFile = await this.generateGenericFHIRClient(resources);
		generatedFiles.push({
			path: join(
				this.options.outputDir,
				`fhir-client.${this.getFileExtension()}`,
			),
			filename: `fhir-client.${this.getFileExtension()}`,
			content: clientFile.content,
			exports: clientFile.exports,
		});

		return generatedFiles;
	}

	/**
	 * Set output directory
	 */
	setOutputDir(directory: string): void {
		this.options.outputDir = directory;
	}

	// Private implementation methods

	private generateBasicSearchBuilder(lines: string[]): void {
		lines.push("/**");
		lines.push(" * Basic FHIR search builder with fluent API");
		lines.push(
			" * Provides basic search functionality without full type safety",
		);
		lines.push(" */");
		lines.push(
			"class BasicSearchBuilder implements PromiseLike<FHIRResponse<Bundle<AnyResource>>> {",
		);
		lines.push("  private params: Record<string, any> = {};");
		lines.push("  private resourceType: string;");
		lines.push("  private client: FHIRClient;");
		lines.push("");
		lines.push("  constructor(client: FHIRClient, resourceType: string) {");
		lines.push("    this.client = client;");
		lines.push("    this.resourceType = resourceType;");
		lines.push("  }");
		lines.push("");
		lines.push("  /**");
		lines.push("   * Add a search parameter");
		lines.push("   */");
		lines.push("  where(param: string, value: any): BasicSearchBuilder {");
		lines.push(
			"    const newBuilder = new BasicSearchBuilder(this.client, this.resourceType);",
		);
		lines.push("    newBuilder.params = { ...this.params, [param]: value };");
		lines.push("    return newBuilder;");
		lines.push("  }");
		lines.push("");
		lines.push("  /**");
		lines.push("   * Set the number of resources to return");
		lines.push("   */");
		lines.push("  count(n: number): BasicSearchBuilder {");
		lines.push("    return this.where('_count', n);");
		lines.push("  }");
		lines.push("");
		lines.push("  /**");
		lines.push("   * Set pagination offset");
		lines.push("   */");
		lines.push("  offset(n: number): BasicSearchBuilder {");
		lines.push("    return this.where('_offset', n);");
		lines.push("  }");
		lines.push("");
		lines.push("  /**");
		lines.push("   * Sort results by a parameter");
		lines.push("   */");
		lines.push(
			"  sort(param: string, direction: 'asc' | 'desc' = 'asc'): BasicSearchBuilder {",
		);
		lines.push(
			"    const sortValue = direction === 'desc' ? `-${param}` : param;",
		);
		lines.push("    return this.where('_sort', sortValue);");
		lines.push("  }");
		lines.push("");
		lines.push("  /**");
		lines.push("   * Include related resources");
		lines.push("   */");
		lines.push("  include(include: string): BasicSearchBuilder {");
		lines.push("    const currentIncludes = this.params._include || [];");
		lines.push(
			"    const newIncludes = Array.isArray(currentIncludes) ? [...currentIncludes, include] : [currentIncludes, include];",
		);
		lines.push("    return this.where('_include', newIncludes);");
		lines.push("  }");
		lines.push("");
		lines.push("  /**");
		lines.push("   * Execute the search and return results");
		lines.push("   */");
		lines.push(
			"  async execute(): Promise<FHIRResponse<Bundle<AnyResource>>> {",
		);
		lines.push(
			"    return this.client.search(this.resourceType as ResourceType, this.params);",
		);
		lines.push("  }");
		lines.push("");
		lines.push("  /**");
		lines.push("   * Support for await syntax");
		lines.push("   */");
		lines.push(
			"  then<TResult1 = FHIRResponse<Bundle<AnyResource>>, TResult2 = never>(",
		);
		lines.push(
			"    onfulfilled?: ((value: FHIRResponse<Bundle<AnyResource>>) => TResult1 | PromiseLike<TResult1>) | null | undefined,",
		);
		lines.push(
			"    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined",
		);
		lines.push("  ): PromiseLike<TResult1 | TResult2> {");
		lines.push("    return this.execute().then(onfulfilled, onrejected);");
		lines.push("  }");
		lines.push("}");
		lines.push("");
	}

	private async generateGenericFHIRClient(
		resources: TypeSchema[],
		searchParametersMap?: Map<string, any>,
	): Promise<{ content: string; exports: string[] }> {
		const lines: string[] = [];
		const exports: string[] = [
			"FHIRClient",
			"ClientConfig",
			"HTTPMethod",
			"FHIRResponse",
			"FHIRError",
		];

		// Add header
		lines.push("/**");
		lines.push(" * Generic FHIR REST Client");
		lines.push(" * ");
		lines.push(
			" * Type-safe FHIR client that works with any resource using generics.",
		);
		lines.push(" * Generated from TypeSchema documents");
		lines.push(" */");
		lines.push("");

		// Add imports
		if (this.options.httpClient === "axios") {
			lines.push(
				"import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';",
			);
		} else if (this.options.httpClient === "node-fetch") {
			lines.push("import fetch, { RequestInit, Response } from 'node-fetch';");
		}

		// Import types from the types folder
		if (this.options.language === "typescript" && this.options.generateTypes) {
			lines.push("import type * as FHIR from '../types';");

			// Import search parameter types if available, otherwise use basic types
			if (searchParametersMap && searchParametersMap.size > 0) {
				lines.push(
					"import type { SearchParamsMap, ChainableParams } from './search-types';",
				);
				lines.push(
					"import { FHIRSearchBuilder, OperationBuilder } from '../../src/fhir/search-builder';",
				);
			} else {
				// Add basic search builder support even without full search parameter extraction
				lines.push("// Basic search parameter types");
				lines.push(
					"type BasicSearchParams = Record<string, string | number | boolean | string[]>;",
				);
				lines.push("");
			}
		}
		lines.push("");

		// Add types
		if (this.options.language === "typescript") {
			this.generateGenericClientTypes(lines, resources);
		}

		// Add BasicSearchBuilder class if TypeScript and no full search parameters
		if (
			this.options.language === "typescript" &&
			(!searchParametersMap || searchParametersMap.size === 0)
		) {
			this.generateBasicSearchBuilder(lines);
		}

		// Generate main client class
		this.generateGenericClientClass(lines, resources, searchParametersMap);

		return { content: lines.join("\n"), exports };
	}

	private generateGenericClientTypes(
		lines: string[],
		resources: TypeSchema[],
	): void {
		lines.push(
			'export type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";',
		);
		lines.push("");

		lines.push("export interface ClientConfig {");
		lines.push(`  baseUrl?: string;`);
		lines.push("  timeout?: number;");
		lines.push("  headers?: Record<string, string>;");
		if (this.options.authentication !== "none") {
			lines.push("  auth?: {");
			if (this.options.authentication === "bearer") {
				lines.push("    token: string;");
			} else if (this.options.authentication === "basic") {
				lines.push("    username: string;");
				lines.push("    password: string;");
			}
			lines.push("  };");
		}
		lines.push("}");
		lines.push("");

		lines.push("export interface FHIRResponse<T = any> {");
		lines.push("  data: T;");
		lines.push("  status: number;");
		lines.push("  headers: Record<string, string>;");
		lines.push("}");
		lines.push("");

		lines.push("export interface FHIRError {");
		lines.push("  message: string;");
		lines.push("  status?: number;");
		lines.push("  code?: string;");
		lines.push("  details?: any;");
		lines.push("}");
		lines.push("");

		// Generate resource type union
		lines.push("export type ResourceType = ");
		for (let i = 0; i < resources.length; i++) {
			const resource = resources[i];
			const isLast = i === resources.length - 1;
			lines.push(
				`  ${i === 0 ? "" : "| "}"${resource.identifier.name}"${isLast ? ";" : ""}`,
			);
		}
		lines.push("");

		// Generate union of all resource interfaces
		lines.push("export type AnyResource = ");
		for (let i = 0; i < resources.length; i++) {
			const resource = resources[i];
			const isLast = i === resources.length - 1;
			lines.push(
				`  ${i === 0 ? "" : "| "}FHIR.${resource.identifier.name}${isLast ? ";" : ""}`,
			);
		}
		lines.push("");

		// Bundle type for search results
		lines.push(
			"export interface Bundle<T extends AnyResource = AnyResource> {",
		);
		lines.push('  resourceType: "Bundle";');
		lines.push("  id?: string;");
		lines.push(
			'  type: "searchset" | "collection" | "transaction" | "batch" | "history" | "document" | "message";',
		);
		lines.push("  total?: number;");
		lines.push("  entry?: BundleEntry<T>[];");
		lines.push("  link?: BundleLink[];");
		lines.push("}");
		lines.push("");

		lines.push(
			"export interface BundleEntry<T extends AnyResource = AnyResource> {",
		);
		lines.push("  resource?: T;");
		lines.push("  fullUrl?: string;");
		lines.push("  search?: {");
		lines.push('    mode?: "match" | "include";');
		lines.push("    score?: number;");
		lines.push("  };");
		lines.push("}");
		lines.push("");

		lines.push("export interface BundleLink {");
		lines.push("  relation: string;");
		lines.push("  url: string;");
		lines.push("}");
		lines.push("");
	}

	private generateGenericClientClass(
		lines: string[],
		resources: TypeSchema[],
		searchParametersMap?: Map<string, any>,
	): void {
		const classDeclaration =
			this.options.language === "typescript"
				? "export class FHIRClient"
				: "class FHIRClient";

		lines.push("/**");
		lines.push(" * Generic FHIR REST Client");
		lines.push(" * ");
		lines.push(
			" * Type-safe client for FHIR resources with generic operations.",
		);
		lines.push(" * Usage:");
		lines.push(
			' *   const client = new FHIRClient({ baseUrl: "https://your-fhir-server.com" });',
		);
		lines.push(
			' *   const patient = await client.read<FHIR.Patient>("Patient", "123");',
		);
		lines.push(
			' *   const newPatient = await client.create<FHIR.Patient>("Patient", patientData);',
		);
		lines.push(
			' *   const patients = await client.search<FHIR.Patient>("Patient", { name: "John" });',
		);
		lines.push(" */");
		lines.push(`${classDeclaration} {`);

		// Private fields
		if (this.options.language === "typescript") {
			lines.push("  private baseUrl: string;");
			lines.push("  private timeout: number;");
			lines.push("  private headers: Record<string, string>;");
			if (this.options.httpClient === "axios") {
				lines.push("  private axiosInstance: AxiosInstance;");
			}
		}
		lines.push("");

		// Constructor
		const configParam =
			this.options.language === "typescript"
				? "config: ClientConfig = {}"
				: "config = {}";
		lines.push(`  constructor(${configParam}) {`);
		lines.push(
			`    this.baseUrl = config.baseUrl || '${this.options.baseUrl}';`,
		);
		lines.push("    this.timeout = config.timeout || 30000;");
		lines.push("    this.headers = {");
		lines.push("      'Content-Type': 'application/fhir+json',");
		lines.push("      'Accept': 'application/fhir+json',");
		lines.push("      ...config.headers,");
		lines.push("    };");
		lines.push("");

		if (this.options.authentication !== "none") {
			lines.push("    if (config.auth) {");
			if (this.options.authentication === "bearer") {
				lines.push(
					"      this.headers['Authorization'] = `Bearer ${config.auth.token}`;",
				);
			} else if (this.options.authentication === "basic") {
				lines.push(
					"      const credentials = btoa(`${config.auth.username}:${config.auth.password}`);",
				);
				lines.push(
					"      this.headers['Authorization'] = `Basic ${credentials}`;",
				);
			}
			lines.push("    }");
			lines.push("");
		}

		if (this.options.httpClient === "axios") {
			lines.push("    this.axiosInstance = axios.create({");
			lines.push("      baseURL: this.baseUrl,");
			lines.push("      timeout: this.timeout,");
			lines.push("      headers: this.headers,");
			lines.push("    });");
		}

		lines.push("  }");
		lines.push("");

		// Generate generic CRUD methods
		this.generateGenericCRUDMethods(lines, searchParametersMap);

		// Generate core HTTP request method
		this.generateRequestMethod(lines);

		// Generate error handling
		this.generateErrorHandling(lines);

		lines.push("}");
		lines.push("");

		// CommonJS export if needed
		if (this.options.language === "javascript") {
			lines.push("module.exports = { FHIRClient };");
		}
	}

	private generateGenericCRUDMethods(
		lines: string[],
		searchParametersMap?: Map<string, any>,
	): void {
		const isTS = this.options.language === "typescript";

		// CREATE method
		lines.push("  /**");
		lines.push("   * Create a new FHIR resource");
		lines.push(
			'   * @param resourceType - The FHIR resource type (e.g., "Patient", "Observation")',
		);
		lines.push("   * @param resource - The resource data to create");
		lines.push("   * @returns Promise<FHIRResponse<T>> - The created resource");
		lines.push("   */");
		if (isTS) {
			lines.push("  async create<T extends AnyResource>(");
			lines.push("    resourceType: ResourceType,");
			lines.push("    resource: T");
			lines.push("  ): Promise<FHIRResponse<T>> {");
		} else {
			lines.push("  async create(resourceType, resource) {");
		}
		lines.push('    return this.request("POST", resourceType, resource);');
		lines.push("  }");
		lines.push("");

		// READ method
		lines.push("  /**");
		lines.push("   * Read a FHIR resource by ID");
		lines.push(
			'   * @param resourceType - The FHIR resource type (e.g., "Patient", "Observation")',
		);
		lines.push("   * @param id - The resource ID");
		lines.push(
			"   * @returns Promise<FHIRResponse<T>> - The requested resource",
		);
		lines.push("   */");
		if (isTS) {
			lines.push("  async read<T extends AnyResource>(");
			lines.push("    resourceType: ResourceType,");
			lines.push("    id: string");
			lines.push("  ): Promise<FHIRResponse<T>> {");
		} else {
			lines.push("  async read(resourceType, id) {");
		}
		lines.push('    return this.request("GET", `${resourceType}/${id}`);');
		lines.push("  }");
		lines.push("");

		// UPDATE method
		lines.push("  /**");
		lines.push("   * Update a FHIR resource");
		lines.push(
			'   * @param resourceType - The FHIR resource type (e.g., "Patient", "Observation")',
		);
		lines.push("   * @param id - The resource ID to update");
		lines.push("   * @param resource - The updated resource data");
		lines.push("   * @returns Promise<FHIRResponse<T>> - The updated resource");
		lines.push("   */");
		if (isTS) {
			lines.push("  async update<T extends AnyResource>(");
			lines.push("    resourceType: ResourceType,");
			lines.push("    id: string,");
			lines.push("    resource: T");
			lines.push("  ): Promise<FHIRResponse<T>> {");
		} else {
			lines.push("  async update(resourceType, id, resource) {");
		}
		lines.push(
			'    return this.request("PUT", `${resourceType}/${id}`, resource);',
		);
		lines.push("  }");
		lines.push("");

		// DELETE method
		lines.push("  /**");
		lines.push("   * Delete a FHIR resource");
		lines.push(
			'   * @param resourceType - The FHIR resource type (e.g., "Patient", "Observation")',
		);
		lines.push("   * @param id - The resource ID to delete");
		lines.push(
			"   * @returns Promise<FHIRResponse<any>> - The deletion response",
		);
		lines.push("   */");
		if (isTS) {
			lines.push("  async delete(");
			lines.push("    resourceType: ResourceType,");
			lines.push("    id: string");
			lines.push("  ): Promise<FHIRResponse<any>> {");
		} else {
			lines.push("  async delete(resourceType, id) {");
		}
		lines.push('    return this.request("DELETE", `${resourceType}/${id}`);');
		lines.push("  }");
		lines.push("");

		// SEARCH method
		lines.push("  /**");
		lines.push("   * Search for FHIR resources");
		lines.push(
			'   * @param resourceType - The FHIR resource type to search (e.g., "Patient", "Observation")',
		);
		lines.push("   * @param params - Search parameters as key-value pairs");
		lines.push(
			"   * @returns Promise<FHIRResponse<Bundle<T>>> - Search results in a Bundle",
		);
		lines.push("   */");
		if (isTS) {
			lines.push("  async search<T extends AnyResource>(");
			lines.push("    resourceType: ResourceType,");
			lines.push("    params?: Record<string, string | number | boolean>");
			lines.push("  ): Promise<FHIRResponse<Bundle<T>>> {");
		} else {
			lines.push("  async search(resourceType, params) {");
		}
		lines.push("    const query = params ? new URLSearchParams(");
		lines.push("      Object.entries(params).map(([k, v]) => [k, String(v)])");
		lines.push('    ).toString() : "";');
		lines.push(
			'    return this.request("GET", `${resourceType}${query ? `?${query}` : ""}`);',
		);
		lines.push("  }");
		lines.push("");

		// Add search builder methods if TypeScript
		if (this.options.language === "typescript") {
			if (searchParametersMap?.size > 0) {
				// Full type-safe version with generated search parameters
				lines.push("  /**");
				lines.push(
					"   * Start a type-safe search builder for the specified resource type",
				);
				lines.push(
					"   * @param resourceType - The FHIR resource type to search",
				);
				lines.push(
					"   * @returns FHIRSearchBuilder - A fluent search builder with type safety",
				);
				lines.push("   * @example");
				lines.push(
					'   * const patients = await client.searchBuilder("Patient")',
				);
				lines.push('   *   .where("name", "Smith")');
				lines.push('   *   .where("active", true)');
				lines.push("   *   .count(10);");
				lines.push("   */");
				lines.push(
					"  searchBuilder<T extends keyof SearchParamsMap>(resourceType: T): FHIRSearchBuilder<T> {",
				);
				lines.push("    return new FHIRSearchBuilder(this, resourceType);");
				lines.push("  }");
				lines.push("");

				lines.push("  /**");
				lines.push(
					"   * Start an operation builder for the specified resource type",
				);
				lines.push("   * @param resourceType - The FHIR resource type");
				lines.push(
					"   * @param id - Optional resource ID for instance-level operations",
				);
				lines.push(
					"   * @returns OperationBuilder - A builder for executing FHIR operations",
				);
				lines.push("   * @example");
				lines.push(
					'   * const result = await client.operation("Patient", "123")',
				);
				lines.push("   *   .$everything({ _count: 50 });");
				lines.push("   */");
				lines.push(
					"  operation<T extends keyof SearchParamsMap>(resourceType: T, id?: string): OperationBuilder<T> {",
				);
				lines.push("    return new OperationBuilder(this, resourceType, id);");
				lines.push("  }");
				lines.push("");
			} else {
				// Basic version with minimal type safety
				lines.push("  /**");
				lines.push(
					"   * Start a search builder for the specified resource type",
				);
				lines.push(
					"   * @param resourceType - The FHIR resource type to search",
				);
				lines.push("   * @returns BasicSearchBuilder - A basic search builder");
				lines.push("   * @example");
				lines.push(
					'   * const patients = await client.searchBuilder("Patient")',
				);
				lines.push('   *   .where("name", "Smith")');
				lines.push('   *   .where("active", true)');
				lines.push("   *   .count(10);");
				lines.push("   */");
				lines.push(
					"  searchBuilder(resourceType: ResourceType): BasicSearchBuilder {",
				);
				lines.push("    return new BasicSearchBuilder(this, resourceType);");
				lines.push("  }");
				lines.push("");
			}
		}

		// PATCH method for partial updates
		lines.push("  /**");
		lines.push("   * Partially update a FHIR resource using JSON Patch");
		lines.push(
			'   * @param resourceType - The FHIR resource type (e.g., "Patient", "Observation")',
		);
		lines.push("   * @param id - The resource ID to patch");
		lines.push("   * @param patch - JSON Patch operations");
		lines.push("   * @returns Promise<FHIRResponse<T>> - The patched resource");
		lines.push("   */");
		if (isTS) {
			lines.push("  async patch<T extends AnyResource>(");
			lines.push("    resourceType: ResourceType,");
			lines.push("    id: string,");
			lines.push("    patch: any[]");
			lines.push("  ): Promise<FHIRResponse<T>> {");
		} else {
			lines.push("  async patch(resourceType, id, patch) {");
		}
		lines.push(
			'    return this.request("PATCH", `${resourceType}/${id}`, patch);',
		);
		lines.push("  }");
		lines.push("");
	}

	private generateRequestMethod(lines: string[]): void {
		const genericParam =
			this.options.language === "typescript" ? "<T = any>" : "";
		const returnType =
			this.options.language === "typescript"
				? ": Promise<FHIRResponse<T>>"
				: "";

		lines.push("  /**");
		lines.push("   * Core request method");
		lines.push("   */");
		lines.push(`  private async request${genericParam}(`);
		lines.push(
			`    method${this.options.language === "typescript" ? ": HTTPMethod" : ""},`,
		);
		lines.push(
			`    url${this.options.language === "typescript" ? ": string" : ""},`,
		);
		lines.push(
			`    data${this.options.language === "typescript" ? "?: any" : ""}`,
		);
		lines.push(`  )${returnType} {`);

		if (this.options.httpClient === "axios") {
			this.generateAxiosRequest(lines);
		} else {
			this.generateFetchRequest(lines);
		}

		lines.push("  }");
	}

	private generateAxiosRequest(lines: string[]): void {
		lines.push("    try {");
		lines.push("      const config = {");
		lines.push("        method: method.toLowerCase(),");
		lines.push("        url,");
		lines.push("        data,");
		lines.push("      };");
		lines.push("");
		lines.push(
			"      const response = await this.axiosInstance.request(config);",
		);
		lines.push("      return {");
		lines.push("        data: response.data,");
		lines.push("        status: response.status,");
		lines.push("        headers: response.headers,");
		lines.push("      };");
		lines.push("    } catch (error) {");
		lines.push("      throw this.handleError(error);");
		lines.push("    }");
	}

	private generateFetchRequest(lines: string[]): void {
		lines.push("    try {");
		lines.push(
			`      const fullUrl = url.startsWith('http') ? url : \`\${this.baseUrl}/\${url}\`;`,
		);
		lines.push("      const init = {");
		lines.push("        method,");
		lines.push("        headers: this.headers,");
		lines.push("        body: data ? JSON.stringify(data) : undefined,");
		lines.push("      };");
		lines.push("");
		lines.push("      const response = await fetch(fullUrl, init);");
		lines.push("      const responseData = await response.json();");
		lines.push("");
		lines.push("      if (!response.ok) {");
		lines.push("        throw {");
		lines.push("          status: response.status,");
		lines.push(
			"          message: responseData?.issue?.[0]?.details?.text || response.statusText,",
		);
		lines.push("          details: responseData,");
		lines.push("        };");
		lines.push("      }");
		lines.push("");
		lines.push("      return {");
		lines.push("        data: responseData,");
		lines.push("        status: response.status,");
		lines.push(
			"        headers: Object.fromEntries(response.headers.entries()),",
		);
		lines.push("      };");
		lines.push("    } catch (error) {");
		lines.push("      throw this.handleError(error);");
		lines.push("    }");
	}

	private generateErrorHandling(lines: string[]): void {
		lines.push("  /**");
		lines.push("   * Handle and normalize errors");
		lines.push("   */");
		lines.push("  private handleError(error: any): FHIRError {");
		lines.push("    if (error.status) {");
		lines.push("      return {");
		lines.push('        message: error.message || "Request failed",');
		lines.push("        status: error.status,");
		lines.push("        details: error.details,");
		lines.push("      };");
		lines.push("    }");
		lines.push("");
		lines.push("    return {");
		lines.push('      message: error.message || "Unknown error occurred",');
		lines.push("      details: error,");
		lines.push("    };");
		lines.push("  }");
		lines.push("");
	}

	private async generateClientTypes(
		resources: TypeSchema[],
	): Promise<{ content: string; exports: string[] }> {
		const lines: string[] = [];
		const exports: string[] = [];

		lines.push("/**");
		lines.push(" * TypeScript type definitions for REST client");
		lines.push(" * Generated from TypeSchema documents");
		lines.push(" */");
		lines.push("");

		// Re-export all resource types from the types folder
		for (const resource of resources) {
			lines.push(
				`export type { ${resource.identifier.name} } from '../types';`,
			);
			exports.push(resource.identifier.name);
		}

		return { content: lines.join("\n"), exports };
	}

	private async generatePackageJson(): Promise<string> {
		const packageJson = {
			name: "generated-fhir-rest-client",
			version: "1.0.0",
			description: "Generated FHIR REST API client",
			main: `fhir-client.${this.options.language === "typescript" ? "js" : "js"}`,
			types:
				this.options.language === "typescript" ? "fhir-client.d.ts" : undefined,
			type: "module",
			files: ["*.js", "*.d.ts", "**/*.js", "**/*.d.ts"],
			scripts: {
				build: this.options.language === "typescript" ? "tsc" : undefined,
				"type-check":
					this.options.language === "typescript" ? "tsc --noEmit" : undefined,
			},
			dependencies: {
				...(this.options.httpClient === "axios" ? { axios: "^1.0.0" } : {}),
				...(this.options.httpClient === "node-fetch"
					? { "node-fetch": "^3.0.0" }
					: {}),
			},
			devDependencies: {
				...(this.options.language === "typescript"
					? {
							typescript: "^5.0.0",
							"@types/node": "^20.0.0",
						}
					: {}),
				...(this.options.httpClient === "node-fetch"
					? { "@types/node-fetch": "^3.0.0" }
					: {}),
			},
			keywords: [
				"fhir",
				"rest",
				"api",
				"client",
				"healthcare",
				"ehr",
				"generated",
			],
			license: "MIT",
			author: "atomic-codegen",
		};

		return JSON.stringify(packageJson, null, 2);
	}

	// Utility methods

	private getFileExtension(): string {
		return this.options.language === "typescript" ? "ts" : "js";
	}

	private getFileName(name: string): string {
		return name.toLowerCase().replace(/[^a-z0-9]/gi, "-");
	}

	private async ensureDirectoryExists(filePath: string): Promise<void> {
		const dir = dirname(filePath);
		await mkdir(dir, { recursive: true });
	}
}
