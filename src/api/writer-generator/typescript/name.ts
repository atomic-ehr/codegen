import {
    camelCase,
    kebabCase,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
    extractNameFromCanonical,
    type NameCandidates,
    type ProfileExtension,
    type SnapshotProfileTypeSchema,
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
    return kebabCase(name.replace(/[@/]/g, "_"));
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

export const tsProfileModuleName = (tsIndex: TypeSchemaIndex, schema: SnapshotProfileTypeSchema): string => {
    const resourceId = tsIndex.findLastSpecializationByIdentifier(schema.identifier);
    const resourceName = uppercaseFirstLetter(normalizeTsName(resourceId.name));
    return `${resourceName}_${normalizeTsName(schema.identifier.name)}`;
};

export const tsProfileModuleFileName = (tsIndex: TypeSchemaIndex, schema: SnapshotProfileTypeSchema): string => {
    return `${tsProfileModuleName(tsIndex, schema)}.ts`;
};

export const tsProfileClassName = (schema: SnapshotProfileTypeSchema): string => {
    const name = normalizeTsName(schema.identifier.name);
    return name.endsWith("Profile") ? name : `${name}Profile`;
};

export const tsSliceFlatTypeName = (profileName: string, fieldName: string, sliceName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(fieldName))}_${uppercaseFirstLetter(normalizeTsName(sliceName))}SliceFlat`;
};

export const tsSliceFlatAllTypeName = (profileName: string, fieldName: string, sliceName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(fieldName))}_${uppercaseFirstLetter(normalizeTsName(sliceName))}SliceFlatAll`;
};

export const tsExtensionFlatTypeName = (profileName: string, extensionName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(extensionName))}Flat`;
};

/** The shape `extractComplexExtension` can produce from any resource: every member optional. */
export const tsExtensionExtractedTypeName = (profileName: string, extensionName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(extensionName))}Extracted`;
};

/** The same shape once the extension validated: required sub-extensions are guaranteed. */
export const tsExtensionVFlatTypeName = (profileName: string, extensionName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(extensionName))}VFlat`;
};

/** Static class member name for a slice's match constant. */
export const tsSliceStaticName = (name: string): string =>
    `${name.replace(/\[x\]/g, "").replace(/[^a-zA-Z0-9_$]/g, "_")}SliceMatch`;

export const tsValueFieldName = (id: TypeIdentifier): string => `value${uppercaseFirstLetter(id.name)}`;

const TS_IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** An object-literal property key for emitted value code: bare when it is a
 *  valid identifier, quoted otherwise — and computed for "__proto__", whose
 *  plain form is the prototype setter and would not create an own property. */
export const tsObjectKey = (key: string): string => {
    if (key === "__proto__") return '["__proto__"]';
    return TS_IDENTIFIER_RE.test(key) ? key : JSON.stringify(key);
};

type SliceNaming = { fieldName: string; sliceName: string; nameCandidates: NameCandidates };

export type ProfileMethodBaseNames = {
    extension: (ext: ProfileExtension) => string;
    slice: (sliceDef: SliceNaming) => string;
};

/** Allocate one accessor base name, avoiding names already taken. */
export const tsAccessorBaseName = (
    candidates: readonly string[],
    recommended: string,
    reserved: ReadonlySet<string>,
): string => {
    if (!reserved.has(recommended)) return recommended;
    for (const candidate of candidates) {
        if (!reserved.has(candidate)) return candidate;
    }
    return recommended;
};

export const resolveProfileMethodBaseNames = (
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceNaming[],
): ProfileMethodBaseNames => {
    // Field accessors are emitted from the same class, so their names are taken
    // before slice accessors get to pick.
    const reserved = new Set(Object.keys(snapshot.fields).map(uppercaseFirstLetter));

    const slicesRecord: Record<string, string> = {};
    for (const s of sliceDefs) {
        const name = tsAccessorBaseName(s.nameCandidates.candidates, s.nameCandidates.recommended, reserved);
        reserved.add(name);
        slicesRecord[`${s.fieldName}:${s.sliceName}`] = name;
    }

    return {
        // Extension accessors keep their recommended name: never reserved, and not keyed
        // by url:path, which two snapshot entries can share.
        extension: (ext) => ext.nameCandidates.recommended,
        slice: (sliceDef) =>
            slicesRecord[`${sliceDef.fieldName}:${sliceDef.sliceName}`] ?? sliceDef.nameCandidates.recommended,
    };
};
