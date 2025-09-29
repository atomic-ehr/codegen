import type { FHIRSchema, StructureDefinition } from "@atomic-ehr/fhirschema";
import * as fhirschema from "@atomic-ehr/fhirschema";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import {
  type RichFHIRSchema,
  type PackageInfo,
  enrichFHIRSchema,
} from "@typeschema/types";
import type { Code } from "ajv";

export type Register = {
  // resolveSD(canonicalUrl: string): Promise<StructureDefinition | undefined>;
  appendFS(fs: FHIRSchema): void;
  resolveFS(canonicalUrl: string): RichFHIRSchema | undefined;
  allSD(): StructureDefinition[];
  allFS(): RichFHIRSchema[];
  allVS(): any[];
  dictCT(): Record<string, RichFHIRSchema>;
} & ReturnType<typeof CanonicalManager>;

export const registerFromManager = async (
  manager: ReturnType<typeof CanonicalManager>,
  logger?: CodegenLogger,
): Promise<Register> => {
  const resources = await manager.search({});

  const structureDefinitions = {} as Record<string, StructureDefinition>;
  for (const resource of resources) {
    if (resource.resourceType === "StructureDefinition") {
      structureDefinitions[resource.url!] = resource as StructureDefinition;
    }
  }

  const fhirSchemas = {} as Record<string, RichFHIRSchema>;
  let [success, failed] = [0, 0];

  for (const sd of Object.values(structureDefinitions)) {
    try {
      const fs = fhirschema.translate(sd);
      const rfs = enrichFHIRSchema(fs);
      fhirSchemas[rfs.url] = rfs;
      success++;
    } catch (error) {
      logger?.warn(
        `Failed to convert StructureDefinition ${sd.name || sd.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      failed++;
    }
    logger?.success(
      `FHIR Schema conversion completed: ${success}/${structureDefinitions.length} successful, ${failed} failed`,
    );
  }

  const valueSets = {} as Record<string, any[]>;
  for (const resource of resources) {
    if (resource.resourceType === "ValueSet") {
      valueSets[resource.url!] = resource as any;
    }
  }

  const complexTypes = {} as Record<string, RichFHIRSchema>;
  for (const fs of Object.values(fhirSchemas)) {
    if (fs.kind === "complex-type") {
      complexTypes[fs.url] = fs;
    }
  }

  console.log("complexTypes", complexTypes);

  return {
    ...manager,
    // resolveSD: async (canonicalUrl: string) => {
    //   return structureDefinitions[canonicalUrl];
    // },
    appendFS(fs: FHIRSchema) {
      fhirSchemas[fs.url] = enrichFHIRSchema(fs);
    },
    resolveFS: (canonicalUrl: string) => fhirSchemas[canonicalUrl],
    allSD: () => Object.values(structureDefinitions),
    allFS: () => Object.values(fhirSchemas),
    allVS: () => Object.values(valueSets),
    dictCT: () => complexTypes,
  };
};

export const registerFromPackageMetas = async (
  packageMetas: PackageInfo[],
  logger?: CodegenLogger,
): Promise<Register> => {
  const packageNames = packageMetas.map(
    (meta) => `${meta.name}${meta.version}`,
  );
  logger?.step(`Loading FHIR packages: ${packageNames.join(", ")}`);
  const manager = CanonicalManager({
    packages: packageNames,
    workingDir: "tmp/fhir",
  });
  await manager.init();
  return await registerFromManager(manager);
};
