import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema, FHIRSchemaElement, StructureDefinition } from "@atomic-ehr/fhirschema";
import * as fhirschema from "@atomic-ehr/fhirschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { CanonicalUrl, Name, PackageMeta, RichFHIRSchema, RichValueSet } from "@typeschema/types";
import { enrichFHIRSchema, packageMetaToFhir } from "@typeschema/types";

export type Register = {
    appendFs(fs: FHIRSchema): void;
    ensureSpecializationCanonicalUrl(name: string | Name | CanonicalUrl): CanonicalUrl;
    resolveSd(canonicalUrl: CanonicalUrl): StructureDefinition | undefined;
    resolveFs(canonicalUrl: CanonicalUrl): RichFHIRSchema | undefined;
    resolveFsGenealogy(canonicalUrl: CanonicalUrl): RichFHIRSchema[];
    resolveFsSpecializations(canonicalUrl: CanonicalUrl): RichFHIRSchema[];
    allSd(): StructureDefinition[];
    allFs(): RichFHIRSchema[];
    allVs(): RichValueSet[];
    resolveVs(canonicalUrl: CanonicalUrl): RichValueSet | undefined;
    complexTypeDict(): Record<string, RichFHIRSchema>;
    resolveAny(canonicalUrl: CanonicalUrl): any | undefined;
} & ReturnType<typeof CanonicalManager>;

export const registerFromManager = async (
    manager: ReturnType<typeof CanonicalManager>,
    logger?: CodegenLogger,
): Promise<Register> => {
    const packages = await manager.packages();
    const flatRawIndex: Record<CanonicalUrl, any> = {};
    const indexByPackages = [] as {
        package_meta: PackageMeta;
        index: Record<CanonicalUrl, any>;
    }[];
    for (const pkg of packages) {
        const resources = await manager.search({ package: pkg });
        const perPackageIndex = {} as Record<CanonicalUrl, any>;
        for (const resource of resources) {
            const url = resource.url as CanonicalUrl;
            if (!url) continue;
            if (perPackageIndex[url]) throw new Error(`Duplicate resource URL: ${url}`);
            perPackageIndex[url] = resource;
            if (flatRawIndex[url]) throw new Error(`Duplicate resource URL: ${url}`);
            flatRawIndex[url] = resource;
        }
        indexByPackages.push({
            package_meta: pkg,
            index: perPackageIndex,
        });
    }

    const sdIndex = {} as Record<CanonicalUrl, StructureDefinition>;
    const vsIndex = {} as Record<string, RichValueSet>;
    const fsIndex = {} as Record<CanonicalUrl, RichFHIRSchema>;
    const specNameToCanonical = {} as Record<Name, CanonicalUrl>;

    for (const resourcesByPackage of indexByPackages) {
        const packageMeta = resourcesByPackage.package_meta;
        for (const [surl, resource] of Object.entries(resourcesByPackage.index)) {
            const url = surl as CanonicalUrl;
            if (resource.resourceType === "StructureDefinition") {
                const sd = resource as StructureDefinition;
                sdIndex[url] = sd;
                const rfs = enrichFHIRSchema(fhirschema.translate(sd), packageMeta);
                fsIndex[rfs.url] = rfs;
                if (rfs.derivation === undefined || rfs.derivation === "specialization") {
                    if (specNameToCanonical[rfs.name]) {
                        const info = {
                            old: specNameToCanonical[rfs.name],
                            oldDerivation: flatRawIndex[specNameToCanonical[rfs.name]!].derivation,
                            new: rfs.url,
                            newDerivation: rfs.derivation,
                        };
                        throw new Error(`Duplicate name ${rfs.name} ${JSON.stringify(info, undefined, 2)}`);
                    }
                    specNameToCanonical[rfs.name] = rfs.url;
                }
            }
            if (resource.resourceType === "ValueSet") {
                if (!resource.package_meta) {
                    resource.package_meta = packageMeta;
                }
                vsIndex[resource.url!] = resource as RichValueSet;
            }
        }
        logger?.success(
            `FHIR Schema conversion for '${packageMetaToFhir(packageMeta)}' completed: ${Object.keys(fsIndex).length} successful`,
        );
    }

    const complexTypes = {} as Record<string, RichFHIRSchema>;
    for (const fs of Object.values(fsIndex)) {
        if (fs.kind === "complex-type") {
            complexTypes[fs.url] = fs;
        }
    }

    const resolveFsGenealogy = (canonicalUrl: CanonicalUrl) => {
        let fs = fsIndex[canonicalUrl]!;
        if (fs === undefined) throw new Error(`Failed to resolve FHIR Schema genealogy for '${canonicalUrl}'`);
        const genealogy = [fs];
        while (fs?.base) {
            fs = fsIndex[fs.base] || fsIndex[specNameToCanonical[fs.base as string as Name]!]!;
            genealogy.push(fs);
            if (fs === undefined) throw new Error(`Failed to resolve FHIR Schema genealogy for '${canonicalUrl}'`);
        }
        return genealogy;
    };

    const resolveFsSpecializations = (canonicalUrl: CanonicalUrl): RichFHIRSchema[] => {
        return resolveFsGenealogy(canonicalUrl).filter((fs) => fs.derivation === "specialization");
    };

    return {
        ...manager,
        appendFs(fs: FHIRSchema) {
            const rfs = enrichFHIRSchema(fs);
            fsIndex[rfs.url] = rfs;
            specNameToCanonical[rfs.name] = rfs.url;
        },
        resolveFs: (canonicalUrl: CanonicalUrl) => fsIndex[canonicalUrl],
        resolveFsGenealogy: resolveFsGenealogy,
        resolveFsSpecializations: resolveFsSpecializations,
        ensureSpecializationCanonicalUrl: (name: string | Name | CanonicalUrl) =>
            specNameToCanonical[name as Name] || (name as CanonicalUrl),
        allSd: () => Object.values(sdIndex),
        resolveSd: (canonicalUrl: CanonicalUrl) => sdIndex[canonicalUrl],
        allFs: () => Object.values(fsIndex),
        allVs: () => Object.values(vsIndex),
        resolveVs: (canonicalUrl: CanonicalUrl) => vsIndex[canonicalUrl],
        complexTypeDict: () => complexTypes,
        resolveAny: (canonicalUrl: CanonicalUrl) => flatRawIndex[canonicalUrl],
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
    return await registerFromManager(manager, logger);
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
    const snapshot = genealogy.reverse().reduce((snapshot, elem) => ({ ...snapshot, ...elem }), {});
    // NOTE: to avoid regeneration nested types
    snapshot.elements = undefined;
    return snapshot;
}
