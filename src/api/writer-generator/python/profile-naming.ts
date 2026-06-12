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
import type {
    ProfileExtension,
    ProfileTypeSchema,
    SnapshotProfileTypeSchema,
    TypeIdentifier,
} from "@root/typeschema/types";
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
export const pyProfileClassName = (schema: ProfileTypeSchema | SnapshotProfileTypeSchema): string => {
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
export const pyProfileModuleName = (
    tsIndex: TypeSchemaIndex,
    schema: ProfileTypeSchema | SnapshotProfileTypeSchema,
): string => {
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

/** snake_case the FHIR `value[x]` field for a TypeIdentifier. */
export const pyValueFieldName = (id: TypeIdentifier): string => `value_${snakeCase(normalizePyName(id.name))}`;

export type ResolvedProfileMethods = {
    extensions: Record<string, string>;
    slices: Record<string, string>;
    allBaseNames: Set<string>;
};

export const resolveProfileMethodBaseNames = (
    extensions: ProfileExtension[],
    sliceDefs: SliceDef[],
): ResolvedProfileMethods => {
    const extensionsRecord: Record<string, string> = {};
    for (const ext of extensions) {
        if (!ext.url) continue;
        extensionsRecord[`${ext.url}:${ext.path}`] = snakeCase(ext.nameCandidates.recommended);
    }

    const slicesRecord: Record<string, string> = {};
    for (const s of sliceDefs) {
        slicesRecord[`${s.fieldName}:${s.sliceName}`] = snakeCase(s.nameCandidates.recommended);
    }

    const allBaseNames = new Set([...Object.values(extensionsRecord), ...Object.values(slicesRecord)]);
    return { extensions: extensionsRecord, slices: slicesRecord, allBaseNames };
};
