import {
    camelCase,
    kebabCase,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
    extractNameFromCanonical,
    type Identifier,
    type ProfileTypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";

// biome-ignore format: too long
const tsKeywords = new Set([ "class", "function", "return", "if", "for", "while", "const", "let", "var", "import", "export", "interface" ]);

const normalizeTsName = (n: string): string => {
    if (tsKeywords.has(n)) n = `${n}_`;
    return n.replace(/\[x\]/g, "_x_").replace(/[- :.]/g, "_");
};

export const safeCamelCase = (name: string): string => {
    if (!name) return "";
    // Remove [x] suffix and normalize special characters before camelCase
    const normalized = name.replace(/\[x\]/g, "").replace(/:/g, "_");
    return camelCase(normalized);
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
    return `${normalizeTsName(schema.identifier.name)}Profile`;
};

export const tsSliceInputTypeName = (profileName: string, fieldName: string, sliceName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(fieldName))}_${uppercaseFirstLetter(normalizeTsName(sliceName))}SliceInput`;
};

export const tsExtensionInputTypeName = (profileName: string, extensionName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(extensionName))}Input`;
};

export const tsSliceMethodName = (sliceName: string): string => {
    const normalized = safeCamelCase(sliceName);
    return `set${uppercaseFirstLetter(normalized || "Slice")}`;
};

export const tsExtensionMethodName = (name: string): string => {
    const normalized = safeCamelCase(name);
    return `set${uppercaseFirstLetter(normalized || "Extension")}`;
};

export const tsExtensionMethodFallback = (name: string, path?: string): string => {
    const rawPath =
        path
            ?.split(".")
            .filter((p) => p && p !== "extension")
            .join("_") ?? "";
    const pathPart = rawPath ? uppercaseFirstLetter(safeCamelCase(rawPath)) : "";
    const normalized = safeCamelCase(name);
    return `setExtension${pathPart}${uppercaseFirstLetter(normalized || "Extension")}`;
};

export const tsSliceMethodFallback = (fieldName: string, sliceName: string): string => {
    const fieldPart = uppercaseFirstLetter(safeCamelCase(fieldName) || "Field");
    const slicePart = uppercaseFirstLetter(safeCamelCase(sliceName) || "Slice");
    return `setSlice${fieldPart}${slicePart}`;
};
