/**
 * TypeSchema Generator
 *
 * Generates TypeSchema documents from FHIR packages using fhrischema.
 * Provides high-level API for converting FHIR Structure Definitions to TypeSchema format.
 */

import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import { type FHIRSchema, translate } from "@atomic-ehr/fhirschema";
import type { TypeSchemaConfig } from "../config";
import { isFHIRResourceType } from "../fhir/core/types";
import { TypeSchemaCache } from "./cache";
import { transformFHIRSchema, transformFHIRSchemas } from "./core/transformer";
import type {
	AnyTypeSchema,
	GeneratorOptions,
	PackageInfo,
	TransformContext,
} from "./types";

/**
 * TypeSchema Generator class
 *
 * Main class for generating TypeSchema documents from FHIR packages.
 * Leverages fhrischema for FHIR parsing and canonical manager for dependency resolution.
 */
export class TypeSchemaGenerator {
	private manager: ReturnType<typeof CanonicalManager>;
	private options: GeneratorOptions;
	private cache: TypeSchemaCache | null = null;
	private cacheConfig?: TypeSchemaConfig;

	constructor(options: GeneratorOptions = {}, cacheConfig?: TypeSchemaConfig) {
		this.options = {
			includeValueSets: true,
			includeBindings: true,
			includeProfiles: true,
			includeExtensions: false,
			includeCodeSystems: false,
			includeOperations: false,
			fhirVersion: "R4",
			resourceTypes: [],
			maxDepth: 10,
			verbose: false,
			...options,
		};
		this.manager = CanonicalManager({ packages: [], workingDir: "tmp/fhir" });
		this.cacheConfig = cacheConfig;
	}

	/**
	 * Initialize the cache if configured
	 */
	private async initializeCache(): Promise<void> {
		if (this.cacheConfig && !this.cache) {
			this.cache = new TypeSchemaCache(this.cacheConfig);
			await this.cache.initialize();
		}
	}

	/**
	 * Generate TypeSchema from a FHIR package name
	 */
	async generateFromPackage(
		packageName: string,
		packageVersion?: string,
	): Promise<AnyTypeSchema[]> {
		// Initialize cache if needed
		await this.initializeCache();

		// Check if we should force regeneration
		const forceRegenerate = this.cacheConfig?.forceRegenerate ?? false;

		// Try to load from cache if enabled and not forcing regeneration
		if (this.cache && !forceRegenerate) {
			const cachedSchemas = this.cache.getByPackage(packageName);
			if (cachedSchemas.length > 0) {
				if (this.options.verbose) {
					console.log(
						`Using cached TypeSchemas for package: ${packageName} (${cachedSchemas.length} schemas)`,
					);
				}
				return cachedSchemas;
			}
		}

		if (this.options.verbose) {
			console.log(
				`Loading FHIR package: ${packageName}${packageVersion ? `@${packageVersion}` : ""}`,
			);
		}

		// Initialize FHIR canonical manager to load packages
		this.manager = CanonicalManager({
			packages: [`${packageName}${packageVersion ? `@${packageVersion}` : ""}`],
			workingDir: "tmp/fhir",
		});

		await this.manager.init();

		// Get all resources from the package
		const allResources = await this.manager.search({});
		const structureDefinitions = allResources.filter(
			(resource) => resource.resourceType === "StructureDefinition",
		);
		const valueSets = allResources.filter(
			(resource) => resource.resourceType === "ValueSet",
		);

		if (this.options.verbose) {
			console.log(
				`Found ${structureDefinitions.length} StructureDefinitions and ${valueSets.length} ValueSets in package`,
			);
		}

		// Convert StructureDefinitions to FHIRSchemas
		const fhirSchemas: FHIRSchema[] = [];
		for (const sd of structureDefinitions) {
			try {
				const fhirSchema = translate(sd as any);
				fhirSchemas.push(fhirSchema);
			} catch (error) {
				if (this.options.verbose) {
					console.warn(
						`Failed to convert ${sd.name || sd.id}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
		}

		// Store ValueSets for enum extraction during binding processing
		// The CanonicalManager will handle ValueSet resolution, but we ensure they're available
		if (valueSets.length > 0 && this.options.verbose) {
			console.log(
				`ValueSets available for enum extraction: ${valueSets.map((vs) => vs.name || vs.id).join(", ")}`,
			);
		}

		// Create package info
		const packageInfo: PackageInfo = {
			name: packageName,
			version: packageVersion || "latest",
		};

		// Transform all FHIR schemas to TypeSchema format
		const schemas = await this.generateFromSchemas(fhirSchemas, packageInfo);

		// Cache the generated schemas if caching is enabled
		if (this.cache && schemas.length > 0) {
			for (const schema of schemas) {
				await this.cache.set(schema);
			}
			if (this.options.verbose) {
				console.log(
					`Cached ${schemas.length} TypeSchemas for package: ${packageName}`,
				);
			}
		}

		return schemas;
	}

	/**
	 * Generate TypeSchema from individual FHIR schema
	 */
	async generateFromSchema(
		fhirSchema: FHIRSchema,
		packageInfo?: PackageInfo,
	): Promise<AnyTypeSchema[]> {
		const _context: TransformContext = {
			packageInfo,
			verbose: this.options.verbose,
		};

		if (this.options.verbose) {
			console.log(
				`Transforming schema: ${fhirSchema.url || fhirSchema.name || "unnamed"}`,
			);
		}

		return await transformFHIRSchema(fhirSchema, this.manager, packageInfo);
	}

	/**
	 * Generate TypeSchema from multiple FHIR schemas with FHIR-specific enhancements
	 */
	async generateFromSchemas(
		fhirSchemas: FHIRSchema[],
		packageInfo?: PackageInfo,
	): Promise<AnyTypeSchema[]> {
		const _context: TransformContext = {
			packageInfo,
			verbose: this.options.verbose,
		};

		if (this.options.verbose) {
			console.log(`Transforming ${fhirSchemas.length} schemas`);
		}

		// First, transform FHIR schemas to TypeSchemas using the core transformer
		const baseSchemas = await transformFHIRSchemas(
			fhirSchemas,
			this.manager,
			packageInfo,
		);

		// Apply FHIR-specific processing
		const results: AnyTypeSchema[] = [];

		// Filter schemas based on options
		const filteredSchemas = this.filterTypeSchemas(baseSchemas);

		if (this.options.verbose) {
			console.log(`Processing ${filteredSchemas.length} filtered TypeSchemas`);
		}

		// Group schemas by type for efficient processing
		const groupedSchemas = this.groupTypeSchemas(filteredSchemas);

		// Process resources, complex types, and primitives (core types)
		results.push(...groupedSchemas.resources);
		results.push(...groupedSchemas.complexTypes);
		results.push(...groupedSchemas.primitives);

		// Generate profiles if enabled
		if (this.options.includeProfiles && groupedSchemas.profiles.length > 0) {
			const profileResults = await this.enhanceProfiles(
				groupedSchemas.profiles,
			);
			results.push(...profileResults);
		}

		// Generate extensions if enabled
		if (
			this.options.includeExtensions &&
			groupedSchemas.extensions.length > 0
		) {
			const extensionResults = await this.enhanceExtensions(
				groupedSchemas.extensions,
			);
			results.push(...extensionResults);
		}

		// Generate value sets if enabled
		if (this.options.includeValueSets && groupedSchemas.valueSets.length > 0) {
			const valueSetResults = await this.enhanceValueSets(
				groupedSchemas.valueSets,
			);
			results.push(...valueSetResults);
		}

		// Generate code systems if enabled
		if (
			this.options.includeCodeSystems &&
			groupedSchemas.codeSystems.length > 0
		) {
			const codeSystemResults = await this.enhanceCodeSystems(
				groupedSchemas.codeSystems,
			);
			results.push(...codeSystemResults);
		}

		// Generate operations if enabled
		if (this.options.includeOperations) {
			const operationResults = await this.generateOperations();
			results.push(...operationResults);
		}

		if (this.options.verbose) {
			console.log(`Generated ${results.length} enhanced FHIR type schemas`);
		}

		return results;
	}

	/**
	 * Generate TypeSchema with filtered resource types
	 */
	async generateFiltered(
		packageName: string,
		_filter: {
			resourceTypes?: string[];
			includeProfiles?: boolean;
			includeExtensions?: boolean;
			includeValueSets?: boolean;
		},
		packageVersion?: string,
	): Promise<AnyTypeSchema[]> {
		if (this.options.verbose) {
			console.log(`Loading filtered FHIR package: ${packageName}`);
		}

		// TODO: Implement filtering functionality - for now, delegate to generateFromPackage
		return await this.generateFromPackage(packageName, packageVersion);
		//
		// // Filter schemas based on criteria
		// let filteredSchemas = allSchemas;
		//
		// if (filter.resourceTypes) {
		// 	filteredSchemas = filteredSchemas.filter((schema) =>
		// 		filter.resourceTypes!.includes(schema.name || schema.id),
		// 	);
		// }
		//
		// if (filter.includeProfiles === false) {
		// 	filteredSchemas = filteredSchemas.filter(
		// 		(schema) => schema.kind !== "profile",
		// 	);
		// }
		//
		// if (filter.includeExtensions === false) {
		// 	filteredSchemas = filteredSchemas.filter(
		// 		(schema) => schema.type !== "Extension",
		// 	);
		// }
		//
		// if (filter.includeValueSets === false) {
		// 	filteredSchemas = filteredSchemas.filter(
		// 		(schema) => schema.kind !== "value-set",
		// 	);
		// }
		//
		// if (this.options.verbose) {
		// 	console.log(`Filtered to ${filteredSchemas.length} schemas`);
		// }
		//
		// const packageInfo: PackageInfo = {
		// 	name: packageName,
		// 	version: packageVersion || "latest",
		// };
		//
		// return await this.generateFromSchemas(filteredSchemas, packageInfo);
	}

	/**
	 * Set generator options
	 */
	setOptions(options: Partial<GeneratorOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Get current generator options
	 */
	getOptions(): GeneratorOptions {
		return { ...this.options };
	}

	/**
	 * Add a package to the canonical manager for dependency resolution
	 */
	async addDependencyPackage(
		packageName: string,
		packageVersion?: string,
	): Promise<void> {
		if (this.options.verbose) {
			console.log(
				`Adding dependency package: ${packageName}${packageVersion ? `@${packageVersion}` : ""}`,
			);
		}

		// TODO: Implement comparison functionality - for now, delegate to generateFromPackage
		return await this.generateFromPackage(packageName, packageVersion);

		// // Add schemas to canonical manager
		// for (const schema of schemas) {
		// 	if (schema.url) {
		// 		await this.manager.register(schema.url, schema);
		// 	}
		// }
	}

	/**
	 * Extract SearchParameter definitions for a specific resource type
	 */
	async getSearchParameters(resourceType: string): Promise<any[]> {
		if (!this.manager) {
			throw new Error(
				"Manager not initialized. Call generateFromPackage first.",
			);
		}

		try {
			// Get SearchParameter resources for the specified resource type
			const searchParameters =
				await this.manager.getSearchParametersForResource(resourceType);

			if (this.options.verbose) {
				console.log(
					`Found ${searchParameters.length} SearchParameters for ${resourceType}`,
				);
			}

			return searchParameters;
		} catch (error) {
			if (this.options.verbose) {
				console.warn(
					`Failed to get SearchParameters for ${resourceType}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			return [];
		}
	}

	/**
	 * Extract OperationDefinition resources for a specific resource type
	 */
	async getOperationDefinitions(resourceType?: string): Promise<any[]> {
		if (!this.manager) {
			throw new Error(
				"Manager not initialized. Call generateFromPackage first.",
			);
		}

		try {
			// Search for OperationDefinition resources
			const allResources = await this.manager.search({});
			let operationDefinitions = allResources.filter(
				(resource: any) => resource.resourceType === "OperationDefinition",
			);

			// Filter by resource type if specified
			if (resourceType) {
				operationDefinitions = operationDefinitions.filter((resource: any) =>
					resource.resource?.includes(resourceType),
				);
			}

			if (this.options.verbose) {
				console.log(
					`Found ${operationDefinitions.length} OperationDefinitions${resourceType ? ` for ${resourceType}` : ""}`,
				);
			}

			return operationDefinitions;
		} catch (error) {
			if (this.options.verbose) {
				console.warn(
					`Failed to get OperationDefinitions${resourceType ? ` for ${resourceType}` : ""}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			return [];
		}
	}

	/**
	 * Get all resource types from loaded StructureDefinitions
	 */
	async getResourceTypes(): Promise<string[]> {
		if (!this.manager) {
			throw new Error(
				"Manager not initialized. Call generateFromPackage first.",
			);
		}

		try {
			const allResources = await this.manager.search({});
			const structureDefinitions = allResources.filter(
				(resource) =>
					resource.resourceType === "StructureDefinition" &&
					resource.kind === "resource" &&
					resource.derivation === "specialization",
			);

			const resourceTypes = structureDefinitions
				.map((sd) => sd.name || sd.type)
				.filter(
					(name: string) =>
						name && name !== "Resource" && name !== "DomainResource",
				)
				.sort();

			if (this.options.verbose) {
				console.log(
					`Found ${resourceTypes.length} resource types: ${resourceTypes.join(", ")}`,
				);
			}

			return resourceTypes;
		} catch (error) {
			if (this.options.verbose) {
				console.warn(
					`Failed to get resource types: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			return [];
		}
	}

	/**
	 * Clear the canonical manager cache
	 */
	clearCache(): void {
		this.manager = CanonicalManager({ packages: [], workingDir: "tmp/fhir" });
	}

	// Private FHIR-specific helper methods

	private filterTypeSchemas(schemas: AnyTypeSchema[]): AnyTypeSchema[] {
		let filtered = schemas;

		// Filter by resource types if specified
		if (this.options.resourceTypes && this.options.resourceTypes.length > 0) {
			filtered = filtered.filter(
				(schema) =>
					!schema.identifier.name ||
					this.options.resourceTypes?.includes(schema.identifier.name) ||
					!isFHIRResourceType(schema.identifier.name, schemas),
			);
		}

		return filtered;
	}

	private groupTypeSchemas(schemas: AnyTypeSchema[]): {
		resources: AnyTypeSchema[];
		complexTypes: AnyTypeSchema[];
		primitives: AnyTypeSchema[];
		profiles: AnyTypeSchema[];
		extensions: AnyTypeSchema[];
		valueSets: AnyTypeSchema[];
		codeSystems: AnyTypeSchema[];
	} {
		const groups = {
			resources: [] as AnyTypeSchema[],
			complexTypes: [] as AnyTypeSchema[],
			primitives: [] as AnyTypeSchema[],
			profiles: [] as AnyTypeSchema[],
			extensions: [] as AnyTypeSchema[],
			valueSets: [] as AnyTypeSchema[],
			codeSystems: [] as AnyTypeSchema[],
		};

		for (const schema of schemas) {
			switch (schema.identifier.kind) {
				case "resource":
					groups.resources.push(schema);
					break;
				case "complex-type":
					groups.complexTypes.push(schema);
					break;
				case "primitive-type":
					groups.primitives.push(schema);
					break;
				case "profile":
					groups.profiles.push(schema);
					break;
				case "binding":
					// Extensions are complex-types with special metadata
					if ("metadata" in schema && (schema as any).metadata?.isExtension) {
						groups.extensions.push(schema);
					} else {
						groups.complexTypes.push(schema);
					}
					break;
				case "value-set":
					groups.valueSets.push(schema);
					break;
				default:
					// Check metadata for special types
					if ("metadata" in schema && (schema as any).metadata?.isCodeSystem) {
						groups.codeSystems.push(schema);
					} else {
						groups.complexTypes.push(schema);
					}
					break;
			}
		}

		return groups;
	}

	private async enhanceProfiles(
		schemas: AnyTypeSchema[],
	): Promise<AnyTypeSchema[]> {
		// Profiles are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async enhanceExtensions(
		schemas: AnyTypeSchema[],
	): Promise<AnyTypeSchema[]> {
		// Extensions are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async enhanceValueSets(
		schemas: AnyTypeSchema[],
	): Promise<AnyTypeSchema[]> {
		// ValueSets are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async enhanceCodeSystems(
		schemas: AnyTypeSchema[],
	): Promise<AnyTypeSchema[]> {
		// CodeSystems are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async generateOperations(): Promise<AnyTypeSchema[]> {
		// Operations generation would be implemented here if needed
		// For now, return empty array as operations are rarely used
		return [];
	}
}

/**
 * Convenience function to generate TypeSchema from a package
 */
export async function generateTypeSchemaFromPackage(
	packageName: string,
	options: GeneratorOptions = {},
): Promise<AnyTypeSchema[]> {
	const generator = new TypeSchemaGenerator(options);
	return await generator.generateFromPackage(packageName);
}

/**
 * Convenience function to generate TypeSchema from FHIR schemas
 */
export async function generateTypeSchemaFromSchemas(
	fhirSchemas: FHIRSchema[],
	packageInfo?: PackageInfo,
	options: GeneratorOptions = {},
): Promise<AnyTypeSchema[]> {
	const generator = new TypeSchemaGenerator(options);
	return await generator.generateFromSchemas(fhirSchemas, packageInfo);
}

/**
 * Convenience function to generate TypeSchema from a single FHIR schema
 */
export async function generateTypeSchemaFromSchema(
	fhirSchema: FHIRSchema,
	packageInfo?: PackageInfo,
	options: GeneratorOptions = {},
): Promise<AnyTypeSchema[]> {
	const generator = new TypeSchemaGenerator(options);
	return await generator.generateFromSchema(fhirSchema, packageInfo);
}
