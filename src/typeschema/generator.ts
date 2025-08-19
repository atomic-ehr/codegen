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
import type { TypeSchema } from "./type-schema.types";
import type { PackageInfo, TypeschemaGeneratorOptions } from "./types";

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
		await this.initializeCache();

		const forceRegenerate = this.cacheConfig?.forceRegenerate ?? false;

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

		this.manager = CanonicalManager({
			packages: [`${packageName}${packageVersion ? `@${packageVersion}` : ""}`],
			workingDir: "tmp/fhir",
		});

		await this.manager.init();

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

		this.logger.progress(
			`Converting ${structureDefinitions.length} StructureDefinitions to FHIRSchemas`,
		);

		const filteredStructureDefinitions =
			this.applyStructureDefinitionTreeshaking(structureDefinitions);

		const fhirSchemas: FHIRSchema[] = [];
		let convertedCount = 0;
		let failedCount = 0;

		for (const sd of filteredStructureDefinitions) {
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
			`Schema conversion completed: ${convertedCount}/${filteredStructureDefinitions.length} successful, ${failedCount} failed`,
		);

		if (valueSets.length > 0) {
			this.logger.debug(
				`${valueSets.length} ValueSets available for enum extraction`,
			);
		}

		const packageInfo: PackageInfo = {
			name: packageName,
			version: packageVersion || "latest",
		};

		const schemas = await this.generateFromSchemas(fhirSchemas, packageInfo);
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

		const baseSchemas = await transformFHIRSchemas(
			fhirSchemas,
			this.manager,
			packageInfo,
		);

		const results: TypeSchema[] = [];
		const groupedSchemas = this.groupTypeSchemas(baseSchemas);

		results.push(...groupedSchemas.resources);
		results.push(...groupedSchemas.complexTypes);
		results.push(...groupedSchemas.primitives);

		if (groupedSchemas.profiles.length > 0) {
			this.logger.info(`Enhancing ${groupedSchemas.profiles.length} profiles`);
			const profileResults = await this.enhanceProfiles(
				groupedSchemas.profiles,
			);
			results.push(...profileResults);
		}

		if (groupedSchemas.extensions.length > 0) {
			this.logger.info(
				`Enhancing ${groupedSchemas.extensions.length} extensions`,
			);
			const extensionResults = await this.enhanceExtensions(
				groupedSchemas.extensions,
			);
			results.push(...extensionResults);
		}

		if (groupedSchemas.valueSets.length > 0) {
			this.logger.info(
				`Enhancing ${groupedSchemas.valueSets.length} value sets`,
			);
			const valueSetResults = await this.enhanceValueSets(
				groupedSchemas.valueSets,
			);
			results.push(...valueSetResults);
		}

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
		return schemas;
	}

	private async enhanceExtensions(
		schemas: TypeSchema[],
	): Promise<TypeSchema[]> {
		return schemas;
	}

	private async enhanceValueSets(schemas: TypeSchema[]): Promise<TypeSchema[]> {
		return schemas;
	}

	private async enhanceCodeSystems(
		schemas: TypeSchema[],
	): Promise<TypeSchema[]> {
		return schemas;
	}

	/**
	 * Apply treeshaking to StructureDefinitions before FHIR schema transformation
	 * This is more efficient and includes smart reference handling
	 */
	private applyStructureDefinitionTreeshaking(
		structureDefinitions: any[],
	): any[] {
		const treeshakeList = this.options.treeshake;

		if (!treeshakeList || treeshakeList.length === 0) {
			return structureDefinitions;
		}

		this.logger.info(
			`Applying treeshaking filter for ResourceTypes: ${treeshakeList.join(", ")}`,
		);

		const allStructureDefinitions = new Map<string, any>();
		const realDependencies = new Map<string, Set<string>>();
		const referenceTargets = new Map<string, Set<string>>();

		for (const sd of structureDefinitions) {
			const name = sd.name || sd.id;
			if (name) {
				allStructureDefinitions.set(name, sd);
				realDependencies.set(name, new Set());
				referenceTargets.set(name, new Set());
			}
		}

		for (const sd of structureDefinitions) {
			const name = sd.name || sd.id;
			if (!name) continue;

			const { realDeps, refTargets } =
				this.extractStructureDefinitionDependenciesWithReferences(sd);
			realDependencies.set(name, new Set(realDeps));
			referenceTargets.set(name, new Set(refTargets));
		}

		const structureDefinitionsToKeep = new Set<string>();

		for (const resourceType of treeshakeList) {
			if (allStructureDefinitions.has(resourceType)) {
				structureDefinitionsToKeep.add(resourceType);
			} else {
				this.logger.warn(
					`ResourceType '${resourceType}' not found in structure definitions`,
				);
			}
		}

		const addRealDependenciesRecursively = (
			name: string,
			visited = new Set<string>(),
		) => {
			if (visited.has(name) || !realDependencies.has(name)) {
				return;
			}

			visited.add(name);
			const deps = realDependencies.get(name) || new Set();

			for (const dep of Array.from(deps)) {
				if (allStructureDefinitions.has(dep)) {
					structureDefinitionsToKeep.add(dep);
					addRealDependenciesRecursively(dep, visited);
				}
			}
		};

		for (const resourceType of Array.from(structureDefinitionsToKeep)) {
			addRealDependenciesRecursively(resourceType);
		}

		const filteredStructureDefinitions = structureDefinitions.filter((sd) => {
			const name = sd.name || sd.id;
			return name && structureDefinitionsToKeep.has(name);
		});

		const excludedReferenceTargets = new Set<string>();
		for (const sd of structureDefinitions) {
			const name = sd.name || sd.id;
			if (name && !structureDefinitionsToKeep.has(name)) {
				const isOnlyReferenceTarget = Array.from(
					referenceTargets.values(),
				).some((targets) => targets.has(name));

				if (isOnlyReferenceTarget) {
					excludedReferenceTargets.add(name);
				}
			}
		}

		if (excludedReferenceTargets.size > 0) {
			this.logger.info(
				`Excluded reference-only targets: ${Array.from(excludedReferenceTargets).join(", ")}`,
			);
		}

		this.logger.success(
			`Treeshaking completed: kept ${filteredStructureDefinitions.length}/${structureDefinitions.length} structure definitions`,
		);

		return filteredStructureDefinitions;
	}

	/**
	 * Extract dependencies from StructureDefinition with smart reference handling
	 * Returns both real dependencies and reference targets separately
	 */
	private extractStructureDefinitionDependenciesWithReferences(sd: any): {
		realDeps: string[];
		refTargets: string[];
	} {
		const realDeps = new Set<string>();
		const refTargets = new Set<string>();

		if (sd.baseDefinition) {
			const baseName = this.extractResourceNameFromUrl(sd.baseDefinition);
			if (baseName) {
				realDeps.add(baseName);
			}
		}

		if (sd.snapshot?.element || sd.differential?.element) {
			const elements = sd.snapshot?.element || sd.differential?.element;

			for (const element of elements) {
				if (element.type) {
					for (const type of element.type) {
						if (type.code) {
							realDeps.add(type.code);

							if (type.code === "Reference" && type.targetProfile) {
								for (const targetProfile of type.targetProfile) {
									const targetName =
										this.extractResourceNameFromUrl(targetProfile);
									if (targetName) {
										refTargets.add(targetName);
									}
								}
							}
						}

						if (type.profile) {
							for (const profile of type.profile) {
								const profileName = this.extractResourceNameFromUrl(profile);
								if (profileName) {
									realDeps.add(profileName);
								}
							}
						}
					}
				}
			}
		}

		return {
			realDeps: Array.from(realDeps),
			refTargets: Array.from(refTargets),
		};
	}

	/**
	 * Extract resource name from FHIR URL
	 */
	private extractResourceNameFromUrl(url: string): string | null {
		const match = url.match(/\/([^/]+)$/);
		return match ? (match[1] ?? null) : null;
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
