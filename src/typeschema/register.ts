import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, StructureDefinition } from "@atomic-ehr/fhirschema";
import * as fhirschema from "@atomic-ehr/fhirschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import { enrichFHIRSchema, type PackageMeta, type RichFHIRSchema } from "@typeschema/types";

export type Register = {
    appendFs(fs: FHIRSchema): void;
    ensureCanonicalUrl(canonicalUrl: string): string;
    resolveSd(canonicalUrl: string): StructureDefinition | undefined;
    resolveFs(canonicalUrl: string): RichFHIRSchema | undefined;
    resolveFSGenealogy(canonicalUrl: string): RichFHIRSchema[] | undefined;
    allSd(): StructureDefinition[];
    allFs(): RichFHIRSchema[];
    allVs(): any[];
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

    const resolveFSGenealogy = (canonicalUrl: string) => {
        let fs = fhirSchemas[canonicalUrl];
        if (!fs) return undefined;
        const genealogy = [fs];
        while (fs && fs.base) {
            fs = fhirSchemas[fs.base]!;
            genealogy.push(fs);
        }
        return genealogy;
    };

    return {
        ...manager,
        appendFs(fs: FHIRSchema) {
            fhirSchemas[fs.url] = enrichFHIRSchema(fs);
        },
        resolveFs: (canonicalUrl: string) => fhirSchemas[canonicalUrl],
        resolveFSGenealogy: resolveFSGenealogy,
        ensureCanonicalUrl: (canonicalUrl: string) => nameDict[canonicalUrl] || canonicalUrl,
        allSd: () => Object.values(structureDefinitions),
        resolveSd: (canonicalUrl: string) => structureDefinitions[canonicalUrl],
        allFs: () => Object.values(fhirSchemas),
        allVs: () => Object.values(valueSets),
        complexTypeDict: () => complexTypes,
    };
};

export const registerFromPackageMetas = async (
    packageMetas: PackageMeta[],
    logger?: CodegenLogger,
): Promise<Register> => {
    const packageNames = packageMetas.map((meta) => `${meta.name}@${meta.version}`);
    logger?.step(`Loading FHIR packages: ${packageNames.join(", ")}`);
    const manager = CanonicalManager({
        packages: packageNames,
        workingDir: "tmp/fhir",
    });
    await manager.init();
    // Pass package info from the first package (assuming single package for now)
    return await registerFromManager(manager, logger, packageMetas[0]);
};
