import {
    type ConstrainedChoiceInfo,
    type Identifier,
    isChoiceDeclarationField,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    type ProfileTypeSchema,
    type RegularField,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    tsFieldName,
    tsProfileClassName,
    tsResolvedSliceBaseName,
    tsResourceName,
    tsSliceFlatTypeName,
    tsSliceStaticName,
} from "./name";
import { tsGet, tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

/** Collect choice declaration field names from a base type schema */
const collectChoiceBaseNames = (tsIndex: TypeSchemaIndex, typeId: Identifier): Set<string> => {
    const names = new Set<string>();
    const schema = tsIndex.resolve(typeId);
    if (schema && "fields" in schema && schema.fields) {
        for (const [name, f] of Object.entries(schema.fields)) {
            if (isChoiceDeclarationField(f)) names.add(name);
        }
    }
    return names;
};

export const collectTypesFromSlices = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    addType: (typeId: Identifier) => void,
) => {
    const pkgName = flatProfile.identifier.package;
    for (const field of Object.values(flatProfile.fields ?? {})) {
        if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices || !field.type) continue;
        for (const slice of Object.values(field.slicing.slices)) {
            if (Object.keys(slice.match ?? {}).length > 0) {
                addType(field.type);
                const cc = slice.elements ? tsIndex.constrainedChoice(pkgName, field.type, slice.elements) : undefined;
                if (cc) addType(cc.variantType);
            }
        }
    }
};

export const collectRequiredSliceNames = (field: RegularField): string[] | undefined => {
    if (!field.array || !field.slicing?.slices) return undefined;
    const names = Object.entries(field.slicing.slices)
        .filter(([_, s]) => s.min !== undefined && s.min >= 1 && s.match && Object.keys(s.match).length > 0)
        .map(([name]) => name);
    return names.length > 0 ? names : undefined;
};

export type SliceDef = {
    fieldName: string;
    baseType: string;
    sliceName: string;
    match: Record<string, unknown>;
    /** Required fields, already filtered (match keys and polymorphic base names removed) */
    required: string[];
    excluded: string[];
    array: boolean;
    constrainedChoice: ConstrainedChoiceInfo | undefined;
};

export const collectSliceDefs = (tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema): SliceDef[] =>
    Object.entries(flatProfile.fields ?? {})
        .filter(([_, field]) => isNotChoiceDeclarationField(field) && field.slicing?.slices)
        .flatMap(([fieldName, field]) => {
            if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices || !field.type) return [];
            const baseType = tsTypeFromIdentifier(field.type);
            const pkgName = flatProfile.identifier.package;
            const choiceBaseNames = collectChoiceBaseNames(tsIndex, field.type);
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
                    // Skip flattening for primitive types — can't intersect object with boolean/string/etc.
                    const constrainedChoice = cc && !isPrimitiveIdentifier(cc.variantType) ? cc : undefined;
                    return {
                        fieldName,
                        baseType,
                        sliceName,
                        match: slice.match ?? {},
                        required,
                        excluded: slice.excluded ?? [],
                        array: Boolean(field.array),
                        constrainedChoice,
                    };
                });
        });

export const generateSliceSetters = (
    w: TypeScript,
    sliceDefs: SliceDef[],
    flatProfile: ProfileTypeSchema,
    sliceBaseNames: Record<string, string>,
) => {
    const profileClassName = tsProfileClassName(flatProfile);
    const tsProfileName = tsResourceName(flatProfile.identifier);
    for (const sliceDef of sliceDefs) {
        const baseName = tsResolvedSliceBaseName(sliceBaseNames, sliceDef.fieldName, sliceDef.sliceName);
        const methodName = `set${baseName}`;
        const typeName = tsSliceFlatTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const matchRef = `${profileClassName}.${tsSliceStaticName(sliceDef.sliceName)}SliceMatch`;
        const tsField = tsFieldName(sliceDef.fieldName);
        const fieldAccess = tsGet("this.resource", tsField);
        const baseType = sliceDef.baseType;
        // Make input optional when there are no required fields (input can be empty object)
        const inputOptional = sliceDef.required.length === 0;
        const unionType = `${typeName} | ${baseType}`;
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
        w.line();
    }
};

export const generateSliceGetters = (
    w: TypeScript,
    sliceDefs: SliceDef[],
    flatProfile: ProfileTypeSchema,
    sliceBaseNames: Record<string, string>,
) => {
    const profileClassName = tsProfileClassName(flatProfile);
    const tsProfileName = tsResourceName(flatProfile.identifier);
    const defaultMode = w.opts.sliceGetterDefault ?? "flat";
    for (const sliceDef of sliceDefs) {
        const baseName = tsResolvedSliceBaseName(sliceBaseNames, sliceDef.fieldName, sliceDef.sliceName);
        const getMethodName = `get${baseName}`;
        const typeName = tsSliceFlatTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const matchRef = `${profileClassName}.${tsSliceStaticName(sliceDef.sliceName)}SliceMatch`;
        const matchKeys = JSON.stringify(Object.keys(sliceDef.match));
        const tsField = tsFieldName(sliceDef.fieldName);
        const fieldAccess = tsGet("this.resource", tsField);
        const baseType = sliceDef.baseType;
        const defaultReturn = defaultMode === "raw" ? baseType : typeName;

        // Overload signatures
        w.lineSM(`public ${getMethodName}(mode: 'flat'): ${typeName} | undefined`);
        w.lineSM(`public ${getMethodName}(mode: 'raw'): ${baseType} | undefined`);
        w.lineSM(`public ${getMethodName}(): ${defaultReturn} | undefined`);

        // Implementation
        w.curlyBlock(
            [
                "public",
                getMethodName,
                `(mode: 'flat' | 'raw' = '${defaultMode}'): ${typeName} | ${baseType} | undefined`,
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
                w.line("if (mode === 'raw') return item");
                if (sliceDef.constrainedChoice) {
                    const cc = sliceDef.constrainedChoice;
                    w.line(`return unwrapSliceChoice<${typeName}>(item, ${matchKeys}, ${JSON.stringify(cc.variant)})`);
                } else {
                    w.line(`return stripMatchKeys<${typeName}>(item, ${matchKeys})`);
                }
            },
        );
        w.line();
    }
};
