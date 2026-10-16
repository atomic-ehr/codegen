import {
    type ConstrainedChoiceInfo,
    type FieldSlicing,
    isChoiceDeclarationField,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isTypeDiscriminated,
    type NameCandidates,
    type RegularField,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { type ProfileImports, profilePyType, resolveFhirType } from "./imports";
import { pyLiteral } from "./naming-utils";
import { type ProfileMethodBaseNames, pyFieldName, pyProfileClassName, pySliceStaticName } from "./profile-naming";
import type { Python } from "./writer";

export type SliceDef = {
    fieldName: string;
    sliceName: string;
    /** Pre-computed name candidates from TypeSchema (recommended is PascalCase). */
    nameCandidates: NameCandidates;
    /** Discriminator values that identify an element of the slice, normalized for Pydantic. */
    match: Record<string, unknown>;
    /** Required fields, already filtered (match keys and polymorphic base names removed) */
    required: string[];
    array: boolean;
    /** 0 = unbounded ("*"), positive = exact limit. */
    max: number;
    constrainedChoice: ConstrainedChoiceInfo | undefined;
    /** True when the slice uses a type discriminator (match by resourceType) */
    typeDiscriminated: boolean;
    /**
     * Element type, parameterized with the matched resource type when the slice is type-discriminated
     * (e.g. "BundleEntry[Patient]"); `Any` for a primitive element.
     */
    typedBaseType: string;
    elementTypeName: string | undefined;
    /** For type-discriminated slices: the resource type name, e.g. "Patient", "Organization". */
    typeDiscriminatorType: string | undefined;
};

/**
 * Returns names of required slices with a non-empty match, which the factory auto-populates with a
 * stub of that match. Unlike TypeScript, a slice that requires fields beyond its match keys (e.g. BP
 * component.valueQuantity) is still included — its stub carries only the match. A field that uses a
 * type discriminator (e.g. Bundle entry.resource) gets no stubs.
 */
export const collectRequiredSliceNames = (
    field: RegularField,
    fieldSlicing: FieldSlicing | undefined,
): string[] | undefined => {
    if (!field.array || !fieldSlicing?.slices) return undefined;
    // Type-discriminated slices ("type" discriminator) require explicit typed setters — no stubs.
    if (isTypeDiscriminated(fieldSlicing)) return undefined;
    const names = Object.entries(fieldSlicing.slices)
        .filter(([_, s]) => s.min !== undefined && s.min >= 1 && s.match && Object.keys(s.match).length > 0)
        .map(([name]) => name);
    return names.length > 0 ? names : undefined;
};

/** Collect choice declaration field names from a base type schema */
const collectChoiceBaseNames = (tsIndex: TypeSchemaIndex, typeId: TypeIdentifier): Set<string> => {
    const names = new Set<string>();
    const schema = tsIndex.resolveType(typeId);
    if (schema && "fields" in schema && schema.fields) {
        for (const [name, f] of Object.entries(schema.fields)) {
            if (isChoiceDeclarationField(f)) names.add(name);
        }
    }
    return names;
};

/** Extract resource type name from a type-discriminator match, looking one level deep only
 *  (e.g. {"resource":{"resourceType":"Patient"}} → "Patient"). */
const extractResourceTypeFromMatch = (match: Record<string, unknown>): string | undefined => {
    for (const val of Object.values(match)) {
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            const rt = (val as Record<string, unknown>).resourceType;
            if (typeof rt === "string") return rt;
        }
    }
    return undefined;
};

/** Ensure the slice match has shapes that Pydantic accepts when the match is
 *  later merged into user input and passed to a model constructor: a plain
 *  object value for a list-typed field is wrapped in a single-element list.
 *  Values that are already lists are recursed into but not rewrapped. */
const normalizeMatchForPython = (
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

export const collectSliceDefs = (
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
): SliceDef[] => {
    const pkgName = snapshot.identifier.package;
    return Object.entries(snapshot.slicing ?? {}).flatMap(([fieldName, fieldSlicing]) => {
        const field = snapshot.fields[fieldName];
        if (!isNotChoiceDeclarationField(field) || !fieldSlicing.slices || !field.type) return [];
        const choiceBaseNames = collectChoiceBaseNames(tsIndex, field.type);
        const baseSchema = tsIndex.resolveType(field.type);
        return Object.entries(fieldSlicing.slices)
            .filter(([_, slice]) => Object.keys(slice.match ?? {}).length > 0)
            .map(([sliceName, slice]) => {
                const matchFields = Object.keys(slice.match ?? {});
                const required = (slice.required ?? []).filter(
                    (name) => !matchFields.includes(name) && !choiceBaseNames.has(name),
                );
                const cc = slice.elements ? tsIndex.constrainedChoice(pkgName, field.type, slice.elements) : undefined;
                // Skip flattening for primitive types — can't wrap/unwrap under a variant key.
                const constrainedChoice = cc && !isPrimitiveIdentifier(cc.variantType) ? cc : undefined;
                const typeDiscriminated = isTypeDiscriminated(fieldSlicing);
                const resourceType = typeDiscriminated ? extractResourceTypeFromMatch(slice.match ?? {}) : undefined;
                const elementTypeName =
                    field.type && !isPrimitiveIdentifier(field.type) ? profilePyType(imports, field.type) : undefined;
                const typeDiscriminatorType = resourceType
                    ? profilePyType(imports, resolveFhirType(tsIndex, snapshot, resourceType))
                    : undefined;
                return {
                    fieldName,
                    sliceName,
                    nameCandidates: slice.nameCandidates,
                    match: normalizeMatchForPython(tsIndex, slice.match ?? {}, baseSchema),
                    required,
                    array: Boolean(field.array),
                    max: slice.max ?? 0,
                    constrainedChoice,
                    typeDiscriminated,
                    typedBaseType:
                        elementTypeName && typeDiscriminatorType
                            ? `${elementTypeName}[${typeDiscriminatorType}]`
                            : (elementTypeName ?? imports.typing.use("Any")),
                    elementTypeName,
                    typeDiscriminatorType,
                };
            });
    });
};

export const generateStaticSliceFields = (w: Python, imports: ProfileImports, sliceDefs: SliceDef[]): void => {
    for (const sliceDef of sliceDefs) {
        const staticName = pySliceStaticName(sliceDef.sliceName);
        w.line(`${staticName}: dict[str, ${imports.typing.use("Any")}] = ${pyLiteral(sliceDef.match)}`);
    }
    if (sliceDefs.length > 0) w.line();
};

const generateSliceGetters = (
    w: Python,
    imports: ProfileImports,
    sliceDefs: SliceDef[],
    methodNames: ProfileMethodBaseNames,
): void => {
    for (const sliceDef of sliceDefs) {
        const baseName = methodNames.slice(sliceDef);
        const staticName = pySliceStaticName(sliceDef.sliceName);
        const fieldName = pyFieldName(sliceDef.fieldName, w.nameFormatFunction);
        const matchKeys = JSON.stringify(Object.keys(sliceDef.match));

        if (sliceDef.typeDiscriminated) {
            const retType = sliceDef.typedBaseType;
            const isUnbounded = sliceDef.array && sliceDef.max === 0;
            if (isUnbounded) {
                w.line(`def get_${baseName}(self, mode: str | None = None) -> list[${retType}] | None:`);
                w.indentBlock(() => {
                    w.line(`match = self.__class__.${staticName}`);
                    w.line(
                        `result = ${imports.helpers.use("get_array_slices")}(getattr(self._resource, ${JSON.stringify(fieldName)}, None), match)`,
                    );
                    w.line(`return ${imports.typing.use("cast")}('list[${retType}] | None', result or None)`);
                });
            } else {
                w.line(`def get_${baseName}(self, mode: str | None = None) -> ${retType} | None:`);
                w.indentBlock(() => {
                    w.line(`match = self.__class__.${staticName}`);
                    w.line(
                        `return ${imports.typing.use("cast")}('${retType} | None', ${imports.helpers.use("get_array_slice")}(getattr(self._resource, ${JSON.stringify(fieldName)}, None), match))`,
                    );
                });
            }
        } else {
            // The flat form is always a plain dict at runtime (helpers return dict[str, Any]),
            // including constrained-choice slices where the variant wrapper is unwrapped.
            const flatRetType = `dict[str, ${imports.typing.use("Any")}]`;
            const rawRetType = sliceDef.typedBaseType;
            w.line(`@${imports.typing.use("overload")}`);
            w.line(`def get_${baseName}(self) -> ${flatRetType} | None: ...`);
            w.line(`@${imports.typing.use("overload")}`);
            w.line(
                `def get_${baseName}(self, mode: ${imports.typing.use("Literal")}["raw"]) -> ${rawRetType} | None: ...`,
            );
            w.line(
                `def get_${baseName}(self, mode: ${imports.typing.use("Literal")}["raw"] | None = None) -> ${flatRetType} | ${rawRetType} | None:`,
            );
            w.indentBlock(() => {
                w.line(`match = self.__class__.${staticName}`);
                if (sliceDef.array) {
                    w.line(
                        `item = ${imports.helpers.use("get_array_slice")}(getattr(self._resource, ${JSON.stringify(fieldName)}, None), match)`,
                    );
                } else {
                    w.line(`item = getattr(self._resource, ${JSON.stringify(fieldName)}, None)`);
                    w.line(`if item is None or not ${imports.helpers.use("matches_value")}(item, match):`);
                    w.indentBlock(() => {
                        w.line("return None");
                    });
                }
                w.line('if mode == "raw":');
                w.indentBlock(() => {
                    w.line(`return ${imports.typing.use("cast")}('${rawRetType} | None', item)`);
                });
                w.line(
                    "item_dict = item if isinstance(item, dict) else item.model_dump(by_alias=True, exclude_none=True)",
                );
                if (sliceDef.constrainedChoice) {
                    const variant = JSON.stringify(sliceDef.constrainedChoice.variant);
                    w.line(`return ${imports.helpers.use("unwrap_slice_choice")}(item_dict, ${matchKeys}, ${variant})`);
                } else {
                    w.line(`return ${imports.helpers.use("strip_match_keys")}(item_dict, ${matchKeys})`);
                }
            });
        }
        w.line();
    }
};

const generateSliceSetters = (
    w: Python,
    imports: ProfileImports,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
    methodNames: ProfileMethodBaseNames,
): void => {
    const className = pyProfileClassName(snapshot);
    for (const sliceDef of sliceDefs) {
        const baseName = methodNames.slice(sliceDef);
        const staticName = pySliceStaticName(sliceDef.sliceName);
        const fieldName = pyFieldName(sliceDef.fieldName, w.nameFormatFunction);
        if (sliceDef.typeDiscriminated) {
            const retType = sliceDef.typedBaseType;
            const isUnbounded = sliceDef.array && sliceDef.max === 0;
            if (isUnbounded) {
                w.line(`def set_${baseName}(self, values: list[${retType}]) -> "${className}":`);
                w.indentBlock(() => {
                    w.line(`match = self.__class__.${staticName}`);
                    w.line(`items = list(getattr(self._resource, ${JSON.stringify(fieldName)}, None) or [])`);
                    w.line(`${imports.helpers.use("set_array_slices")}(items, match, values)`);
                    w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, items)`);
                    w.line("return self");
                });
            } else {
                w.line(`def set_${baseName}(self, value: ${retType} | None = None) -> "${className}":`);
                w.indentBlock(() => {
                    w.line(`match = self.__class__.${staticName}`);
                    w.line(`items = getattr(self._resource, ${JSON.stringify(fieldName)}, None) or []`);
                    w.line(`${imports.helpers.use("set_array_slice")}(items, match, value)`);
                    w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, items)`);
                    w.line("return self");
                });
            }
        } else {
            // Make input optional when there are no required fields (input can be empty / omitted),
            // A slice that requires nothing of its element accepts no input.
            const inputOptional = sliceDef.required.length === 0;
            const sig = inputOptional
                ? `def set_${baseName}(self, value: dict[str, ${imports.typing.use("Any")}] | None = None) -> "${className}":`
                : `def set_${baseName}(self, value: dict[str, ${imports.typing.use("Any")}]) -> "${className}":`;
            w.line(sig);
            w.indentBlock(() => {
                w.line(`match = self.__class__.${staticName}`);
                const inputExpr = inputOptional ? "(value or {})" : "value";
                if (sliceDef.constrainedChoice) {
                    const variant = JSON.stringify(sliceDef.constrainedChoice.variant);
                    w.line(`wrapped = ${imports.helpers.use("wrap_slice_choice")}(${inputExpr}, ${variant})`);
                    w.line(`merged = ${imports.helpers.use("apply_slice_match")}(wrapped, match)`);
                } else {
                    w.line(`merged = ${imports.helpers.use("apply_slice_match")}(${inputExpr}, match)`);
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
                    w.line(`${imports.helpers.use("set_array_slice")}(items, match, ${elementExpr})`);
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

export const generateSliceMethods = (
    w: Python,
    imports: ProfileImports,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
    methodNames: ProfileMethodBaseNames,
): void => {
    // All slice getters first, then all slice setters.
    generateSliceGetters(w, imports, sliceDefs, methodNames);
    generateSliceSetters(w, imports, snapshot, sliceDefs, methodNames);
};
