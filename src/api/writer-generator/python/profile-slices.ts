import {
    type ConstrainedChoiceInfo,
    isChoiceDeclarationField,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    type ProfileTypeSchema,
    type RegularField,
} from "@typeschema/types.ts";
import type { TypeSchemaIndex } from "@typeschema/utils.ts";
import { pyTypeFromIdentifier } from "./profile-extensions";
import { pyFieldName, pySliceMethodBaseName, pySliceStaticName } from "./profile-naming";
import type { Python } from "./writer";

export type SliceDef = {
    fieldName: string;
    sliceName: string;
    match: Record<string, unknown>;
    required: string[];
    array: boolean;
    constrainedChoice: ConstrainedChoiceInfo | undefined;
    elementTypeName: string | undefined;
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

/** Ensure the slice match has shapes that Pydantic accepts when the match is
 *  later merged into user input and passed to a model constructor: a plain-
 *  object value for a list-typed field is wrapped in a single-element list.
 *  Values that are already lists are recursed into but not rewrapped. */
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
        const nestedSchema = fieldDef.type ? tsIndex.resolveType(fieldDef.type) : undefined;
        const normalizeOne = (v: unknown): unknown =>
            v !== null && typeof v === "object" && !Array.isArray(v)
                ? normalizeMatchForPython(tsIndex, v as Record<string, unknown>, nestedSchema)
                : v;

        if (Array.isArray(value)) {
            // Already a list — normalize each element, do not wrap again.
            result[key] = value.map(normalizeOne);
        } else if (value !== null && typeof value === "object") {
            const normalized = normalizeOne(value);
            result[key] = fieldDef.array ? [normalized] : normalized;
        } else {
            // Primitive — leave as-is.
            result[key] = value;
        }
    }
    return result;
};

export const collectSliceDefs = (tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema): SliceDef[] => {
    const pkgName = flatProfile.identifier.package;
    return Object.entries(flatProfile.fields ?? {})
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
                    const cc = slice.elements
                        ? tsIndex.constrainedChoice(pkgName, field.type, slice.elements)
                        : undefined;
                    // Skip flattening for primitive types — can't wrap/unwrap under a variant key.
                    const constrainedChoice = cc && !isPrimitiveIdentifier(cc.variantType) ? cc : undefined;
                    return {
                        fieldName,
                        sliceName,
                        match: normalizeMatchForPython(tsIndex, slice.match ?? {}, baseSchema),
                        required,
                        array: Boolean(field.array),
                        constrainedChoice,
                        elementTypeName:
                            field.type && !isPrimitiveIdentifier(field.type)
                                ? pyTypeFromIdentifier(field.type)
                                : undefined,
                    };
                });
        });
};

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

        w.line(`def get_${baseName}(self, mode: str | None = None) -> Any | None:`);
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
            w.line('if mode == "raw":');
            w.indentBlock(() => {
                w.line("return item");
            });
            w.line("item_dict = item if isinstance(item, dict) else item.model_dump(by_alias=True, exclude_none=True)");
            if (sliceDef.constrainedChoice) {
                const variant = JSON.stringify(sliceDef.constrainedChoice.variant);
                w.line(`return unwrap_slice_choice(item_dict, ${matchKeys}, ${variant})`);
            } else {
                w.line(`return strip_match_keys(item_dict, ${matchKeys})`);
            }
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
        // Make input optional when there are no required fields (input can be empty / omitted),
        // mirroring TS `inputOptional = sliceDef.required.length === 0`.
        const inputOptional = sliceDef.required.length === 0;
        const sig = inputOptional
            ? `def set_${baseName}(self, value: dict | None = None) -> "${className}":`
            : `def set_${baseName}(self, value: dict) -> "${className}":`;

        w.line(sig);
        w.indentBlock(() => {
            w.line(`match = self.__class__.${staticName}`);
            const inputExpr = inputOptional ? "(value or {})" : "value";
            if (sliceDef.constrainedChoice) {
                const variant = JSON.stringify(sliceDef.constrainedChoice.variant);
                w.line(`wrapped = wrap_slice_choice(${inputExpr}, ${variant})`);
                w.line("merged = apply_slice_match(wrapped, match)");
            } else {
                w.line(`merged = apply_slice_match(${inputExpr}, match)`);
            }
            if (sliceDef.elementTypeName) {
                w.line(`merged = ${sliceDef.elementTypeName}(**merged)`);
            }
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
