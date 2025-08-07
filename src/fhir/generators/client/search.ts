/**
 * FHIR Search Client Generator
 *
 * Generates comprehensive type-safe search client code for FHIR search operations.
 * Provides advanced search capabilities with chaining, modifiers, and result processing.
 */

import type { AnyTypeSchema } from "../../../typeschema/lib-types";

/**
 * Enhanced search client generation options
 */
export interface EnhancedSearchClientGenerationOptions {
	/** Include search builder classes */
	includeBuilders?: boolean;
	/** Include result processors */
	includeProcessors?: boolean;
	/** Include search parameter validation */
	includeValidation?: boolean;
	/** Generate async methods */
	useAsync?: boolean;
	/** Client class name */
	clientClassName?: string;
	/** Include resource-specific builders */
	includeResourceBuilders?: boolean;
	/** Include advanced search features */
	includeAdvancedFeatures?: boolean;
	/** Include search parameter documentation */
	includeDocumentation?: boolean;
	/** Include search metrics and performance monitoring */
	includeMetrics?: boolean;
}

/**
 * Generate comprehensive search client from schemas
 */
export async function generateEnhancedSearchClient(
	schemas: AnyTypeSchema[],
	options: EnhancedSearchClientGenerationOptions = {},
): Promise<string> {
	const resourceSchemas = schemas.filter(
		(s) => s.identifier.kind === "resource",
	);

	const className = options.clientClassName || "FHIRSearchClient";
	const sections: string[] = [];

	// Add file header
	sections.push(generateSearchClientHeader());

	// Add imports
	sections.push(generateSearchClientImports(options));

	// Add type definitions
	sections.push(generateSearchClientTypes(resourceSchemas, options));

	// Generate main client class
	sections.push(
		await generateMainSearchClientClass(className, resourceSchemas, options),
	);

	// Generate search builders
	if (options.includeBuilders) {
		sections.push(
			await generateEnhancedSearchBuilders(resourceSchemas, options),
		);
	}

	return sections.filter(Boolean).join("\n\n");
}

function generateSearchClientHeader(): string {
	return `/**
 * Enhanced FHIR Search Client
 * 
 * Auto-generated type-safe search client with advanced FHIR search capabilities.
 * 
 * WARNING: This file is auto-generated. Do not modify manually.
 */

/* eslint-disable */`;
}

function generateSearchClientImports(
	_options: EnhancedSearchClientGenerationOptions,
): string {
	return `// Core FHIR types and search functionality
import type {
  ResourceMap,
  ResourceType,
  SearchParamsMap,
  Bundle,
  FHIRResponse
} from '../types';

import {
  FHIRSearchBuilder,
  AdvancedSearchResultProcessor
} from '../../features/search/builder';`;
}

function generateSearchClientTypes(
	_resourceSchemas: AnyTypeSchema[],
	_options: EnhancedSearchClientGenerationOptions,
): string {
	return `/**
 * Enhanced search client configuration
 */
export interface EnhancedSearchClientConfig {
  /** Base URL of FHIR server */
  baseUrl: string;
  /** Default headers */
  headers?: Record<string, string>;
  /** Request timeout */
  timeout?: number;
  /** Enable search parameter validation */
  validation?: boolean;
  /** Enable performance metrics */
  metrics?: boolean;
}`;
}

async function generateMainSearchClientClass(
	className: string,
	_resourceSchemas: AnyTypeSchema[],
	_options: EnhancedSearchClientGenerationOptions,
): Promise<string> {
	return `/**
 * Enhanced FHIR Search Client
 */
export class ${className} {
  private config: EnhancedSearchClientConfig;

  constructor(config: EnhancedSearchClientConfig) {
    this.config = config;
  }

  /**
   * Create a type-safe search builder for a resource type
   */
  search<T extends ResourceType>(resourceType: T): FHIRSearchBuilder<T> {
    return new FHIRSearchBuilder(this as any, resourceType);
  }

  /**
   * Execute a search request
   */
  async executeSearch<T extends ResourceType>(
    resourceType: T,
    params: Record<string, any>
  ): Promise<FHIRResponse<Bundle<ResourceMap[T]>>> {
    const url = this.buildSearchUrl(resourceType, params);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/fhir+json',
        ...this.config.headers,
      },
    });

    const data = await response.json();
    return {
      data,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }

  private buildSearchUrl(resourceType: string, params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    }
    
    const queryString = searchParams.toString();
    return \`\${this.config.baseUrl}/\${resourceType}\${queryString ? '?' + queryString : ''}\`;
  }
}`;
}

async function generateEnhancedSearchBuilders(
	resourceSchemas: AnyTypeSchema[],
	_options: EnhancedSearchClientGenerationOptions,
): Promise<string> {
	const lines: string[] = [];

	lines.push(`/**`);
	lines.push(` * Enhanced Search Builders with Full Parameter Support`);
	lines.push(` */`);

	// Generate builder for each resource type
	for (const schema of resourceSchemas) {
		const resourceType = schema.identifier.name;

		lines.push(`/**`);
		lines.push(` * Enhanced ${resourceType} search builder`);
		lines.push(` */`);
		lines.push(
			`export class Enhanced${resourceType}SearchBuilder extends FHIRSearchBuilder<'${resourceType}'> {`,
		);
		lines.push(`  constructor(client: any) {`);
		lines.push(`    super(client, '${resourceType}');`);
		lines.push(`  }`);

		// Add some resource-specific methods as examples
		if (resourceType === "Patient") {
			lines.push(``);
			lines.push(`  /** Search by patient name */`);
			lines.push(
				`  name(value: string): Enhanced${resourceType}SearchBuilder {`,
			);
			lines.push(
				`    return this.whereString('name', value) as Enhanced${resourceType}SearchBuilder;`,
			);
			lines.push(`  }`);
		}

		lines.push(`}`);
		lines.push(``);
	}

	return lines.join("\n");
}
