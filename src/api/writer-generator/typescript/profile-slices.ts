import {
    type ConstrainedChoiceInfo,
    isChoiceDeclarationField,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    type ProfileTypeSchema,
    type RegularField,
    type TypeIdentifier,
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

/** Extract resource type name from a type-discriminator match (e.g. {"resource":{"resourceType":"Patient"}} → "Patient") */
export const extractResourceTypeFromMatch = (match: Record<string, unknown>): string | undefined => {
    for (const value of Object.values(match)) {
        if (typeof value !== "object" || value === null) continue;
        const obj = value as Record<string, unknown>;
        if (typeof obj.resourceType === "string") return obj.resourceType;
        const nested = extractResourceTypeFromMatch(obj);
        if (nested) return nested;
    }
    return undefined;
};

export const collectTypesFromSlices = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    addType: (typeId: TypeIdentifier) => void,
) => {
    const pkgName = flatProfile.identifier.package;
    for (const field of Object.values(flatProfile.fields ?? {})) {
        if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices || !field.type) continue;
        const isTypeDisc = field.slicing.discriminator?.some((d) => d.type === "type") ?? false;
        for (const slice of Object.values(field.slicing.slices)) {
            if (Object.keys(slice.match ?? {}).length > 0) {
                addType(field.type);
                const cc = slice.elements ? tsIndex.constrainedChoice(pkgName, field.type, slice.elements) : undefined;
                if (cc) addType(cc.variantType);
                // For type discriminator slices, also import the matched resource type
                if (isTypeDisc && slice.match) {
                    const resourceTypeName = extractResourceTypeFromMatch(slice.match);
                    if (resourceTypeName) {
                        const resourceSchema = tsIndex.schemas.find(
                            (s) => s.identifier.name === resourceTypeName && s.identifier.kind === "resource",
                        );
                        if (resourceSchema) addType(resourceSchema.identifier);
                    }
                }
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
    /** Base type parameterized with the matched resource type (e.g. "BundleEntry<Patient>") */
    typedBaseType: string;
    sliceName: string;
    match: Record<string, unknown>;
    /** Required fields, already filtered (match keys and polymorphic base names removed) */
    required: string[];
    excluded: string[];
    array: boolean;
    constrainedChoice: ConstrainedChoiceInfo | undefined;
    /** True when the slice uses a type discriminator (match by resourceType) */
    typeDiscriminator: boolean;
};

export const collectSliceDefs = (tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema): SliceDef[] =>
    Object.entries(flatProfile.fields ?? {})
        .filter(([_, field]) => isNotChoiceDeclarationField(field) && field.slicing?.slices)
        .flatMap(([fieldName, field]) => {
            if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices || !field.type) return [];
            const baseType = tsTypeFromIdentifier(field.type);
            const pkgName = flatProfile.identifier.package;
            const choiceBaseNames = collectChoiceBaseNames(tsIndex, field.type);
            const isTypeDisc = field.slicing.discriminator?.some((d) => d.type === "type") ?? false;
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
                    const resourceType = isTypeDisc ? extractResourceTypeFromMatch(slice.match ?? {}) : undefined;
                    const typedBaseType = resourceType ? `${baseType}<${resourceType}>` : baseType;
                    return {
                        fieldName,
                        baseType,
                        typedBaseType,
                        sliceName,
                        match: slice.match ?? {},
                        required,
                        excluded: slice.excluded ?? [],
                        array: Boolean(field.array),
                        constrainedChoice,
                        typeDiscriminator: isTypeDisc,
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
        const baseType = sliceDef.typedBaseType;
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
        const baseType = sliceDef.typedBaseType;
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
                if (sliceDef.typeDiscriminator) {
                    w.line(`if (mode === 'raw') return item as ${baseType}`);
                } else {
                    w.line("if (mode === 'raw') return item");
                }
                if (sliceDef.typeDiscriminator) {
                    w.line(`return item as ${typeName}`);
                } else if (sliceDef.constrainedChoice) {
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
