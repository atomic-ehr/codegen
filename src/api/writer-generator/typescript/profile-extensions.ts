import {
    type CanonicalUrl,
    isChoiceDeclarationField,
    isProfileTypeSchema,
    type ProfileExtension,
    type ProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    tsCamelCase,
    tsExtensionFlatTypeName,
    tsProfileClassName,
    tsProfileModuleName,
    tsResolvedExtensionBaseName,
    tsResourceName,
    tsValueFieldName,
} from "./name";
import { collectProfileFactoryInfo } from "./profile";
import { tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

export type SubExtensionSliceInfo = {
    name: string;
    url: string;
    valueField: string;
    tsType: string;
    isArray: boolean;
    isRequired: boolean;
};

export type ExtensionProfileInfo = {
    className: string;
    modulePath: string;
    flatProfile: ProfileTypeSchema;
};

/**
 * Extract value field name from a slice's `elements` list.
 * E.g. `["url", "value", "valueCoding"]` → `"valueCoding"`
 */
export const extractValueField = (elements: string[] | undefined): string | undefined => {
    if (!elements) return undefined;
    return elements.find((e) => e.startsWith("value") && e !== "value");
};

/**
 * Map a FHIR value field name (e.g. "valueCoding") to its TypeScript type.
 */
export const valueFieldToTsType = (valueField: string): string => {
    const fhirName = valueField.replace(/^value/, "");
    // Primitive types that map to TS primitives
    const primitives: Record<string, string> = {
        String: "string",
        Boolean: "boolean",
        Integer: "number",
        Decimal: "number",
        Date: "string",
        DateTime: "string",
        Time: "string",
        Instant: "string",
        Uri: "string",
        Url: "string",
        Canonical: "string",
        Code: "string",
        Oid: "string",
        Id: "string",
        Markdown: "string",
        UnsignedInt: "number",
        PositiveInt: "number",
        Uuid: "string",
        Base64Binary: "string",
    };
    return primitives[fhirName] ?? fhirName;
};

/**
 * Collect sub-extension "flat input" info from an extension profile's own
 * slice definitions on its `extension` field.
 */
export const collectSubExtensionSlices = (extProfile: ProfileTypeSchema): SubExtensionSliceInfo[] => {
    const extensionField = extProfile.fields?.extension;
    if (!extensionField || isChoiceDeclarationField(extensionField) || !extensionField.slicing?.slices) return [];
    const result: SubExtensionSliceInfo[] = [];
    for (const [sliceName, slice] of Object.entries(extensionField.slicing.slices)) {
        const valueField = extractValueField(slice.elements);
        if (!valueField) continue;
        const tsType = valueFieldToTsType(valueField);
        const isArray = slice.max === undefined;
        const isRequired = slice.min !== undefined && slice.min >= 1;
        result.push({
            name: tsCamelCase(sliceName) || sliceName,
            url: sliceName,
            valueField,
            tsType,
            isArray,
            isRequired,
        });
    }
    return result;
};

/**
 * Resolve extension URL → extension profile class info (if the extension has
 * its own generated profile class in the index).
 */
export const resolveExtensionProfile = (
    tsIndex: TypeSchemaIndex,
    pkgName: string,
    url: string,
): ExtensionProfileInfo | undefined => {
    const schema = tsIndex.resolveByUrl(pkgName, url as CanonicalUrl);
    if (!schema || !isProfileTypeSchema(schema)) return undefined;
    // Only resolve extension profiles from the same package to avoid cross-package imports
    if (schema.identifier.package !== pkgName) return undefined;
    const className = tsProfileClassName(schema);
    const modulePath = `./${tsProfileModuleName(tsIndex, schema)}`;
    const flatProfile = tsIndex.flatProfile(schema);
    return { className, modulePath, flatProfile };
};

/** Generate the body of a raw Extension branch: validate url, then push. */
const generateRawExtensionBody = (w: TypeScript, ext: ProfileExtension, targetPath: string[], paramName = "input") => {
    w.line(
        `if (${paramName}.url !== ${JSON.stringify(ext.url)}) throw new Error(\`Expected extension url '${ext.url}', got '\${${paramName}.url}'\`)`,
    );
    generateExtensionPush(w, targetPath, paramName);
};

/** Generate the code that pushes an extension onto the target (root or nested path). */
export const generateExtensionPush = (w: TypeScript, targetPath: string[], extExpr: string) => {
    if (targetPath.length === 0) {
        w.line(`pushExtension(this.resource, ${extExpr})`);
    } else {
        w.line(
            `const target = ensurePath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
        );
        w.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
        w.line(`pushExtension(target as unknown as { extension?: Extension[] }, ${extExpr})`);
    }
};

/** Generate the extension lookup code for getters. */
const generateExtLookup = (w: TypeScript, ext: ProfileExtension, targetPath: string[]) => {
    if (targetPath.length === 0) {
        w.line(`const ext = this.resource.extension?.find(e => e.url === "${ext.url}")`);
    } else {
        w.line(
            `const target = ensurePath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
        );
        w.line(`const ext = (target.extension as Extension[] | undefined)?.find(e => e.url === "${ext.url}")`);
    }
};

const effectiveGetterDefault = (w: TypeScript, hasProfile: boolean): "flat" | "profile" | "raw" => {
    const configured = w.opts.extensionGetterDefault ?? "flat";
    if (configured === "profile" && !hasProfile) return "flat";
    return configured;
};

const returnTypeForMode = (mode: "flat" | "profile" | "raw", inputType: string, profileClassName?: string): string => {
    if (mode === "profile" && profileClassName) return profileClassName;
    if (mode === "raw") return "Extension";
    return inputType;
};

const generateExtensionGetterOverloads = (
    w: TypeScript,
    ext: ProfileExtension,
    targetPath: string[],
    methodName: string,
    inputType: string,
    extProfileInfo: ExtensionProfileInfo | undefined,
    generateInputBody: () => void,
) => {
    const hasProfile = !!extProfileInfo;
    const defaultMode = effectiveGetterDefault(w, hasProfile);
    const modes: ("flat" | "profile" | "raw")[] = hasProfile ? ["flat", "profile", "raw"] : ["flat", "raw"];

    for (const mode of modes) {
        const rt = returnTypeForMode(mode, inputType, extProfileInfo?.className);
        w.lineSM(`public ${methodName}(mode: '${mode}'): ${rt} | undefined`);
    }
    const defaultReturn = returnTypeForMode(defaultMode, inputType, extProfileInfo?.className);
    w.lineSM(`public ${methodName}(): ${defaultReturn} | undefined`);

    const allReturns = [...new Set(modes.map((m) => returnTypeForMode(m, inputType, extProfileInfo?.className)))];
    const modesUnion = modes.map((m) => `'${m}'`).join(" | ");
    w.curlyBlock(
        ["public", methodName, `(mode: ${modesUnion} = '${defaultMode}'): ${allReturns.join(" | ")} | undefined`],
        () => {
            generateExtLookup(w, ext, targetPath);
            w.line("if (!ext) return undefined");
            w.line("if (mode === 'raw') return ext");
            if (hasProfile) {
                w.line(`if (mode === 'profile') return ${extProfileInfo?.className}.apply(ext)`);
            }
            generateInputBody();
        },
    );
};

type ExtensionMethodInfo = {
    ext: ProfileExtension;
    flatProfile: ProfileTypeSchema;
    setMethodName: string;
    getMethodName: string;
    targetPath: string[];
    extProfileInfo: ExtensionProfileInfo | undefined;
};

// Complex extension — has sub-extensions (e.g., Race with ombCategory, detailed, text)

const generateComplexExtensionSetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, flatProfile, setMethodName, targetPath, extProfileInfo } = info;
    const tsProfileName = tsResourceName(flatProfile.identifier);
    const inputTypeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
    const extProfileHasFlatInput = extProfileInfo
        ? collectSubExtensionSlices(extProfileInfo.flatProfile).length > 0
        : false;

    if (extProfileInfo && extProfileHasFlatInput) {
        const paramType = `${extProfileInfo.className}Flat | ${extProfileInfo.className} | Extension`;
        w.curlyBlock(["public", setMethodName, `(input: ${paramType}): this`], () => {
            w.ifElseChain(
                [
                    {
                        cond: `input instanceof ${extProfileInfo.className}`,
                        body: () => generateExtensionPush(w, targetPath, "input.toResource()"),
                    },
                    {
                        cond: "isExtension<Extension>(input)",
                        body: () => generateRawExtensionBody(w, ext, targetPath),
                    },
                ],
                () => generateExtensionPush(w, targetPath, `${extProfileInfo.className}.createResource(input)`),
            );
            w.line("return this");
        });
    } else {
        w.curlyBlock(["public", setMethodName, `(input: ${inputTypeName}): this`], () => {
            w.line("const subExtensions: Extension[] = []");
            for (const sub of ext.subExtensions ?? []) {
                const valueField = sub.valueFieldType ? tsValueFieldName(sub.valueFieldType) : "value";
                if (sub.max === "*") {
                    w.curlyBlock(["if", `(input.${sub.name})`], () => {
                        w.curlyBlock(["for", `(const item of input.${sub.name})`], () => {
                            w.line(`subExtensions.push({ url: "${sub.url}", ${valueField}: item } as Extension)`);
                        });
                    });
                } else {
                    w.curlyBlock(["if", `(input.${sub.name} !== undefined)`], () => {
                        w.line(
                            `subExtensions.push({ url: "${sub.url}", ${valueField}: input.${sub.name} } as Extension)`,
                        );
                    });
                }
            }
            if (targetPath.length === 0) {
                w.line("const list = (this.resource.extension ??= [])");
                w.line(`list.push({ url: "${ext.url}", extension: subExtensions })`);
            } else {
                w.line(
                    `const target = ensurePath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                );
                w.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                w.line(`(target.extension as Extension[]).push({ url: "${ext.url}", extension: subExtensions })`);
            }
            w.line("return this");
        });
    }
};

const generateComplexExtensionGetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, flatProfile, getMethodName, targetPath, extProfileInfo } = info;
    const tsProfileName = tsResourceName(flatProfile.identifier);
    const inputTypeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
    const extProfileHasFlatInput = extProfileInfo
        ? collectSubExtensionSlices(extProfileInfo.flatProfile).length > 0
        : false;
    const inputType = extProfileHasFlatInput && extProfileInfo ? `${extProfileInfo.className}Flat` : inputTypeName;

    generateExtensionGetterOverloads(w, ext, targetPath, getMethodName, inputType, extProfileInfo, () => {
        const configItems = (ext.subExtensions ?? []).map((sub) => {
            const valueField = sub.valueFieldType ? tsValueFieldName(sub.valueFieldType) : "value";
            const isArray = sub.max === "*";
            return `{ name: "${sub.url}", valueField: "${valueField}", isArray: ${isArray} }`;
        });
        w.line(`const config = [${configItems.join(", ")}]`);
        w.line(`return extractComplexExtension<${inputType}>(ext, config)`);
    });
};

// Single-value extension — one known value type (e.g., birthSex with valueCode)

const generateSingleValueExtensionSetter = (w: TypeScript, tsIndex: TypeSchemaIndex, info: ExtensionMethodInfo) => {
    const { ext, setMethodName, targetPath, extProfileInfo } = info;
    const firstValueType = ext.valueFieldTypes?.[0];
    if (!firstValueType) return;
    const valueType = tsTypeFromIdentifier(firstValueType);
    const valueField = tsValueFieldName(firstValueType);

    if (extProfileInfo) {
        const paramType = `${extProfileInfo.className} | Extension | ${valueType}`;
        const extHasValueParam = collectProfileFactoryInfo(tsIndex, extProfileInfo.flatProfile).params.some(
            (p) => p.name === valueField,
        );
        const elseExpr = extHasValueParam
            ? `${extProfileInfo.className}.createResource({ ${valueField}: value as ${valueType} })`
            : `{ url: "${ext.url}", ${valueField}: value as ${valueType} } as Extension`;
        w.curlyBlock(["public", setMethodName, `(value: ${paramType}): this`], () => {
            w.ifElseChain(
                [
                    {
                        cond: `value instanceof ${extProfileInfo.className}`,
                        body: () => generateExtensionPush(w, targetPath, "value.toResource()"),
                    },
                    {
                        cond: "isExtension(value)",
                        body: () => generateRawExtensionBody(w, ext, targetPath, "value"),
                    },
                ],
                () => generateExtensionPush(w, targetPath, elseExpr),
            );
            w.line("return this");
        });
    } else {
        w.curlyBlock(["public", setMethodName, `(value: ${valueType}): this`], () => {
            const extLiteral = `{ url: "${ext.url}", ${valueField}: value } as Extension`;
            generateExtensionPush(w, targetPath, extLiteral);
            w.line("return this");
        });
    }
};

const generateSingleValueExtensionGetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, getMethodName, targetPath, extProfileInfo } = info;
    const firstValueType = ext.valueFieldTypes?.[0];
    if (!firstValueType) return;
    const valueType = tsTypeFromIdentifier(firstValueType);
    const valueField = tsValueFieldName(firstValueType);

    generateExtensionGetterOverloads(w, ext, targetPath, getMethodName, valueType, extProfileInfo, () => {
        w.line(`return getExtensionValue<${valueType}>(ext, "${valueField}")`);
    });
};

// Generic extension — no known value type

const generateGenericExtensionSetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, setMethodName, targetPath } = info;

    w.curlyBlock(["public", setMethodName, `(value: Omit<Extension, "url"> | Extension): this`], () => {
        w.ifElseChain(
            [
                {
                    cond: "isExtension(value)",
                    body: () => generateRawExtensionBody(w, ext, targetPath, "value"),
                },
            ],
            () => generateExtensionPush(w, targetPath, `{ url: "${ext.url}", ...value } as Extension`),
        );
        w.line("return this");
    });
};

const generateGenericExtensionGetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, getMethodName, targetPath } = info;

    w.curlyBlock(["public", getMethodName, "(): Extension | undefined"], () => {
        if (targetPath.length === 0) {
            w.line(`return this.resource.extension?.find(e => e.url === "${ext.url}")`);
        } else {
            w.line(
                `const target = ensurePath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
            );
            w.line(`return (target.extension as Extension[] | undefined)?.find(e => e.url === "${ext.url}")`);
        }
    });
};

export const generateExtensionMethods = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    extensionBaseNames: Record<string, string>,
) => {
    for (const ext of flatProfile.extensions ?? []) {
        if (!ext.url) continue;
        const baseName = tsResolvedExtensionBaseName(extensionBaseNames, ext.url, ext.path, ext.name);
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");
        const extProfileInfo = resolveExtensionProfile(tsIndex, flatProfile.identifier.package, ext.url);
        const info: ExtensionMethodInfo = {
            ext,
            flatProfile,
            setMethodName: `set${baseName}`,
            getMethodName: `get${baseName}`,
            targetPath,
            extProfileInfo,
        };

        if (ext.isComplex && ext.subExtensions) {
            generateComplexExtensionSetter(w, info);
            w.line();
            generateComplexExtensionGetter(w, info);
        } else if (ext.valueFieldTypes?.length === 1 && ext.valueFieldTypes[0]) {
            generateSingleValueExtensionSetter(w, tsIndex, info);
            w.line();
            generateSingleValueExtensionGetter(w, info);
        } else {
            generateGenericExtensionSetter(w, info);
            w.line();
            generateGenericExtensionGetter(w, info);
        }
        w.line();
    }
};

export const collectTypesFromExtensions = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    addType: (typeId: TypeIdentifier) => void,
): boolean => {
    let needsExtensionType = false;

    for (const ext of flatProfile.extensions ?? []) {
        if (ext.isComplex && ext.subExtensions) {
            needsExtensionType = true;
            for (const sub of ext.subExtensions) {
                if (!sub.valueFieldType) continue;
                const resolvedType = tsIndex.resolveByUrl(
                    flatProfile.identifier.package,
                    sub.valueFieldType.url as CanonicalUrl,
                );
                addType(resolvedType?.identifier ?? sub.valueFieldType);
            }
        } else if (ext.valueFieldTypes && ext.valueFieldTypes.length === 1) {
            needsExtensionType = true;
            if (ext.valueFieldTypes[0]) {
                const resolvedType = tsIndex.resolveByUrl(
                    flatProfile.identifier.package,
                    ext.valueFieldTypes[0].url as CanonicalUrl,
                );
                addType(resolvedType?.identifier ?? ext.valueFieldTypes[0]);
            }
        } else {
            needsExtensionType = true;
        }
    }

    return needsExtensionType;
};

/** Collect types used in the FlatInput of extension profiles. */
export const collectTypesFromFlatInput = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    addType: (typeId: TypeIdentifier) => void,
) => {
    if (flatProfile.base.name !== "Extension") return;
    const subSlices = collectSubExtensionSlices(flatProfile);
    for (const sub of subSlices) {
        const tsType = sub.tsType;
        // Primitive types (string, boolean, number) don't need imports
        if (["string", "boolean", "number"].includes(tsType)) continue;
        // Resolve complex FHIR type by name
        const fhirUrl = `http://hl7.org/fhir/StructureDefinition/${tsType}` as CanonicalUrl;
        const schema = tsIndex.resolveByUrl(flatProfile.identifier.package, fhirUrl);
        if (schema) addType(schema.identifier);
    }
};
