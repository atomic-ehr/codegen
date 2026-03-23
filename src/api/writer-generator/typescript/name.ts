import {
    camelCase,
    kebabCase,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
    extractNameFromCanonical,
    type ProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";

// biome-ignore format: too long
const tsKeywords = new Set([ "class", "function", "return", "if", "for", "while", "const", "let", "var", "import", "export", "interface" ]);

export const normalizeTsName = (n: string): string => {
    if (tsKeywords.has(n)) n = `${n}_`;
    return n.replace(/\[x\]/g, "_x_").replace(/[- :.]/g, "_");
};

export const tsCamelCase = (name: string): string => {
    if (!name) return "";
    // Remove [x] suffix and normalize special characters before camelCase
    const normalized = name.replace(/\[x\]/g, "").replace(/:/g, "_");
    return camelCase(normalized);
};

export const tsPackageDir = (name: string): string => {
    return kebabCase(name);
};

export const tsModuleName = (id: TypeIdentifier): string => {
    // NOTE: Why not pascal case?
    // In hl7-fhir-uv-xver-r5-r4 we have:
    // - http://hl7.org/fhir/5.0/StructureDefinition/extension-Subscription.topic (subscription_topic)
    // - http://hl7.org/fhir/5.0/StructureDefinition/extension-SubscriptionTopic (SubscriptionTopic)
    // And they should not clash the names.
    return uppercaseFirstLetter(tsResourceName(id));
};

export const tsModuleFileName = (id: TypeIdentifier): string => {
    return `${tsModuleName(id)}.ts`;
};

export const tsModulePath = (id: TypeIdentifier): string => {
    return `${tsPackageDir(id.package)}/${tsModuleName(id)}`;
};

export const tsNameFromCanonical = (canonical: string | undefined, dropFragment = true) => {
    if (!canonical) return undefined;
    const localName = extractNameFromCanonical(canonical as CanonicalUrl, dropFragment);
    if (!localName) return undefined;
    return normalizeTsName(localName);
};

export const tsResourceName = (id: TypeIdentifier): string => {
    if (id.kind === "nested") {
        const url = id.url;
        // Extract name from URL without normalizing dots (needed for fragment splitting)
        const localName = extractNameFromCanonical(url as CanonicalUrl, false);
        if (!localName) return "";
        const [resourceName, fragment] = localName.split("#");
        const name = uppercaseFirstLetterOfEach((fragment ?? "").split(".")).join("");
        return normalizeTsName([resourceName, name].join(""));
    }
    const name = id.name.includes("/")
        ? (extractNameFromCanonical(id.name as unknown as CanonicalUrl) ?? id.name)
        : id.name;
    return normalizeTsName(name);
};

export const tsFieldName = (n: string): string => {
    if (tsKeywords.has(n)) return `"${n}"`;
    if (n.includes(" ") || n.includes("-")) return `"${n}"`;
    return n;
};

export const tsProfileModuleName = (tsIndex: TypeSchemaIndex, schema: ProfileTypeSchema): string => {
    const resourceSchema = tsIndex.findLastSpecialization(schema);
    const resourceName = uppercaseFirstLetter(normalizeTsName(resourceSchema.identifier.name));
    return `${resourceName}_${normalizeTsName(schema.identifier.name)}`;
};

export const tsProfileModuleFileName = (tsIndex: TypeSchemaIndex, schema: ProfileTypeSchema): string => {
    return `${tsProfileModuleName(tsIndex, schema)}.ts`;
};

export const tsProfileClassName = (schema: ProfileTypeSchema): string => {
    const name = normalizeTsName(schema.identifier.name);
    return name.endsWith("Profile") ? name : `${name}Profile`;
};

export const tsSliceFlatTypeName = (profileName: string, fieldName: string, sliceName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(fieldName))}_${uppercaseFirstLetter(normalizeTsName(sliceName))}SliceFlat`;
};

export const tsExtensionFlatTypeName = (profileName: string, extensionName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(extensionName))}Flat`;
};

export const tsSliceStaticName = (name: string): string => name.replace(/\[x\]/g, "").replace(/[^a-zA-Z0-9_$]/g, "_");

export const tsSliceMethodBaseName = (sliceName: string): string =>
    uppercaseFirstLetter(normalizeTsName(sliceName) || "Slice");

export const tsExtensionMethodBaseName = (name: string): string =>
    uppercaseFirstLetter(tsCamelCase(name) || "Extension");

export const tsQualifiedExtensionMethodBaseName = (name: string, path?: string): string => {
    const rawPath =
        path
            ?.split(".")
            .filter((p) => p && p !== "extension")
            .join("_") ?? "";
    const pathPart = rawPath ? uppercaseFirstLetter(tsCamelCase(rawPath)) : "";
    return `${pathPart}${uppercaseFirstLetter(tsCamelCase(name) || "Extension")}`;
};

export const tsQualifiedSliceMethodBaseName = (fieldName: string, sliceName: string): string => {
    const fieldPart = uppercaseFirstLetter(tsCamelCase(fieldName) || "Field");
    const slicePart = uppercaseFirstLetter(normalizeTsName(sliceName) || "Slice");
    return `${fieldPart}${slicePart}`;
};

export const tsResolvedExtensionBaseName = (
    extensionBaseNames: Record<string, string>,
    url: string,
    path: string,
    fallbackName: string,
): string => extensionBaseNames[`${url}:${path}`] ?? fallbackName;

export const tsResolvedSliceBaseName = (
    sliceBaseNames: Record<string, string>,
    fieldName: string,
    sliceName: string,
): string => sliceBaseNames[`${fieldName}:${sliceName}`] ?? sliceName;

export const tsValueFieldName = (id: TypeIdentifier): string => `value${uppercaseFirstLetter(id.name)}`;
