import {
    camelCase,
    kebabCase,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
    type ChoiceFieldInstance,
    type EnumDefinition,
    extractNameFromCanonical,
    type Identifier,
    isNestedIdentifier,
    isPrimitiveIdentifier,
    type RegularField,
} from "@root/typeschema/types";

export const primitiveType2tsType: Record<string, string> = {
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

export const tsFhirPackageDir = (name: string): string => {
    return kebabCase(name);
};

export const tsModuleName = (id: Identifier): string => {
    // NOTE: Why not pascal case?
    // In hl7-fhir-uv-xver-r5-r4 we have:
    // - http://hl7.org/fhir/5.0/StructureDefinition/extension-Subscription.topic (subscription_topic)
    // - http://hl7.org/fhir/5.0/StructureDefinition/extension-SubscriptionTopic (SubscriptionTopic)
    // And they should not clash the names.
    return uppercaseFirstLetter(normalizeTsName(id.name));
};

export const tsModuleFileName = (id: Identifier): string => {
    return `${tsModuleName(id)}.ts`;
};

export const tsModulePath = (id: Identifier): string => {
    return `${tsFhirPackageDir(id.package)}/${tsModuleName(id)}`;
};

export const canonicalToName = (canonical: string | undefined, dropFragment = true) => {
    if (!canonical) return undefined;
    const localName = extractNameFromCanonical(canonical as CanonicalUrl, dropFragment);
    if (!localName) return undefined;
    return normalizeTsName(localName);
};

export const tsResourceName = (id: Identifier): string => {
    if (id.kind === "nested") {
        const url = id.url;
        // Extract name from URL without normalizing dots (needed for fragment splitting)
        const localName = extractNameFromCanonical(url as CanonicalUrl, false);
        if (!localName) return "";
        const [resourceName, fragment] = localName.split("#");
        const name = uppercaseFirstLetterOfEach((fragment ?? "").split(".")).join("");
        return normalizeTsName([resourceName, name].join(""));
    }
    return normalizeTsName(id.name);
};

// biome-ignore format: too long
export const tsKeywords = new Set([ "class", "function", "return", "if", "for", "while", "const", "let", "var", "import", "export", "interface" ]);

export const tsFieldName = (n: string): string => {
    if (tsKeywords.has(n)) return `"${n}"`;
    if (n.includes(" ") || n.includes("-")) return `"${n}"`;
    return n;
};

export const normalizeTsName = (n: string): string => {
    if (tsKeywords.has(n)) n = `${n}_`;
    return n.replace(/\[x\]/g, "_x_").replace(/[- :.]/g, "_");
};

export const tsGet = (object: string, tsFieldName: string) => {
    if (tsFieldName.startsWith('"')) return `${object}[${tsFieldName}]`;
    return `${object}.${tsFieldName}`;
};

export const tsEnumType = (enumDef: EnumDefinition) => {
    const values = enumDef.values.map((e) => `"${e}"`).join(" | ");
    return enumDef.isOpen ? `(${values} | string)` : `(${values})`;
};

export const rewriteFieldTypeDefs: Record<string, Record<string, () => string>> = {
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

export const safeCamelCase = (name: string): string => {
    if (!name) return "";
    // Remove [x] suffix and normalize special characters before camelCase
    const normalized = name.replace(/\[x\]/g, "").replace(/:/g, "_");
    return camelCase(normalized);
};
