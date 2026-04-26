import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import * as fhirschema from "@atomic-ehr/fhirschema";
import {
    type FHIRSchema,
    type FHIRSchemaElement,
    isStructureDefinition,
    type StructureDefinition,
} from "@atomic-ehr/fhirschema";
import { type CodeSystem, isCodeSystem, isValueSet, type ValueSet } from "@root/fhir-types/hl7-fhir-r4-core";
import type { CodegenLog } from "@root/utils/log";
import type {
    CanonicalUrl,
    Name,
    PackageMeta,
    RichFHIRSchema,
    RichStructureDefinition,
    RichValueSet,
} from "@typeschema/types";
import { enrichFHIRSchema, enrichValueSet, packageMetaToFhir, packageMetaToNpm } from "@typeschema/types";

export type Register = {
    testAppendFs(fs: FHIRSchema): void;
    ensureSpecializationCanonicalUrl(name: string | Name | CanonicalUrl): CanonicalUrl;
    resolveSd(pkg: PackageMeta, canonicalUrl: CanonicalUrl): StructureDefinition | undefined;
    resolveFs(pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema | undefined;
    resolveFsGenealogy(pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema[];
    resolveFsSpecializations(pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema[];
    allSd(): RichStructureDefinition[];
    /** Returns all FHIRSchemas from all packages in the resolver */
    allFs(): RichFHIRSchema[];
    /** Returns all ValueSets from all packages in the resolver */
    allVs(): RichValueSet[];
    resolveVs(_pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichValueSet | undefined;
    resolveAny(canonicalUrl: CanonicalUrl): any | undefined;
    resolveElementSnapshot(fhirSchema: RichFHIRSchema, path: string[]): FHIRSchemaElement;
    getAllElementKeys(elems: Record<string, FHIRSchemaElement>): string[];
    resolver: PackageAwareResolver;
    resolutionTree: () => ResolutionTree;
};

const readPackageDependencies = async (manager: ReturnType<typeof CanonicalManager>, packageMeta: PackageMeta) => {
    const packageJSON = (await manager.packageJson(packageMeta.name)) as any;
    if (!packageJSON) return [];
    const dependencies = packageJSON.dependencies;
    if (dependencies !== undefined) {
        return Object.entries(dependencies).map(([name, version]): PackageMeta => {
            return { name: name as string, version: version as string };
        });
    }
    return [];
};

// FIXME: Tiding: PackageName, PkgId, PkgName
type PkgId = string;
type PkgName = string;
type FocusedResource = StructureDefinition | ValueSet | CodeSystem;

type CanonicalResolution<T> = {
    deep: number;
    pkg: PackageMeta;
    pkgId: PkgId;
    resource: T;
};

type PackageIndex = {
    pkg: PackageMeta;
    canonicalResolution: Record<CanonicalUrl, CanonicalResolution<FocusedResource>[]>;
    fhirSchemas: Record<CanonicalUrl, RichFHIRSchema>;
    valueSets: Record<CanonicalUrl, RichValueSet>;
};

type PackageAwareResolver = Record<PkgId, PackageIndex>;
export type ResolutionTree = Record<PkgName, Record<CanonicalUrl, { deep: number; pkg: PackageMeta }[]>>;

const mkEmptyPkgIndex = (pkg: PackageMeta): PackageIndex => {
    return {
        pkg,
        canonicalResolution: {},
        fhirSchemas: {},
        valueSets: {},
    };
};

const mkPackageAwareResolver = async (
    manager: ReturnType<typeof CanonicalManager>,
    pkg: PackageMeta,
    deep: number,
    acc: PackageAwareResolver,
    logger?: CodegenLog,
    nodeModulesPath?: string,
): Promise<PackageIndex> => {
    const pkgId = packageMetaToFhir(pkg);
    logger?.info(`${" ".repeat(deep * 2)}+ ${pkgId}`);
    if (acc[pkgId]) return acc[pkgId];

    const index = mkEmptyPkgIndex(pkg);

    let resources: FocusedResource[] = (await manager.search({ package: pkg })) as unknown as FocusedResource[];

    // Fallback: some FHIR packages (e.g. de.basisprofil.r4@1.5.4) ship a .index.json with
    // entries that have null `id` fields (e.g. ImplementationGuide resources). The canonical
    // manager's strict parseIndex validation rejects the entire .index.json in this case,
    // leaving the package with 0 indexed resources. When that happens, we fall back to
    // reading the package files directly from the canonical manager's node_modules cache.
    // This is equivalent to the canonical manager's own scanDirectoryForResources fallback.
    if (resources.length === 0 && nodeModulesPath) {
        resources = await scanNodeModulesPackage(nodeModulesPath, pkg, logger);
    }

    for (const resource of resources) {
        const rawUrl = resource.url;
        if (!rawUrl) continue;
        if (!(isStructureDefinition(resource) || isValueSet(resource) || isCodeSystem(resource))) continue;
        const url = rawUrl as CanonicalUrl;
        if (index.canonicalResolution[url])
            logger?.dryWarn("#duplicateCanonical", `Duplicate canonical URL: ${url} at ${pkgId}.`);
        index.canonicalResolution[url] = [{ deep, pkg: pkg, pkgId, resource: resource as FocusedResource }];
    }

    const deps = await readPackageDependencies(manager, pkg);
    for (const depPkg of deps) {
        const { canonicalResolution } = await mkPackageAwareResolver(
            manager,
            depPkg,
            deep + 1,
            acc,
            logger,
            nodeModulesPath,
        );
        for (const [surl, resolutions] of Object.entries(canonicalResolution)) {
            const url = surl as CanonicalUrl;
            index.canonicalResolution[url] = [...(index.canonicalResolution[url] || []), ...resolutions];
        }
    }
    for (const resolutionOptions of Object.values(index.canonicalResolution)) {
        resolutionOptions.sort((a, b) => a.deep - b.deep);
    }

    acc[pkgId] = index;
    return index;
};

const enrichResolver = (resolver: PackageAwareResolver, logger?: CodegenLog) => {
    for (const { pkg, canonicalResolution } of Object.values(resolver)) {
        const pkgId = packageMetaToFhir(pkg);
        if (!resolver[pkgId]) throw new Error(`Package ${pkgId} not found`);
        let counter = 0;
        logger?.info(`FHIR Schema conversion for '${packageMetaToFhir(pkg)}' begins...`);
        for (const [_url, options] of Object.entries(canonicalResolution)) {
            const resolition = options[0];
            if (!resolition) throw new Error(`Resource not found`);
            const resource = resolition.resource;
            const resourcePkg = resolition.pkg;
            if (isStructureDefinition(resource)) {
                const fs = fhirschema.translate(resource as StructureDefinition) as FHIRSchema;
                const rfs = enrichFHIRSchema(fs, resourcePkg);
                counter++;
                resolver[pkgId].fhirSchemas[rfs.url] = rfs;
            }
            if (isValueSet(resource)) {
                const rvs = enrichValueSet(resource, resourcePkg);
                resolver[pkgId].valueSets[rvs.url] = rvs;
            }
        }
        logger?.info(`FHIR Schema conversion for '${packageMetaToFhir(pkg)}' completed: ${counter} successful`);
    }
};

const packageAgnosticResolveCanonical = (resolver: PackageAwareResolver, url: CanonicalUrl, _logger?: CodegenLog) => {
    const options = Object.values(resolver).flatMap((pkg) => pkg.canonicalResolution[url]);
    if (!options) throw new Error(`No canonical resolution found for ${url} in any package`);
    // if (options.length > 1)
    //     logger?.dry_warn(
    //         `Multiple canonical resolutions found for ${url} in: ${options
    //             .map((e) => {
    //                 return `\n    ${JSON.stringify({ ...e, resource: undefined, pkg: undefined })}`;
    //             })
    //             .join("")}`,
    //     );
    return options[0]?.resource;
};

export type RegisterConfig = {
    logger?: CodegenLog;
    focusedPackages?: PackageMeta[];
    /** Custom FHIR package registry URL */
    registry?: string;
    /**
     * Path to the canonical manager's node_modules directory.
     * Used as a fallback when the canonical manager reports 0 resources for a package
     * (which happens when the package's .index.json has invalid entries).
     * Computed automatically in registerFromPackageMetas and registerFromManager.
     * Can be overridden explicitly if the canonical manager is configured with a custom
     * workingDir or a non-standard package layout.
     */
    nodeModulesPath?: string;
};

export const registerFromManager = async (
    manager: ReturnType<typeof CanonicalManager>,
    { logger, focusedPackages, nodeModulesPath }: RegisterConfig,
): Promise<Register> => {
    const packages = focusedPackages ?? (await manager.packages());

    // Compute the node_modules fallback path if not supplied by the caller.
    // This covers APIBuilder callers that invoke registerFromManager directly without
    // going through registerFromPackageMetas. Both code paths use the same hardcoded
    // workingDir, so the cache-key derivation produces the correct path.
    // NOTE: computeCanonicalManagerCacheKey mirrors the SHA-256 algorithm inside
    // @atomic-ehr/fhir-canonical-manager@0.0.23 (dist/cache.js#computeCacheKey).
    // If the canonical manager changes its hash strategy, this fallback will silently
    // stop working — update both together.
    if (!nodeModulesPath && focusedPackages) {
        const pkgNames = focusedPackages.map(packageMetaToNpm);
        nodeModulesPath = computeNodeModulesPath(pkgNames, CANONICAL_MANAGER_WORKING_DIR);
    }

    const resolver: PackageAwareResolver = {};
    for (const pkg of packages) {
        await mkPackageAwareResolver(manager, pkg, 0, resolver, logger, nodeModulesPath);
    }
    enrichResolver(resolver, logger);

    const resolveFs = (pkg: PackageMeta, canonicalUrl: CanonicalUrl) => {
        const pkgIndex = resolver[packageMetaToFhir(pkg)];
        if (pkgIndex) {
            // Use canonicalResolution which is sorted by depth (closest first)
            const resolution = pkgIndex.canonicalResolution[canonicalUrl]?.[0];
            if (resolution) {
                return resolver[resolution.pkgId]?.fhirSchemas[canonicalUrl];
            }
        }
        // Fallback for packages not in resolver: search by package name in fhirSchemas
        for (const idx of Object.values(resolver)) {
            const fs = idx.fhirSchemas[canonicalUrl];
            if (fs && fs.package_meta.name === pkg.name) return fs;
        }
        // Last resort: return any match
        for (const idx of Object.values(resolver)) {
            const fs = idx.fhirSchemas[canonicalUrl];
            if (fs) return fs;
        }
        return undefined;
    };

    const resolveVs = (pkg: PackageMeta, canonicalUrl: CanonicalUrl) => {
        const pkgIndex = resolver[packageMetaToFhir(pkg)];
        if (pkgIndex) {
            // Use canonicalResolution which is sorted by depth (closest first)
            const resolution = pkgIndex.canonicalResolution[canonicalUrl]?.[0];
            if (resolution) {
                return resolver[resolution.pkgId]?.valueSets[canonicalUrl];
            }
        }
        // Fallback for packages not in resolver: search by package name in valueSets
        for (const idx of Object.values(resolver)) {
            const vs = idx.valueSets[canonicalUrl];
            if (vs && vs.package_meta.name === pkg.name) return vs;
        }
        // Last resort: return any match
        for (const idx of Object.values(resolver)) {
            const vs = idx.valueSets[canonicalUrl];
            if (vs) return vs;
        }
        return undefined;
    };

    const ensureSpecializationCanonicalUrl = (name: string | Name | CanonicalUrl): CanonicalUrl => {
        // Strip version suffix from canonical URL (e.g., "Extension|4.0.1" -> "Extension")
        if (name.includes("|")) name = name.split("|")[0] as CanonicalUrl;
        if (name.match(/^[a-zA-Z0-9]+$/)) {
            return `http://hl7.org/fhir/StructureDefinition/${name}` as CanonicalUrl;
        }
        return name as CanonicalUrl;
    };

    const resolveFsGenealogy = (pkg: PackageMeta, canonicalUrl: CanonicalUrl) => {
        let fs = resolveFs(pkg, canonicalUrl);
        if (fs === undefined) throw new Error(`Failed to resolve FHIR Schema: '${canonicalUrl}'`);
        const genealogy = [fs];
        while (fs?.base) {
            const pkg = fs.package_meta;
            const baseUrl = ensureSpecializationCanonicalUrl(fs.base);
            fs = resolveFs(pkg, baseUrl);
            if (fs === undefined)
                throw new Error(
                    `Failed to resolve FHIR Schema base for '${canonicalUrl}'. Problem: '${baseUrl}' from '${packageMetaToFhir(pkg)}'`,
                );
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
        const elemSnapshot = mergeFsElementProps(elemGeneology);
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

    let cachedResolutionTree: ResolutionTree | undefined;

    return {
        testAppendFs(rfs: RichFHIRSchema) {
            const pkgId = packageMetaToFhir(rfs.package_meta);
            if (!resolver[pkgId]) resolver[pkgId] = mkEmptyPkgIndex(rfs.package_meta);
            resolver[pkgId].fhirSchemas[rfs.url] = rfs;
            cachedResolutionTree = undefined;
        },
        resolveFs,
        resolveFsGenealogy: resolveFsGenealogy,
        resolveFsSpecializations: resolveFsSpecializations,
        ensureSpecializationCanonicalUrl,
        resolveSd: (pkg: PackageMeta, canonicalUrl: CanonicalUrl) => {
            const res = resolver[packageMetaToFhir(pkg)]?.canonicalResolution[canonicalUrl]?.[0]?.resource;
            if (isStructureDefinition(res)) return res as StructureDefinition;
            return undefined;
        },
        allSd: () =>
            Object.values(resolver)
                .flatMap((pkgIndex) =>
                    Object.values(pkgIndex.canonicalResolution).flatMap((resolutions) =>
                        resolutions.map((r) => {
                            const sd = r.resource as RichStructureDefinition;
                            if (!sd.package_name) {
                                return {
                                    ...sd,
                                    package_name: pkgIndex.pkg.name,
                                    package_version: pkgIndex.pkg.version,
                                };
                            }
                            return sd;
                        }),
                    ),
                )
                .filter((r): r is RichStructureDefinition => isStructureDefinition(r))
                .sort((sd1, sd2) => sd1.url.localeCompare(sd2.url)),
        allFs: () => Object.values(resolver).flatMap((pkgIndex) => Object.values(pkgIndex.fhirSchemas)),
        allVs: () => Object.values(resolver).flatMap((pkgIndex) => Object.values(pkgIndex.valueSets)),
        resolveVs,
        resolveAny: (canonicalUrl: CanonicalUrl) => packageAgnosticResolveCanonical(resolver, canonicalUrl, logger),
        resolveElementSnapshot,
        getAllElementKeys,
        resolver,
        resolutionTree: () => {
            if (cachedResolutionTree) return cachedResolutionTree;
            const res: ResolutionTree = {};
            for (const [_pkgId, pkgIndex] of Object.entries(resolver)) {
                const pkgName = pkgIndex.pkg.name;
                res[pkgName] = {};
                for (const [surl, resolutions] of Object.entries(pkgIndex.canonicalResolution)) {
                    const url = surl as CanonicalUrl;
                    res[pkgName][url] = [];
                    for (const resolution of resolutions) {
                        res[pkgName][url].push({ deep: resolution.deep, pkg: resolution.pkg });
                    }
                }
            }
            cachedResolutionTree = res;
            return res;
        },
    };
};

/**
 * Compute the same cache key as @atomic-ehr/fhir-canonical-manager uses internally
 * (mirrors computeCacheKey in dist/cache.js — tracked at @0.0.23).
 * Key: SHA-256 of the sorted, JSON-stringified package spec list (e.g. ["kbv.basis@1.8.0", ...]).
 * NOTE: Only the explicitly requested packages go into the key; transitive dependencies
 * are installed into the same node_modules but do not affect the hash.
 */
const computeCanonicalManagerCacheKey = (packageNames: string[]): string => {
    const content = JSON.stringify([...packageNames].sort());
    return createHash("sha256").update(content).digest("hex");
};

/**
 * Returns the path to the canonical manager's node_modules directory for a given
 * set of package names and working directory. Both this function and process.cwd()
 * must stay in sync with @atomic-ehr/fhir-canonical-manager's cacheRecordPaths logic.
 */
const computeNodeModulesPath = (packageNames: string[], workingDir: string): string => {
    const cacheKey = computeCanonicalManagerCacheKey(packageNames);
    return join(process.cwd(), workingDir, cacheKey, "node", "node_modules");
};

/**
 * Some FHIR packages (e.g. de.basisprofil.r4@1.5.4) ship an .index.json that contains
 * entries where the `id` field is null (e.g. ImplementationGuide resources without an id).
 * The canonical manager's parseIndex function treats ANY such entry as fatal — it returns
 * null and silently skips ALL resources from that package.  This means `manager.search()`
 * returns 0 resources for the affected package, so nothing gets added to the canonical
 * resolution and cross-package base-type lookups fail at transform time.
 *
 * Rather than trying to patch the canonical manager's cache (which gets regenerated on
 * reinstall), we scan the package directory directly from the canonical manager's
 * node_modules when the manager reports 0 resources for a focused package.
 * This mirrors what the canonical manager's own `scanDirectoryForResources` does.
 */

/**
 * Reads the version from a package directory's package.json.
 * Returns undefined if the file cannot be read or parsed.
 */
const readPackageDirVersion = async (pkgDir: string): Promise<string | undefined> => {
    const pkgJsonPath = join(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) return undefined;
    try {
        const content = await readFile(pkgJsonPath, "utf-8");
        const parsed = JSON.parse(content) as Record<string, unknown>;
        return typeof parsed.version === "string" ? parsed.version : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Scans a single package directory and returns all FHIR resources found.
 * Does not check version — callers must verify the directory holds the correct version.
 */
const scanNodeModulesPackageDir = async (
    pkgDir: string,
    pkg: PackageMeta,
    logger?: CodegenLog,
): Promise<FocusedResource[]> => {
    const resources: FocusedResource[] = [];
    let fileNames: string[];
    try {
        // readdir without withFileTypes returns string[] — avoids Bun's Dirent<Buffer> type mismatch
        fileNames = await readdir(pkgDir);
    } catch (err) {
        logger?.dryWarn(
            "#canonicalManagerFallback",
            `Failed to read directory for ${packageMetaToFhir(pkg)} at ${pkgDir}: ${err}`,
        );
        return [];
    }

    for (const name of fileNames) {
        if (!name.endsWith(".json")) continue;
        if (name === "package.json" || name === ".index.json") continue;
        try {
            const content = await readFile(join(pkgDir, name), "utf-8");
            const resource = JSON.parse(content) as Record<string, unknown>;
            if (!resource.resourceType || !resource.url) continue;
            if (!(isStructureDefinition(resource) || isValueSet(resource) || isCodeSystem(resource))) continue;
            resources.push(resource as unknown as FocusedResource);
        } catch (err) {
            logger?.dryWarn("#canonicalManagerFallback", `Skipping ${name} in ${packageMetaToFhir(pkg)}: ${err}`);
        }
    }
    return resources;
};

/**
 * Find candidate node_modules paths to scan for a package.
 *
 * The codegen-7y9 fix computed a single `nodeModulesPath` based on the focusedPackages
 * SHA-256 hash. That works when CanonicalManager was initialised with all packages up-front
 * (registerFromPackageMetas case). It FAILS when packages are added later via
 * addTgzPackage / addLocalPackage (APIBuilder.localTgzPackage path) — those calls do NOT
 * change the canonical-manager's cache hash, so the directory the codegen computes does
 * not exist and the fallback is silently disabled.
 *
 * Workaround: if the computed path doesn't exist, scan ALL sibling cache record directories
 * under the codegen-cache/canonical-manager-cache root and try each one. Return paths in
 * insertion order so the most recently used cache record (likely the active one) is tried first.
 */
const findCandidateNodeModulesPaths = (computedPath: string): string[] => {
    const candidates: string[] = [];
    if (existsSync(computedPath)) candidates.push(computedPath);

    // The canonical-manager-cache root is the parent of the cache hash dir's grandparent.
    // computedPath = <root>/<hash>/node/node_modules → cacheRoot = <root>
    const cacheRoot = join(computedPath, "..", "..", "..");
    if (!existsSync(cacheRoot)) return candidates;

    let entries: string[];
    try {
        entries = require("node:fs").readdirSync(cacheRoot);
    } catch {
        return candidates;
    }
    for (const entry of entries) {
        const candidate = join(cacheRoot, entry, "node", "node_modules");
        if (candidate === computedPath) continue;
        if (existsSync(candidate)) candidates.push(candidate);
    }
    return candidates;
};

/**
 * Scans node_modules for a package, preferring an exact version match.
 *
 * Strategy (per candidate cache directory):
 * 1. Check the flat top-level path (nodeModulesPath/<pkg.name>/).
 *    If its package.json version matches the requested version → use it.
 * 2. If the flat path holds a DIFFERENT version, scan all sibling package directories
 *    for nested paths (nodeModulesPath/<parentDir>/node_modules/<pkg.name>/) and
 *    return the first one whose version matches the requested version.
 * 3. If no exact-version match anywhere → fall back to the flat path content
 *    (graceful degradation; preserves the original vrq fix behaviour).
 *
 * Across multiple cache directories: tries each until resources are found. This handles
 * the APIBuilder.localTgzPackage case where the computed cache hash does not reflect
 * later addTgzPackage calls.
 */
const scanNodeModulesPackage = async (
    nodeModulesPath: string,
    pkg: PackageMeta,
    logger?: CodegenLog,
): Promise<FocusedResource[]> => {
    const candidatePaths = findCandidateNodeModulesPaths(nodeModulesPath);
    if (candidatePaths.length === 0) return [];

    let chosenDir: string | undefined;
    let chosenSource = "";
    let chosenFlatVersion: string | undefined;

    // Try each candidate cache directory (computed first, then siblings).
    outer: for (const candidate of candidatePaths) {
        const flatPkgDir = join(candidate, pkg.name);
        if (!existsSync(flatPkgDir)) continue;

        const flatVersion = await readPackageDirVersion(flatPkgDir);
        if (flatVersion === pkg.version) {
            chosenDir = flatPkgDir;
            chosenSource = candidate === nodeModulesPath ? "flat" : `flat (sibling-cache)`;
            chosenFlatVersion = flatVersion;
            break;
        }

        // Scan sibling parent directories for a nested copy with the exact version.
        let parentDirNames: string[];
        try {
            parentDirNames = await readdir(candidate);
        } catch {
            parentDirNames = [];
        }
        for (const parentDir of parentDirNames) {
            const nestedPkgDir = join(candidate, parentDir, "node_modules", pkg.name);
            if (!existsSync(nestedPkgDir)) continue;
            const nestedVersion = await readPackageDirVersion(nestedPkgDir);
            if (nestedVersion === pkg.version) {
                chosenDir = nestedPkgDir;
                chosenSource = `nested (${parentDir}/node_modules/${pkg.name}${candidate === nodeModulesPath ? "" : ", sibling-cache"})`;
                chosenFlatVersion = flatVersion;
                break outer;
            }
        }

        // Remember the flat dir as a graceful-degradation fallback if no exact match found.
        if (!chosenDir) {
            chosenDir = flatPkgDir;
            chosenSource = `flat path (version mismatch: flat=${flatVersion ?? "unknown"}, requested=${pkg.version})`;
            chosenFlatVersion = flatVersion;
        }
    }

    if (!chosenDir) return [];

    const resources = await scanNodeModulesPackageDir(chosenDir, pkg, logger);

    if (resources.length > 0) {
        logger?.warn(
            "#canonicalManagerFallback",
            `Package ${packageMetaToFhir(pkg)} had 0 resources in canonical manager ` +
                `(likely due to invalid .index.json entries or addTgzPackage cache mismatch). ` +
                `Falling back to direct directory scan (${chosenSource}, flat-version=${chosenFlatVersion ?? "unknown"}): ${resources.length} resources found.`,
        );
    }
    return resources;
};

const CANONICAL_MANAGER_WORKING_DIR = ".codegen-cache/canonical-manager-cache" as const;

export const registerFromPackageMetas = async (
    packageMetas: PackageMeta[],
    conf: RegisterConfig,
): Promise<Register> => {
    const packageNames = packageMetas.map(packageMetaToNpm);
    conf?.logger?.info(`Loading FHIR packages: ${packageNames.join(", ")}`);
    const manager = CanonicalManager({
        packages: packageNames,
        workingDir: CANONICAL_MANAGER_WORKING_DIR,
        registry: conf.registry || undefined,
    });
    await manager.init();

    return await registerFromManager(manager, {
        ...conf,
        focusedPackages: packageMetas,
        // Provide nodeModulesPath explicitly so registerFromManager doesn't have to
        // recompute it from focusedPackages (both produce the same result here).
        nodeModulesPath: computeNodeModulesPath(packageNames, CANONICAL_MANAGER_WORKING_DIR),
    });
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

/**
 * Merge scalar properties of an element across its genealogy chain.
 * Sub-elements are intentionally stripped — use resolveFsElementGenealogy
 * to access nested structure properly.
 */
export function mergeFsElementProps(genealogy: FHIRSchemaElement[]): FHIRSchemaElement {
    const revGenealogy = genealogy.reverse();
    const snapshot = Object.assign({}, ...revGenealogy);
    snapshot.elements = undefined;
    return snapshot;
}
