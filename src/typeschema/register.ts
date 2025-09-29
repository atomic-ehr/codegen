import type { FHIRSchema, StructureDefinition } from "@atomic-ehr/fhirschema";
import * as fhirschema from "@atomic-ehr/fhirschema";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import {
  type RichFHIRSchema,
  type PackageMeta,
  enrichFHIRSchema,
} from "@typeschema/types";

export type Register = {
  appendFS(fs: FHIRSchema): void;
  ensureCanonicalUrl(canonicalUrl: string): string;
  resolveSD(canonicalUrl: string): StructureDefinition | undefined;
  resolveFS(canonicalUrl: string): RichFHIRSchema | undefined;
  allSD(): StructureDefinition[];
  allFS(): RichFHIRSchema[];
  allVS(): any[];
  complexTypeDict(): Record<string, RichFHIRSchema>;
} & ReturnType<typeof CanonicalManager>;

export const registerFromManager = async (
  manager: ReturnType<typeof CanonicalManager>,
  logger?: CodegenLogger,
  packageInfo?: PackageMeta,
): Promise<Register> => {
  const resources = await manager.search({});

  const structureDefinitions = {} as Record<string, StructureDefinition>;
  for (const resource of resources) {
    if (resource.resourceType === "StructureDefinition") {
      structureDefinitions[resource.url!] = resource as StructureDefinition;
    }
  }

  const fhirSchemas = {} as Record<string, RichFHIRSchema>;
  const nameDict = {} as Record<string, string>;
  let [success, failed] = [0, 0];

  for (const sd of Object.values(structureDefinitions)) {
    try {
      const fs = fhirschema.translate(sd);
      const rfs = enrichFHIRSchema(fs, packageInfo);
      fhirSchemas[rfs.url] = rfs;
      nameDict[rfs.name] = rfs.url;
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

  return {
    ...manager,
    appendFS(fs: FHIRSchema) {
      fhirSchemas[fs.url] = enrichFHIRSchema(fs);
    },
    resolveFS: (canonicalUrl: string) => fhirSchemas[canonicalUrl],
    ensureCanonicalUrl: (canonicalUrl: string) =>
      nameDict[canonicalUrl] || canonicalUrl,
    allSD: () => Object.values(structureDefinitions),
    resolveSD: (canonicalUrl: string) => structureDefinitions[canonicalUrl],
    allFS: () => Object.values(fhirSchemas),
    allVS: () => Object.values(valueSets),
    complexTypeDict: () => complexTypes,
  };
};

export const registerFromPackageMetas = async (
  packageMetas: PackageMeta[],
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
  // Pass package info from the first package (assuming single package for now)
  return await registerFromManager(manager, logger, packageMetas[0]);
};
