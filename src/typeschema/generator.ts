/**
 * TypeSchema Generator
 *
 * Generates TypeSchema documents from FHIR packages using fhrischema.
 * Provides high-level API for converting FHIR Structure Definitions to TypeSchema format.
 */

import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import { type FHIRSchema, translate } from "@atomic-ehr/fhirschema";
import type { TypeSchemaConfig } from "../config";
import { Logger } from "../logger";
import { TypeSchemaCache } from "./cache";
import { transformFHIRSchema, transformFHIRSchemas } from "./core/transformer";
import type {
	AnyTypeSchemaCompliant,
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
	private logger: Logger;

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
		this.logger = new Logger({
			component: "TypeSchemaGenerator",
			level: this.options.verbose ? 0 : 1,
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
	): Promise<AnyTypeSchemaCompliant[]> {
		// Initialize cache if needed
		await this.initializeCache();

		// Check if we should force regeneration
		const forceRegenerate = this.cacheConfig?.forceRegenerate ?? false;

		// Try to load from cache if enabled and not forcing regeneration
		if (this.cache && !forceRegenerate) {
			const cachedSchemas = this.cache.getByPackage(packageName);
			if (cachedSchemas.length > 0) {
				await this.logger.info(
					`Using cached TypeSchemas for package: ${packageName}`,
					{ schemasCount: cachedSchemas.length },
				);
				return cachedSchemas;
			}
		}

		await this.logger.info(
			`Loading FHIR package: ${packageName}${packageVersion ? `@${packageVersion}` : ""}`,
			{ packageName, packageVersion: packageVersion || "latest" },
			"loadPackage",
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

		await this.logger.info(
			`Found resources in package`,
			{
				structureDefinitions: structureDefinitions.length,
				valueSets: valueSets.length,
			},
			"scanPackage",
		);

		// Convert StructureDefinitions to FHIRSchemas
		await this.logger.info(
			"Converting StructureDefinitions to FHIRSchemas",
			{ total: structureDefinitions.length },
			"convertSchemas",
		);

		const fhirSchemas: FHIRSchema[] = [];
		let convertedCount = 0;
		let failedCount = 0;

		for (const sd of structureDefinitions) {
			try {
				const fhirSchema = translate(sd as any);
				fhirSchemas.push(fhirSchema);
				convertedCount++;

				await this.logger.debug(
					`Converted StructureDefinition: ${sd.name || sd.id}`,
					{ resourceType: sd.resourceType, url: sd.url },
				);
			} catch (error) {
				failedCount++;
				await this.logger.warn(`Failed to convert StructureDefinition`, {
					name: sd.name || sd.id,
					resourceType: sd.resourceType,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		await this.logger.info(
			"Schema conversion completed",
			{
				converted: convertedCount,
				failed: failedCount,
				total: structureDefinitions.length,
			},
			"convertSchemas",
		);

		// Store ValueSets for enum extraction during binding processing
		// The CanonicalManager will handle ValueSet resolution, but we ensure they're available
		if (valueSets.length > 0) {
			await this.logger.debug("ValueSets available for enum extraction", {
				count: valueSets.length,
				valueSets: valueSets.map((vs) => vs.name || vs.id).slice(0, 10),
			});
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
			await this.logger.info(
				"Caching generated schemas",
				{ count: schemas.length, packageName },
				"cacheSchemas",
			);

			for (const schema of schemas) {
				await this.cache.set(schema);
			}

			await this.logger.info(`Cached TypeSchemas for package: ${packageName}`, {
				count: schemas.length,
			});
		}

		return schemas;
	}

	/**
	 * Generate TypeSchema from individual FHIR schema
	 */
	async generateFromSchema(
		fhirSchema: FHIRSchema,
		packageInfo?: PackageInfo,
	): Promise<AnyTypeSchemaCompliant[]> {
		const _context: TransformContext = {
			packageInfo,
			verbose: this.options.verbose,
		};

		await this.logger.info(
			"Transforming FHIR schema to TypeSchema",
			{
				url: fhirSchema.url,
				name: fhirSchema.name || "unnamed",
				schemaType: fhirSchema.type,
			},
			"transformSchema",
		);

		return await transformFHIRSchema(fhirSchema, this.manager, packageInfo);
	}

	/**
	 * Generate TypeSchema from multiple FHIR schemas with FHIR-specific enhancements
	 */
	async generateFromSchemas(
		fhirSchemas: FHIRSchema[],
		packageInfo?: PackageInfo,
	): Promise<AnyTypeSchemaCompliant[]> {
		const _context: TransformContext = {
			packageInfo,
			verbose: this.options.verbose,
		};

		await this.logger.info(
			`Transforming multiple FHIR schemas to TypeSchema`,
			{ count: fhirSchemas.length },
			"transformSchemas",
		);

		// First, transform FHIR schemas to TypeSchemas using the core transformer
		const baseSchemas = await transformFHIRSchemas(
			fhirSchemas,
			this.manager,
			packageInfo,
		);

		// Apply FHIR-specific processing
		const results: AnyTypeSchemaCompliant[] = [];

		// Filter schemas based on options
		const filteredSchemas = this.filterTypeSchemas(baseSchemas);

		await this.logger.info(
			"Processing filtered TypeSchemas",
			{ count: filteredSchemas.length },
			"processSchemas",
		);

		// Group schemas by type for efficient processing
		const groupedSchemas = this.groupTypeSchemas(filteredSchemas);

		// Process resources, complex types, and primitives (core types)
		results.push(...groupedSchemas.resources);
		results.push(...groupedSchemas.complexTypes);
		results.push(...groupedSchemas.primitives);

		// Generate profiles if enabled
		if (this.options.includeProfiles && groupedSchemas.profiles.length > 0) {
			await this.logger.info(
				"Enhancing profiles",
				{ count: groupedSchemas.profiles.length },
				"enhanceProfiles",
			);
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
			await this.logger.info(
				"Enhancing extensions",
				{ count: groupedSchemas.extensions.length },
				"enhanceExtensions",
			);
			const extensionResults = await this.enhanceExtensions(
				groupedSchemas.extensions,
			);
			results.push(...extensionResults);
		}

		// Generate value sets if enabled
		if (this.options.includeValueSets && groupedSchemas.valueSets.length > 0) {
			await this.logger.info(
				"Enhancing value sets",
				{ count: groupedSchemas.valueSets.length },
				"enhanceValueSets",
			);
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
			await this.logger.info(
				"Enhancing code systems",
				{ count: groupedSchemas.codeSystems.length },
				"enhanceCodeSystems",
			);
			const codeSystemResults = await this.enhanceCodeSystems(
				groupedSchemas.codeSystems,
			);
			results.push(...codeSystemResults);
		}

		// Generate operations if enabled
		if (this.options.includeOperations) {
			await this.logger.info("Generating operations", {}, "generateOperations");
			const operationResults = await this.generateOperations();
			results.push(...operationResults);
		}

		await this.logger.info("Generated enhanced FHIR type schemas", {
			totalSchemas: results.length,
			resources: groupedSchemas.resources.length,
			complexTypes: groupedSchemas.complexTypes.length,
			primitives: groupedSchemas.primitives.length,
			profiles: this.options.includeProfiles
				? groupedSchemas.profiles.length
				: 0,
			extensions: this.options.includeExtensions
				? groupedSchemas.extensions.length
				: 0,
			valueSets: this.options.includeValueSets
				? groupedSchemas.valueSets.length
				: 0,
			codeSystems: this.options.includeCodeSystems
				? groupedSchemas.codeSystems.length
				: 0,
		});

		return results;
	}

	// Private FHIR-specific helper methods

	private filterTypeSchemas(
		schemas: AnyTypeSchemaCompliant[],
	): AnyTypeSchemaCompliant[] {
		let filtered = schemas;

		// Filter by resource types if specified
		if (this.options.resourceTypes && this.options.resourceTypes.length > 0) {
			filtered = filtered.filter(
				(schema) =>
					!schema.identifier.name ||
					this.options.resourceTypes?.includes(schema.identifier.name),
				// !isFHIRResourceType(schema.identifier.name, schemas),
			);
		}

		return filtered;
	}

	private groupTypeSchemas(schemas: AnyTypeSchemaCompliant[]): {
		resources: AnyTypeSchemaCompliant[];
		complexTypes: AnyTypeSchemaCompliant[];
		primitives: AnyTypeSchemaCompliant[];
		profiles: AnyTypeSchemaCompliant[];
		extensions: AnyTypeSchemaCompliant[];
		valueSets: AnyTypeSchemaCompliant[];
		codeSystems: AnyTypeSchemaCompliant[];
	} {
		const groups = {
			resources: [] as AnyTypeSchemaCompliant[],
			complexTypes: [] as AnyTypeSchemaCompliant[],
			primitives: [] as AnyTypeSchemaCompliant[],
			profiles: [] as AnyTypeSchemaCompliant[],
			extensions: [] as AnyTypeSchemaCompliant[],
			valueSets: [] as AnyTypeSchemaCompliant[],
			codeSystems: [] as AnyTypeSchemaCompliant[],
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
		schemas: AnyTypeSchemaCompliant[],
	): Promise<AnyTypeSchemaCompliant[]> {
		// Profiles are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async enhanceExtensions(
		schemas: AnyTypeSchemaCompliant[],
	): Promise<AnyTypeSchemaCompliant[]> {
		// Extensions are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async enhanceValueSets(
		schemas: AnyTypeSchemaCompliant[],
	): Promise<AnyTypeSchemaCompliant[]> {
		// ValueSets are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async enhanceCodeSystems(
		schemas: AnyTypeSchemaCompliant[],
	): Promise<AnyTypeSchemaCompliant[]> {
		// CodeSystems are already generated by TypeSchema transformer
		// Add any FHIR-specific enhancements here if needed
		return schemas;
	}

	private async generateOperations(): Promise<AnyTypeSchemaCompliant[]> {
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
): Promise<AnyTypeSchemaCompliant[]> {
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
): Promise<AnyTypeSchemaCompliant[]> {
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
): Promise<AnyTypeSchemaCompliant[]> {
	const generator = new TypeSchemaGenerator(options);
	return await generator.generateFromSchema(fhirSchema, packageInfo);
}
