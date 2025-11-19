import { kebabCase, pascalCase, uppercaseFirstLetterOfEach } from "@root/api/writer-generator/utils";
import type { CanonicalUrl, Identifier } from "@root/typeschema/types";
import { extractNameFromCanonical } from "@root/typeschema/types";

/**
 * Map FHIR primitive types to TypeScript types
 */
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

/**
 * TypeScript reserved keywords
 */
const tsKeywords = new Set([
    "class",
    "function",
    "return",
    "if",
    "for",
    "while",
    "const",
    "let",
    "var",
    "import",
    "export",
    "interface",
]);

/**
 * Resolve FHIR primitive type to TypeScript type
 */
export function resolvePrimitiveType(name: string): string {
    const tsType = primitiveType2tsType[name];
    if (tsType === undefined) {
        throw new Error(`Unknown primitive type ${name}`);
    }
    return tsType;
}

/**
 * Convert FHIR package name to TypeScript directory name
 */
export function tsFhirPackageDir(name: string): string {
    return kebabCase(name);
}

/**
 * Convert identifier to TypeScript module name
 */
export function tsModuleName(id: Identifier): string {
    if (id.kind === "profile") {
        return tsResourceName(id);
    }
    return pascalCase(id.name);
}

/**
 * Convert identifier to TypeScript module file name
 */
export function tsModuleFileName(id: Identifier): string {
    return `${tsModuleName(id)}.ts`;
}

/**
 * Extract name from canonical URL
 */
export function canonicalToName(canonical: string | undefined, dropFragment = true): string | undefined {
    if (!canonical) return undefined;
    const localName = extractNameFromCanonical(canonical as CanonicalUrl, dropFragment);
    if (!localName) return undefined;
    return normalizeTsName(localName);
}

/**
 * Convert identifier to TypeScript resource/type name
 */
export function tsResourceName(id: Identifier): string {
    if (id.kind === "nested") {
        const url = id.url;
        const path = canonicalToName(url, false);
        if (!path) return "";
        const [resourceName, fragment] = path.split("#");
        const name = uppercaseFirstLetterOfEach((fragment ?? "").split(".")).join("");
        return normalizeTsName([resourceName, name].join(""));
    }
    return normalizeTsName(id.name);
}

/**
 * Convert field name to TypeScript property name
 * Quotes names that are keywords or contain special characters
 */
export function tsFieldName(n: string): string {
    if (tsKeywords.has(n)) return `"${n}"`;
    if (n.includes(" ") || n.includes("-")) return `"${n}"`;
    return n;
}

/**
 * Normalize TypeScript name (replace invalid characters, avoid keywords)
 */
export function normalizeTsName(n: string): string {
    let normalized = n;
    if (tsKeywords.has(n)) {
        normalized = `${n}_`;
    }
    return normalized.replace(/[- ]/g, "_");
}

/**
 * Get property accessor for TypeScript object
 * Uses bracket notation for quoted property names
 */
export function tsGet(object: string, tsFieldName: string): string {
    if (tsFieldName.startsWith('"')) {
        return `${object}[${tsFieldName}]`;
    }
    return `${object}.${tsFieldName}`;
}
