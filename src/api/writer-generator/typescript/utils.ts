import type { SectionHandle } from "@root/api/writer-generator/section-writer";
import {
    type ChoiceFieldInstance,
    type EnumDefinition,
    isPrimitiveIdentifier,
    type RegularField,
    type TypeIdentifier,
} from "@root/typeschema/types";

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

export type TsImport = TypeIdentifier | { module: string; name: string; typeOnly?: boolean };
export type TsImports = SectionHandle<never, TsImport>;
export const isFhirTypeImport = (key: TsImport): key is TypeIdentifier => !("module" in key);

/** A runtime helper from the generated `profile-helpers` module, as written in a profile module. */
export const profileHelper = (imports: TsImports, name: string): string =>
    imports.use({ module: "../../profile-helpers", name });

const rewriteFieldTypeDefs: Record<
    string,
    Record<string, (field: RegularField | ChoiceFieldInstance, imports: TsImports) => string>
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
    CodeableConcept: { coding: (field, imports) => `${imports.use(field.type)}<T>` },
};

/** The field's TS type, or `undefined` when it is a plain reference to `field.type`: the caller names that type. */
export const resolveFieldTsType = (
    imports: TsImports,
    schemaName: string,
    tsName: string,
    field: RegularField | ChoiceFieldInstance,
    resolveRef?: (ref: TypeIdentifier) => TypeIdentifier,
    genericFieldMap?: Record<string, string>,
    isFamilyType?: (ref: TypeIdentifier) => boolean,
): string | undefined => {
    if (genericFieldMap?.[tsName]) return genericFieldMap[tsName];

    const rewriteFieldType = rewriteFieldTypeDefs[schemaName]?.[tsName];
    if (rewriteFieldType) return rewriteFieldType(field, imports);

    if (field.enum) {
        if (field.type.name === "Coding" || field.type.name === "CodeableConcept")
            return `${imports.use(field.type)}<${tsEnumType(field.enum)}>`;
        return tsEnumType(field.enum);
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
        return `${imports.use(field.type)}<${references}>`;
    }
    if (isPrimitiveIdentifier(field.type)) return resolvePrimitiveType(field.type.name);
    return undefined;
};

export const fieldTsType = (
    imports: TsImports,
    field: RegularField | ChoiceFieldInstance,
    resolveRef?: (ref: TypeIdentifier) => TypeIdentifier,
    isFamilyType?: (ref: TypeIdentifier) => boolean,
): string =>
    (resolveFieldTsType(imports, "", "", field, resolveRef, undefined, isFamilyType) ?? imports.use(field.type)) +
    (field.array ? "[]" : "");

export const tsTypeFromIdentifier = (imports: TsImports, id: TypeIdentifier): string => {
    if (isPrimitiveIdentifier(id)) return resolvePrimitiveType(id.name);
    // Fallback: check if id.name is a known primitive type even if kind isn't set
    const primitiveType = primitiveType2tsType[id.name];
    if (primitiveType !== undefined) return primitiveType;
    return imports.use(id);
};
