/**
 * Enhanced FHIR REST Client Generator
 *
 * Generates a comprehensive, production-ready FHIR REST client with all enhanced features:
 * - Error handling with OperationOutcome support
 * - Retry strategies and circuit breakers
 * - Type-safe operations
 * - Batch and transaction builders
 * - Pagination with async iterators
 * - Conditional operations
 * - Interceptors system
 * - Caching with TTL and invalidation
 */

import type { AnyTypeSchema, TypeSchema } from "../../../typeschema/types";
import { generateBatchTransactionCode } from "./batch";
import { generateCachingCode } from "./caching";
import { generateConditionalOperationsCode } from "./conditional";
import {
	generateErrorHandlingCode,
	generateErrorTypes,
} from "./error-handling";
import { generateInterceptorCode } from "./interceptors";
import {
	generateOperationClasses,
	generateOperationSupportCode,
} from "./operations";
import { generatePaginationCode } from "./pagination";
import { generateRetryStrategyCode } from "./retry";

/**
 * Enhanced REST client generation options
 */
export interface EnhancedRestClientOptions {
	/** Client class name */
	className?: string;
	/** Include error handling */
	includeErrorHandling?: boolean;
	/** Include retry strategies */
	includeRetryStrategies?: boolean;
	/** Include operations support */
	includeOperations?: boolean;
	/** Include batch/transaction builders */
	includeBatchTransaction?: boolean;
	/** Include pagination helpers */
	includePagination?: boolean;
	/** Include conditional operations */
	includeConditionalOperations?: boolean;
	/** Include interceptors system */
	includeInterceptors?: boolean;
	/** Include caching support */
	includeCaching?: boolean;
	/** HTTP client library to use */
	httpClient?: "fetch" | "axios" | "node-fetch";
	/** Whether to generate TypeScript types */
	generateTypes?: boolean;
	/** Base URL for the FHIR server */
	baseUrl?: string;
	/** Authentication type */
	authentication?: "bearer" | "basic" | "none";
}

/**
 * Generate enhanced FHIR REST client
 */
export function generateEnhancedRestClient(
	schemas: AnyTypeSchema[],
	options: EnhancedRestClientOptions = {},
): string {
	const config: Required<EnhancedRestClientOptions> = {
		className: "EnhancedFHIRClient",
		includeErrorHandling: true,
		includeRetryStrategies: true,
		includeOperations: true,
		includeBatchTransaction: true,
		includePagination: true,
		includeConditionalOperations: true,
		includeInterceptors: true,
		includeCaching: true,
		httpClient: "fetch",
		generateTypes: true,
		baseUrl: "https://api.example.com/fhir/R4",
		authentication: "none",
		...options,
	};

	const resourceSchemas = schemas.filter(
		(schema) => schema.identifier.kind === "resource",
	) as TypeSchema[];

	const sections: string[] = [];

	// File header
	sections.push(generateFileHeader());

	// Imports
	sections.push(generateImports(config));

	// Types
	if (config.generateTypes) {
		sections.push(generateTypes(resourceSchemas, config));
	}

	// Main client class
	sections.push(generateMainClientClass(resourceSchemas, config));

	// Operation classes
	if (config.includeOperations) {
		sections.push(generateOperationClasses(resourceSchemas, {} as any));
	}

	// Export statements
	sections.push(generateExports(config));

	return sections.join("\n\n");
}

/**
 * Generate file header
 */
function generateFileHeader(): string {
	return `/**
 * Enhanced FHIR REST Client
 * 
 * A comprehensive, production-ready FHIR REST client with advanced features:
 * - Comprehensive error handling with OperationOutcome support
 * - Retry strategies with exponential backoff and circuit breaker
 * - Type-safe FHIR operations ($everything, $match, etc.)
 * - Batch and transaction builders with validation
 * - Pagination helpers with async iterators
 * - Conditional operations (create-if-not-exists, etc.)
 * - Request/response interceptors
 * - Intelligent caching with TTL and invalidation
 * 
 * Generated at: ${new Date().toISOString()}
 * 
 * WARNING: This file is auto-generated. Do not modify manually.
 */

/* eslint-disable */`;
}

/**
 * Generate imports
 */
function generateImports(config: Required<EnhancedRestClientOptions>): string {
	const imports: string[] = [];

	// HTTP client imports
	if (config.httpClient === "axios") {
		imports.push(
			"import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';",
		);
	} else if (config.httpClient === "node-fetch") {
		imports.push("import fetch, { RequestInit, Response } from 'node-fetch';");
	}

	// Enhanced component imports
	if (config.includeErrorHandling) {
		imports.push(`
import {
  FHIRError,
  FHIRErrorFactory,
  ErrorHandler,
  AuthRefreshStrategy,
  ValidationRecoveryStrategy,
} from './error-handling';`);
	}

	if (config.includeRetryStrategies) {
		imports.push(`
import {
  RetryStrategy,
  CircuitBreaker,
  ResilientExecutor,
  ExponentialBackoff,
  DefaultRetryConfigs,
  DefaultCircuitBreakerConfigs,
} from './retry';`);
	}

	if (config.includeOperations) {
		imports.push(`
import {
  OperationRegistry,
  OperationBuilder,
  OperationParameterBuilder,
} from './operations';`);
	}

	if (config.includeBatchTransaction) {
		imports.push(`
import {
  BatchBuilder,
  TransactionBuilder,
  BundleBuilderFactory,
} from './batch';`);
	}

	if (config.includePagination) {
		imports.push(`
import {
  PaginatedResults,
  PaginationConfig,
  PaginationUtils,
} from './pagination';`);
	}

	if (config.includeConditionalOperations) {
		imports.push(`
import {
  ConditionalOperations,
  ConditionalOperationsBuilder,
  ConditionalRequestOptions,
  ConditionalRequestResult,
} from './conditional';`);
	}

	if (config.includeInterceptors) {
		imports.push(`
import {
  InterceptorManager,
  Interceptor,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  AuthenticationInterceptor,
  LoggingInterceptor,
  RequestIdInterceptor,
  CachingInterceptor,
} from './interceptors';`);
	}

	if (config.includeCaching) {
		imports.push(`
import {
  FHIRCache,
  CacheConfig,
  CacheStats,
  CachedHTTPClient,
  CacheManager,
} from './caching';`);
	}

	return imports.join("\n");
}

/**
 * Generate TypeScript types
 */
function generateTypes(
	resourceSchemas: TypeSchema[],
	config: Required<EnhancedRestClientOptions>,
): string {
	const types: string[] = [];

	// Basic types
	types.push(`
/**
 * HTTP methods supported by the client
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Client configuration interface
 */
export interface EnhancedClientConfig {
  /** Base URL of the FHIR server */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Default headers to include with requests */
  headers?: Record<string, string>;
  /** Authentication configuration */
  auth?: {
    type: 'bearer' | 'basic' | 'custom';
    token?: string;
    username?: string;
    password?: string;
    customHeaders?: Record<string, string>;
  };
  /** Retry configuration */
  retry?: {
    maxAttempts?: number;
    backoffStrategy?: 'exponential' | 'linear' | 'fixed';
    initialDelay?: number;
    maxDelay?: number;
  };
  /** Circuit breaker configuration */
  circuitBreaker?: {
    enabled?: boolean;
    failureThreshold?: number;
    recoveryTimeout?: number;
  };
  /** Cache configuration */
  cache?: CacheConfig;
  /** Default interceptors to register */
  interceptors?: Interceptor[];
}`);

	// Resource types
	const resourceTypeUnion = resourceSchemas
		.map((schema) => `"${schema.identifier.name}"`)
		.join(" | ");

	types.push(`
/**
 * Union of all FHIR resource types
 */
export type ResourceType = ${resourceTypeUnion};

/**
 * Base FHIR resource interface
 */
export interface BaseResource {
  resourceType: ResourceType;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    profile?: string[];
    security?: any[];
    tag?: any[];
  };
}

/**
 * Union of all resource interfaces
 */
export type AnyResource = BaseResource;`);

	// Bundle types
	types.push(`
/**
 * FHIR Bundle resource
 */
export interface Bundle<T = AnyResource> {
  resourceType: 'Bundle';
  id?: string;
  meta?: any;
  type: 'document' | 'message' | 'transaction' | 'transaction-response' | 'batch' | 'batch-response' | 'history' | 'searchset' | 'collection' | 'subscription-notification';
  timestamp?: string;
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
}`);

	// Response interface
	types.push(`
/**
 * HTTP response wrapper
 */
export interface FHIRResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}`);

	// Error types
	if (config.includeErrorHandling) {
		types.push(generateErrorTypes());
	}

	return types.join("\n");
}

/**
 * Generate main client class
 */
function generateMainClientClass(
	_resourceSchemas: TypeSchema[],
	config: Required<EnhancedRestClientOptions>,
): string {
	const sections: string[] = [];

	// Class declaration
	sections.push(`
/**
 * Enhanced FHIR REST Client
 * 
 * A comprehensive client with advanced features for production FHIR applications.
 */
export class ${config.className} {`);

	// Private fields
	sections.push(generatePrivateFields(config));

	// Constructor
	sections.push(generateConstructor(config));

	// Core HTTP methods
	sections.push(generateCoreHTTPMethods(config));

	// CRUD methods
	sections.push(generateCRUDMethods(config));

	// Enhanced features
	if (config.includeOperations) {
		sections.push(generateOperationSupportCode());
	}

	if (config.includeBatchTransaction) {
		sections.push(generateBatchTransactionCode());
	}

	if (config.includePagination) {
		sections.push(generatePaginationCode());
	}

	if (config.includeConditionalOperations) {
		sections.push(generateConditionalOperationsCode());
	}

	if (config.includeInterceptors) {
		sections.push(generateInterceptorCode());
	}

	if (config.includeCaching) {
		sections.push(generateCachingCode());
	}

	if (config.includeRetryStrategies) {
		sections.push(generateRetryStrategyCode());
	}

	if (config.includeErrorHandling) {
		sections.push(generateErrorHandlingCode());
	}

	// Utility methods
	sections.push(generateUtilityMethods(config));

	// Close class
	sections.push("}");

	return sections.join("\n\n");
}

/**
 * Generate private fields
 */
function generatePrivateFields(
	config: Required<EnhancedRestClientOptions>,
): string {
	const fields: string[] = [
		"  private baseUrl: string;",
		"  private timeout: number;",
		"  private headers: Record<string, string>;",
	];

	if (config.httpClient === "axios") {
		fields.push("  private axiosInstance: AxiosInstance;");
	}

	if (config.includeRetryStrategies) {
		fields.push("  private retryStrategy?: RetryStrategy;");
		fields.push("  private circuitBreaker?: CircuitBreaker;");
		fields.push("  private resilientExecutor?: ResilientExecutor;");
	}

	if (config.includeErrorHandling) {
		fields.push("  private errorHandler = new ErrorHandler();");
	}

	return fields.join("\n");
}

/**
 * Generate constructor
 */
function generateConstructor(
	config: Required<EnhancedRestClientOptions>,
): string {
	return `  /**
   * Create a new enhanced FHIR client
   */
  constructor(config: EnhancedClientConfig = {}) {
    this.baseUrl = config.baseUrl?.replace(/\\/$/, '') || '${config.baseUrl}';
    this.timeout = config.timeout || 30000;
    this.headers = {
      'Content-Type': 'application/fhir+json',
      'Accept': 'application/fhir+json',
      ...config.headers,
    };

    // Setup authentication
    if (config.auth) {
      this.setupAuthentication(config.auth);
    }

    // Setup HTTP client
    this.setupHTTPClient();

    // Setup retry strategies
    if (config.retry) {
      this.setupRetryStrategies(config.retry);
    }

    // Setup circuit breaker
    if (config.circuitBreaker?.enabled) {
      this.setupCircuitBreaker(config.circuitBreaker);
    }

    // Setup caching
    if (config.cache) {
      this.enableCache(config.cache);
    }

    // Setup default interceptors
    this.setupDefaultInterceptors();
    
    // Register custom interceptors
    if (config.interceptors) {
      config.interceptors.forEach(interceptor => this.addInterceptor(interceptor));
    }
  }`;
}

/**
 * Generate core HTTP methods
 */
function generateCoreHTTPMethods(
	_config: Required<EnhancedRestClientOptions>,
): string {
	return `  /**
   * Core HTTP request method
   */
  private async request<T = any>(
    method: HTTPMethod,
    url: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<FHIRResponse<T>> {
    const fullUrl = url.startsWith('http') ? url : \`\${this.baseUrl}/\${url}\`;
    const requestHeaders = { ...this.headers, ...headers };

    const config: RequestInit = {
      method,
      headers: requestHeaders,
      body: data ? JSON.stringify(data) : undefined,
    };

    try {
      const response = await fetch(fullUrl, config);
      const responseData = response.status !== 204 ? await response.json() : null;

      if (!response.ok) {
        throw await FHIRErrorFactory.fromResponse(response, fullUrl);
      }

      return {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      if (error instanceof FHIRError) {
        throw error;
      }
      throw FHIRErrorFactory.fromNetworkError(error as Error, fullUrl);
    }
  }`;
}

/**
 * Generate CRUD methods
 */
function generateCRUDMethods(
	_config: Required<EnhancedRestClientOptions>,
): string {
	return `  /**
   * Create a new resource
   */
  async create<T extends AnyResource>(
    resourceType: ResourceType,
    resource: T
  ): Promise<FHIRResponse<T>> {
    return this.request<T>('POST', resourceType, resource);
  }

  /**
   * Read a resource by ID
   */
  async read<T extends AnyResource>(
    resourceType: ResourceType,
    id: string,
    options?: { versionId?: string }
  ): Promise<FHIRResponse<T>> {
    let url = \`\${resourceType}/\${id}\`;
    if (options?.versionId) {
      url += \`/_history/\${options.versionId}\`;
    }
    return this.request<T>('GET', url);
  }

  /**
   * Update a resource
   */
  async update<T extends AnyResource>(
    resourceType: ResourceType,
    id: string,
    resource: T
  ): Promise<FHIRResponse<T>> {
    return this.request<T>('PUT', \`\${resourceType}/\${id}\`, resource);
  }

  /**
   * Delete a resource
   */
  async delete(
    resourceType: ResourceType,
    id: string
  ): Promise<FHIRResponse<void>> {
    return this.request<void>('DELETE', \`\${resourceType}/\${id}\`);
  }

  /**
   * Search resources
   */
  async search<T extends AnyResource>(
    resourceType: ResourceType,
    params?: Record<string, any>
  ): Promise<FHIRResponse<Bundle<T>>> {
    const searchParams = params ? new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => 
        Array.isArray(v) ? v.map(val => [k, String(val)]) : [[k, String(v)]]
      )
    ).toString() : '';
    
    const url = searchParams ? \`\${resourceType}?\${searchParams}\` : resourceType;
    return this.request<Bundle<T>>('GET', url);
  }

  /**
   * Patch a resource
   */
  async patch<T extends AnyResource>(
    resourceType: ResourceType,
    id: string,
    patchOperations: any[]
  ): Promise<FHIRResponse<T>> {
    return this.request<T>('PATCH', \`\${resourceType}/\${id}\`, patchOperations, {
      'Content-Type': 'application/json-patch+json'
    });
  }`;
}

/**
 * Generate utility methods
 */
function generateUtilityMethods(
	_config: Required<EnhancedRestClientOptions>,
): string {
	return `  /**
   * Setup authentication
   */
  private setupAuthentication(auth: NonNullable<EnhancedClientConfig['auth']>): void {
    if (auth.type === 'bearer' && auth.token) {
      this.headers['Authorization'] = \`Bearer \${auth.token}\`;
    } else if (auth.type === 'basic' && auth.username && auth.password) {
      const credentials = btoa(\`\${auth.username}:\${auth.password}\`);
      this.headers['Authorization'] = \`Basic \${credentials}\`;
    } else if (auth.type === 'custom' && auth.customHeaders) {
      Object.assign(this.headers, auth.customHeaders);
    }
  }

  /**
   * Setup HTTP client
   */
  private setupHTTPClient(): void {
    // HTTP client setup is handled in the request method
  }

  /**
   * Setup retry strategies
   */
  private setupRetryStrategies(retryConfig: NonNullable<EnhancedClientConfig['retry']>): void {
    const strategy = retryConfig.backoffStrategy || 'exponential';
    const backoff = strategy === 'exponential' 
      ? new ExponentialBackoff({
          initialDelay: retryConfig.initialDelay,
          maxDelay: retryConfig.maxDelay
        })
      : strategy === 'linear'
      ? new LinearBackoff({
          baseDelay: retryConfig.initialDelay,
          maxDelay: retryConfig.maxDelay
        })
      : new FixedBackoff(retryConfig.initialDelay || 1000);

    this.retryStrategy = new RetryStrategy({
      maxAttempts: retryConfig.maxAttempts || 3,
      backoffStrategy: backoff,
      retryCondition: RetryConditions.retryableFHIRError
    });
  }

  /**
   * Setup circuit breaker
   */
  private setupCircuitBreaker(cbConfig: NonNullable<EnhancedClientConfig['circuitBreaker']>): void {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: cbConfig.failureThreshold || 5,
      recoveryTimeout: cbConfig.recoveryTimeout || 60000,
      monitoringPeriod: 300000,
      minimumRequests: 10,
      successThreshold: 3
    });

    if (this.retryStrategy && this.circuitBreaker) {
      this.resilientExecutor = new ResilientExecutor(this.retryStrategy, this.circuitBreaker);
    }
  }

  /**
   * Setup default interceptors
   */
  private setupDefaultInterceptors(): void {
    // Add request ID interceptor
    this.addRequestInterceptor(new RequestIdInterceptor());
    
    // Add basic logging interceptor
    this.addInterceptor(new LoggingInterceptor());
  }

  /**
   * Get client information
   */
  getInfo(): {
    baseUrl: string;
    timeout: number;
    hasRetryStrategy: boolean;
    hasCircuitBreaker: boolean;
    cacheEnabled: boolean;
    interceptorCount: number;
  } {
    return {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      hasRetryStrategy: !!this.retryStrategy,
      hasCircuitBreaker: !!this.circuitBreaker,
      cacheEnabled: !!this.getCache(),
      interceptorCount: this.interceptorManager?.getInterceptorNames().length || 0
    };
  }`;
}

/**
 * Generate exports
 */
function generateExports(config: Required<EnhancedRestClientOptions>): string {
	const exports: string[] = [
		`export { ${config.className} }`,
		"export type { EnhancedClientConfig, FHIRResponse, ResourceType, AnyResource, Bundle, HTTPMethod }",
	];

	if (config.includeErrorHandling) {
		exports.push("export { FHIRError, FHIRErrorFactory, ErrorHandler }");
	}

	if (config.includeRetryStrategies) {
		exports.push(
			"export { RetryStrategy, CircuitBreaker, ExponentialBackoff }",
		);
	}

	if (config.includeOperations) {
		exports.push("export { OperationBuilder, OperationRegistry }");
	}

	if (config.includeBatchTransaction) {
		exports.push(
			"export { BatchBuilder, TransactionBuilder, BundleBuilderFactory }",
		);
	}

	if (config.includePagination) {
		exports.push("export { PaginatedResults, PaginationConfig }");
	}

	if (config.includeConditionalOperations) {
		exports.push("export { ConditionalOperations, ConditionalRequestResult }");
	}

	if (config.includeInterceptors) {
		exports.push(
			"export { InterceptorManager, AuthenticationInterceptor, LoggingInterceptor }",
		);
	}

	if (config.includeCaching) {
		exports.push("export { FHIRCache, CacheConfig, CacheStats }");
	}

	return `${exports.join(";\n")};`;
}

/**
 * Generate package.json for the enhanced client
 */
export function generateEnhancedClientPackageJson(
	config: EnhancedRestClientOptions = {},
): string {
	const packageJson = {
		name: "enhanced-fhir-rest-client",
		version: "1.0.0",
		description: "Enhanced FHIR REST client with advanced features",
		main: "index.js",
		types: "index.d.ts",
		type: "module",
		files: ["*.js", "*.d.ts", "**/*.js", "**/*.d.ts"],
		scripts: {
			build: "tsc",
			"type-check": "tsc --noEmit",
			test: "jest",
			lint: "eslint . --ext .ts,.js",
			"lint:fix": "eslint . --ext .ts,.js --fix",
		},
		dependencies: {
			...(config.httpClient === "axios" ? { axios: "^1.6.0" } : {}),
			...(config.httpClient === "node-fetch" ? { "node-fetch": "^3.3.0" } : {}),
		},
		devDependencies: {
			typescript: "^5.8.3",
			"@types/node": "^22.0.0",
			jest: "^29.0.0",
			"@types/jest": "^29.0.0",
			"ts-jest": "^29.0.0",
			eslint: "^8.0.0",
			"@typescript-eslint/eslint-plugin": "^7.0.0",
			"@typescript-eslint/parser": "^7.0.0",
			...(config.httpClient === "node-fetch"
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
			"typescript",
			"enhanced",
			"production-ready",
		],
		license: "MIT",
		author: "atomic-codegen",
		repository: {
			type: "git",
			url: "https://github.com/your-org/enhanced-fhir-client.git",
		},
		engines: {
			node: ">=18.0.0",
		},
	};

	return JSON.stringify(packageJson, null, 2);
}
