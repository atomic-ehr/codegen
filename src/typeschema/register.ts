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

// TODO: pass packageNameResolver from APIBuilder. Required to resolve
// name collision by package priority.
export const registerFromManager = async (
    manager: ReturnType<typeof CanonicalManager>,
    conf?: { packageNameResolver?: string[]; logger?: CodegenLogger },
): Promise<Register> => {
    const packageNameResolver = conf?.packageNameResolver ?? ["hl7.fhir.r5.core", "hl7.cda.uv.core"];
    const logger = conf?.logger;
    const flatRawIndex: Record<CanonicalUrl, any> = {};
    const canonicalToPackages = {} as Record<CanonicalUrl, PackageMeta[]>;
    const resourceTypes = new Set<string>(["StructureDefinition", "ValueSet", "CodeSystem"]);

    for (const res of await manager.search({})) {
        const rawUrl = res.url;
        if (!rawUrl) continue;
        if (!resourceTypes.has(res.resourceType)) continue;
        const url = rawUrl as CanonicalUrl;

        const pkg = (await manager.resolveEntry(url)).package;
        if (!pkg) throw new Error(`Can't resolve package for ${url}`);

        if (!canonicalToPackages[url]) canonicalToPackages[url] = [];
        canonicalToPackages[url].push(pkg);

        flatRawIndex[url as CanonicalUrl] = res;
    }

    const collisions = Object.entries(canonicalToPackages)
        .filter(([_, e]) => e.length > 1)
        .map(([url, pkgs]) => `${url}: ${pkgs.map((p) => `${p.name}@${p.version}`).join(", ")}`)
        .join("\n");
    logger?.warn(`Duplicated canonicals: ${collisions}`);

    const packageToResources: Map<PackageMeta, Record<CanonicalUrl, any>> = new Map();
    for (const [url, _pkgs] of Object.entries(canonicalToPackages)) {
        const pkg = (await manager.resolveEntry(url)).package;
        if (!pkg) throw new Error(`Can't find package for ${url}`);
        const res = await manager.resolve(url);
        if (!packageToResources.get(pkg)) {
            packageToResources.set(pkg, {});
        }
        const index = packageToResources.get(pkg);
        if (!index) throw new Error(`Can't find index for ${pkg.name}@${pkg.version}`);
        index[url as CanonicalUrl] = res;
    }

    const indexByPackages = [] as {
        package_meta: PackageMeta;
        index: Record<CanonicalUrl, any>;
    }[];
    for (const [pkg, index] of packageToResources.entries()) {
        indexByPackages.push({
            package_meta: pkg,
            index: index,
        });
    }

    const sdIndex = {} as Record<CanonicalUrl, StructureDefinition>;
    const vsIndex = {} as Record<string, RichValueSet>;
    const fsIndex = {} as Record<CanonicalUrl, RichFHIRSchema>;

    for (const resourcesByPackage of indexByPackages) {
        const packageMeta = resourcesByPackage.package_meta;
        logger?.info(`FHIR Schema conversion for '${packageMetaToFhir(packageMeta)}' begins...`);
        for (const [surl, resource] of Object.entries(resourcesByPackage.index)) {
            const url = surl as CanonicalUrl;
            if (resource.resourceType === "StructureDefinition") {
                const sd = resource as StructureDefinition;
                sdIndex[url] = sd;
                const rfs = enrichFHIRSchema(fhirschema.translate(sd), packageMeta);
                fsIndex[rfs.url] = rfs;
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

    const specNameToCanonicals = {} as Record<Name, Record<string, CanonicalUrl>>;
    for (const rfs of Object.values(fsIndex)) {
        if (rfs.derivation === "constraint") continue;
        const name = rfs.name;
        if (!specNameToCanonicals[name]) specNameToCanonicals[name] = {};
        specNameToCanonicals[name][rfs.package_meta.name] = rfs.url;
    }
    const specNameToCanonical = {} as Record<Name, CanonicalUrl>;
    for (const [sname, canonicals] of Object.entries(specNameToCanonicals)) {
        const name = sname as Name;
        const canonicalValues = Object.values(canonicals);
        if (canonicalValues.length === 1) {
            const url = canonicalValues[0]!;
            specNameToCanonical[name] = url;
        } else {
            for (const pname of packageNameResolver) {
                if (canonicals[pname]) {
                    specNameToCanonical[name] = canonicals[pname];
                    break;
                }
            }
            if (specNameToCanonical[name] === undefined) throw new Error(`No canonical URL found for ${name}`);
        }
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
    return await registerFromManager(manager, { logger: logger });
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
