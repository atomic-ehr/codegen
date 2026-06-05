/**
 * Codegen patch-helper factories + scoping combinators built on CanonicalManager's `patches`
 * runtime.
 *
 * Helpers are unscoped transforms (`injectDependency`, `renameCanonical`, …); scope them with
 * the `forPackage` / `forResource` combinators, which nest. Pass the result via `APIBuilder`'s
 * `patches` option (a phase accepts a single handler or a list), e.g.
 * `patches: { package: forPackage("de.basisprofil.r4", [injectDependency({ "hl7.fhir.r4.core": "4.0.1" })]) }`.
 */

import type { PackageId, PackagePatch, PatchReportSink, ResourcePatch } from "@atomic-ehr/fhir-canonical-manager";
import { matchPackage, type PackageMatch } from "@atomic-ehr/fhir-canonical-manager/patch";

/** A non-dropping phase handler — `(pkg, value, report) => value | undefined`. */
type Handler<V> = (pkg: PackageId, value: V, report: PatchReportSink) => V | undefined;

/** Run `handlers` left-to-right over `value`; return the result only if something changed. */
const run = <V>(handlers: Handler<V>[], pkg: PackageId, value: V, report: PatchReportSink): V | undefined => {
    let acc = value;
    let changed = false;
    for (const handler of handlers) {
        const result = handler(pkg, acc, report);
        if (result !== undefined) {
            acc = result;
            changed = true;
        }
    }
    return changed ? acc : undefined;
};

// ── Scoping combinators ──────────────────────────────────────────────────────

/** Apply `handlers` only to packages matching `match`. Works for package- and resource-phase
 *  handlers, and nests with `forResource`. */
export const forPackage = <V>(match: PackageMatch, handlers: Handler<V>[]): Handler<V> => {
    return (pkg, value, report) => (matchPackage(match, pkg) ? run(handlers, pkg, value, report) : undefined);
};

/** Apply resource `handlers` only to the resource with the given canonical `url`. */
export const forResource = (url: string, handlers: ResourcePatch[]): ResourcePatch => {
    return (pkg, resource, report) => (resource.url === url ? run(handlers, pkg, resource, report) : undefined);
};

// ── Unscoped transform helpers ───────────────────────────────────────────────

/** Replace every occurrence of each `from` URL with its `to` throughout the resource body. */
const replaceUrls =
    (renames: Record<string, string>): ResourcePatch =>
    (_pkg, resource) => {
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
export const renameCanonical = (renames: Record<string, string>): ResourcePatch => replaceUrls(renames);

/** Rewrite reference targets (e.g. a profile that points at the wrong/unavailable type). */
export const renameReferenceTarget = (renames: Record<string, string>): ResourcePatch => replaceUrls(renames);

/** Swap a binding's ValueSet URL for an available one (e.g. an external set not in any package). */
export const swapBinding = (swaps: Record<string, string>): ResourcePatch => replaceUrls(swaps);

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
 * Inject FHIR package dependencies into the manifest when they aren't already declared (a common
 * defect: a package references core types without depending on the core package). Scope it with
 * `forPackage`. No-op if every dep is already declared.
 */
export const injectDependency =
    (deps: Record<string, string>): PackagePatch =>
    (_pkg, packageJson) => {
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
