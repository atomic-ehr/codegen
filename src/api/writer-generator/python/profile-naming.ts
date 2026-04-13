/**
 * Naming utilities for Python profile generation.
 *
 * Mirrors `src/api/writer-generator/typescript/name.ts`, but emits
 * snake_case method / field names and `module_file.py` filenames.
 *
 * Used by the Python profile generator — kept in its own file so
 * the existing `naming-utils.ts` stays focused on the core type writer.
 */

import { PYTHON_KEYWORDS } from "@root/api/writer-generator/python/naming-utils";
import { pascalCase, snakeCase } from "@root/api/writer-generator/utils";
import type { ProfileExtension, ProfileTypeSchema, TypeIdentifier } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { SliceDef } from "./profile-slices";

// ---------------------------------------------------------------------------
// Identifier sanitisation
// ---------------------------------------------------------------------------

/** Make a raw FHIR name safe to use as a Python identifier. */
export const normalizePyName = (n: string): string => {
    let out = n.replace(/\[x\]/g, "_x_").replace(/[- :./]/g, "_");
    if (PYTHON_KEYWORDS.has(out)) out = `${out}_`;
    if (/^\d/.test(out)) out = `_${out}`;
    return out;
};

/** Snake-case conversion that first strips `[x]` and FHIR slice separators. */
export const pySnakeName = (name: string): string => {
    if (!name) return "";
    const cleaned = name.replace(/\[x\]/g, "").replace(/[:./]/g, "_");
    return snakeCase(cleaned);
};

/** Snake-case a field name, escaping Python keywords. */
export const pyFieldName = (n: string): string => {
    const out = pySnakeName(n);
    return PYTHON_KEYWORDS.has(out) ? `${out}_` : out;
};

// ---------------------------------------------------------------------------
// Profile module + class names
// ---------------------------------------------------------------------------

/** PascalCase class name for a profile, suffixed with `Profile` (or
 *  `Extension` when the profile already ends in "Extension"). Mirrors
 *  `tsProfileClassName` exactly. */
export const pyProfileClassName = (schema: ProfileTypeSchema): string => {
    const name = pascalCase(normalizePyName(schema.identifier.name));
    if (schema.base.name === "Extension") {
        return name.endsWith("Extension") ? name : `${name}Extension`;
    }
    return name.endsWith("Profile") ? name : `${name}Profile`;
};

/** snake_case module stem: `<base>_<profile-identifier>`, mirroring TS
 *  `tsProfileModuleName`. The profile portion uses the raw identifier name
 *  (NOT the class name), so e.g. R4 `bodyweight` → `observation_bodyweight`
 *  and US Core `USCorePatientProfile` → `patient_us_core_patient_profile`. */
export const pyProfileModuleName = (tsIndex: TypeSchemaIndex, schema: ProfileTypeSchema): string => {
    const baseSchema = tsIndex.findLastSpecialization(schema);
    const baseName = snakeCase(normalizePyName(baseSchema.identifier.name));
    const profileName = snakeCase(normalizePyName(schema.identifier.name));
    return `${baseName}_${profileName}`;
};

// ---------------------------------------------------------------------------
// Slice / extension method base names + collision resolution
// ---------------------------------------------------------------------------

/** Static class attribute name for a slice's match constant. */
export const pySliceStaticName = (name: string): string => {
    const cleaned = name.replace(/\[x]/g, "").replace(/[^a-zA-Z0-9_]/g, "_");
    return `_${snakeCase(cleaned)}_slice_match`;
};

/** Base method name for a slice (mirrors `tsSliceMethodBaseName` but snake). */
export const pySliceMethodBaseName = (sliceName: string): string => pySnakeName(sliceName) || "slice";

/** Disambiguated slice base name including the field. */
export const pyQualifiedSliceMethodBaseName = (fieldName: string, sliceName: string): string => {
    const fieldPart = pySnakeName(fieldName) || "field";
    const slicePart = pySnakeName(sliceName) || "slice";
    return `${fieldPart}_${slicePart}`;
};

/** Base method name for an extension. */
export const pyExtensionMethodBaseName = (name: string): string => pySnakeName(name) || "extension";

/** Disambiguated extension base name including its path. */
export const pyQualifiedExtensionMethodBaseName = (name: string, path?: string): string => {
    const rawPath =
        path
            ?.split(".")
            .filter((p) => p && p !== "extension")
            .map(pySnakeName)
            .filter(Boolean)
            .join("_") ?? "";
    const namePart = pySnakeName(name) || "extension";
    return rawPath ? `${rawPath}_${namePart}` : namePart;
};

/** snake_case the FHIR `value[x]` field for a TypeIdentifier. */
export const pyValueFieldName = (id: TypeIdentifier): string => `value_${snakeCase(normalizePyName(id.name))}`;

// ---------------------------------------------------------------------------
// Name collision resolution
// ---------------------------------------------------------------------------

type NameEntry = { key: string; candidates: string[] };

const resolveNameCollisions = (entries: NameEntry[]): Record<string, string> => {
    const levels = entries[0]?.candidates.length ?? 0;
    const resolve = (unresolved: NameEntry[], level: number): Record<string, string> => {
        if (unresolved.length === 0 || level >= levels) return {};
        const counts: Record<string, number> = {};
        for (const e of unresolved) {
            const name = e.candidates[level] ?? "";
            counts[name] = (counts[name] ?? 0) + 1;
        }
        const isLastLevel = level >= levels - 1;
        const resolved: Record<string, string> = {};
        const colliding: NameEntry[] = [];
        for (const e of unresolved) {
            const name = e.candidates[level] ?? "";
            if ((counts[name] ?? 0) > 1 && !isLastLevel) {
                colliding.push(e);
            } else {
                resolved[e.key] = name;
            }
        }
        return { ...resolved, ...resolve(colliding, level + 1) };
    };
    return resolve(entries, 0);
};

export type ResolvedProfileMethods = {
    extensions: Record<string, string>;
    slices: Record<string, string>;
    allBaseNames: Set<string>;
};

export const resolveProfileMethodBaseNames = (
    extensions: ProfileExtension[],
    sliceDefs: SliceDef[],
): ResolvedProfileMethods => {
    const extensionEntries: NameEntry[] = extensions
        .filter((ext) => ext.url)
        .map((ext) => {
            const base = pyExtensionMethodBaseName(ext.name);
            const qualified = pyQualifiedExtensionMethodBaseName(ext.name, ext.path);
            return { key: `${ext.url}:${ext.path}`, candidates: [base, qualified, `${qualified}_extension`] };
        });

    const sliceEntries: NameEntry[] = sliceDefs.map((s) => {
        const base = pySliceMethodBaseName(s.sliceName);
        const qualified = pyQualifiedSliceMethodBaseName(s.fieldName, s.sliceName);
        return { key: `${s.fieldName}:${s.sliceName}`, candidates: [base, qualified, `${qualified}_slice`] };
    });

    const allEntries = [...extensionEntries, ...sliceEntries];
    if (allEntries.length === 0) return { extensions: {}, slices: {}, allBaseNames: new Set() };

    const resolved = resolveNameCollisions(allEntries);
    const toRecord = (entries: NameEntry[]) =>
        Object.fromEntries(entries.map((e) => [e.key, resolved[e.key] ?? e.candidates[0] ?? ""]));

    const extensionsRecord = toRecord(extensionEntries);
    const slicesRecord = toRecord(sliceEntries);
    const allBaseNames = new Set([...Object.values(extensionsRecord), ...Object.values(slicesRecord)]);
    return { extensions: extensionsRecord, slices: slicesRecord, allBaseNames };
};
