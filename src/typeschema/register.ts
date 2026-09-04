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

const BARE_RESOURCE_NAME_RE = /^[a-zA-Z0-9]+$/;
const FHIR_BASE_CANONICAL = "http://hl7.org/fhir/StructureDefinition/Base";

export const isFhirBaseCanonical = (canonical: string): boolean => canonical.split("|")[0] === FHIR_BASE_CANONICAL;

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
    /** Returns raw terminology resources grouped by their originating package. */
    allTerminology(): PackageTerminology[];
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

export type TerminologyConcept = {
    code: string;
    display?: string;
    concept?: TerminologyConcept[];
};

export type TerminologyResource = {
    resourceType: "CodeSystem" | "ValueSet" | "NamingSystem";
    id?: string;
    name?: string;
    url: string;
    content?: string;
    concept?: TerminologyConcept[];
};

export type PackageTerminology = {
    packageMeta: PackageMeta;
    resources: TerminologyResource[];
};

const projectTerminologyConcepts = (concepts: unknown): TerminologyConcept[] | undefined => {
    if (!Array.isArray(concepts)) return undefined;
    const projected: TerminologyConcept[] = [];
    const stack: {
        source: unknown[];
        target: TerminologyConcept[];
        index: number;
        parent?: TerminologyConcept;
    }[] = [{ source: concepts, target: projected, index: 0 }];

    while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        if (!frame) break;
        if (frame.index >= frame.source.length) {
            if (frame.parent && frame.target.length === 0) delete frame.parent.concept;
            stack.pop();
            continue;
        }
        const concept = frame.source[frame.index];
        frame.index += 1;
        if (concept === null || typeof concept !== "object") continue;
        const candidate = concept as { code?: unknown; display?: unknown; concept?: unknown };
        if (typeof candidate.code !== "string") continue;
        const copy: TerminologyConcept = {
            code: candidate.code,
            ...(typeof candidate.display === "string" ? { display: candidate.display } : {}),
        };
        frame.target.push(copy);
        if (Array.isArray(candidate.concept)) {
            const nested: TerminologyConcept[] = [];
            copy.concept = nested;
            stack.push({ source: candidate.concept, target: nested, index: 0, parent: copy });
        }
    }

    return projected;
};

const namingSystemIdentity = (
    candidate: { id?: unknown; name?: unknown; uniqueId?: unknown },
    logger?: CodegenLog,
): string | undefined => {
    const uniqueIds = Array.isArray(candidate.uniqueId)
        ? candidate.uniqueId.filter(
              (identifier): identifier is { type: string; value: string; preferred?: boolean } =>
                  identifier !== null &&
                  typeof identifier === "object" &&
                  typeof (identifier as { type?: unknown }).type === "string" &&
                  typeof (identifier as { value?: unknown }).value === "string" &&
                  (identifier as { value: string }).value.length > 0,
          )
        : [];
    const preferred = uniqueIds.filter(({ preferred }) => preferred === true);
    const candidates = preferred.length > 0 ? preferred : uniqueIds;
    const identifier = candidates.find(({ type }) => type === "uri") ?? candidates[0];
    if (identifier) {
        if (identifier.type === "oid" && !identifier.value.startsWith("urn:oid:")) return `urn:oid:${identifier.value}`;
        if (identifier.type === "uuid" && !identifier.value.startsWith("urn:uuid:"))
            return `urn:uuid:${identifier.value}`;
        return identifier.value;
    }
    if (typeof candidate.id === "string" && candidate.id.length > 0) return `NamingSystem/${candidate.id}`;
    if (typeof candidate.name === "string" && candidate.name.length > 0) return `NamingSystem/${candidate.name}`;
    logger?.dryWarn("NamingSystem has no uniqueId, id, or name and cannot be emitted.");
    return undefined;
};

const asTerminologyResource = (resource: unknown, logger?: CodegenLog): TerminologyResource | undefined => {
    if (resource === null || typeof resource !== "object") return undefined;
    const candidate = resource as {
        resourceType?: unknown;
        id?: unknown;
        name?: unknown;
        url?: unknown;
        content?: unknown;
        concept?: unknown;
        uniqueId?: unknown;
    };
    if (!["CodeSystem", "ValueSet", "NamingSystem"].includes(String(candidate.resourceType))) return undefined;
    const resourceType = candidate.resourceType as TerminologyResource["resourceType"];
    let url = typeof candidate.url === "string" && candidate.url.length > 0 ? candidate.url : undefined;
    if (url === undefined && resourceType === "NamingSystem") url = namingSystemIdentity(candidate, logger);
    if (typeof url !== "string" || url.length === 0) return undefined;
    const concepts = projectTerminologyConcepts(candidate.concept);
    return {
        resourceType,
        ...(typeof candidate.id === "string" ? { id: candidate.id } : {}),
        ...(typeof candidate.name === "string" ? { name: candidate.name } : {}),
        url,
        ...(typeof candidate.content === "string" ? { content: candidate.content } : {}),
        ...(concepts && concepts.length > 0 ? { concept: concepts } : {}),
    };
};

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
    terminology: TerminologyResource[];
};

type PackageAwareResolver = Record<PkgId, PackageIndex>;
export type ResolutionTree = Record<PkgName, Record<CanonicalUrl, { deep: number; pkg: PackageMeta }[]>>;

const mkEmptyPkgIndex = (pkg: PackageMeta): PackageIndex => {
    return {
        pkg,
        canonicalResolution: {},
        fhirSchemas: {},
        valueSets: {},
        terminology: [],
    };
};

const mkPackageAwareResolver = async (
    manager: ReturnType<typeof CanonicalManager>,
    pkg: PackageMeta,
    deep: number,
    acc: PackageAwareResolver,
    logger?: CodegenLog,
): Promise<PackageIndex> => {
    const pkgId = packageMetaToFhir(pkg);
    logger?.info(`${" ".repeat(deep * 2)}+ ${pkgId}`);
    if (acc[pkgId]) return acc[pkgId];

    const index = mkEmptyPkgIndex(pkg);
    acc[pkgId] = index;
    for (const resource of await manager.search({ package: pkg })) {
        const terminologyResource = asTerminologyResource(resource, logger);
        if (terminologyResource) index.terminology.push(terminologyResource);
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
        const { canonicalResolution } = await mkPackageAwareResolver(manager, depPkg, deep + 1, acc, logger);
        for (const [surl, resolutions] of Object.entries(canonicalResolution)) {
            const url = surl as CanonicalUrl;
            index.canonicalResolution[url] = [...(index.canonicalResolution[url] || []), ...resolutions];
        }
    }
    for (const resolutionOptions of Object.values(index.canonicalResolution)) {
        resolutionOptions.sort((a, b) => a.deep - b.deep);
    }

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
};

export const registerFromManager = async (
    manager: ReturnType<typeof CanonicalManager>,
    { logger, focusedPackages }: RegisterConfig,
): Promise<Register> => {
    const packages = focusedPackages ?? (await manager.packages());
    const resolver: PackageAwareResolver = {};
    for (const pkg of packages) {
        await mkPackageAwareResolver(manager, pkg, 0, resolver, logger);
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
        if (BARE_RESOURCE_NAME_RE.test(name)) {
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
            if (fs.kind === "logical" && fs.derivation === "specialization" && isFhirBaseCanonical(baseUrl)) break;
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
                                    package_name: r.pkg.name,
                                    package_version: r.pkg.version,
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
        allTerminology: () =>
            Object.values(resolver)
                .map(({ pkg, terminology }) => ({ packageMeta: pkg, resources: terminology }))
                .sort((left, right) =>
                    packageMetaToNpm(left.packageMeta).localeCompare(packageMetaToNpm(right.packageMeta)),
                ),
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

export const registerFromPackageMetas = async (
    packageMetas: PackageMeta[],
    conf: RegisterConfig,
): Promise<Register> => {
    const packageNames = packageMetas.map(packageMetaToNpm);
    conf?.logger?.info(`Loading FHIR packages: ${packageNames.join(", ")}`);
    const manager = CanonicalManager({
        packages: packageNames,
        workingDir: ".codegen-cache/canonical-manager-cache",
        registry: conf.registry || undefined,
    });
    await manager.init();
    return await registerFromManager(manager, {
        ...conf,
        focusedPackages: packageMetas,
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
