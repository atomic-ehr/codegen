/**
 * TypeSchema Generator
 *
 * Generates TypeSchema documents from FHIR packages using fhrischema.
 * Provides high-level API for converting FHIR Structure Definitions to TypeSchema format.
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, StructureDefinition } from "@atomic-ehr/fhirschema";
import * as fhirschema from "@atomic-ehr/fhirschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import { createLogger } from "@root/utils/codegen-logger";
import type { Register } from "@typeschema/register";
import { registerFromManager } from "@typeschema/register";
import { transformFhirSchema, transformValueSet } from "./core/transformer";
import {
    type PackageMeta,
    packageMetaToFhir,
    type RichValueSet,
    type TypeSchema,
    type TypeschemaGeneratorOptions,
} from "./types";

/**
 * TypeSchema Generator class
 *
 * Main class for generating TypeSchema documents from FHIR packages.
 * Leverages fhrischema for FHIR parsing and canonical manager for dependency resolution.
 */
export class TypeSchemaGenerator {
    private manager: ReturnType<typeof CanonicalManager>;

    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: currently its okay
    private options: TypeschemaGeneratorOptions;
    private logger?: CodegenLogger;

    constructor(options: TypeschemaGeneratorOptions) {
        this.options = { ...options };
        this.manager = options.manager;
        this.logger =
            options.logger ||
            createLogger({
                prefix: "TypeSchema",
            });
    }

    async registerFromPackageMetas(packageMetas: PackageMeta[]): Promise<Register> {
        const packageNames = packageMetas.map(packageMetaToFhir);
        this.logger?.step(`Loading FHIR packages: ${packageNames.join(", ")}`);

        await this.manager.init();

        return registerFromManager(this.manager, { focusedPackages: packageMetas });
    }

    generateFhirSchemas(structureDefinitions: StructureDefinition[]): FHIRSchema[] {
        this.logger?.progress(`Converting ${structureDefinitions.length} StructureDefinitions to FHIRSchemas`);

        const fhirSchemas: FHIRSchema[] = [];
        let convertedCount = 0;
        let failedCount = 0;

        for (const sd of structureDefinitions) {
            try {
                const fhirSchema = fhirschema.translate(sd as StructureDefinition) as FHIRSchema;
                fhirSchemas.push(fhirSchema);
                convertedCount++;

                this.logger?.debug(`Converted StructureDefinition: ${sd.name || sd.id} (${sd.resourceType})`);
            } catch (error) {
                failedCount++;
                this.logger?.warn(
                    `Failed to convert StructureDefinition ${sd.name || sd.id}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        this.logger?.success(
            `FHIR Schema conversion completed: ${convertedCount}/${structureDefinitions.length} successful, ${failedCount} failed`,
        );
        return fhirSchemas;
    }

    async generateValueSetSchemas(valueSets: RichValueSet[], logger?: CodegenLogger): Promise<TypeSchema[]> {
        if (valueSets.length > 0) {
            this.logger?.debug(`${valueSets.length} ValueSets available for enum extraction`);
        }

        const register = await registerFromManager(this.manager, { logger: this.logger });

        // Process ValueSets separately to add to TypeSchema output
        const valueSetSchemas: TypeSchema[] = [];
        if (valueSets.length > 0) {
            this.logger?.progress(`Converting ${valueSets.length} ValueSets to TypeSchema`);

            let valueSetConvertedCount = 0;
            let valueSetFailedCount = 0;

            for (const vs of valueSets) {
                try {
                    const valueSetSchema = await transformValueSet(register, vs, logger);
                    if (valueSetSchema) {
                        valueSetSchemas.push(valueSetSchema);
                        valueSetConvertedCount++;

                        this.logger?.debug(`Converted ValueSet: ${vs.name || vs.id}`);
                    }
                } catch (error) {
                    valueSetFailedCount++;
                    this.logger?.warn(
                        `Failed to convert ValueSet ${vs.name || vs.id}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }

            this.logger?.success(
                `ValueSet conversion completed: ${valueSetConvertedCount}/${valueSets.length} successful, ${valueSetFailedCount} failed`,
            );
        }
        return valueSetSchemas;
    }

    async generateFromPackage(
        packageName: string,
        packageVersion: string | undefined,
        logger?: CodegenLogger,
    ): Promise<TypeSchema[]> {
        const packageInfo: PackageMeta = {
            name: packageName,
            version: packageVersion || "latest",
        };

        const register = await this.registerFromPackageMetas([packageInfo]);
        const valueSets = await this.generateValueSetSchemas(register.allVs(), logger);
        const fhirSchemas = (
            await Promise.all(register.allFs().map(async (fs) => await transformFhirSchema(register, fs, logger)))
        ).flat();
        const allSchemas = [...fhirSchemas, ...valueSets];

        return allSchemas;
    }
}
