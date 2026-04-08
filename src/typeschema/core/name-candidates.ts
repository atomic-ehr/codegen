import { camelCase, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import type { NameCandidates, ProfileTypeSchema } from "@root/typeschema/types";

// ── Language-neutral normalization ──────────────────────────────────────

/** Normalize a FHIR name for use in identifiers.
 *  Strips special chars, preserves original casing, uppercases first letter. */
const normalizeName = (s: string): string => {
    const cleaned = s.replace(/\[x\]/g, "").replace(/[- :.]/g, "_");
    if (!cleaned) return "";
    return uppercaseFirstLetter(cleaned);
};

/** Normalize via camelCase + uppercaseFirstLetter (for extension names that may be kebab/snake). */
const normalizeCamelName = (s: string): string => {
    const cleaned = s.replace(/\[x\]/g, "").replace(/:/g, "_");
    if (!cleaned) return "";
    return uppercaseFirstLetter(camelCase(cleaned));
};

// ── Candidate generators ────────────────────────────────────────────────

const extensionCandidates = (name: string, path: string): string[] => {
    const base = normalizeCamelName(name) || "Extension";
    const pathParts = path
        .split(".")
        .filter((p) => p && p !== "extension")
        .join("_");
    const pathPart = pathParts ? normalizeCamelName(pathParts) : "";
    const qualified = `${pathPart}${base}`;
    return [base, qualified, `${qualified}Extension`];
};

const sliceCandidates = (fieldName: string, sliceName: string): string[] => {
    const base = normalizeName(sliceName) || "Slice";
    const fieldPart = normalizeCamelName(fieldName) || "Field";
    const qualified = `${fieldPart}${base}`;
    return [base, qualified, `${qualified}Slice`];
};

// ── Collision resolution ────────────────────────────────────────────────

type NameEntry = { key: string; candidates: string[] };

const countBy = (entries: NameEntry[], level: number, reserved: Set<string>): Record<string, number> =>
    entries.reduce(
        (counts, e) => {
            const name = e.candidates[level] ?? "";
            counts[name] = (counts[name] ?? 0) + 1;
            if (reserved.has(name)) counts[name] = (counts[name] ?? 0) + 1;
            return counts;
        },
        {} as Record<string, number>,
    );

/** Resolve naming collisions across multiple levels of candidates.
 *  Each entry provides candidate names in priority order (e.g. base → qualified → discriminated).
 *  Names in `reserved` are treated as taken — entries colliding with them are bumped to the next level. */
const resolveNameCollisions = (entries: NameEntry[], reserved: Set<string>): Record<string, string> => {
    const levels = entries[0]?.candidates.length ?? 0;

    const resolve = (unresolved: NameEntry[], level: number): Record<string, string> => {
        if (unresolved.length === 0 || level >= levels) return {};
        const counts = countBy(unresolved, level, reserved);
        const isLastLevel = level >= levels - 1;
        const [resolved, colliding] = unresolved.reduce(
            ([res, col], e) => {
                const name = e.candidates[level] ?? "";
                return (counts[name] ?? 0) > 1 && !isLastLevel ? [res, [...col, e]] : [{ ...res, [e.key]: name }, col];
            },
            [{} as Record<string, string>, [] as NameEntry[]],
        );
        return { ...resolved, ...resolve(colliding, level + 1) };
    };

    return resolve(entries, 0);
};

// ── Public API ──────────────────────────────────────────────────────────

/** Compute nameCandidates for a ProfileExtension (recommended is set later by assignRecommendedBaseNames). */
export const mkExtensionNameCandidates = (ext: { name: string; path: string }): NameCandidates => {
    return { candidates: extensionCandidates(ext.name, ext.path), recommended: "" };
};

/** Compute nameCandidates for a FieldSlice (recommended is set later by assignRecommendedBaseNames). */
export const mkSliceNameCandidates = (fieldName: string, sliceName: string): NameCandidates => {
    return { candidates: sliceCandidates(fieldName, sliceName), recommended: "" };
};

/** Resolve collisions across all extensions and slices within a profile.
 *  Field accessor names are reserved — slices/extensions are bumped to avoid them.
 *  Mutates `nameCandidates.recommended` on each extension/slice in place. */
export const assignRecommendedBaseNames = (profile: ProfileTypeSchema): void => {
    const extensionEntries: NameEntry[] = (profile.extensions ?? [])
        .filter((ext) => ext.url)
        .map((ext) => ({
            key: `ext:${ext.url}:${ext.path}`,
            candidates: ext.nameCandidates.candidates,
        }));

    const sliceEntries: NameEntry[] = Object.entries(profile.fields ?? {}).flatMap(([fieldName, field]) => {
        if (!("slicing" in field) || !field.slicing?.slices) return [];
        return Object.entries(field.slicing.slices).map(([sliceName, slice]) => ({
            key: `slice:${fieldName}:${sliceName}`,
            candidates: slice.nameCandidates.candidates,
        }));
    });

    // Field names are reserved so slices/extensions avoid colliding with field accessors
    const reservedNames = new Set(Object.keys(profile.fields ?? {}).map(normalizeCamelName));

    const allEntries = [...extensionEntries, ...sliceEntries];
    if (allEntries.length === 0) return;

    const resolved = resolveNameCollisions(allEntries, reservedNames);

    for (const ext of profile.extensions ?? []) {
        if (!ext.url) continue;
        const key = `ext:${ext.url}:${ext.path}`;
        if (resolved[key]) ext.nameCandidates.recommended = resolved[key];
    }

    for (const [fieldName, field] of Object.entries(profile.fields ?? {})) {
        if (!("slicing" in field) || !field.slicing?.slices) continue;
        for (const [sliceName, slice] of Object.entries(field.slicing.slices)) {
            const key = `slice:${fieldName}:${sliceName}`;
            if (resolved[key]) slice.nameCandidates.recommended = resolved[key];
        }
    }
};
