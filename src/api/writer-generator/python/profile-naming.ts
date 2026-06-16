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

/** Format a field name per the active field-naming mode (defaults to snake_case),
 *  escaping Python keywords. The result must match the model's field name, so the
 *  same `formatName` used to generate the models is threaded through. */
export const pyFieldName = (n: string, formatName: (s: string) => string = snakeCase): string => {
    const cleaned = n.replace(/\[x\]/g, "").replace(/[:./]/g, "_");
    const out = formatName(cleaned);
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

/** The FHIR `value[x]` field name for a TypeIdentifier, formatted per the active
 *  field-naming mode (e.g. `value_coding` for snake_case, `valueCoding` for camelCase). */
export const pyValueFieldName = (id: TypeIdentifier, formatName: (s: string) => string = snakeCase): string =>
    formatName(`value${pascalCase(normalizePyName(id.name))}`);

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
