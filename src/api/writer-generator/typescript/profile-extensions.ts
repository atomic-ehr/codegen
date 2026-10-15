import {
    type CanonicalUrl,
    isChoiceDeclarationField,
    isProfileTypeSchema,
    type ProfileExtension,
    type SnapshotProfileTypeSchema,
    snapshotIdentifier,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { type ProfileImports, resolveFhirType } from "./imports";
import {
    type ProfileMethodBaseNames,
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

/** Generate the body of a raw Extension branch: validate url, then push/upsert. */
const generateRawExtensionBody = (
    w: TypeScript,
    imports: ProfileImports,
    extensionId: TypeIdentifier,
    ext: ProfileExtension,
    targetPath: string[],
    paramName = "input",
    useUpsert = false,
) => {
    w.line(
        `if (${paramName}.url !== ${JSON.stringify(ext.url)}) throw new Error(\`Expected extension url '${ext.url}', got '\${${paramName}.url}'\`)`,
    );
    generateExtensionPush(w, imports, extensionId, targetPath, paramName, useUpsert);
};

/** Generate the code that pushes (or upserts) an extension onto the target (root or nested path). */
const generateExtensionPush = (
    w: TypeScript,
    imports: ProfileImports,
    extensionId: TypeIdentifier,
    targetPath: string[],
    extExpr: string,
    useUpsert = false,
) => {
    const extensionType = imports.types.use(extensionId);
    const fn = imports.helpers.use(useUpsert ? "upsertExtension" : "pushExtension");
    if (targetPath.length === 0) {
        w.line(`${fn}(this.resource, ${extExpr})`);
    } else {
        w.line(
            `const target = ${imports.helpers.use("ensurePath")}(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
        );
        w.line(`if (!Array.isArray(target.extension)) target.extension = [] as ${extensionType}[]`);
        w.line(`${fn}(target as unknown as { extension?: ${extensionType}[] }, ${extExpr})`);
    }
};

/** Generate the extension lookup code for getters. */
const generateExtLookup = (
    w: TypeScript,
    imports: ProfileImports,
    extensionId: TypeIdentifier,
    ext: ProfileExtension,
    targetPath: string[],
) => {
    const extensionType = imports.types.use(extensionId);
    if (targetPath.length === 0) {
        w.line(`const ext = this.resource.extension?.find(e => e.url === "${ext.url}")`);
    } else {
        w.line(
            `const target = ${imports.helpers.use("ensurePath")}(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
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
    extensionType: string,
    mode: GetterMode,
    inputType: string,
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
    imports: ProfileImports,
    extensionId: TypeIdentifier,
    ext: ProfileExtension,
    targetPath: string[],
    methodName: string,
    inputType: string,
    extProfileInfo: ExtensionProfileInfo | undefined,
    generateInputBody: () => void,
    vFlatType?: string,
) => {
    const extensionType = imports.types.use(extensionId);
    const hasProfile = !!extProfileInfo;
    const defaultMode = effectiveGetterDefault(w, hasProfile);
    const modes: GetterMode[] = hasProfile ? ["flat", "profile", "raw"] : ["flat", "raw"];
    if (vFlatType) modes.splice(1, 0, "vflat");

    for (const mode of modes) {
        const rt = returnTypeForMode(extensionType, mode, inputType, extProfileInfo?.className, vFlatType);
        w.lineSM(`public ${methodName}(mode: '${mode}'): ${rt} | undefined`);
    }
    const defaultReturn = returnTypeForMode(
        extensionType,
        defaultMode,
        inputType,
        extProfileInfo?.className,
        vFlatType,
    );
    w.lineSM(`public ${methodName}(): ${defaultReturn} | undefined`);

    const allReturns = [
        ...new Set(
            modes.map((m) => returnTypeForMode(extensionType, m, inputType, extProfileInfo?.className, vFlatType)),
        ),
    ];
    const modesUnion = modes.map((m) => `'${m}'`).join(" | ");
    w.curlyBlock(
        ["public", methodName, `(mode: ${modesUnion} = '${defaultMode}'): ${allReturns.join(" | ")} | undefined`],
        () => {
            generateExtLookup(w, imports, extensionId, ext, targetPath);
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
    snapshot: SnapshotProfileTypeSchema;
    baseName: string;
    targetPath: string[];
    extProfileInfo: ExtensionProfileInfo | undefined;
    extensionType: TypeIdentifier;
};

// Complex extension — has sub-extensions (e.g., Race with ombCategory, detailed, text)

const generateComplexExtensionSetter = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const extensionId = info.extensionType;
    const extensionType = imports.types.use(extensionId);
    const { ext, snapshot, baseName, targetPath, extProfileInfo } = info;
    const tsProfileName = tsResourceName(snapshot.identifier);
    const inputTypeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
    const extProfileHasFlatInput = extProfileInfo
        ? collectSubExtensionSlices(extProfileInfo.snapshot).length > 0
        : false;
    const useUpsert = ext.max === "1";

    if (extProfileInfo && extProfileHasFlatInput) {
        const paramType = `${extProfileInfo.className}Flat | ${extProfileInfo.className} | ${extensionType}`;
        w.curlyBlock(["public", `set${baseName}`, `(input: ${paramType}): this`], () => {
            w.ifElseChain(
                [
                    {
                        cond: `input instanceof ${extProfileInfo.className}`,
                        body: () =>
                            generateExtensionPush(w, imports, extensionId, targetPath, "input.toResource()", useUpsert),
                    },
                    {
                        cond: `${imports.helpers.use("isExtension")}<${extensionType}>(input)`,
                        body: () =>
                            generateRawExtensionBody(w, imports, extensionId, ext, targetPath, "input", useUpsert),
                    },
                ],
                () =>
                    generateExtensionPush(
                        w,
                        imports,
                        extensionId,
                        targetPath,
                        `${extProfileInfo.className}.createResource(input)`,
                        useUpsert,
                    ),
            );
            w.line("return this");
        });
    } else {
        w.curlyBlock(["public", `set${baseName}`, `(input: ${inputTypeName}): this`], () => {
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
            const extLiteral = `{ url: "${ext.url}", extension: subExtensions }`;
            const fn = imports.helpers.use(useUpsert ? "upsertExtension" : "pushExtension");
            if (targetPath.length === 0) {
                w.line(`${fn}(this.resource, ${extLiteral})`);
            } else {
                w.line(
                    `const target = ${imports.helpers.use("ensurePath")}(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                );
                w.line(`if (!Array.isArray(target.extension)) target.extension = [] as ${extensionType}[]`);
                w.line(`${fn}(target as unknown as { extension?: ${extensionType}[] }, ${extLiteral})`);
            }
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
    tsProfileName: string,
    ext: ProfileExtension,
    extProfileInfo: ExtensionProfileInfo | undefined,
): { flat: string; vFlat: string | undefined } => {
    const inputTypeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
    const members = extractableMembers(extProfileInfo);
    if (!members || !extProfileInfo) return { flat: `Partial<${inputTypeName}>`, vFlat: undefined };
    const picked = `Pick<${extProfileInfo.className}Flat, ${members}>`;
    return { flat: `Partial<${picked}>`, vFlat: picked };
};

const generateComplexExtensionGetter = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const extensionId = info.extensionType;
    const { ext, snapshot, baseName, targetPath, extProfileInfo } = info;
    const tsProfileName = tsResourceName(snapshot.identifier);
    // Same collision-resolved base name the method names use, so a profile carrying one
    // extension at two paths refers to two distinct declarations rather than one repeated.
    const extractedType = tsExtensionExtractedTypeName(tsProfileName, baseName);
    // The vflat arm needs the extension profile's validate(), so it is emitted
    // only when the extension resolves to a profile class.
    const hasVFlat = extensionExtractedTypes(tsProfileName, ext, extProfileInfo).vFlat !== undefined;
    const vFlatType = hasVFlat ? tsExtensionVFlatTypeName(tsProfileName, baseName) : undefined;

    generateExtensionGetterOverloads(
        w,
        imports,
        extensionId,
        ext,
        targetPath,
        `get${baseName}`,
        extractedType,
        extProfileInfo,
        () => {
            const configItems = (ext.subExtensions ?? []).map((sub) => {
                const valueField = sub.valueFieldType ? tsValueFieldName(sub.valueFieldType) : "value";
                const isArray = sub.max === "*";
                return `{ name: "${sub.url}", valueField: "${valueField}", isArray: ${isArray} }`;
            });
            w.line(`const config = [${configItems.join(", ")}]`);
            if (vFlatType && extProfileInfo) {
                w.curlyBlock(["if", "(mode === 'vflat')"], () => {
                    w.line(`const { errors } = ${extProfileInfo.className}.apply(ext).validate()`);
                    w.line('if (errors.length > 0) throw new Error(errors.join("; "))');
                    w.line(`return ${imports.helpers.use("extractComplexExtension")}<${vFlatType}>(ext, config)`);
                });
            }
            w.line(`return ${imports.helpers.use("extractComplexExtension")}<${extractedType}>(ext, config)`);
        },
        vFlatType,
    );
};

// Single-value extension — one known value type (e.g., birthSex with valueCode)

const generateSingleValueExtensionSetter = (
    w: TypeScript,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    info: ExtensionMethodInfo,
) => {
    const extensionId = info.extensionType;
    const extensionType = imports.types.use(extensionId);
    const { ext, baseName, targetPath, extProfileInfo } = info;
    const firstValueType = ext.valueFieldTypes?.[0];
    if (!firstValueType) return;
    const valueType = tsTypeFromIdentifier(imports.types, firstValueType);
    const valueField = tsValueFieldName(firstValueType);
    const useUpsert = ext.max === "1";

    if (extProfileInfo) {
        const extFactoryInfo = collectProfileFactoryInfo(imports, tsIndex, extProfileInfo.snapshot);
        const extValueParam = extFactoryInfo.params.find((p) => p.name === valueField);
        const resolvedValueType = extValueParam?.tsType ?? valueType;
        const paramType = `${extProfileInfo.className} | ${extensionType} | ${resolvedValueType}`;
        const elseExpr = extValueParam
            ? `${extProfileInfo.className}.createResource({ ${valueField}: value as ${resolvedValueType} })`
            : `{ url: "${ext.url}", ${valueField}: value as ${valueType} } as ${extensionType}`;
        w.curlyBlock(["public", `set${baseName}`, `(value: ${paramType}): this`], () => {
            w.ifElseChain(
                [
                    {
                        cond: `value instanceof ${extProfileInfo.className}`,
                        body: () =>
                            generateExtensionPush(w, imports, extensionId, targetPath, "value.toResource()", useUpsert),
                    },
                    {
                        cond: `${imports.helpers.use("isExtension")}(value)`,
                        body: () =>
                            generateRawExtensionBody(w, imports, extensionId, ext, targetPath, "value", useUpsert),
                    },
                ],
                () => generateExtensionPush(w, imports, extensionId, targetPath, elseExpr, useUpsert),
            );
            w.line("return this");
        });
    } else {
        w.curlyBlock(["public", `set${baseName}`, `(value: ${valueType}): this`], () => {
            const extLiteral = `{ url: "${ext.url}", ${valueField}: value } as ${extensionType}`;
            generateExtensionPush(w, imports, extensionId, targetPath, extLiteral, useUpsert);
            w.line("return this");
        });
    }
};

const generateSingleValueExtensionGetter = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const extensionId = info.extensionType;
    const { ext, baseName, targetPath, extProfileInfo } = info;
    const firstValueType = ext.valueFieldTypes?.[0];
    if (!firstValueType) return;
    const valueType = tsTypeFromIdentifier(imports.types, firstValueType);
    const valueField = tsValueFieldName(firstValueType);

    generateExtensionGetterOverloads(
        w,
        imports,
        extensionId,
        ext,
        targetPath,
        `get${baseName}`,
        valueType,
        extProfileInfo,
        () => {
            w.line(`return ${imports.helpers.use("getExtensionValue")}<${valueType}>(ext, "${valueField}")`);
        },
    );
};

// Generic extension — no known value type

const generateGenericExtensionSetter = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const extensionId = info.extensionType;
    const extensionType = imports.types.use(extensionId);
    const { ext, baseName, targetPath } = info;
    const useUpsert = ext.max === "1";

    w.curlyBlock(
        ["public", `set${baseName}`, `(value: Omit<${extensionType}, "url"> | ${extensionType}): this`],
        () => {
            w.ifElseChain(
                [
                    {
                        cond: `${imports.helpers.use("isExtension")}(value)`,
                        body: () =>
                            generateRawExtensionBody(w, imports, extensionId, ext, targetPath, "value", useUpsert),
                    },
                ],
                () =>
                    generateExtensionPush(
                        w,
                        imports,
                        extensionId,
                        targetPath,
                        `{ url: "${ext.url}", ...value } as ${extensionType}`,
                        useUpsert,
                    ),
            );
            w.line("return this");
        },
    );
};

const generateGenericExtensionGetter = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const extensionId = info.extensionType;
    const extensionType = imports.types.use(extensionId);
    const { ext, baseName, targetPath } = info;

    w.curlyBlock(["public", `get${baseName}`, `(): ${extensionType} | undefined`], () => {
        if (targetPath.length === 0) {
            w.line(`return this.resource.extension?.find(e => e.url === "${ext.url}")`);
        } else {
            w.line(
                `const target = ${imports.helpers.use("ensurePath")}(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
            );
            w.line(`return (target.extension as ${extensionType}[] | undefined)?.find(e => e.url === "${ext.url}")`);
        }
    });
};

export const generateExtensionMethods = (
    w: TypeScript,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    methodNames: ProfileMethodBaseNames,
) => {
    const extensions = snapshot.extensions ?? [];
    if (!extensions.some((ext) => ext.url)) return;
    const extensionType = resolveFhirType(tsIndex, snapshot, "Extension");
    for (const ext of extensions) {
        if (!ext.url) continue;
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");
        const extProfileInfo = resolveExtensionProfile(tsIndex, snapshot.identifier.package, ext.url);
        const info: ExtensionMethodInfo = {
            ext,
            snapshot,
            extensionType,
            baseName: methodNames.extension(ext),
            targetPath,
            extProfileInfo,
        };

        if (ext.isComplex && ext.subExtensions) {
            generateComplexExtensionSetter(w, imports, info);
            w.line();
            generateComplexExtensionGetter(w, imports, info);
        } else if (ext.valueFieldTypes?.length === 1 && ext.valueFieldTypes[0]) {
            generateSingleValueExtensionSetter(w, imports, tsIndex, info);
            w.line();
            generateSingleValueExtensionGetter(w, imports, info);
        } else {
            generateGenericExtensionSetter(w, imports, info);
            w.line();
            generateGenericExtensionGetter(w, imports, info);
        }
        w.line();
    }
};
