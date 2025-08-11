/**
 * TypeSchema Generator
 *
 * Generates TypeSchema documents from FHIR packages using fhrischema.
 * Provides high-level API for converting FHIR Structure Definitions to TypeSchema format.
 */

import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import {
	type FHIRSchema,
	type StructureDefinition,
	translate,
} from "@atomic-ehr/fhirschema";
import type { TypeSchemaConfig } from "../config";
import type { CodegenLogger } from "../utils/codegen-logger";
import { createLogger } from "../utils/codegen-logger";
import { TypeSchemaCache } from "./cache";
import { transformFHIRSchema, transformFHIRSchemas } from "./core/transformer";
import type {
	PackageInfo,
	TypeSchema,
	TypeschemaGeneratorOptions,
} from "./types";

/**
 * TypeSchema Generator class
 *
 * Main class for generating TypeSchema documents from FHIR packages.
 * Leverages fhrischema for FHIR parsing and canonical manager for dependency resolution.
 */
export class TypeSchemaGenerator {
	private manager: ReturnType<typeof CanonicalManager>;
	private options: TypeschemaGeneratorOptions;
	private cache: TypeSchemaCache | null = null;
	private cacheConfig?: TypeSchemaConfig;
	private logger: CodegenLogger;

	constructor(
		options: TypeschemaGeneratorOptions = {},
		cacheConfig?: TypeSchemaConfig,
	) {
		this.options = {
			resourceTypes: [],
			maxDepth: 10,
			verbose: false,
			...options,
		};
		this.manager = CanonicalManager({ packages: [], workingDir: "tmp/fhir" });
		this.cacheConfig = cacheConfig;
		this.logger =
			options.logger ||
			createLogger({
				verbose: this.options.verbose,
				prefix: "TypeSchema",
			});
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
	): Promise<TypeSchema[]> {
		// Initialize cache if needed
		await this.initializeCache();

		// Check if we should force regeneration
		const forceRegenerate = this.cacheConfig?.forceRegenerate ?? false;

		// Try to load from cache if enabled and not forcing regeneration
		if (this.cache && !forceRegenerate) {
			const cachedSchemas = this.cache.getByPackage(packageName);
			if (cachedSchemas.length > 0) {
				this.logger.info(
					`Using cached TypeSchemas for package: ${packageName} (${cachedSchemas.length} schemas)`,
				);
				return cachedSchemas;
			}
		}

		this.logger.step(
			`Loading FHIR package: ${packageName}${packageVersion ? `@${packageVersion}` : ""}`,
		);

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

		this.logger.info(
			`Found ${structureDefinitions.length} StructureDefinitions and ${valueSets.length} ValueSets in package`,
		);

		// Convert StructureDefinitions to FHIRSchemas
		this.logger.progress(
			`Converting ${structureDefinitions.length} StructureDefinitions to FHIRSchemas`,
		);

		const fhirSchemas: FHIRSchema[] = [];
		let convertedCount = 0;
		let failedCount = 0;

		for (const sd of structureDefinitions) {
			try {
				const fhirSchema = translate(sd as StructureDefinition);
				fhirSchemas.push(fhirSchema);
				convertedCount++;

				this.logger.debug(
					`Converted StructureDefinition: ${sd.name || sd.id} (${sd.resourceType})`,
				);
			} catch (error) {
				failedCount++;
				this.logger.warn(
					`Failed to convert StructureDefinition ${sd.name || sd.id}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		this.logger.success(
			`Schema conversion completed: ${convertedCount}/${structureDefinitions.length} successful, ${failedCount} failed`,
		);

		// Store ValueSets for enum extraction during binding processing
		// The CanonicalManager will handle ValueSet resolution, but we ensure they're available
		if (valueSets.length > 0) {
			this.logger.debug(
				`${valueSets.length} ValueSets available for enum extraction`,
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
			this.logger.info(
				`Caching ${schemas.length} generated schemas for package: ${packageName}`,
			);

			for (const schema of schemas) {
				await this.cache.set(schema);
			}

			this.logger.success(
				`Cached ${schemas.length} TypeSchemas for package: ${packageName}`,
			);
		}

		return schemas;
	}

	/**
	 * Generate TypeSchema from individual FHIR schema
	 */
	async generateFromSchema(
		fhirSchema: FHIRSchema,
		packageInfo?: PackageInfo,
	): Promise<TypeSchema[]> {
		this.logger.info("Transforming FHIR schema to TypeSchema");

		return transformFHIRSchema(fhirSchema, this.manager, packageInfo);
	}

	/**
	 * Generate TypeSchema from multiple FHIR schemas with FHIR-specific enhancements
	 */
	async generateFromSchemas(
		fhirSchemas: FHIRSchema[],
		packageInfo?: PackageInfo,
	): Promise<TypeSchema[]> {
		this.logger.info(
			`Transforming ${fhirSchemas.length} FHIR schemas to TypeSchema`,
		);

		// First, transform FHIR schemas to TypeSchemas using the core transformer
		const baseSchemas = await transformFHIRSchemas(
			fhirSchemas,
			this.manager,
			packageInfo,
		);

		// Apply FHIR-specific processing
		const results: TypeSchema[] = [];
		// Filter schemas based on options

		// Group schemas by type for efficient processing
		const groupedSchemas = this.groupTypeSchemas(baseSchemas);

		results.push(...groupedSchemas.resources);
		results.push(...groupedSchemas.complexTypes);
		results.push(...groupedSchemas.primitives);

		// Generate profiles if enabled
		if (groupedSchemas.profiles.length > 0) {
			this.logger.info(
				`Enhancing ${groupedSchemas.profiles.length} profiles`,
			);
			const profileResults = await this.enhanceProfiles(
				groupedSchemas.profiles,
			);
			results.push(...profileResults);
		}

		// Generate extensions if enabled
		if (groupedSchemas.extensions.length > 0) {
			this.logger.info(
				`Enhancing ${groupedSchemas.extensions.length} extensions`,
			);
			const extensionResults = await this.enhanceExtensions(
				groupedSchemas.extensions,
			);
			results.push(...extensionResults);
		}

		// Generate value sets if enabled
		if (groupedSchemas.valueSets.length > 0) {
			this.logger.info(
				`Enhancing ${groupedSchemas.valueSets.length} value sets`,
			);
			const valueSetResults = await this.enhanceValueSets(
				groupedSchemas.valueSets,
			);
			results.push(...valueSetResults);
		}

		// Generate code systems if enabled
		if (groupedSchemas.codeSystems.length > 0) {
			this.logger.info(
				`Enhancing ${groupedSchemas.codeSystems.length} code systems`,
			);
			const codeSystemResults = await this.enhanceCodeSystems(
				groupedSchemas.codeSystems,
			);
			results.push(...codeSystemResults);
		}

		this.logger.success(
			`Generated ${results.length} enhanced FHIR type schemas: ${groupedSchemas.resources.length} resources, ${groupedSchemas.complexTypes.length} complex types, ${groupedSchemas.primitives.length} primitives`,
		);

		return results;
	}
	private groupTypeSchemas(schemas: TypeSchema[]): {
		resources: TypeSchema[];
		complexTypes: TypeSchema[];
		primitives: TypeSchema[];
		profiles: TypeSchema[];
		extensions: TypeSchema[];
		valueSets: TypeSchema[];
		codeSystems: TypeSchema[];
	} {
		const groups = {
			resources: [] as TypeSchema[],
			complexTypes: [] as TypeSchema[],
			primitives: [] as TypeSchema[],
			profiles: [] as TypeSchema[],
			extensions: [] as TypeSchema[],
			valueSets: [] as TypeSchema[],
			codeSystems: [] as TypeSchema[],
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

	private async enhanceProfiles(schemas: TypeSchema[]): Promise<TypeSchema[]> {
		// Profiles are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async enhanceExtensions(
		schemas: TypeSchema[],
	): Promise<TypeSchema[]> {
		// Extensions are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async enhanceValueSets(schemas: TypeSchema[]): Promise<TypeSchema[]> {
		// ValueSets are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async enhanceCodeSystems(
		schemas: TypeSchema[],
	): Promise<TypeSchema[]> {
		// CodeSystems are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}
}

/**
 * Convenience function to generate TypeSchema from a package
 */
export async function generateTypeSchemaFromPackage(
	packageName: string,
	options: TypeschemaGeneratorOptions = {},
): Promise<TypeSchema[]> {
	const generator = new TypeSchemaGenerator(options);
	return await generator.generateFromPackage(packageName);
}

/**
 * Convenience function to generate TypeSchema from FHIR schemas
 */
export async function generateTypeSchemaFromSchemas(
	fhirSchemas: FHIRSchema[],
	packageInfo?: PackageInfo,
	options: TypeschemaGeneratorOptions = {},
): Promise<TypeSchema[]> {
	const generator = new TypeSchemaGenerator(options);
	return await generator.generateFromSchemas(fhirSchemas, packageInfo);
}

/**
 * Convenience function to generate TypeSchema from a single FHIR schema
 */
export async function generateTypeSchemaFromSchema(
	fhirSchema: FHIRSchema,
	packageInfo?: PackageInfo,
	options: TypeschemaGeneratorOptions = {},
): Promise<TypeSchema[]> {
	const generator = new TypeSchemaGenerator(options);
	return await generator.generateFromSchema(fhirSchema, packageInfo);
}
