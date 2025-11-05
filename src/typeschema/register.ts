import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import {
    isStructureDefinition,
    type FHIRSchema,
    type FHIRSchemaElement,
    type StructureDefinition,
} from "@atomic-ehr/fhirschema";
import * as fhirschema from "@atomic-ehr/fhirschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import * as afs from "node:fs/promises";
import * as Path from "node:path";
import type {
    CanonicalUrl,
    CodeSystem,
    Name,
    PackageMeta,
    RichFHIRSchema,
    RichValueSet,
    ValueSet,
} from "@typeschema/types";
import { enrichFHIRSchema, enrichValueSet, isCodeSystem, isValueSet, packageMetaToFhir } from "@typeschema/types";

export type Register = {
    unsafeAppendFs(fs: FHIRSchema): void;
    ensureSpecializationCanonicalUrl(pkg: PackageMeta, name: string | Name | CanonicalUrl): CanonicalUrl;
    resolveSd(pkg: PackageMeta, canonicalUrl: CanonicalUrl): StructureDefinition | undefined;
    resolveFs(pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema | undefined;
    resolveFsGenealogy(pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema[];
    resolveFsSpecializations(pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema[];
    allFs(): RichFHIRSchema[];
    allVs(): RichValueSet[];
    resolveVs(_pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichValueSet | undefined;
    resolveAny(canonicalUrl: CanonicalUrl): any | undefined;
    resolveElementSnapshot(fhirSchema: RichFHIRSchema, path: string[]): FHIRSchemaElement;
    getAllElementKeys(elems: Record<string, FHIRSchemaElement>): string[];
} & ReturnType<typeof CanonicalManager>;

const readPackageJSON = async (workDir: string, packageMeta: PackageMeta) => {
    const packageJSONFileName = Path.join(workDir, "node_modules", packageMeta.name, "package.json");
    const packageJSON = JSON.parse(await afs.readFile(packageJSONFileName, "utf8"));
    return packageJSON;
};

const readPackageDependencies = async (workDir: string, packageMeta: PackageMeta) => {
    const packageJSON = await readPackageJSON(workDir, packageMeta);
    const dependencies = packageJSON.dependencies;
    if (dependencies !== undefined) {
        return Object.entries(dependencies).map(([name, version]): PackageMeta => {
            return { name: name as string, version: version as string };
        });
    }
    return [];
};

type PkgId = string;
type FocusedResource = StructureDefinition | ValueSet | CodeSystem;

type CanonicalResolution = {
    deep: number;
    packageMeta: PackageMeta;
    resource: FocusedResource;
};

type PackageIndex = {
    pkg: PackageMeta;
    canonicalResolution: Record<CanonicalUrl, CanonicalResolution[]>;
    nameResolution: Record<Name, CanonicalUrl>;
    fhirSchemas: Record<CanonicalUrl, RichFHIRSchema>;
    valueSets: Record<CanonicalUrl, RichValueSet>;
};

type PackageAwareResolver = Record<PkgId, PackageIndex>;

const mkEmptyPkgIndex = (pkg: PackageMeta): PackageIndex => {
    return { pkg, nameResolution: {}, canonicalResolution: {}, fhirSchemas: {}, valueSets: {} };
};

const mkPackageAwareResolver = async (
    manager: ReturnType<typeof CanonicalManager>,
    pkg: PackageMeta,
    deep: number = 0,
    _logger?: CodegenLogger,
): Promise<PackageAwareResolver> => {
    const options: PackageAwareResolver = {};

    const deps = await readPackageDependencies("tmp/fhir", pkg);
    for (const dep of deps) {
        const depOptions = mkPackageAwareResolver(manager, dep, deep, _logger);
        Object.assign(options, depOptions);
    }

    const pkgId = packageMetaToFhir(pkg);
    if (!options[pkgId]) options[pkgId] = mkEmptyPkgIndex(pkg);
    for (const resource of await manager.search({ package: pkg })) {
        const rawUrl = resource.url;
        if (!rawUrl) continue;
        if (!(isStructureDefinition(resource) || isValueSet(resource) || isCodeSystem(resource))) continue;

        const url = rawUrl as CanonicalUrl;
        if (!options[pkgId].canonicalResolution[url]) {
            options[pkgId].canonicalResolution[url] = [];
            for (const [depPkgId, { canonicalResolution }] of Object.entries(options)) {
                if (pkgId === depPkgId) continue;
                if (!canonicalResolution[url]) continue;
                for (const deepRes of canonicalResolution[url]) {
                    options[pkgId].canonicalResolution[url].push({
                        deep: deepRes.deep + 1,
                        resource: deepRes.resource,
                        packageMeta: deepRes.packageMeta,
                    });
                }
            }
        }
        options[pkgId].canonicalResolution[url].push({ deep, packageMeta: pkg, resource });
        options[pkgId].canonicalResolution[url].sort((a, b) => a.deep - b.deep);

        const name = resource.name as Name | undefined;
        if (
            name &&
            isStructureDefinition(resource) &&
            (resource.derivation === "specialization" || resource.derivation === undefined)
        ) {
            if (!options[pkgId].nameResolution[name]) {
                options[pkgId].nameResolution[name] = resource.url as CanonicalUrl;
            } else {
                throw new Error(`Duplicate name ${name} in package ${pkgId}`);
            }
        }
    }
    return options;
};

const packageAwareResolveName = (resolver: PackageAwareResolver, pkg: PackageMeta, name: Name) => {
    const pkgId = packageMetaToFhir(pkg);
    if (!resolver[pkgId]) throw new Error(`Package ${pkgId} not found`);
    const resource = resolver[pkgId].nameResolution[name];
    return resource;
};

const packageAgnosticResolveCanonical = (resolver: PackageAwareResolver, url: CanonicalUrl, logger?: CodegenLogger) => {
    const options = Object.values(resolver).flatMap((pkg) => pkg.canonicalResolution[url]);
    if (!options) throw new Error(`No canonical resolution found for ${url} in any package`);
    if (options.length > 1)
        logger?.dry_warn(
            `Multiple canonical resolutions found for ${url} in: ${JSON.stringify(options, undefined, 2)}`,
        );
    return options[0]?.resource;
};

export type RegisterConfig = {
    logger?: CodegenLogger;
    fallbackPackageForNameResolution?: PackageMeta;
};

export const registerFromManager = async (
    manager: ReturnType<typeof CanonicalManager>,
    { logger, fallbackPackageForNameResolution }: RegisterConfig,
): Promise<Register> => {
    const packages = await manager.packages();
    const resolver: PackageAwareResolver = {};
    for (const pkg of packages) {
        Object.assign(resolver, await mkPackageAwareResolver(manager, pkg));
    }

    for (const { pkg, canonicalResolution } of Object.values(resolver)) {
        const pkgId = packageMetaToFhir(pkg);
        if (!resolver[pkgId]) throw new Error(`Package ${pkgId} not found`);
        let counter = 0;
        logger?.info(`FHIR Schema conversion for '${packageMetaToFhir(pkg)}' begins...`);
        for (const [_url, options] of Object.entries(canonicalResolution)) {
            const resource = options[0]?.resource;
            if (!resource) throw new Error(`Resource not found`);
            if (isStructureDefinition(resource)) {
                const rfs = enrichFHIRSchema(fhirschema.translate(resource), pkg);
                counter++;
                resolver[pkgId].fhirSchemas[rfs.url] = rfs;
            }
            if (isValueSet(resource)) {
                const rvs = enrichValueSet(resource, pkg);
                resolver[pkgId].valueSets[rvs.url] = rvs;
            }
        }
        logger?.success(`FHIR Schema conversion for '${packageMetaToFhir(pkg)}' completed: ${counter} successful`);
    }

    const resolveFs = (pkg: PackageMeta, canonicalUrl: CanonicalUrl) => {
        return (
            resolver[packageMetaToFhir(pkg)]?.fhirSchemas[canonicalUrl] ||
            (fallbackPackageForNameResolution &&
                resolver[packageMetaToFhir(fallbackPackageForNameResolution)]?.fhirSchemas[canonicalUrl])
        );
    };

    const resolveVs = (pkg: PackageMeta, canonicalUrl: CanonicalUrl) => {
        return (
            resolver[packageMetaToFhir(pkg)]?.valueSets[canonicalUrl] ||
            (fallbackPackageForNameResolution &&
                resolver[packageMetaToFhir(fallbackPackageForNameResolution)]?.valueSets[canonicalUrl])
        );
    };

    const ensureSpecializationCanonicalUrl = (pkg: PackageMeta, name: string | Name | CanonicalUrl) =>
        packageAwareResolveName(resolver, pkg, name as Name) ||
        (fallbackPackageForNameResolution &&
            packageAwareResolveName(resolver, fallbackPackageForNameResolution, name as Name)) ||
        (name as CanonicalUrl);

    const resolveFsGenealogy = (pkg: PackageMeta, canonicalUrl: CanonicalUrl) => {
        let fs = resolveFs(pkg, canonicalUrl);
        if (fs === undefined) throw new Error(`Failed to resolve FHIR Schema genealogy for '${canonicalUrl}'`);
        const genealogy = [fs];
        while (fs?.base) {
            fs =
                resolveFs(fs.package_meta, fs.base) ||
                resolveFs(fs.package_meta, ensureSpecializationCanonicalUrl(fs.package_meta, fs.base));
            if (fs === undefined) throw new Error(`Failed to resolve FHIR Schema genealogy for '${canonicalUrl}'`);
            genealogy.push(fs);
        }
        return genealogy;
    };

    const resolveFsSpecializations = (pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema[] => {
        return resolveFsGenealogy(pkg, canonicalUrl).filter((fs) => fs.derivation === "specialization");
    };

    const resolveElementSnapshot = (fhirSchema: RichFHIRSchema, path: string[]): FHIRSchemaElement => {
        const geneology = resolveFsGenealogy(fhirSchema.package_meta, fhirSchema.url);
        const elemGeneology = resolveFsElementGenealogy(geneology, path);
        const elemSnapshot = fsElementSnapshot(elemGeneology);
        return elemSnapshot;
    };

    const getAllElementKeys = (elems: Record<string, FHIRSchemaElement>): string[] => {
        const keys: Set<string> = new Set();
        for (const [key, elem] of Object.entries(elems)) {
            keys.add(key);
            for (const choiceKey of elem?.choices || []) {
                if (!elems[choiceKey]) {
                    keys.add(choiceKey);
                }
            }
        }
        return Array.from(keys);
    };

    return {
        ...manager,
        unsafeAppendFs(fs: FHIRSchema) {
            const rfs = enrichFHIRSchema(fs);
            const pkgId = packageMetaToFhir(rfs.package_meta);
            if (!resolver[pkgId]) resolver[pkgId] = mkEmptyPkgIndex(rfs.package_meta);
            resolver[pkgId].nameResolution[rfs.name] = rfs.url;
            resolver[pkgId].fhirSchemas[rfs.url] = rfs;
        },
        resolveFs,
        resolveFsGenealogy: resolveFsGenealogy,
        resolveFsSpecializations: resolveFsSpecializations,
        ensureSpecializationCanonicalUrl,
        resolveSd: (_pkg: PackageMeta, canonicalUrl: CanonicalUrl) => {
            const res = packageAgnosticResolveCanonical(resolver, canonicalUrl, logger);
            if (isStructureDefinition(res)) return res;
            return undefined;
        },
        allFs: () => Object.values(resolver).flatMap((pkgIndex) => Object.values(pkgIndex.fhirSchemas)),
        allVs: () => Object.values(resolver).flatMap((pkgIndex) => Object.values(pkgIndex.valueSets)),
        resolveVs,
        resolveAny: (canonicalUrl: CanonicalUrl) => packageAgnosticResolveCanonical(resolver, canonicalUrl, logger),
        resolveElementSnapshot,
        getAllElementKeys,
    };
};

export const registerFromPackageMetas = async (
    packageMetas: PackageMeta[],
    conf: RegisterConfig,
): Promise<Register> => {
    const packageNames = packageMetas.map((meta) => `${meta.name}@${meta.version}`);
    conf?.logger?.step(`Loading FHIR packages: ${packageNames.join(", ")}`);
    const manager = CanonicalManager({
        packages: packageNames,
        workingDir: "tmp/fhir",
    });
    await manager.init();
    return await registerFromManager(manager, conf);
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
    const revGenealogy = genealogy.reverse();
    const snapshot = Object.assign({}, ...revGenealogy);
    // NOTE: to avoid regeneration nested types
    snapshot.elements = undefined;
    return snapshot;
}
