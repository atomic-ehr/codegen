import type { FhirTypeImports } from "@root/api/writer-generator/section-writer";
import {
    type ChoiceFieldInstance,
    type EnumDefinition,
    type Identifier,
    isNestedIdentifier,
    isPrimitiveIdentifier,
    isProfileNestedIdentifier,
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

const rewriteFieldTypeDefs: Record<
    string,
    Record<string, (field: RegularField | ChoiceFieldInstance, typeRef: (id: Identifier) => string) => string>
> = {
    Coding: { code: () => "T" },
    Reference: {
        // A literal reference is a relative or absolute URL ending in
        // `<Type>/<id>`, so the absolute forms carry the target too — left as a
        // bare `http://${string}` they were an escape hatch out of the whole
        // allowed-target list. `urn:` and `#contained` references name no
        // resource type at all and stay open.
        reference: () =>
            // biome-ignore lint/suspicious/noTemplateCurlyInString: emitted as a TS template literal type, the placeholders are intentional
            "`${T}/${string}` | `http://${string}/${T}/${string}` | `https://${string}/${T}/${string}` | `urn:uuid:${string}` | `urn:oid:${string}` | `#${string}`",
        // `Reference.type` restates what the reference points at, so it is bound
        // by the same targets as the literal. Left as `string` it was the one
        // part of a narrowed Reference that accepted any value at all.
        type: () => "T",
    },
    CodeableConcept: { coding: (field, typeRef) => `${typeRef(field.type)}<T>` },
};

export const resolveFieldTsType = (
    tImport: FhirTypeImports,
    schemaName: string,
    tsName: string,
    field: RegularField | ChoiceFieldInstance,
    resolveRef?: (ref: Identifier) => Identifier,
    genericFieldMap?: Record<string, string>,
    isFamilyType?: (ref: Identifier) => boolean,
): string => {
    // Type modules import referenced types; other callers write them by name.
    const typeRef = (id: Identifier) => tImport.use(id);
    if (genericFieldMap?.[tsName]) return genericFieldMap[tsName];

    const rewriteFieldType = rewriteFieldTypeDefs[schemaName]?.[tsName];
    if (rewriteFieldType) return rewriteFieldType(field, typeRef);

    if (field.enum) {
        if (field.type.name === "Coding" || field.type.name === "CodeableConcept")
            return `${typeRef(field.type)}<${tsEnumType(field.enum)}>`;
        // Bindings on Quantity and other objects constrain a code within the
        // object; they do not replace the whole value with a code string.
        if (isPrimitiveIdentifier(field.type)) return tsEnumType(field.enum);
    }
    if (field.reference && field.reference.resource.length > 0) {
        // Profile targets are replaced by their base resource type; keep the
        // profile URLs as comments to make server-side validation errors traceable.
        const profilesByResource: Record<string, string[]> = {};
        if (resolveRef) {
            for (const profile of field.reference.profiles ?? []) {
                const base = resolveRef(profile).name;
                (profilesByResource[base] ??= []).push(profile.url);
            }
        }
        const references = field.reference.resource
            .map((original) => {
                const ref = resolveRef ? resolveRef(original) : original;
                if (isFamilyType?.(ref)) return `string /* ${ref.name} */`;
                const profiles = profilesByResource[ref.name];
                if (profiles) return `"${ref.name}" /* ${profiles.join(", ")} */`;
                return `"${ref.name}"`;
            })
            .join(" | ");
        return `${typeRef(field.type)}<${references}>`;
    }
    if (isPrimitiveIdentifier(field.type)) return resolvePrimitiveType(field.type.name);
    if (isNestedIdentifier(field.type)) return tsResourceName(field.type);
    // A profile's nested copy is named after its specialization by the type imports.
    return typeRef(field.type);
};

export const fieldTsType = (
    tImport: FhirTypeImports,
    field: RegularField | ChoiceFieldInstance,
    resolveRef?: (ref: Identifier) => Identifier,
    isFamilyType?: (ref: Identifier) => boolean,
): string => {
    // Profile fields use nested types exported by their parent module.
    const type =
        (isNestedIdentifier(field.type) || isProfileNestedIdentifier(field.type)) &&
        !field.enum &&
        !field.reference?.resource.length
            ? tsTypeFromIdentifier(tImport, field.type)
            : resolveFieldTsType(tImport, "", "", field, resolveRef, undefined, isFamilyType);
    return type + (field.array ? "[]" : "");
};

export const tsTypeFromIdentifier = (tImport: FhirTypeImports, id: Identifier): string => {
    if (isNestedIdentifier(id) || isProfileNestedIdentifier(id)) return tImport.use(id);
    if (isPrimitiveIdentifier(id)) return resolvePrimitiveType(id.name);
    // Fallback: check if id.name is a known primitive type even if kind isn't set
    const primitiveType = primitiveType2tsType[id.name];
    if (primitiveType !== undefined) return primitiveType;
    return tImport.use(id);
};
