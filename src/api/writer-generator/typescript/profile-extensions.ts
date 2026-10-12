import {
    type CanonicalUrl,
    isChoiceDeclarationField,
    isProfileTypeSchema,
    type ProfileExtension,
    type SnapshotProfileTypeSchema,
    snapshotIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    tsCamelCase,
    tsExtensionExtractedTypeName,
    tsExtensionFlatTypeName,
    tsExtensionVFlatTypeName,
    tsProfileClassName,
    tsProfileModuleName,
    tsResourceName,
    tsValueFieldName,
} from "./name";
import { collectProfileFactoryInfo } from "./profile";
import { profileHelper, type TsImports, tsTypeFromIdentifier } from "./utils";
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
    snapshot: SnapshotProfileTypeSchema;
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
const VALUE_PREFIX_RE = /^value/;

export const valueFieldToTsType = (valueField: string): string => {
    const fhirName = valueField.replace(VALUE_PREFIX_RE, "");
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
export const collectSubExtensionSlices = (extProfile: SnapshotProfileTypeSchema): SubExtensionSliceInfo[] => {
    const extensionField = extProfile.fields.extension;
    const extensionSlicing = extProfile.slicing?.extension;
    if (!extensionField || isChoiceDeclarationField(extensionField) || !extensionSlicing?.slices) return [];
    const result: SubExtensionSliceInfo[] = [];
    for (const [sliceName, slice] of Object.entries(extensionSlicing.slices)) {
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
    const snapshot = tsIndex.resolve(snapshotIdentifier(schema.identifier));
    if (!snapshot) return undefined;
    const className = tsProfileClassName(snapshot);
    const modulePath = `./${tsProfileModuleName(tsIndex, snapshot)}`;
    return { className, modulePath, snapshot };
};

/** The `Extension` type as written in a profile module: imported from the profile's package. */
export const extensionTypeRef = (
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
): string => {
    const url = "http://hl7.org/fhir/StructureDefinition/Extension" as CanonicalUrl;
    const extension = tsIndex.resolveByUrl(snapshot.identifier.package, url);
    return extension ? imports.use(extension.identifier) : "Extension";
};

/** A sub-extension's value type as written in a profile module: a complex FHIR type is imported. */
export const subExtensionTsType = (
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
    sub: SubExtensionSliceInfo,
): string => {
    if (["string", "boolean", "number"].includes(sub.tsType)) return sub.tsType;
    const url = `http://hl7.org/fhir/StructureDefinition/${sub.tsType}` as CanonicalUrl;
    const schema = tsIndex.resolveByUrl(snapshot.identifier.package, url);
    return schema ? imports.use(schema.identifier) : sub.tsType;
};

/** The extension's profile class, imported from its module. */
const extProfileClass = (imports: TsImports, info: ExtensionProfileInfo): string =>
    imports.use({ module: info.modulePath, name: info.className });

/** The extension profile's `…Flat` input type, imported from its module. */
const extProfileFlat = (imports: TsImports, info: ExtensionProfileInfo): string =>
    imports.use({ module: info.modulePath, name: `${info.className}Flat`, typeOnly: true });

type ExtensionMethodInfo = {
    ext: ProfileExtension;
    snapshot: SnapshotProfileTypeSchema;
    setMethodName: string;
    getMethodName: string;
    targetPath: string[];
    extProfileInfo: ExtensionProfileInfo | undefined;
    imports: TsImports;
    /** The `Extension` type as written in this module. */
    extensionType: string;
};

/** Generate the body of a raw Extension branch: validate url, then push/upsert. */
const generateRawExtensionBody = (w: TypeScript, info: ExtensionMethodInfo, paramName = "input", useUpsert = false) => {
    const { ext } = info;
    w.line(
        `if (${paramName}.url !== ${JSON.stringify(ext.url)}) throw new Error(\`Expected extension url '${ext.url}', got '\${${paramName}.url}'\`)`,
    );
    generateExtensionPush(w, info, paramName, useUpsert);
};

/** Generate the code that pushes (or upserts) an extension onto the target (root or nested path). */
export const generateExtensionPush = (w: TypeScript, info: ExtensionMethodInfo, extExpr: string, useUpsert = false) => {
    const { imports, targetPath, extensionType } = info;
    const fn = profileHelper(imports, useUpsert ? "upsertExtension" : "pushExtension");
    if (targetPath.length === 0) {
        w.line(`${fn}(this.resource, ${extExpr})`);
    } else {
        w.line(
            `const target = ${profileHelper(imports, "ensurePath")}(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
        );
        w.line(`if (!Array.isArray(target.extension)) target.extension = [] as ${extensionType}[]`);
        w.line(`${fn}(target as unknown as { extension?: ${extensionType}[] }, ${extExpr})`);
    }
};

/** Generate the extension lookup code for getters. */
const generateExtLookup = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, imports, targetPath, extensionType } = info;
    if (targetPath.length === 0) {
        w.line(`const ext = this.resource.extension?.find(e => e.url === "${ext.url}")`);
    } else {
        w.line(
            `const target = ${profileHelper(imports, "ensurePath")}(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
        );
        w.line(`const ext = (target.extension as ${extensionType}[] | undefined)?.find(e => e.url === "${ext.url}")`);
    }
};

type GetterMode = "flat" | "vflat" | "profile" | "raw";

const effectiveGetterDefault = (w: TypeScript, hasProfile: boolean): GetterMode => {
    const configured = w.opts.extensionGetterDefault ?? "flat";
    if (configured === "profile" && !hasProfile) return "flat";
    return configured;
};

const returnTypeForMode = (
    mode: GetterMode,
    inputType: string,
    extensionType: string,
    profileClassName?: string,
    vFlatType?: string,
): string => {
    if (mode === "profile" && profileClassName) return profileClassName;
    if (mode === "raw") return extensionType;
    if (mode === "vflat" && vFlatType) return vFlatType;
    return inputType;
};

const generateExtensionGetterOverloads = (
    w: TypeScript,
    info: ExtensionMethodInfo,
    inputType: string,
    generateInputBody: () => void,
    vFlatType?: string,
) => {
    const { getMethodName: methodName, extProfileInfo, imports, extensionType } = info;
    const profileClass = extProfileInfo && extProfileClass(imports, extProfileInfo);
    const defaultMode = effectiveGetterDefault(w, !!profileClass);
    const modes: GetterMode[] = profileClass ? ["flat", "profile", "raw"] : ["flat", "raw"];
    if (vFlatType) modes.splice(1, 0, "vflat");
    const returnType = (mode: GetterMode) => returnTypeForMode(mode, inputType, extensionType, profileClass, vFlatType);

    for (const mode of modes) {
        w.lineSM(`public ${methodName}(mode: '${mode}'): ${returnType(mode)} | undefined`);
    }
    w.lineSM(`public ${methodName}(): ${returnType(defaultMode)} | undefined`);

    const allReturns = [...new Set(modes.map(returnType))];
    const modesUnion = modes.map((m) => `'${m}'`).join(" | ");
    w.curlyBlock(
        ["public", methodName, `(mode: ${modesUnion} = '${defaultMode}'): ${allReturns.join(" | ")} | undefined`],
        () => {
            generateExtLookup(w, info);
            w.line("if (!ext) return undefined");
            w.line("if (mode === 'raw') return ext");
            if (profileClass) {
                w.line(`if (mode === 'profile') return ${profileClass}.apply(ext)`);
            }
            generateInputBody();
        },
    );
};

// Complex extension — has sub-extensions (e.g., Race with ombCategory, detailed, text)

const generateComplexExtensionSetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, snapshot, setMethodName, extProfileInfo, imports, extensionType } = info;
    const tsProfileName = tsResourceName(snapshot.identifier);
    const inputTypeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
    const extProfileHasFlatInput = extProfileInfo
        ? collectSubExtensionSlices(extProfileInfo.snapshot).length > 0
        : false;
    const useUpsert = ext.max === "1";

    if (extProfileInfo && extProfileHasFlatInput) {
        const profileClass = extProfileClass(imports, extProfileInfo);
        const paramType = `${extProfileFlat(imports, extProfileInfo)} | ${profileClass} | ${extensionType}`;
        w.curlyBlock(["public", setMethodName, `(input: ${paramType}): this`], () => {
            w.ifElseChain(
                [
                    {
                        cond: `input instanceof ${profileClass}`,
                        body: () => generateExtensionPush(w, info, "input.toResource()", useUpsert),
                    },
                    {
                        cond: `${profileHelper(imports, "isExtension")}<${extensionType}>(input)`,
                        body: () => generateRawExtensionBody(w, info, "input", useUpsert),
                    },
                ],
                () => generateExtensionPush(w, info, `${profileClass}.createResource(input)`, useUpsert),
            );
            w.line("return this");
        });
    } else {
        w.curlyBlock(["public", setMethodName, `(input: ${inputTypeName}): this`], () => {
            w.line(`const subExtensions: ${extensionType}[] = []`);
            for (const sub of ext.subExtensions ?? []) {
                const valueField = sub.valueFieldType ? tsValueFieldName(sub.valueFieldType) : "value";
                if (sub.max === "*") {
                    w.curlyBlock(["if", `(input.${sub.name})`], () => {
                        w.curlyBlock(["for", `(const item of input.${sub.name})`], () => {
                            w.line(
                                `subExtensions.push({ url: "${sub.url}", ${valueField}: item } as ${extensionType})`,
                            );
                        });
                    });
                } else {
                    w.curlyBlock(["if", `(input.${sub.name} !== undefined)`], () => {
                        w.line(
                            `subExtensions.push({ url: "${sub.url}", ${valueField}: input.${sub.name} } as ${extensionType})`,
                        );
                    });
                }
            }
            generateExtensionPush(w, info, `{ url: "${ext.url}", extension: subExtensions }`, useUpsert);
            w.line("return this");
        });
    }
};

/** The members `extractComplexExtension` can populate: the sub-extension slices, never the
 *  ordinary fields the factory input also carries. Returns undefined when the extension has
 *  no resolvable profile class — the inline input type is then the whole shape. */
const extractableMembers = (extProfileInfo: ExtensionProfileInfo | undefined): string | undefined => {
    const slices = extProfileInfo ? collectSubExtensionSlices(extProfileInfo.snapshot) : [];
    if (slices.length === 0) return undefined;
    return slices.map((sub) => JSON.stringify(sub.name)).join(" | ");
};

/** `flat` is what any resource can yield — every member optional, since extraction fills only
 *  what it finds. `vFlat` is the same members once the extension has been validated, so the
 *  ones the profile requires are guaranteed. */
export const extensionExtractedTypes = (
    imports: TsImports,
    tsProfileName: string,
    ext: ProfileExtension,
    extProfileInfo: ExtensionProfileInfo | undefined,
): { flat: string; vFlat: string | undefined } => {
    const inputTypeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
    const members = extractableMembers(extProfileInfo);
    if (!members || !extProfileInfo) return { flat: `Partial<${inputTypeName}>`, vFlat: undefined };
    const picked = `Pick<${extProfileFlat(imports, extProfileInfo)}, ${members}>`;
    return { flat: `Partial<${picked}>`, vFlat: picked };
};

const generateComplexExtensionGetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, snapshot, extProfileInfo, imports } = info;
    const tsProfileName = tsResourceName(snapshot.identifier);
    // Same collision-resolved base name the method names use, so a profile carrying one
    // extension at two paths refers to two distinct declarations rather than one repeated.
    const baseName = ext.nameCandidates.recommended;
    const extractedType = tsExtensionExtractedTypeName(tsProfileName, baseName);
    // The vflat arm needs the extension profile's validate(), so it is emitted
    // only when the extension resolves to a profile class.
    const hasVFlat = extensionExtractedTypes(imports, tsProfileName, ext, extProfileInfo).vFlat !== undefined;
    const vFlatType = hasVFlat ? tsExtensionVFlatTypeName(tsProfileName, baseName) : undefined;

    generateExtensionGetterOverloads(
        w,
        info,
        extractedType,
        () => {
            const configItems = (ext.subExtensions ?? []).map((sub) => {
                const valueField = sub.valueFieldType ? tsValueFieldName(sub.valueFieldType) : "value";
                const isArray = sub.max === "*";
                return `{ name: "${sub.url}", valueField: "${valueField}", isArray: ${isArray} }`;
            });
            w.line(`const config = [${configItems.join(", ")}]`);
            const extract = profileHelper(imports, "extractComplexExtension");
            if (vFlatType && extProfileInfo) {
                w.curlyBlock(["if", "(mode === 'vflat')"], () => {
                    w.line(`const { errors } = ${extProfileClass(imports, extProfileInfo)}.apply(ext).validate()`);
                    w.line('if (errors.length > 0) throw new Error(errors.join("; "))');
                    w.line(`return ${extract}<${vFlatType}>(ext, config)`);
                });
            }
            w.line(`return ${extract}<${extractedType}>(ext, config)`);
        },
        vFlatType,
    );
};

// Single-value extension — one known value type (e.g., birthSex with valueCode)

const generateSingleValueExtensionSetter = (w: TypeScript, tsIndex: TypeSchemaIndex, info: ExtensionMethodInfo) => {
    const { ext, setMethodName, extProfileInfo, imports, extensionType } = info;
    const firstValueType = ext.valueFieldTypes?.[0];
    if (!firstValueType) return;
    const valueType = tsTypeFromIdentifier(imports, firstValueType);
    const valueField = tsValueFieldName(firstValueType);
    const useUpsert = ext.max === "1";

    if (extProfileInfo) {
        const profileClass = extProfileClass(imports, extProfileInfo);
        const extFactoryInfo = collectProfileFactoryInfo(tsIndex, imports, extProfileInfo.snapshot);
        const extValueParam = extFactoryInfo.params.find((p) => p.name === valueField);
        const resolvedValueType = extValueParam?.tsType ?? valueType;
        const paramType = `${profileClass} | ${extensionType} | ${resolvedValueType}`;
        const elseExpr = extValueParam
            ? `${profileClass}.createResource({ ${valueField}: value as ${resolvedValueType} })`
            : `{ url: "${ext.url}", ${valueField}: value as ${valueType} } as ${extensionType}`;
        w.curlyBlock(["public", setMethodName, `(value: ${paramType}): this`], () => {
            w.ifElseChain(
                [
                    {
                        cond: `value instanceof ${profileClass}`,
                        body: () => generateExtensionPush(w, info, "value.toResource()", useUpsert),
                    },
                    {
                        cond: `${profileHelper(imports, "isExtension")}(value)`,
                        body: () => generateRawExtensionBody(w, info, "value", useUpsert),
                    },
                ],
                () => generateExtensionPush(w, info, elseExpr, useUpsert),
            );
            w.line("return this");
        });
    } else {
        w.curlyBlock(["public", setMethodName, `(value: ${valueType}): this`], () => {
            const extLiteral = `{ url: "${ext.url}", ${valueField}: value } as ${extensionType}`;
            generateExtensionPush(w, info, extLiteral, useUpsert);
            w.line("return this");
        });
    }
};

const generateSingleValueExtensionGetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, imports } = info;
    const firstValueType = ext.valueFieldTypes?.[0];
    if (!firstValueType) return;
    const valueType = tsTypeFromIdentifier(imports, firstValueType);
    const valueField = tsValueFieldName(firstValueType);

    generateExtensionGetterOverloads(w, info, valueType, () => {
        w.line(`return ${profileHelper(imports, "getExtensionValue")}<${valueType}>(ext, "${valueField}")`);
    });
};

// Generic extension — no known value type

const generateGenericExtensionSetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, setMethodName, imports, extensionType } = info;
    const useUpsert = ext.max === "1";

    w.curlyBlock(["public", setMethodName, `(value: Omit<${extensionType}, "url"> | ${extensionType}): this`], () => {
        w.ifElseChain(
            [
                {
                    cond: `${profileHelper(imports, "isExtension")}(value)`,
                    body: () => generateRawExtensionBody(w, info, "value", useUpsert),
                },
            ],
            () => generateExtensionPush(w, info, `{ url: "${ext.url}", ...value } as ${extensionType}`, useUpsert),
        );
        w.line("return this");
    });
};

const generateGenericExtensionGetter = (w: TypeScript, info: ExtensionMethodInfo) => {
    const { ext, getMethodName, targetPath, imports, extensionType } = info;

    w.curlyBlock(["public", getMethodName, `(): ${extensionType} | undefined`], () => {
        if (targetPath.length === 0) {
            w.line(`return this.resource.extension?.find(e => e.url === "${ext.url}")`);
        } else {
            w.line(
                `const target = ${profileHelper(imports, "ensurePath")}(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
            );
            w.line(`return (target.extension as ${extensionType}[] | undefined)?.find(e => e.url === "${ext.url}")`);
        }
    });
};

export const generateExtensionMethods = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
) => {
    for (const ext of snapshot.extensions ?? []) {
        if (!ext.url) continue;
        const baseName = ext.nameCandidates.recommended;
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");
        const extProfileInfo = resolveExtensionProfile(tsIndex, snapshot.identifier.package, ext.url);
        const info: ExtensionMethodInfo = {
            ext,
            snapshot,
            setMethodName: `set${baseName}`,
            getMethodName: `get${baseName}`,
            targetPath,
            extProfileInfo,
            imports,
            extensionType: extensionTypeRef(tsIndex, imports, snapshot),
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
