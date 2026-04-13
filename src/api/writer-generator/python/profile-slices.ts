import {
    isChoiceDeclarationField,
    isNotChoiceDeclarationField,
    type ProfileTypeSchema,
    type RegularField,
} from "@typeschema/types.ts";
import type { TypeSchemaIndex } from "@typeschema/utils.ts";
import { pyFieldName, pySliceMethodBaseName, pySliceStaticName } from "./profile-naming";
import type { Python } from "./writer";

export type SliceDef = {
    fieldName: string;
    sliceName: string;
    match: Record<string, unknown>;
    required: string[];
    array: boolean;
};

// todo: move duplicating ts+py logic into a shared helper
export const collectRequiredSliceNames = (field: RegularField): string[] | undefined => {
    if (!field.array || !field.slicing?.slices) return undefined;
    const names = Object.entries(field.slicing.slices)
        .filter(([_, s]) => s.min !== undefined && s.min >= 1 && s.match && Object.keys(s.match).length > 0)
        .map(([name]) => name);
    return names.length > 0 ? names : undefined;
};

export const generateStaticSliceFields = (w: Python, sliceDefs: SliceDef[]): void => {
    for (const sliceDef of sliceDefs) {
        const staticName = pySliceStaticName(sliceDef.sliceName);
        w.line(`${staticName}: dict = ${JSON.stringify(sliceDef.match)}`);
    }
    if (sliceDefs.length > 0) w.line();
};

/** Recursively wrap nested plain-object match values in single-element arrays
 *  where the corresponding base-type field is declared as ``array``.  This
 *  ensures the match pattern is valid for Pydantic model construction (e.g.
 *  ``coding`` in CodeableConcept must be a list, not a plain dict). */
export const normalizeMatchForPython = (
    tsIndex: TypeSchemaIndex,
    match: Record<string, unknown>,
    schema: ReturnType<TypeSchemaIndex["resolveType"]> | undefined,
): Record<string, unknown> => {
    if (!schema || !("fields" in schema) || !schema.fields) return match;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(match)) {
        const fieldDef = schema.fields[key];
        if (!fieldDef || !isNotChoiceDeclarationField(fieldDef)) {
            result[key] = value;
            continue;
        }
        const isObj = typeof value === "object" && value !== null && !Array.isArray(value);
        if (isObj) {
            const nestedSchema = fieldDef.type ? tsIndex.resolveType(fieldDef.type) : undefined;
            const normalized = normalizeMatchForPython(tsIndex, value as Record<string, unknown>, nestedSchema);
            result[key] = fieldDef.array ? [normalized] : normalized;
        } else {
            result[key] = fieldDef.array ? [value] : value;
        }
    }
    return result;
};

export const collectSliceDefs = (tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema): SliceDef[] =>
    Object.entries(flatProfile.fields ?? {})
        .filter(([_, field]) => isNotChoiceDeclarationField(field) && field.slicing?.slices)
        .flatMap(([fieldName, field]) => {
            if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices || !field.type) return [];
            const choiceBaseNames = new Set<string>();
            const baseSchema = tsIndex.resolveType(field.type);
            if (baseSchema && "fields" in baseSchema && baseSchema.fields) {
                for (const [n, f] of Object.entries(baseSchema.fields)) {
                    if (isChoiceDeclarationField(f)) choiceBaseNames.add(n);
                }
            }
            return Object.entries(field.slicing.slices)
                .filter(([_, slice]) => Object.keys(slice.match ?? {}).length > 0)
                .map(([sliceName, slice]) => {
                    const matchFields = Object.keys(slice.match ?? {});
                    const required = (slice.required ?? []).filter(
                        (name) => !matchFields.includes(name) && !choiceBaseNames.has(name),
                    );
                    return {
                        fieldName,
                        sliceName,
                        match: normalizeMatchForPython(tsIndex, slice.match ?? {}, baseSchema),
                        required,
                        array: Boolean(field.array),
                    };
                });
        });

// ---------------------------------------------------------------------------
// Slice getters / setters
// ---------------------------------------------------------------------------

export const generateSliceGetters = (
    w: Python,
    _className: string,
    sliceDefs: SliceDef[],
    sliceBaseNames: Record<string, string>,
): void => {
    for (const sliceDef of sliceDefs) {
        const baseName =
            sliceBaseNames[`${sliceDef.fieldName}:${sliceDef.sliceName}`] ?? pySliceMethodBaseName(sliceDef.sliceName);
        const staticName = pySliceStaticName(sliceDef.sliceName);
        const fieldName = pyFieldName(sliceDef.fieldName);
        const matchKeys = JSON.stringify(Object.keys(sliceDef.match));

        w.line(`def get_${baseName}(self) -> dict | None:`);
        w.indentBlock(() => {
            w.line(`match = self.__class__.${staticName}`);
            if (sliceDef.array) {
                w.line(`item = get_array_slice(getattr(self._resource, ${JSON.stringify(fieldName)}, None), match)`);
            } else {
                w.line(`item = getattr(self._resource, ${JSON.stringify(fieldName)}, None)`);
                w.line("if item is None or not matches_value(item, match):");
                w.indentBlock(() => {
                    w.line("return None");
                });
            }
            w.line("if item is None:");
            w.indentBlock(() => {
                w.line("return None");
            });
            w.line(
                `return strip_match_keys(item if isinstance(item, dict) else item.model_dump(by_alias=True, exclude_none=True), ${matchKeys})`,
            );
        });
        w.line();
    }
};

export const generateSliceSetters = (
    w: Python,
    className: string,
    sliceDefs: SliceDef[],
    sliceBaseNames: Record<string, string>,
): void => {
    for (const sliceDef of sliceDefs) {
        const baseName =
            sliceBaseNames[`${sliceDef.fieldName}:${sliceDef.sliceName}`] ?? pySliceMethodBaseName(sliceDef.sliceName);
        const staticName = pySliceStaticName(sliceDef.sliceName);
        const fieldName = pyFieldName(sliceDef.fieldName);

        w.line(`def set_${baseName}(self, value: dict) -> "${className}":`);
        w.indentBlock(() => {
            w.line(`match = self.__class__.${staticName}`);
            w.line("merged = apply_slice_match(value, match)");
            if (sliceDef.array) {
                w.line(`items = getattr(self._resource, ${JSON.stringify(fieldName)}, None) or []`);
                w.line("set_array_slice(items, match, merged)");
                w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, items)`);
            } else {
                w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, merged)`);
            }
            w.line("return self");
        });
        w.line();
    }
};
