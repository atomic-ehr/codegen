/**
 * Codegen patch-helper factories built on CanonicalManager's `patches` runtime.
 *
 * Each factory returns a CM phase handler (`PackagePatch` / `EntryPatch` / `ResourcePatch`)
 * that works around a package defect. Pass them via `APIBuilder`'s `patches` option, e.g.
 * `patches: { package: [injectDependency("de.basisprofil.r4", { "hl7.fhir.r4.core": "4.0.1" })] }`.
 */

import type { PackagePatch } from "@atomic-ehr/fhir-canonical-manager";
import { matchPackage, type PackageMatch } from "@atomic-ehr/fhir-canonical-manager/patch";

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
