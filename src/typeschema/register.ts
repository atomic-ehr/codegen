import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, FHIRSchemaElement, StructureDefinition } from "@atomic-ehr/fhirschema";
import * as fhirschema from "@atomic-ehr/fhirschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { CanonicalUrl, Name, PackageMeta, RichFHIRSchema } from "@typeschema/types";
import { enrichFHIRSchema } from "@typeschema/types";

export type Register = {
    appendFs(fs: FHIRSchema): void;
    ensureCanonicalUrl(name: Name | CanonicalUrl): CanonicalUrl;
    resolveSd(canonicalUrl: CanonicalUrl): StructureDefinition | undefined;
    resolveFs(canonicalUrl: CanonicalUrl): RichFHIRSchema | undefined;
    resolveFsGenealogy(canonicalUrl: CanonicalUrl): RichFHIRSchema[];
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

    const structureDefinitions = {} as Record<CanonicalUrl, StructureDefinition>;
    for (const resource of resources) {
        if (resource.resourceType === "StructureDefinition") {
            const url = resource.url! as CanonicalUrl;
            structureDefinitions[url] = resource as StructureDefinition;
        }
    }

    const fhirSchemas = {} as Record<CanonicalUrl, RichFHIRSchema>;
    const nameDict = {} as Record<Name, CanonicalUrl>;
    let [success, failed] = [0, 0];

    for (const sd of Object.values(structureDefinitions)) {
        try {
            const rfs = enrichFHIRSchema(fhirschema.translate(sd), packageInfo);
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
            `FHIR Schema conversion completed: ${success}/${Object.values(structureDefinitions).length} successful, ${failed} failed`,
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

    const resolveFsGenealogy = (canonicalUrl: CanonicalUrl) => {
        let fs = fhirSchemas[canonicalUrl]!;
        if (fs === undefined) throw new Error(`Failed to resolve FHIR Schema genealogy for ${canonicalUrl}`);
        const genealogy = [fs];
        while (fs?.base) {
            console.log(1, fs.base);
            fs = fhirSchemas[fs.base]! || fhirSchemas[nameDict[fs.base as string as Name]!]!;
            genealogy.push(fs);
            if (fs === undefined) throw new Error(`Failed to resolve FHIR Schema genealogy for ${canonicalUrl}`);
        }
        return genealogy;
    };

    return {
        ...manager,
        appendFs(fs: FHIRSchema) {
            const rfs = enrichFHIRSchema(fs);
            fhirSchemas[rfs.url] = rfs;
        },
        resolveFs: (canonicalUrl: CanonicalUrl) => fhirSchemas[canonicalUrl],
        resolveFsGenealogy: resolveFsGenealogy,
        ensureCanonicalUrl: (name: Name | CanonicalUrl) => nameDict[name as Name] || (name as CanonicalUrl),
        allSd: () => Object.values(structureDefinitions),
        resolveSd: (canonicalUrl: CanonicalUrl) => structureDefinitions[canonicalUrl],
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

export const resolveFsElementGenealogy = (genealogy: RichFHIRSchema[], path: string[]): FHIRSchemaElement[] => {
    const [top, ...rest] = path;
    if (top === undefined) return [];
    return genealogy
        .map((fs) => {
            if (!fs.elements) return undefined;
            let elem = fs.elements?.[top];
            for (const k of rest) {
                elem = elem?.elements?.[k];
            }
            return elem;
        })
        .filter((elem) => elem !== undefined);
};

export function fsElementSnapshot(genealogy: FHIRSchemaElement[]): FHIRSchemaElement {
    // FIXME: nested elements will break it
    return genealogy.reverse().reduce((snapshot, elem) => ({ ...snapshot, ...elem }), {});
}
