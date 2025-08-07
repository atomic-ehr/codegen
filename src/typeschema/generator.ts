/**
 * TypeSchema Generator
 *
 * Generates TypeSchema documents from FHIR packages using fhrischema.
 * Provides high-level API for converting FHIR Structure Definitions to TypeSchema format.
 */

import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import { type FHIRSchema, translate } from "@atomic-ehr/fhirschema";
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

	constructor(options: GeneratorOptions = {}) {
		this.options = {
			includeValueSets: true,
			includeBindings: true,
			verbose: false,
			...options,
		};
		this.manager = CanonicalManager({ packages: [], workingDir: "tmp/fhir" });
	}

	/**
	 * Generate TypeSchema from a FHIR package name
	 */
	async generateFromPackage(
		packageName: string,
		packageVersion?: string,
	): Promise<AnyTypeSchema[]> {
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
		return await this.generateFromSchemas(fhirSchemas, packageInfo);
	}

	/**
	 * Generate TypeSchema from individual FHIR schema
	 */
	async generateFromSchema(
		fhirSchema: FHIRSchema,
		packageInfo?: PackageInfo,
	): Promise<AnyTypeSchema[]> {
		const context: TransformContext = {
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
	 * Generate TypeSchema from multiple FHIR schemas
	 */
	async generateFromSchemas(
		fhirSchemas: FHIRSchema[],
		packageInfo?: PackageInfo,
	): Promise<AnyTypeSchema[]> {
		const context: TransformContext = {
			packageInfo,
			verbose: this.options.verbose,
		};

		if (this.options.verbose) {
			console.log(`Transforming ${fhirSchemas.length} schemas`);
		}

		return await transformFHIRSchemas(fhirSchemas, this.manager, packageInfo);
	}

	/**
	 * Generate TypeSchema with filtered resource types
	 */
	async generateFiltered(
		packageName: string,
		filter: {
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
				operationDefinitions = operationDefinitions.filter(
					(resource: any) =>
						resource.resource && resource.resource.includes(resourceType),
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

	/**
	 * Convert a FHIR StructureDefinition to FHIRSchema format
	 * This is a helper method for compatibility with raw FHIR resources
	 */
	private convertStructureDefinitionToFHIRSchema(
		structureDefinition: any,
		packageInfo?: PackageInfo,
	): FHIRSchema {
		// Basic conversion from StructureDefinition to FHIRSchema
		// This would need to be implemented based on the fhrischema format
		const schema: FHIRSchema = {
			url: structureDefinition.url,
			name: structureDefinition.name,
			id: structureDefinition.id,
			type: structureDefinition.type,
			kind: structureDefinition.kind,
			baseDefinition: structureDefinition.baseDefinition,
			description: structureDefinition.description,
			package_name: packageInfo?.name,
			package_version: packageInfo?.version,
		};

		// Convert elements if present
		if (
			structureDefinition.snapshot?.element ||
			structureDefinition.differential?.element
		) {
			const elements =
				structureDefinition.snapshot?.element ||
				structureDefinition.differential?.element;
			schema.elements = {};

			for (const element of elements) {
				if (element.path && element.path !== structureDefinition.type) {
					const path = element.path.replace(`${structureDefinition.type}.`, "");
					schema.elements[path] = {
						path: element.path,
						min: element.min,
						max: element.max,
						type: element.type,
						binding: element.binding,
						definition: element.definition,
						short: element.short,
					};
				}
			}
		}

		return schema;
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
