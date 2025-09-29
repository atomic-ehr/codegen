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
} from "@atomic-ehr/fhirschema";
import * as fhirschema from "@atomic-ehr/fhirschema";
import type { TypeSchemaConfig } from "@root/config";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import { createLogger } from "@root/utils/codegen-logger";
import { TypeSchemaCache } from "./cache";
import { transformFHIRSchema } from "./core/transformer";
import type {
  PackageInfo,
  RichFHIRSchema,
  TypeSchema,
  TypeschemaGeneratorOptions,
} from "./types";
import { enrichFHIRSchema } from "./types";
import { transformValueSet } from "./value-set/processor";
import { registerFromManager } from "@typeschema/register";
import type { Register } from "@typeschema/register";

/**
 * TypeSchema Generator class
 *
 * Main class for generating TypeSchema documents from FHIR packages.
 * Leverages fhrischema for FHIR parsing and canonical manager for dependency resolution.
 */
export class TypeSchemaGenerator {
  private manager: ReturnType<typeof CanonicalManager>;

  private options: TypeschemaGeneratorOptions;
  private cacheConfig?: TypeSchemaConfig;
  private cache?: TypeSchemaCache;
  private logger: CodegenLogger;

  constructor(
    options: TypeschemaGeneratorOptions = {},
    cacheConfig?: TypeSchemaConfig,
  ) {
    this.options = { verbose: false, ...options };
    this.manager = options.manager || 
      CanonicalManager({ packages: [], workingDir: "tmp/fhir" });
    this.cacheConfig = cacheConfig;
    this.logger =
      options.logger ||
      createLogger({
        verbose: this.options.verbose,
        prefix: "TypeSchema",
      });
  }

  private async initializeCache(): Promise<void> {
    if (this.cacheConfig && !this.cache) {
      this.cache = new TypeSchemaCache(this.cacheConfig);
      await this.cache.initialize();
    }
  }

  async registerFromPackageMetas(
    packageMetas: PackageInfo[],
  ): Promise<Register> {
    const packageNames = packageMetas.map(
      (meta) => `${meta.name}${meta.version}`,
    );
    this.logger.step(`Loading FHIR packages: ${packageNames.join(", ")}`);

    await this.manager.init();

    return registerFromManager(this.manager);
  }

  generateFhirSchemas(
    structureDefinitions: StructureDefinition[],
  ): FHIRSchema[] {
    this.logger.progress(
      `Converting ${structureDefinitions.length} StructureDefinitions to FHIRSchemas`,
    );

    // TODO: do it on the TypeSchema
    const filteredStructureDefinitions =
      this.applyStructureDefinitionTreeshaking(structureDefinitions);

    const fhirSchemas: FHIRSchema[] = [];
    let convertedCount = 0;
    let failedCount = 0;

    for (const sd of filteredStructureDefinitions) {
      try {
        const fhirSchema = fhirschema.translate(sd as StructureDefinition);
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
      `FHIR Schema conversion completed: ${convertedCount}/${filteredStructureDefinitions.length} successful, ${failedCount} failed`,
    );
    return fhirSchemas;
  }

  async generateValueSetSchemas(
    valueSets: any[],
    packageInfo: PackageInfo,
  ): Promise<TypeSchema[]> {
    if (valueSets.length > 0) {
      this.logger.debug(
        `${valueSets.length} ValueSets available for enum extraction`,
      );
    }

    // Process ValueSets separately to add to TypeSchema output
    const valueSetSchemas: TypeSchema[] = [];
    if (valueSets.length > 0) {
      this.logger.progress(
        `Converting ${valueSets.length} ValueSets to TypeSchema`,
      );

      let valueSetConvertedCount = 0;
      let valueSetFailedCount = 0;

      for (const vs of valueSets) {
        try {
          const valueSetSchema = await transformValueSet(
            vs,
            this.manager,
            packageInfo,
          );
          if (valueSetSchema) {
            valueSetSchemas.push(valueSetSchema);
            valueSetConvertedCount++;

            this.logger.debug(`Converted ValueSet: ${vs.name || vs.id}`);
          }
        } catch (error) {
          valueSetFailedCount++;
          this.logger.warn(
            `Failed to convert ValueSet ${vs.name || vs.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.success(
        `ValueSet conversion completed: ${valueSetConvertedCount}/${valueSets.length} successful, ${valueSetFailedCount} failed`,
      );
    }
    return valueSetSchemas;
  }

  async generateFromPackage(
    packageName: string,
    packageVersion?: string,
  ): Promise<TypeSchema[]> {
    await this.initializeCache();
    if (this.cache && !(this.cacheConfig?.forceRegenerate ?? false)) {
      const cachedSchemas = this.cache.getByPackage(packageName);
      if (cachedSchemas.length > 0) {
        this.logger.info(
          `Using cached TypeSchemas for package: ${packageName} (${cachedSchemas.length} schemas)`,
        );
        return cachedSchemas;
      }
    }

    const packageInfo: PackageInfo = {
      name: packageName,
      version: packageVersion || "latest",
    };

    const register = await this.registerFromPackageMetas([packageInfo]);
    const allSchemas = [
      ...(
        await Promise.all(
          register
            .allFS()
            .map(async (fs) => await transformFHIRSchema(register, fs)),
        )
      ).flat(),
      ...(await this.generateValueSetSchemas(register.allVS(), packageInfo)),
    ];

    if (this.cache) {
      for (const schema of allSchemas) {
        await this.cache.set(schema);
      }
    }

    return allSchemas;
  }

  async generateResourceTypeSchemas(
    fhirSchemas: RichFHIRSchema[],
  ): Promise<TypeSchema[]> {
    this.logger.info(
      `Transforming ${fhirSchemas.length} FHIR schemas to Type Schema`,
    );

    const typeSchemas: TypeSchema[] = [];
    for (const fhirSchema of fhirSchemas) {
      typeSchemas.push(
        ...(await transformFHIRSchema(this.manager, fhirSchema)),
      );
    }
    return typeSchemas;
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
