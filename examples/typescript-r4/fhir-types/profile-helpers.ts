/**
 * Runtime helpers for generated FHIR profile classes.
 *
 * This file is copied verbatim into every generated TypeScript output and
 * imported by profile modules.  It provides:
 *
 * - **Slice helpers** – match, get, set, and default-fill array slices
 *   defined by a FHIR StructureDefinition.
 * - **Extension helpers** – read complex (nested) FHIR extensions into
 *   plain objects.
 * - **Choice-type helpers** – wrap/unwrap polymorphic `value[x]` fields so
 *   profile classes can expose a flat API.
 * - **Validation helpers** – lightweight structural checks that profile
 *   classes call from their `validate()` method.
 * - **Misc utilities** – deep-match, deep-merge, path navigation.
 */

// ---------------------------------------------------------------------------
// General utilities
// ---------------------------------------------------------------------------

/** Type guard: `value` is a non-null, non-array plain object. */
export const isRecord = (value: unknown): value is Record<string, unknown> => {
    return value !== null && typeof value === "object" && !Array.isArray(value);
};

/**
 * Walk `path` segments from `root`, creating intermediate objects (or using
 * the first element of an existing array) as needed.  Returns the leaf object.
 *
 * Used by extension setters to reach a nested target inside a resource.
 *
 * @example
 *   ensurePath(resource, ["contact", "telecom"])
 *   // → resource.contact.telecom (created if absent)
 */
export const ensurePath = (root: Record<string, unknown>, path: string[]): Record<string, unknown> => {
    let current: Record<string, unknown> = root;
    for (const segment of path) {
        if (Array.isArray(current[segment])) {
            const list = current[segment] as unknown[];
            if (list.length === 0) {
                list.push({});
            }
            current = list[0] as Record<string, unknown>;
        } else {
            if (!isRecord(current[segment])) {
                current[segment] = {};
            }
            current = current[segment] as Record<string, unknown>;
        }
    }
    return current;
};

// ---------------------------------------------------------------------------
// Deep match / merge
// ---------------------------------------------------------------------------

/**
 * Deep-merge `match` into `target`, mutating `target` in place.
 * Skips prototype-pollution keys.  Used internally by {@link applySliceMatch}.
 */
export const mergeMatch = (target: Record<string, unknown>, match: Record<string, unknown>): void => {
    for (const [key, matchValue] of Object.entries(match)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
            continue;
        }
        if (isRecord(matchValue)) {
            if (isRecord(target[key])) {
                mergeMatch(target[key] as Record<string, unknown>, matchValue);
            } else {
                target[key] = { ...matchValue };
            }
        } else {
            target[key] = matchValue;
        }
    }
};

/**
 * Shallow-clone `input` then deep-merge the slice discriminator values from
 * `match` on top, returning a complete slice element ready for insertion.
 *
 * @example
 *   applySliceMatch({ text: "hi" }, { coding: { code: "vital-signs", system: "…" } })
 *   // → { text: "hi", coding: { code: "vital-signs", system: "…" } }
 */
export const applySliceMatch = <T extends object>(input: Partial<T>, match: Partial<Record<keyof T, unknown>>): T => {
    const result = { ...input } as Record<string, unknown>;
    mergeMatch(result, match);
    return result as T;
};

/**
 * Recursively test whether `value` structurally contains everything in
 * `match`.  Arrays are matched with "every match item has a corresponding
 * value item" semantics; objects are matched key-by-key; primitives use `===`.
 *
 * This is the core discriminator check used to identify which array element
 * belongs to a given FHIR slice.
 */
export const matchesValue = (value: unknown, match: unknown): boolean => {
    if (Array.isArray(match)) {
        if (!Array.isArray(value)) {
            return false;
        }
        return match.every((matchItem) => value.some((item) => matchesValue(item, matchItem)));
    }
    if (isRecord(match)) {
        if (!isRecord(value)) {
            return false;
        }
        for (const [key, matchValue] of Object.entries(match)) {
            if (!matchesValue((value as Record<string, unknown>)[key], matchValue)) {
                return false;
            }
        }
        return true;
    }
    return value === match;
};

/**
 * Type guard that discriminates a raw extension input (with an `extension`
 * array) from a flat-API input object.  Using a custom type guard instead of
 * a bare `"extension" in args` lets TypeScript narrow *both* branches of the
 * union — the plain `in` check cannot eliminate a type whose `extension`
 * property is optional.
 */
export const isRawExtensionInput = <TRaw extends object>(input: object): input is TRaw => "extension" in input;

/**
 * Type guard that tests whether an unknown setter input is a raw Extension
 * (i.e. an object with a `url` property).  When `url` is provided, also
 * checks that the extension's URL matches the expected value.
 */
export const isExtension = <E extends { url: string }>(input: unknown, url?: string): input is E =>
    typeof input === "object" && input !== null && "url" in input && (url === undefined || input.url === url);

/**
 * Read a single typed value field from an Extension, returning `undefined`
 * when the extension itself is absent or the field is not set.
 *
 * This avoids the double-cast `(ext as Record<…>)?.field as T` that would
 * otherwise be needed for value fields not declared on the base Extension type.
 */
export const getExtensionValue = <T>(ext: { url?: string } | undefined, field: string): T | undefined => {
    if (!ext) return undefined;
    return (ext as Record<string, unknown>)[field] as T | undefined;
};

/**
 * Push an extension onto `target.extension`, creating the array if absent.
 */
export const pushExtension = <E extends { url?: string }>(target: { extension?: E[] }, ext: E): void => {
    (target.extension ??= []).push(ext);
};

// ---------------------------------------------------------------------------
// Extension helpers
// ---------------------------------------------------------------------------

/**
 * Read a complex (nested) FHIR extension into a plain key/value object.
 *
 * Each entry in `config` describes one sub-extension by URL, the name of its
 * value field (e.g. `"valueString"`), and whether it may repeat.
 *
 * @returns A record keyed by sub-extension URL, or `undefined` if the
 *          extension has no nested children.
 */
export const extractComplexExtension = <T = Record<string, unknown>>(
    extension: { extension?: Array<{ url?: string }> } | undefined,
    config: Array<{ name: string; valueField: string; isArray: boolean }>,
): T | undefined => {
    if (!extension?.extension) return undefined;
    const result: Record<string, unknown> = {};
    for (const { name, valueField, isArray } of config) {
        const subExts = extension.extension.filter((e) => e.url === name);
        if (isArray) {
            result[name] = subExts.map((e) => (e as Record<string, unknown>)[valueField]);
        } else if (subExts[0]) {
            result[name] = (subExts[0] as Record<string, unknown>)[valueField];
        }
    }
    return result as T;
};

// ---------------------------------------------------------------------------
// Slice helpers
// ---------------------------------------------------------------------------

/**
 * Remove discriminator keys from a slice element, returning only the
 * user-supplied portion.  Used by slice getters so callers see a clean object
 * without the fixed discriminator values baked in.
 */
export const stripMatchKeys = <T>(slice: object, matchKeys: string[]): T => {
    const result = { ...slice } as Record<string, unknown>;
    for (const key of matchKeys) {
        delete result[key];
    }
    return result as T;
};

/**
 * Wrap a flat input object under a choice-type key before inserting into a
 * slice.  For example, a Quantity value destined for `valueQuantity` is
 * wrapped as `{ valueQuantity: { ...input } }`.
 *
 * No-op when `input` is empty (the slice will contain only discriminator
 * defaults).
 */
export const wrapSliceChoice = <T>(input: object, choiceVariant: string): Partial<T> => {
    if (Object.keys(input).length === 0) return input as Partial<T>;
    return { [choiceVariant]: input } as Partial<T>;
};

/**
 * Inverse of {@link wrapSliceChoice}: strip discriminator keys, then hoist
 * the value inside `choiceVariant` up to the top level.
 *
 * @example
 *   unwrapSliceChoice(raw, ["code"], "valueQuantity")
 *   // removes "code", moves raw.valueQuantity.* to top level
 */
export const unwrapSliceChoice = <T>(slice: object, matchKeys: string[], choiceVariant: string): T => {
    const result = { ...slice } as Record<string, unknown>;
    for (const key of matchKeys) {
        delete result[key];
    }
    const variantValue = result[choiceVariant];
    delete result[choiceVariant];
    if (isRecord(variantValue)) {
        Object.assign(result, variantValue);
    }
    return result as T;
};

/**
 * Ensure that every required slice has at least a stub element in the array.
 * Each `match` is a discriminator pattern; if no existing item satisfies it,
 * a deep clone of the pattern is appended.
 *
 * Called in `createResource` so that required slices are always present even
 * when the caller omits them.
 */
export const ensureSliceDefaults = <T>(items: T[], ...matches: Record<string, unknown>[]): T[] => {
    for (const match of matches) {
        if (!items.some((item) => matchesValue(item, match))) {
            items.push(structuredClone(match) as T);
        }
    }
    return items;
};

/**
 * Cast an object literal to a FHIR resource type.  This centralises the single
 * `as unknown as T` that is unavoidable when constructing a resource from a
 * plain object (deep inheritance prevents direct structural compatibility).
 */
export const buildResource = <T>(obj: object): T => obj as unknown as T;

/**
 * Add `canonicalUrl` to `resource.meta.profile` if not already present.
 * Creates `meta` and `profile` when missing.
 */
export const ensureProfile = (resource: { meta?: { profile?: string[] } }, canonicalUrl: string): void => {
    const meta = (resource.meta ??= {});
    const profiles = (meta.profile ??= []);
    if (!profiles.includes(canonicalUrl)) profiles.push(canonicalUrl);
};

/**
 * Find or insert a slice element in `list`.  If an element matching `match`
 * already exists it is replaced in place; otherwise `value` is appended.
 */
export const setArraySlice = <T>(list: T[], match: Record<string, unknown>, value: T): void => {
    const index = list.findIndex((item) => matchesValue(item, match));
    if (index === -1) {
        list.push(value);
    } else {
        list[index] = value;
    }
};

/** Return the first element in `list` that satisfies the slice discriminator `match`. */
export const getArraySlice = <T>(list: readonly T[] | undefined, match: Record<string, unknown>): T | undefined => {
    if (!list) return undefined;
    return list.find((item) => matchesValue(item, match));
};

// ---------------------------------------------------------------------------
// Validation helpers
//
// Each function returns an array of human-readable error strings (empty = ok).
// Profile classes spread them all into a single array from `validate()`.
// ---------------------------------------------------------------------------

/** Checks that `field` is present (not `undefined` or `null`). */
export const validateRequired = (res: object, profileName: string, field: string): string[] => {
    const rec = res as Record<string, unknown>;
    return rec[field] === undefined || rec[field] === null
        ? [`${profileName}: required field '${field}' is missing`]
        : [];
};

/** Checks that a must-support field is populated (warning, not error). */
export const validateMustSupport = (res: object, profileName: string, field: string): string[] => {
    const rec = res as Record<string, unknown>;
    return rec[field] === undefined || rec[field] === null
        ? [`${profileName}: must-support field '${field}' is not populated`]
        : [];
};

/** Checks that `field` is absent (profiles may exclude base fields). */
export const validateExcluded = (res: object, profileName: string, field: string): string[] => {
    return (res as Record<string, unknown>)[field] !== undefined
        ? [`${profileName}: field '${field}' must not be present`]
        : [];
};

/** Checks that `field` structurally contains the expected fixed value. */
export const validateFixedValue = (res: object, profileName: string, field: string, expected: unknown): string[] => {
    return matchesValue((res as Record<string, unknown>)[field], expected)
        ? []
        : [`${profileName}: field '${field}' does not match expected fixed value`];
};

/**
 * Checks that the number of array elements matching `match` (a slice
 * discriminator) falls within [`min`, `max`].  Pass `max = 0` for unbounded.
 */
export const validateSliceCardinality = (
    res: object,
    profileName: string,
    field: string,
    match: Record<string, unknown>,
    sliceName: string,
    min: number,
    max: number,
): string[] => {
    const items = (res as Record<string, unknown>)[field] as unknown[] | undefined;
    const count = (items ?? []).filter((item) => matchesValue(item, match)).length;
    const errors: string[] = [];
    if (count < min) {
        errors.push(`${profileName}.${field}: slice '${sliceName}' requires at least ${min} item(s), found ${count}`);
    }
    if (max > 0 && count > max) {
        errors.push(`${profileName}.${field}: slice '${sliceName}' allows at most ${max} item(s), found ${count}`);
    }
    return errors;
};

/**
 * Checks that at least one of the listed choice-type variants is present.
 * E.g. `["effectiveDateTime", "effectivePeriod"]`.
 */
export const validateChoiceRequired = (res: object, profileName: string, choices: string[]): string[] => {
    const rec = res as Record<string, unknown>;
    return choices.some((c) => rec[c] !== undefined)
        ? []
        : [`${profileName}: at least one of ${choices.join(", ")} is required`];
};

/**
 * Checks that the value of `field` has a code within `allowed`.
 * Handles plain strings, Coding objects, and CodeableConcept objects.
 * Skips validation when the field is absent.
 */
export const validateEnum = (res: object, profileName: string, field: string, allowed: string[]): string[] => {
    const value = (res as Record<string, unknown>)[field];
    if (value === undefined || value === null) return [];
    if (typeof value === "string") {
        return allowed.includes(value)
            ? []
            : [`${profileName}: field '${field}' value '${value}' is not in allowed values`];
    }
    const rec = value as Record<string, unknown>;
    // Coding
    if (typeof rec.code === "string" && rec.system !== undefined) {
        return allowed.includes(rec.code)
            ? []
            : [`${profileName}: field '${field}' code '${rec.code}' is not in allowed values`];
    }
    // CodeableConcept
    if (Array.isArray(rec.coding)) {
        const codes = (rec.coding as Record<string, unknown>[]).map((c) => c.code as string).filter(Boolean);
        const hasValid = codes.some((c) => allowed.includes(c));
        return hasValid ? [] : [`${profileName}: field '${field}' has no coding with an allowed code`];
    }
    return [];
};

/**
 * Checks that a Reference field points to one of the `allowed` resource
 * types.  Extracts the type from the `reference` string (the part before
 * the first `/`).  Skips validation when the field or reference is absent.
 */
export const validateReference = (res: object, profileName: string, field: string, allowed: string[]): string[] => {
    const value = (res as Record<string, unknown>)[field];
    if (value === undefined || value === null) return [];
    const ref = (value as Record<string, unknown>).reference as string | undefined;
    if (!ref) return [];
    const slashIdx = ref.indexOf("/");
    if (slashIdx === -1) return [];
    const refType = ref.slice(0, slashIdx);
    return allowed.includes(refType)
        ? []
        : [`${profileName}: field '${field}' references '${refType}' but only ${allowed.join(", ")} are allowed`];
};
