import { isExtensionOwnedField } from "@root/api/writer-generator/utils";
import {
    type ConstrainedChoiceInfo,
    type FieldSlicing,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isTypeDiscriminated,
    type NameCandidates,
    type RegularField,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@typeschema/types.ts";
import type { TypeSchemaIndex } from "@typeschema/utils.ts";
import { pyTypeFromIdentifier } from "./naming-utils";
import { pyFieldName, pySliceStaticName } from "./profile-naming";
import type { Python } from "./writer";

export type SliceDef = {
    fieldName: string;
    sliceName: string;
    match: Record<string, unknown>;
    required: string[];
    array: boolean;
    /** 0 = unbounded ("*"), mirrors TS SliceDef.max */
    max: number;
    constrainedChoice: ConstrainedChoiceInfo | undefined;
    elementTypeName: string | undefined;
    /** The type identifier of the array element, used for import resolution. */
    elementTypeId: TypeIdentifier | undefined;
    /** True when the FieldSlicing discriminator type is "type" (resource-type discriminator). */
    isTypeDiscriminated: boolean;
    /** For type-discriminated slices: the resource type name, e.g. "Patient", "Organization". */
    typeDiscriminatorResource: string | undefined;
    /** Pre-computed name candidates from TypeSchema (recommended is PascalCase). */
    nameCandidates: NameCandidates;
};

export const collectRequiredSliceNames = (
    field: RegularField,
    fieldSlicing: FieldSlicing | undefined,
): string[] | undefined => {
    if (!field.array || !fieldSlicing?.slices) return undefined;
    const names = Object.entries(fieldSlicing.slices)
        .filter(([_, s]) => s.autoStub)
        .map(([name]) => name);
    return names.length > 0 ? names : undefined;
};

export const generateStaticSliceFields = (w: Python, sliceDefs: SliceDef[]): void => {
    for (const sliceDef of sliceDefs) {
        const staticName = pySliceStaticName(sliceDef.sliceName);
        w.line(`${staticName}: dict[str, Any] = ${JSON.stringify(sliceDef.match)}`);
    }
    if (sliceDefs.length > 0) w.line();
};

/** Ensure the slice match has shapes that Pydantic accepts when the match is
 *  later merged into user input and passed to a model constructor: a plain
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

export const collectSliceDefs = (tsIndex: TypeSchemaIndex, flatProfile: SnapshotProfileTypeSchema): SliceDef[] => {
    return Object.entries(flatProfile.slicing ?? {}).flatMap(([fieldName, fieldSlicing]) => {
        if (isExtensionOwnedField(fieldName) && flatProfile.base.name !== "Extension") return [];
        const field = flatProfile.fields[fieldName];
        if (!isNotChoiceDeclarationField(field) || !fieldSlicing.slices || !field.type) return [];
        const baseSchema = tsIndex.resolveType(field.type);
        const typeDiscriminated = isTypeDiscriminated(fieldSlicing);
        return Object.entries(fieldSlicing.slices)
            .filter(([_, slice]) => slice.match !== undefined)
            .map(([sliceName, slice]) => {
                const cc = slice.constrainedChoice;
                // Skip flattening for primitive types — can't wrap/unwrap under a variant key.
                const constrainedChoice = cc && !isPrimitiveIdentifier(cc.variantType) ? cc : undefined;
                return {
                    fieldName,
                    sliceName,
                    match: normalizeMatchForPython(tsIndex, slice.match?.value ?? {}, baseSchema),
                    required: slice.effectiveRequired ?? [],
                    array: Boolean(field.array),
                    max: slice.max ?? 0,
                    constrainedChoice,
                    elementTypeName:
                        field.type && !isPrimitiveIdentifier(field.type) ? pyTypeFromIdentifier(field.type) : undefined,
                    elementTypeId: field.type && !isPrimitiveIdentifier(field.type) ? field.type : undefined,
                    isTypeDiscriminated: typeDiscriminated,
                    typeDiscriminatorResource: slice.resourceType,
                    nameCandidates: slice.nameCandidates,
                };
            });
    });
};

// ---------------------------------------------------------------------------
// Slice getters / setters
// ---------------------------------------------------------------------------

const sliceElementRetType = (sliceDef: SliceDef): string =>
    sliceDef.elementTypeName && sliceDef.typeDiscriminatorResource
        ? `${sliceDef.elementTypeName}[${sliceDef.typeDiscriminatorResource}]`
        : (sliceDef.elementTypeName ?? "Any");

export const generateSliceGetters = (
    w: Python,
    sliceDefs: SliceDef[],
    sliceBaseNames: Record<string, string>,
): void => {
    for (const sliceDef of sliceDefs) {
        const baseName =
            sliceBaseNames[`${sliceDef.fieldName}:${sliceDef.sliceName}`] ?? sliceDef.nameCandidates.recommended;
        const staticName = pySliceStaticName(sliceDef.sliceName);
        const fieldName = pyFieldName(sliceDef.fieldName, w.nameFormatFunction);
        const matchKeys = JSON.stringify(Object.keys(sliceDef.match));

        if (sliceDef.isTypeDiscriminated) {
            const retType = sliceElementRetType(sliceDef);
            const isUnbounded = sliceDef.array && sliceDef.max === 0;
            if (isUnbounded) {
                w.line(`def get_${baseName}(self, mode: str | None = None) -> list[${retType}] | None:`);
                w.indentBlock(() => {
                    w.line(`match = self.__class__.${staticName}`);
                    w.line(
                        `result = get_array_slices(getattr(self._resource, ${JSON.stringify(fieldName)}, None), match)`,
                    );
                    w.line(`return cast('list[${retType}] | None', result or None)`);
                });
            } else {
                w.line(`def get_${baseName}(self, mode: str | None = None) -> ${retType} | None:`);
                w.indentBlock(() => {
                    w.line(`match = self.__class__.${staticName}`);
                    w.line(
                        `return cast('${retType} | None', get_array_slice(getattr(self._resource, ${JSON.stringify(fieldName)}, None), match))`,
                    );
                });
            }
        } else {
            // The flat form is always a plain dict at runtime (helpers return dict[str, Any]),
            // including constrained-choice slices where the variant wrapper is unwrapped.
            const flatRetType = "dict[str, Any]";
            const rawRetType = sliceDef.elementTypeName ?? "Any";
            w.line("@overload");
            w.line(`def get_${baseName}(self) -> ${flatRetType} | None: ...`);
            w.line("@overload");
            w.line(`def get_${baseName}(self, mode: Literal["raw"]) -> ${rawRetType} | None: ...`);
            w.line(
                `def get_${baseName}(self, mode: Literal["raw"] | None = None) -> ${flatRetType} | ${rawRetType} | None:`,
            );
            w.indentBlock(() => {
                w.line(`match = self.__class__.${staticName}`);
                if (sliceDef.array) {
                    w.line(
                        `item = get_array_slice(getattr(self._resource, ${JSON.stringify(fieldName)}, None), match)`,
                    );
                } else {
                    w.line(`item = getattr(self._resource, ${JSON.stringify(fieldName)}, None)`);
                    w.line("if item is None or not matches_value(item, match):");
                    w.indentBlock(() => {
                        w.line("return None");
                    });
                }
                w.line('if mode == "raw":');
                w.indentBlock(() => {
                    w.line(`return cast('${rawRetType} | None', item)`);
                });
                w.line(
                    "item_dict = item if isinstance(item, dict) else item.model_dump(by_alias=True, exclude_none=True)",
                );
                if (sliceDef.constrainedChoice) {
                    const variant = JSON.stringify(sliceDef.constrainedChoice.variant);
                    w.line(`return unwrap_slice_choice(item_dict, ${matchKeys}, ${variant})`);
                } else {
                    w.line(`return strip_match_keys(item_dict, ${matchKeys})`);
                }
            });
        }
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
            sliceBaseNames[`${sliceDef.fieldName}:${sliceDef.sliceName}`] ?? sliceDef.nameCandidates.recommended;
        const staticName = pySliceStaticName(sliceDef.sliceName);
        const fieldName = pyFieldName(sliceDef.fieldName, w.nameFormatFunction);
        if (sliceDef.isTypeDiscriminated) {
            const retType = sliceElementRetType(sliceDef);
            const isUnbounded = sliceDef.array && sliceDef.max === 0;
            if (isUnbounded) {
                w.line(`def set_${baseName}(self, values: list[${retType}]) -> "${className}":`);
                w.indentBlock(() => {
                    w.line(`match = self.__class__.${staticName}`);
                    w.line(`items = list(getattr(self._resource, ${JSON.stringify(fieldName)}, None) or [])`);
                    w.line("set_array_slices(items, match, values)");
                    w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, items)`);
                    w.line("return self");
                });
            } else {
                w.line(`def set_${baseName}(self, value: ${retType} | None = None) -> "${className}":`);
                w.indentBlock(() => {
                    w.line(`match = self.__class__.${staticName}`);
                    w.line(`items = getattr(self._resource, ${JSON.stringify(fieldName)}, None) or []`);
                    w.line("set_array_slice(items, match, value)");
                    w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, items)`);
                    w.line("return self");
                });
            }
        } else {
            // Make input optional when there are no required fields (input can be empty / omitted),
            // mirroring TS `inputOptional = sliceDef.required.length === 0`.
            const inputOptional = sliceDef.required.length === 0;
            const sig = inputOptional
                ? `def set_${baseName}(self, value: dict[str, Any] | None = None) -> "${className}":`
                : `def set_${baseName}(self, value: dict[str, Any]) -> "${className}":`;
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
                // Wrap into the element model under a fresh name: `merged` is typed
                // `dict[str, Any]`, so rebinding it to a model would trip mypy's assignment check.
                let elementExpr = "merged";
                if (sliceDef.elementTypeName) {
                    w.line(`element = ${sliceDef.elementTypeName}(**merged)`);
                    elementExpr = "element";
                }
                if (sliceDef.array) {
                    w.line(`items = getattr(self._resource, ${JSON.stringify(fieldName)}, None) or []`);
                    w.line(`set_array_slice(items, match, ${elementExpr})`);
                    w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, items)`);
                } else {
                    w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, ${elementExpr})`);
                }
                w.line("return self");
            });
        }
        w.line();
    }
};
