import {
    type CanonicalUrl,
    isChoiceDeclarationField,
    isProfileTypeSchema,
    type ProfileExtension,
    type SnapshotProfileTypeSchema,
    snapshotIdentifier,
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
import { collectProfileFactoryInfo } from "./profile-factory";
import { tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

type ExtensionProfileInfo = {
    className: string;
    modulePath: string;
    snapshot: SnapshotProfileTypeSchema;
};

type ExtensionMethodInfo = {
    ext: ProfileExtension;
    snapshot: SnapshotProfileTypeSchema;
    baseName: string;
    targetPath: string[];
    /** Marker of the package's `Extension` type, rendered once per module. */
    extensionType: string;
    extProfileInfo: ExtensionProfileInfo | undefined;
};

export type SubExtensionSliceInfo = {
    name: string;
    url: string;
    valueField: string;
    tsType: string;
    isArray: boolean;
    isRequired: boolean;
};

/**
 * Extract value field name from a slice's `elements` list.
 * E.g. `["url", "value", "valueCoding"]` → `"valueCoding"`
 */
const extractValueField = (elements: string[] | undefined): string | undefined => {
    if (!elements) return undefined;
    return elements.find((e) => e.startsWith("value") && e !== "value");
};

/**
 * Map a FHIR value field name (e.g. "valueCoding") to its TypeScript type.
 */
const VALUE_PREFIX_RE = /^value/;

const valueFieldToTsType = (valueField: string): string => {
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
const extensionExtractedTypes = (
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

/**
 * Resolve an extension (by its URL) → extension profile class info (if the
 * extension has its own generated profile class in the index).
 */
export const resolveExtensionProfile = (
    tsIndex: TypeSchemaIndex,
    pkgName: string,
    ext: ProfileExtension,
): ExtensionProfileInfo | undefined => {
    if (!ext.url) return undefined;
    const schema = tsIndex.resolveByUrl(pkgName, ext.url as CanonicalUrl);
    if (!schema || !isProfileTypeSchema(schema)) return undefined;
    // Only resolve extension profiles from the same package to avoid cross-package imports
    if (schema.identifier.package !== pkgName) return undefined;
    const snapshot = tsIndex.resolve(snapshotIdentifier(schema.identifier));
    if (!snapshot) return undefined;
    const className = tsProfileClassName(snapshot);
    const modulePath = `./${tsProfileModuleName(tsIndex, snapshot)}`;
    return { className, modulePath, snapshot };
};

/** Generate inline extension input types only for complex extensions without a resolved FlatInput profile */
export const generateInlineExtensionInputTypes = (
    w: TypeScript,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
) => {
    const tsProfileName = tsResourceName(snapshot.identifier);
    const complexExtensions = (snapshot.extensions ?? []).filter((ext) => ext.isComplex && ext.subExtensions);
    for (const ext of complexExtensions) {
        if (!ext.url) continue;
        const extProfileInfo = resolveExtensionProfile(tsIndex, snapshot.identifier.package, ext);
        const hasFlatInput = extProfileInfo ? collectSubExtensionSlices(extProfileInfo.snapshot).length > 0 : false;
        if (hasFlatInput) continue;
        const typeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
        w.curlyBlock(["export", "type", typeName, "="], () => {
            for (const sub of ext.subExtensions ?? []) {
                const tsType = sub.valueFieldType ? tsTypeFromIdentifier(imports.types, sub.valueFieldType) : "unknown";
                const isArray = sub.max === "*";
                const isRequired = sub.min !== undefined && sub.min > 0;
                w.lineSM(`${sub.name}${isRequired ? "" : "?"}: ${tsType}${isArray ? "[]" : ""}`);
            }
        });
        w.line();
    }
};

/** Name what the complex extension getters return, so the overloads, the implementation
 *  signature and the extractComplexExtension calls refer to a type instead of repeating it —
 *  and so a consumer has a name for the shape it receives. */
export const generateExtensionExtractedTypes = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    methodNames: ProfileMethodBaseNames,
) => {
    const tsProfileName = tsResourceName(snapshot.identifier);
    const complexExtensions = (snapshot.extensions ?? []).filter((ext) => ext.isComplex && ext.subExtensions);
    for (const ext of complexExtensions) {
        if (!ext.url) continue;
        const extProfileInfo = resolveExtensionProfile(tsIndex, snapshot.identifier.package, ext);
        const { flat, vFlat } = extensionExtractedTypes(tsProfileName, ext, extProfileInfo);
        // Name from the collision-resolved base name, the same source the getters use: two
        // entries for one extension at two paths share `ext.name` and would declare twice.
        const baseName = methodNames.extension(ext);
        w.lineSM(`export type ${tsExtensionExtractedTypeName(tsProfileName, baseName)} = ${flat}`);
        if (vFlat) {
            w.lineSM(`export type ${tsExtensionVFlatTypeName(tsProfileName, baseName)} = ${vFlat}`);
        }
        w.line();
    }
};

/** Generate the extension lookup code for getters. */
const generateExtensionLookup = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const { ext, targetPath, extensionType } = info;
    if (targetPath.length === 0) {
        w.line(`const ext = this.resource.extension?.find(e => e.url === "${ext.url}")`);
    } else {
        w.line(
            `const target = ${imports.helpers.use("ensurePath")}(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
        );
        w.line(`const ext = (target.extension as ${extensionType}[] | undefined)?.find(e => e.url === "${ext.url}")`);
    }
};

/** Generate the code that pushes (or upserts) an extension onto the target (root or nested path). */
const generateExtensionPush = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo, extExpr: string) => {
    const { targetPath, extensionType } = info;
    const useUpsert = info.ext.max === "1";
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

/** Generate the body of a raw Extension branch: validate url, then push/upsert. */
const generateRawExtensionBody = (
    w: TypeScript,
    imports: ProfileImports,
    info: ExtensionMethodInfo,
    paramName: string,
) => {
    const { ext } = info;
    w.line(
        `if (${paramName}.url !== ${JSON.stringify(ext.url)}) throw new Error(\`Expected extension url '${ext.url}', got '\${${paramName}.url}'\`)`,
    );
    generateExtensionPush(w, imports, info, paramName);
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

const generateExtensionGetter = (
    w: TypeScript,
    imports: ProfileImports,
    info: ExtensionMethodInfo,
    flatType: string,
    generateFlatBody: () => void,
    vFlatType?: string,
) => {
    const { extensionType, extProfileInfo } = info;
    const methodName = `get${info.baseName}`;
    const hasProfile = !!extProfileInfo;
    const defaultMode = effectiveGetterDefault(w, hasProfile);
    const modes: GetterMode[] = hasProfile ? ["flat", "profile", "raw"] : ["flat", "raw"];
    if (vFlatType) modes.splice(1, 0, "vflat");

    for (const mode of modes) {
        const rt = returnTypeForMode(extensionType, mode, flatType, extProfileInfo?.className, vFlatType);
        w.lineSM(`public ${methodName}(mode: '${mode}'): ${rt} | undefined`);
    }
    const defaultReturn = returnTypeForMode(extensionType, defaultMode, flatType, extProfileInfo?.className, vFlatType);
    w.lineSM(`public ${methodName}(): ${defaultReturn} | undefined`);

    const allReturns = [
        ...new Set(
            modes.map((m) => returnTypeForMode(extensionType, m, flatType, extProfileInfo?.className, vFlatType)),
        ),
    ];
    const modesUnion = modes.map((m) => `'${m}'`).join(" | ");
    w.curlyBlock(
        ["public", methodName, `(mode: ${modesUnion} = '${defaultMode}'): ${allReturns.join(" | ")} | undefined`],
        () => {
            generateExtensionLookup(w, imports, info);
            w.line("if (!ext) return undefined");
            w.line("if (mode === 'raw') return ext");
            if (hasProfile) {
                w.line(`if (mode === 'profile') return ${extProfileInfo?.className}.apply(ext)`);
            }
            generateFlatBody();
        },
    );
};

// Complex extension — has sub-extensions (e.g., Race with ombCategory, detailed, text)

const generateComplexExtensionGetter = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const { ext, snapshot, baseName, extProfileInfo } = info;
    const tsProfileName = tsResourceName(snapshot.identifier);
    // Same collision-resolved base name the method names use, so a profile carrying one
    // extension at two paths refers to two distinct declarations rather than one repeated.
    const extractedType = tsExtensionExtractedTypeName(tsProfileName, baseName);
    // The vflat arm needs the extension profile's validate(), so it is emitted
    // only when the extension resolves to a profile class.
    const hasVFlat = extensionExtractedTypes(tsProfileName, ext, extProfileInfo).vFlat !== undefined;
    const vFlatType = hasVFlat ? tsExtensionVFlatTypeName(tsProfileName, baseName) : undefined;

    generateExtensionGetter(
        w,
        imports,
        info,
        extractedType,
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

const generateComplexExtensionSetter = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const { ext, snapshot, baseName, extensionType, extProfileInfo } = info;
    const tsProfileName = tsResourceName(snapshot.identifier);
    const inputTypeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
    const extProfileHasFlatInput = extProfileInfo
        ? collectSubExtensionSlices(extProfileInfo.snapshot).length > 0
        : false;

    if (extProfileInfo && extProfileHasFlatInput) {
        const paramType = `${extProfileInfo.className}Flat | ${extProfileInfo.className} | ${extensionType}`;
        w.curlyBlock(["public", `set${baseName}`, `(input: ${paramType}): this`], () => {
            w.ifElseChain(
                [
                    {
                        cond: `input instanceof ${extProfileInfo.className}`,
                        body: () => generateExtensionPush(w, imports, info, "input.toResource()"),
                    },
                    {
                        cond: `${imports.helpers.use("isExtension")}<${extensionType}>(input)`,
                        body: () => generateRawExtensionBody(w, imports, info, "input"),
                    },
                ],
                () => generateExtensionPush(w, imports, info, `${extProfileInfo.className}.createResource(input)`),
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
            generateExtensionPush(w, imports, info, extLiteral);
            w.line("return this");
        });
    }
};

// Single-value extension — one known value type (e.g., birthSex with valueCode)

const generateSingleValueExtensionGetter = (
    w: TypeScript,
    imports: ProfileImports,
    info: ExtensionMethodInfo,
    valueField: string,
    valueType: string,
) => {
    generateExtensionGetter(w, imports, info, valueType, () => {
        w.line(`return ${imports.helpers.use("getExtensionValue")}<${valueType}>(ext, "${valueField}")`);
    });
};

const generateSingleValueExtensionSetter = (
    w: TypeScript,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    info: ExtensionMethodInfo,
    valueField: string,
    valueType: string,
) => {
    const { ext, baseName, extensionType, extProfileInfo } = info;

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
                        body: () => generateExtensionPush(w, imports, info, "value.toResource()"),
                    },
                    {
                        cond: `${imports.helpers.use("isExtension")}(value)`,
                        body: () => generateRawExtensionBody(w, imports, info, "value"),
                    },
                ],
                () => generateExtensionPush(w, imports, info, elseExpr),
            );
            w.line("return this");
        });
    } else {
        w.curlyBlock(["public", `set${baseName}`, `(value: ${valueType}): this`], () => {
            const extLiteral = `{ url: "${ext.url}", ${valueField}: value } as ${extensionType}`;
            generateExtensionPush(w, imports, info, extLiteral);
            w.line("return this");
        });
    }
};

// Generic extension — no known value type

const generateGenericExtensionGetter = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const { ext, baseName, targetPath, extensionType } = info;

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

const generateGenericExtensionSetter = (w: TypeScript, imports: ProfileImports, info: ExtensionMethodInfo) => {
    const { ext, baseName, extensionType } = info;

    w.curlyBlock(
        ["public", `set${baseName}`, `(value: Omit<${extensionType}, "url"> | ${extensionType}): this`],
        () => {
            w.ifElseChain(
                [
                    {
                        cond: `${imports.helpers.use("isExtension")}(value)`,
                        body: () => generateRawExtensionBody(w, imports, info, "value"),
                    },
                ],
                () => generateExtensionPush(w, imports, info, `{ url: "${ext.url}", ...value } as ${extensionType}`),
            );
            w.line("return this");
        },
    );
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
    const extensionType = imports.types.use(resolveFhirType(tsIndex, snapshot, "Extension"));
    for (const ext of extensions) {
        if (!ext.url) continue;
        const info: ExtensionMethodInfo = {
            ext,
            snapshot,
            baseName: methodNames.extension(ext),
            targetPath: ext.path.split(".").filter((segment) => segment !== "extension"),
            extensionType,
            extProfileInfo: resolveExtensionProfile(tsIndex, snapshot.identifier.package, ext),
        };

        // Each extension gets its setter, then its getter.
        if (ext.isComplex && ext.subExtensions) {
            generateComplexExtensionSetter(w, imports, info);
            w.line();
            generateComplexExtensionGetter(w, imports, info);
        } else if (ext.valueFieldTypes?.length === 1 && ext.valueFieldTypes[0]) {
            const firstValueType = ext.valueFieldTypes[0];
            const valueField = tsValueFieldName(firstValueType);
            const valueType = tsTypeFromIdentifier(imports.types, firstValueType);
            generateSingleValueExtensionSetter(w, imports, tsIndex, info, valueField, valueType);
            w.line();
            generateSingleValueExtensionGetter(w, imports, info, valueField, valueType);
        } else {
            generateGenericExtensionSetter(w, imports, info);
            w.line();
            generateGenericExtensionGetter(w, imports, info);
        }
        w.line();
    }
};
