import { isExtensionOwnedField } from "@root/api/writer-generator/utils";
import {
    type ConstrainedChoiceInfo,
    type FieldSlicing,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isTypeDiscriminated,
    type RegularField,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    tsFieldName,
    tsProfileClassName,
    tsResourceName,
    tsSliceFlatAllTypeName,
    tsSliceFlatTypeName,
    tsSliceStaticName,
} from "./name";
import { tsGet, tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

export const collectTypesFromSlices = (
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    addType: (typeId: TypeIdentifier) => void,
) => {
    for (const [fieldName, fieldSlicing] of Object.entries(snapshot.slicing ?? {})) {
        if (isExtensionOwnedField(fieldName) && snapshot.base.name !== "Extension") continue;
        const field = snapshot.fields[fieldName];
        if (!isNotChoiceDeclarationField(field) || !fieldSlicing.slices || !field.type) continue;
        for (const slice of Object.values(fieldSlicing.slices)) {
            if (slice.match !== undefined) {
                addType(field.type);
                if (slice.constrainedChoice) addType(slice.constrainedChoice.variantType);
                // For type discriminator slices, also import the matched resource type
                if (slice.resourceType) {
                    const resourceSchema = tsIndex.schemas.find(
                        (s) => s.identifier.name === slice.resourceType && s.identifier.kind === "resource",
                    );
                    if (resourceSchema) addType(resourceSchema.identifier);
                }
            }
        }
    }
};

/**
 * Returns names of required slices that can be auto-populated with just the discriminator match.
 * Slices are excluded (need user-provided data) when:
 * - They have required fields beyond the match keys (e.g. BP component.valueQuantity)
 * - The field uses a type discriminator (e.g. Bundle entry.resource) — the stub only sets
 *   resourceType, the user must provide the actual typed resource
 */
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

export type SliceDef = {
    fieldName: string;
    baseType: string;
    /** Base type parameterized with the matched resource type (e.g. "BundleEntry<Patient>") */
    typedBaseType: string;
    sliceName: string;
    /** Collision-free base name from nameCandidates.recommended (e.g. "VSCat", "SystolicBP") */
    baseName: string;
    match: Record<string, unknown>;
    /** Required fields, already filtered (match keys and polymorphic base names removed) */
    required: string[];
    excluded: string[];
    array: boolean;
    constrainedChoice: ConstrainedChoiceInfo | undefined;
    /** True when the slice uses a type discriminator (match by resourceType) */
    typeDiscriminator: boolean;
    /** Max cardinality of the slice. 0 or undefined = unbounded ("*"), positive = exact limit. */
    max: number;
};

export const collectSliceDefs = (_tsIndex: TypeSchemaIndex, snapshot: SnapshotProfileTypeSchema): SliceDef[] =>
    Object.entries(snapshot.slicing ?? {}).flatMap(([fieldName, fieldSlicing]) => {
        if (isExtensionOwnedField(fieldName) && snapshot.base.name !== "Extension") return [];
        const field = snapshot.fields[fieldName];
        if (!isNotChoiceDeclarationField(field) || !fieldSlicing.slices || !field.type) return [];
        const baseType = tsTypeFromIdentifier(field.type);
        const isTypeDisc = isTypeDiscriminated(fieldSlicing);
        return Object.entries(fieldSlicing.slices)
            .filter(([_, slice]) => slice.match !== undefined)
            .map(([sliceName, slice]) => {
                const cc = slice.constrainedChoice;
                // Skip flattening for primitive types — can't intersect object with boolean/string/etc.
                const constrainedChoice = cc && !isPrimitiveIdentifier(cc.variantType) ? cc : undefined;
                const typedBaseType = slice.resourceType ? `${baseType}<${slice.resourceType}>` : baseType;
                return {
                    fieldName,
                    baseType,
                    typedBaseType,
                    sliceName,
                    baseName: slice.nameCandidates.recommended,
                    match: slice.match?.value ?? {},
                    required: slice.effectiveRequired ?? [],
                    excluded: slice.excluded ?? [],
                    array: Boolean(field.array),
                    constrainedChoice,
                    typeDiscriminator: isTypeDisc,
                    max: slice.max ?? 0,
                };
            });
    });

export const generateSliceSetters = (w: TypeScript, sliceDefs: SliceDef[], snapshot: SnapshotProfileTypeSchema) => {
    const profileClassName = tsProfileClassName(snapshot);
    const tsProfileName = tsResourceName(snapshot.identifier);
    for (const sliceDef of sliceDefs) {
        const baseName = sliceDef.baseName;
        const methodName = `set${baseName}`;
        const inputTypeName = tsSliceFlatTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const matchRef = `${profileClassName}.${tsSliceStaticName(sliceDef.sliceName)}SliceMatch`;
        const tsField = tsFieldName(sliceDef.fieldName);
        const fieldAccess = tsGet("this.resource", tsField);
        const baseType = sliceDef.typedBaseType;
        const isUnbounded = sliceDef.array && (sliceDef.max === 0 || sliceDef.max === undefined);

        if (isUnbounded) {
            // Unbounded slice: accept an array of items
            const unionType = `(${inputTypeName} | ${baseType})[]`;
            const paramSignature = `(input: ${unionType}): this`;
            w.curlyBlock(["public", methodName, paramSignature], () => {
                w.line(`const match = ${matchRef}`);
                w.line(`const arr = ${fieldAccess} ??= []`);
                if (sliceDef.constrainedChoice) {
                    const cc = sliceDef.constrainedChoice;
                    w.line(
                        `const values = input.map(item => matchesValue(item, match) ? item as ${baseType} : applySliceMatch<${baseType}>(wrapSliceChoice<${baseType}>(item, ${JSON.stringify(cc.variant)}), match))`,
                    );
                } else {
                    w.line(
                        `const values = input.map(item => matchesValue(item, match) ? item as ${baseType} : applySliceMatch<${baseType}>(item, match))`,
                    );
                }
                w.line("setArraySliceAll(arr, match, values)");
                w.line("return this");
            });
        } else {
            // Single-element slice (max: 1): keep existing behavior
            const inputOptional = sliceDef.required.length === 0;
            const unionType = `${inputTypeName} | ${baseType}`;
            const paramSignature = inputOptional ? `(input?: ${unionType}): this` : `(input: ${unionType}): this`;
            w.curlyBlock(["public", methodName, paramSignature], () => {
                w.line(`const match = ${matchRef}`);
                w.curlyBlock(["if", "(input && matchesValue(input, match))"], () => {
                    if (sliceDef.array) {
                        w.line(`setArraySlice(${fieldAccess} ??= [], match, input as ${baseType})`);
                    } else {
                        w.line(`${fieldAccess} = input as ${baseType}`);
                    }
                    w.line("return this");
                });
                const inputExpr = inputOptional ? "input ?? {}" : "input";
                if (sliceDef.constrainedChoice) {
                    const cc = sliceDef.constrainedChoice;
                    w.line(`const wrapped = wrapSliceChoice<${baseType}>(${inputExpr}, ${JSON.stringify(cc.variant)})`);
                    w.line(`const value = applySliceMatch<${baseType}>(wrapped, match)`);
                } else {
                    w.line(`const value = applySliceMatch<${baseType}>(${inputExpr}, match)`);
                }
                if (sliceDef.array) {
                    w.line(`setArraySlice(${fieldAccess} ??= [], match, value)`);
                } else {
                    w.line(`${fieldAccess} = value`);
                }
                w.line("return this");
            });
        }
        w.line();
    }
};

export const generateSliceGetters = (w: TypeScript, sliceDefs: SliceDef[], snapshot: SnapshotProfileTypeSchema) => {
    const profileClassName = tsProfileClassName(snapshot);
    const tsProfileName = tsResourceName(snapshot.identifier);
    const defaultMode = w.opts.sliceGetterDefault ?? "flat";
    for (const sliceDef of sliceDefs) {
        const baseName = sliceDef.baseName;
        const getMethodName = `get${baseName}`;
        const flatTypeName = tsSliceFlatAllTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const matchRef = `${profileClassName}.${tsSliceStaticName(sliceDef.sliceName)}SliceMatch`;
        const matchKeys = JSON.stringify(Object.keys(sliceDef.match));
        const tsField = tsFieldName(sliceDef.fieldName);
        const fieldAccess = tsGet("this.resource", tsField);
        const baseType = sliceDef.typedBaseType;
        const isUnbounded = sliceDef.array && (sliceDef.max === 0 || sliceDef.max === undefined);

        if (isUnbounded) {
            // Unbounded slice: return an array or undefined
            const defaultReturn = defaultMode === "raw" ? `${baseType}[]` : `${flatTypeName}[]`;

            // Overload signatures
            w.lineSM(`public ${getMethodName}(mode: 'flat'): ${flatTypeName}[] | undefined`);
            w.lineSM(`public ${getMethodName}(mode: 'raw'): ${baseType}[] | undefined`);
            w.lineSM(`public ${getMethodName}(): ${defaultReturn} | undefined`);

            // Implementation
            w.curlyBlock(
                [
                    "public",
                    getMethodName,
                    `(mode: 'flat' | 'raw' = '${defaultMode}'): (${flatTypeName} | ${baseType})[] | undefined`,
                ],
                () => {
                    w.line(`const match = ${matchRef}`);
                    w.line(`const items = getArraySliceAll(${fieldAccess}, match)`);
                    w.line("if (items.length === 0) return undefined");
                    if (sliceDef.typeDiscriminator) {
                        w.line(`if (mode === 'raw') return items as ${baseType}[]`);
                    } else {
                        w.line("if (mode === 'raw') return items");
                    }
                    if (sliceDef.constrainedChoice) {
                        const cc = sliceDef.constrainedChoice;
                        w.line(
                            `return items.map(item => unwrapSliceChoice<${flatTypeName}>(item, ${matchKeys}, ${JSON.stringify(cc.variant)}))`,
                        );
                    } else {
                        w.line(`return items as unknown as ${flatTypeName}[]`);
                    }
                },
            );
        } else {
            // Single-element slice: return single item or undefined
            const defaultReturn = defaultMode === "raw" ? baseType : flatTypeName;

            // Overload signatures
            w.lineSM(`public ${getMethodName}(mode: 'flat'): ${flatTypeName} | undefined`);
            w.lineSM(`public ${getMethodName}(mode: 'raw'): ${baseType} | undefined`);
            w.lineSM(`public ${getMethodName}(): ${defaultReturn} | undefined`);

            // Implementation
            w.curlyBlock(
                [
                    "public",
                    getMethodName,
                    `(mode: 'flat' | 'raw' = '${defaultMode}'): ${flatTypeName} | ${baseType} | undefined`,
                ],
                () => {
                    w.line(`const match = ${matchRef}`);
                    if (sliceDef.array) {
                        w.line(`const item = getArraySlice(${fieldAccess}, match)`);
                        w.line("if (!item) return undefined");
                    } else {
                        w.line(`const item = ${fieldAccess}`);
                        w.line("if (!item || !matchesValue(item, match)) return undefined");
                    }
                    if (sliceDef.typeDiscriminator) {
                        w.line(`if (mode === 'raw') return item as ${baseType}`);
                    } else {
                        w.line("if (mode === 'raw') return item");
                    }
                    if (sliceDef.constrainedChoice) {
                        const cc = sliceDef.constrainedChoice;
                        w.line(
                            `return unwrapSliceChoice<${flatTypeName}>(item, ${matchKeys}, ${JSON.stringify(cc.variant)})`,
                        );
                    } else {
                        w.line(`return item as unknown as ${flatTypeName}`);
                    }
                },
            );
        }
        w.line();
    }
};
