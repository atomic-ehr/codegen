export const isRecord = (value: unknown): value is Record<string, unknown> => {
    return value !== null && typeof value === "object" && !Array.isArray(value);
};

export const getOrCreateObjectAtPath = (root: Record<string, unknown>, path: string[]): Record<string, unknown> => {
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

export const applySliceMatch = <T extends Record<string, unknown>>(input: T, match: Record<string, unknown>): T => {
    const result = { ...input } as Record<string, unknown>;
    mergeMatch(result, match);
    return result as T;
};

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

export const matchesSlice = (value: unknown, match: Record<string, unknown>): boolean => {
    return matchesValue(value, match);
};

export const extractComplexExtension = (
    extension: { extension?: Array<{ url?: string; [key: string]: unknown }> } | undefined,
    config: Array<{ name: string; valueField: string; isArray: boolean }>,
): Record<string, unknown> | undefined => {
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
    return result;
};

export const extractSliceSimplified = <T extends Record<string, unknown>>(
    slice: T,
    matchKeys: string[],
): Partial<T> => {
    const result = { ...slice } as Record<string, unknown>;
    for (const key of matchKeys) {
        delete result[key];
    }
    return result as Partial<T>;
};

export const wrapSliceChoice = (input: Record<string, unknown>, choiceVariant: string): Record<string, unknown> => {
    if (Object.keys(input).length === 0) return input;
    return { [choiceVariant]: input };
};

export const flattenSliceChoice = (
    slice: Record<string, unknown>,
    matchKeys: string[],
    choiceVariant: string,
): Record<string, unknown> => {
    const result = { ...slice } as Record<string, unknown>;
    for (const key of matchKeys) {
        delete result[key];
    }
    const variantValue = result[choiceVariant];
    delete result[choiceVariant];
    if (isRecord(variantValue)) {
        Object.assign(result, variantValue);
    }
    return result;
};

export const registerProfile = (resource: Record<string, unknown>, canonicalUrl: string): void => {
    const meta = (resource.meta ??= {}) as Record<string, unknown>;
    const profiles = (meta.profile ??= []) as string[];
    if (!profiles.includes(canonicalUrl)) profiles.push(canonicalUrl);
};

export const setArraySlice = (
    resource: Record<string, unknown>,
    field: string,
    match: Record<string, unknown>,
    value: Record<string, unknown>,
): void => {
    const list = ((resource as Record<string, unknown>)[field] ??= []) as unknown[];
    const index = list.findIndex((item) => matchesSlice(item, match));
    if (index === -1) {
        list.push(value);
    } else {
        list[index] = value;
    }
};

export const getArraySlice = (
    list: unknown[] | undefined,
    match: Record<string, unknown>,
): Record<string, unknown> | undefined => {
    if (!list) return undefined;
    return list.find((item) => matchesSlice(item, match)) as Record<string, unknown> | undefined;
};

export const validateRequired = (res: Record<string, unknown>, profileName: string, field: string): string[] => {
    return res[field] === undefined || res[field] === null
        ? [`${profileName}: required field '${field}' is missing`]
        : [];
};

export const validateExcluded = (res: Record<string, unknown>, profileName: string, field: string): string[] => {
    return res[field] !== undefined ? [`${profileName}: field '${field}' must not be present`] : [];
};

export const validateFixedValue = (
    res: Record<string, unknown>,
    profileName: string,
    field: string,
    expected: unknown,
): string[] => {
    return matchesValue(res[field], expected)
        ? []
        : [`${profileName}: field '${field}' does not match expected fixed value`];
};

export const validateSliceCardinality = (
    res: Record<string, unknown>,
    profileName: string,
    field: string,
    match: Record<string, unknown>,
    sliceName: string,
    min: number,
    max: number,
): string[] => {
    const items = res[field] as unknown[] | undefined;
    const count = (items ?? []).filter((item) => matchesSlice(item, match)).length;
    const errors: string[] = [];
    if (count < min) {
        errors.push(`${profileName}.${field}: slice '${sliceName}' requires at least ${min} item(s), found ${count}`);
    }
    if (max > 0 && count > max) {
        errors.push(`${profileName}.${field}: slice '${sliceName}' allows at most ${max} item(s), found ${count}`);
    }
    return errors;
};

export const validateChoiceRequired = (
    res: Record<string, unknown>,
    profileName: string,
    choices: string[],
): string[] => {
    return choices.some((c) => res[c] !== undefined)
        ? []
        : [`${profileName}: at least one of ${choices.join(", ")} is required`];
};

export const validateEnum = (
    res: Record<string, unknown>,
    profileName: string,
    field: string,
    allowed: string[],
): string[] => {
    const value = res[field];
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

export const validateReference = (
    res: Record<string, unknown>,
    profileName: string,
    field: string,
    allowed: string[],
): string[] => {
    const value = res[field];
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
