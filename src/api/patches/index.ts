/**
 * Codegen patch-helper factories built on CanonicalManager's `patches` runtime.
 *
 * Each factory returns a CM phase handler (`PackagePatch` / `EntryPatch` / `ResourcePatch`)
 * that works around a package defect. Pass them via `APIBuilder`'s `patches` option, e.g.
 * `patches: { package: [injectDependency("de.basisprofil.r4", { "hl7.fhir.r4.core": "4.0.1" })] }`.
 */

import type { PackageId, PackagePatch, Resource, ResourcePatch } from "@atomic-ehr/fhir-canonical-manager";
import { matchPackage, type PackageMatch } from "@atomic-ehr/fhir-canonical-manager/patch";

/** Scope a resource-phase patch to a package and/or a specific canonical url. */
export type ResourceScope = { package?: PackageMatch; url?: string };

const inScope = (scope: ResourceScope | undefined, pkg: PackageId, resource: Resource): boolean => {
    if (!scope) return true;
    if (scope.package && !matchPackage(scope.package, pkg)) return false;
    if (scope.url !== undefined && resource.url !== scope.url) return false;
    return true;
};

/** Replace every occurrence of each `from` URL with its `to` throughout a (scoped) resource body. */
const replaceUrls =
    (renames: Record<string, string>, scope: ResourceScope | undefined): ResourcePatch =>
    (pkg, resource) => {
        if (!inScope(scope, pkg, resource)) return undefined;
        let str = JSON.stringify(resource);
        let changed = false;
        for (const [from, to] of Object.entries(renames)) {
            if (str.includes(from)) {
                str = str.replaceAll(from, to);
                changed = true;
            }
        }
        return changed ? JSON.parse(str) : undefined;
    };

/** Fix a typo'd canonical URL — the resource's own identity and every reference to it. */
export const renameCanonical = (renames: Record<string, string>, scope?: ResourceScope): ResourcePatch =>
    replaceUrls(renames, scope);

/** Rewrite reference targets (e.g. a profile that points at the wrong/unavailable type). */
export const renameReferenceTarget = (renames: Record<string, string>, scope?: ResourceScope): ResourcePatch =>
    replaceUrls(renames, scope);

/** Swap a binding's ValueSet URL for an available one (e.g. an external set not in any package). */
export const swapBinding = (swaps: Record<string, string>, scope?: ResourceScope): ResourcePatch =>
    replaceUrls(swaps, scope);

/**
 * Add missing codes to a CodeSystem (matched by `url`) — for systems that omit codes used by
 * profiles. No-op if the resource isn't that CodeSystem or already declares every code.
 */
export const patchCodeSystem =
    (url: string, codes: string[]): ResourcePatch =>
    (_pkg, resource) => {
        if (resource.url !== url) return undefined;
        const concept = (resource as { concept?: { code: string }[] }).concept;
        if (!concept) return undefined;
        const existing = new Set(concept.map((c) => c.code));
        const missing = codes.filter((code) => !existing.has(code));
        if (missing.length === 0) return undefined;
        return { ...resource, concept: [...concept, ...missing.map((code) => ({ code }))] };
    };

/**
 * Inject FHIR package dependencies into a matching package's manifest when they aren't
 * already declared (a common defect: a package references core types without depending on
 * the core package). No-op if the package doesn't match or already declares every dep.
 */
export const injectDependency =
    (match: PackageMatch, deps: Record<string, string>): PackagePatch =>
    (pkg, packageJson) => {
        if (!matchPackage(match, pkg)) return undefined;
        const existing = (packageJson.dependencies as Record<string, string> | undefined) ?? {};
        const missing = Object.entries(deps).filter(([name]) => !(name in existing));
        if (missing.length === 0) return undefined;
        return { ...packageJson, dependencies: { ...existing, ...Object.fromEntries(missing) } };
    };

/**
 * Rename a package whose manifest name is a typo, via an old-name → new-name map. No-op for
 * packages not in the map.
 */
export const renamePackage =
    (renames: Record<string, string>): PackagePatch =>
    (pkg, packageJson) => {
        const renamed = renames[pkg.name];
        return renamed === undefined ? undefined : { ...packageJson, name: renamed };
    };
