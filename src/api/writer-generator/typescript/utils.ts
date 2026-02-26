import {
    type ChoiceFieldInstance,
    type EnumDefinition,
    type Identifier,
    isNestedIdentifier,
    isPrimitiveIdentifier,
    type RegularField,
} from "@root/typeschema/types";
import { tsResourceName } from "./name";

const primitiveType2tsType: Record<string, string> = {
    boolean: "boolean",
    instant: "string",
    time: "string",
    date: "string",
    dateTime: "string",

    decimal: "number",
    integer: "number",
    unsignedInt: "number",
    positiveInt: "number",
    integer64: "number",
    base64Binary: "string",

    uri: "string",
    url: "string",
    canonical: "string",
    oid: "string",
    uuid: "string",

    string: "string",
    code: "string",
    markdown: "string",
    id: "string",
    xhtml: "string",
};

export const resolvePrimitiveType = (name: string) => {
    const tsType = primitiveType2tsType[name];
    if (tsType === undefined) throw new Error(`Unknown primitive type ${name}`);
    return tsType;
};

export const tsGet = (object: string, tsFieldName: string) => {
    if (tsFieldName.startsWith('"')) return `${object}[${tsFieldName}]`;
    return `${object}.${tsFieldName}`;
};

export const tsEnumType = (enumDef: EnumDefinition) => {
    const values = enumDef.values.map((e) => `"${e}"`).join(" | ");
    return enumDef.isOpen ? `(${values} | string)` : `(${values})`;
};

const rewriteFieldTypeDefs: Record<string, Record<string, () => string>> = {
    Coding: { code: () => "T" },
    // biome-ignore lint: that is exactly string what we want
    Reference: { reference: () => "`${T}/${string}`" },
    CodeableConcept: { coding: () => "Coding<T>" },
};

export const resolveFieldTsType = (
    schemaName: string,
    tsName: string,
    field: RegularField | ChoiceFieldInstance,
): string => {
    const rewriteFieldType = rewriteFieldTypeDefs[schemaName]?.[tsName];
    if (rewriteFieldType) return rewriteFieldType();

    if (field.enum) {
        if (field.type.name === "Coding") return `Coding<${tsEnumType(field.enum)}>`;
        if (field.type.name === "CodeableConcept") return `CodeableConcept<${tsEnumType(field.enum)}>`;
        return tsEnumType(field.enum);
    }
    if (field.reference && field.reference.length > 0) {
        const references = field.reference.map((ref) => `"${ref.name}"`).join(" | ");
        return `Reference<${references}>`;
    }
    if (isPrimitiveIdentifier(field.type)) return resolvePrimitiveType(field.type.name);
    if (isNestedIdentifier(field.type)) return tsResourceName(field.type);
    return field.type.name as string;
};

export const tsTypeFromIdentifier = (id: Identifier): string => {
    if (isNestedIdentifier(id)) return tsResourceName(id);
    if (isPrimitiveIdentifier(id)) return resolvePrimitiveType(id.name);
    // Fallback: check if id.name is a known primitive type even if kind isn't set
    const primitiveType = primitiveType2tsType[id.name];
    if (primitiveType !== undefined) return primitiveType;
    return id.name;
};
