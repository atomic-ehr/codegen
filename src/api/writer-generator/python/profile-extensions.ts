import {
    type CanonicalUrl,
    isPrimitiveIdentifier,
    isProfileTypeSchema,
    type ProfileExtension,
    type ProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { deriveResourceName, PRIMITIVE_TYPE_MAP } from "./naming-utils";
import { pyExtensionMethodBaseName, pyProfileClassName, pyProfileModuleName, pyValueFieldName } from "./profile-naming";
import type { Python } from "./writer";

// ---------------------------------------------------------------------------
// Python type mapping (shared with profile.ts via re-export)
// ---------------------------------------------------------------------------

/** Map a TypeIdentifier to its Python type string. */
export const pyTypeFromIdentifier = (id: TypeIdentifier): string => {
    if (isPrimitiveIdentifier(id)) return PRIMITIVE_TYPE_MAP[id.name] ?? "str";
    const prim = PRIMITIVE_TYPE_MAP[id.name];
    if (prim !== undefined) return prim;
    return deriveResourceName(id);
};

// ---------------------------------------------------------------------------
// Extension-profile resolution
// ---------------------------------------------------------------------------

export type ExtensionProfileInfo = {
    className: string;
    moduleName: string;
    flatProfile: ProfileTypeSchema;
};

/**
 * Resolve an extension URL to its generated profile class (if any exists in the
 * same package). Returns undefined when no profile class is available.
 */
export const resolveExtensionProfile = (
    tsIndex: TypeSchemaIndex,
    pkgName: string,
    url: string,
): ExtensionProfileInfo | undefined => {
    const schema = tsIndex.resolveByUrl(pkgName, url as CanonicalUrl);
    if (!schema || !isProfileTypeSchema(schema)) return undefined;
    if (schema.identifier.package !== pkgName) return undefined;
    return {
        className: pyProfileClassName(schema),
        moduleName: pyProfileModuleName(tsIndex, schema),
        flatProfile: tsIndex.flatProfile(schema),
    };
};

// ---------------------------------------------------------------------------
// Extension getters / setters
// ---------------------------------------------------------------------------

export const generateExtensionMethods = (
    w: Python,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    className: string,
    extensionBaseNames: Record<string, string>,
): void => {
    const pkgName = flatProfile.identifier.package;
    for (const ext of flatProfile.extensions ?? []) {
        if (!ext.url) continue;
        const baseName = extensionBaseNames[`${ext.url}:${ext.path}`] ?? pyExtensionMethodBaseName(ext.name);
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");
        const extProfileInfo = resolveExtensionProfile(tsIndex, pkgName, ext.url);

        if (ext.isComplex && ext.subExtensions) {
            generateComplexExtensionGetter(w, ext, baseName, targetPath, extProfileInfo);
            generateComplexExtensionSetter(w, ext, className, baseName, targetPath, extProfileInfo);
        } else if (ext.valueFieldTypes?.length === 1 && ext.valueFieldTypes[0]) {
            const valueType = ext.valueFieldTypes[0];
            const valueField = pyValueFieldName(valueType);
            const pyType = pyTypeFromIdentifier(valueType);
            generateSingleValueExtensionGetter(w, ext, baseName, targetPath, valueField, pyType, extProfileInfo);
            generateSingleValueExtensionSetter(w, ext, className, baseName, targetPath, valueField, extProfileInfo);
        } else {
            generateGenericExtensionGetter(w, ext, baseName, targetPath, extProfileInfo);
            generateGenericExtensionSetter(w, ext, className, baseName, targetPath, extProfileInfo);
        }
    }
};

// ---------------------------------------------------------------------------
// Emit helpers
// ---------------------------------------------------------------------------

const emitExtLookup = (w: Python, ext: ProfileExtension, targetPath: string[]): void => {
    if (targetPath.length === 0) {
        w.line(`exts = getattr(self._resource, "extension", None) or []`);
        w.line(`ext = next((e for e in exts if is_extension(e, ${JSON.stringify(ext.url)})), None)`);
    } else {
        w.line(
            `target = ensure_path(self._resource.model_dump(by_alias=True, exclude_none=True) if hasattr(self._resource, "model_dump") else self._resource, ${JSON.stringify(targetPath)})`,
        );
        w.line(`exts = target.get("extension", []) if isinstance(target, dict) else []`);
        w.line(`ext = next((e for e in exts if is_extension(e, ${JSON.stringify(ext.url)})), None)`);
    }
};

const emitExtPush = (w: Python, _ext: ProfileExtension, targetPath: string[], extExpr: string): void => {
    if (targetPath.length === 0) {
        w.line(`push_extension(self._resource, ${extExpr})`);
    } else {
        w.line(`target = ensure_path(self._resource, ${JSON.stringify(targetPath)})`);
        w.line(`push_extension(target, ${extExpr})`);
    }
};

/**
 * Emit the overload signatures + concrete `def` line for a getter. The caller
 * is responsible for the indented body (lookup + mode dispatch + flat path).
 */
const emitGetterOverloads = (
    w: Python,
    methodName: string,
    flatPyType: string,
    extProfileInfo: ExtensionProfileInfo | undefined,
): void => {
    const profileClass = extProfileInfo?.className;

    w.line("@overload");
    w.line(`def ${methodName}(self) -> ${flatPyType} | None: ...`);
    w.line("@overload");
    w.line(`def ${methodName}(self, mode: Literal["raw"]) -> Extension | None: ...`);
    if (profileClass) {
        w.line("@overload");
        w.line(`def ${methodName}(self, mode: Literal["profile"]) -> ${profileClass} | None: ...`);
    }

    const modeType = profileClass ? `Literal["raw", "profile"] | None` : `Literal["raw"] | None`;
    const returnUnion = profileClass
        ? `${flatPyType} | Extension | ${profileClass} | None`
        : `${flatPyType} | Extension | None`;
    w.line(`def ${methodName}(self, mode: ${modeType} = None) -> ${returnUnion}:`);
};

/**
 * Emit the mode-dispatch block that runs after the ext lookup: returns the
 * raw Extension when `mode == "raw"`, wraps in a profile class when
 * `mode == "profile"`, otherwise falls through to the caller-supplied flat
 * body.
 */
const emitGetterModeDispatch = (w: Python, extProfileInfo: ExtensionProfileInfo | undefined): void => {
    w.line(`if mode == "raw":`);
    w.indentBlock(() => w.line("return ext if not isinstance(ext, dict) else Extension(**ext)"));
    if (extProfileInfo) {
        w.line(`if mode == "profile":`);
        w.indentBlock(() =>
            w.line(`return ${extProfileInfo.className}.apply(ext if not isinstance(ext, dict) else Extension(**ext))`),
        );
    }
};

/**
 * Emit the shared setter dispatch preamble: `if isinstance(value, ProfileClass)`
 * → push toResource(); `elif is_extension(value)` → validate url, raise on
 * mismatch, push as-is. Caller emits the `else:` flat body afterwards.
 */
const emitSetterDispatchPreamble = (
    w: Python,
    ext: ProfileExtension,
    targetPath: string[],
    extProfileInfo: ExtensionProfileInfo | undefined,
): void => {
    let startedChain = false;
    if (extProfileInfo) {
        w.line(`if isinstance(value, ${extProfileInfo.className}):`);
        w.indentBlock(() => emitExtPush(w, ext, targetPath, "value.to_resource()"));
        startedChain = true;
    }
    const keyword = startedChain ? "elif" : "if";
    w.line(`${keyword} is_extension(value):`);
    w.indentBlock(() => {
        w.line(`if _get_key(value, "url") != ${JSON.stringify(ext.url)}:`);
        w.indentBlock(() =>
            w.line(`raise ValueError(f"Expected extension url '${ext.url}', got {_get_key(value, 'url')!r}")`),
        );
        emitExtPush(w, ext, targetPath, "value");
    });
};

/** Build the Python type string for the `value` parameter of a setter. */
const buildSetterParamType = (flatType: string, extProfileInfo: ExtensionProfileInfo | undefined): string => {
    const parts: string[] = [];
    if (extProfileInfo) parts.push(extProfileInfo.className);
    parts.push("Extension", flatType);
    return `"${parts.join(" | ")}"`;
};

// ---------------------------------------------------------------------------
// Complex extension (has sub-extensions)
// ---------------------------------------------------------------------------

const generateComplexExtensionGetter = (
    w: Python,
    ext: ProfileExtension,
    baseName: string,
    targetPath: string[],
    extProfileInfo: ExtensionProfileInfo | undefined,
): void => {
    emitGetterOverloads(w, `get_${baseName}`, "dict", extProfileInfo);
    w.indentBlock(() => {
        emitExtLookup(w, ext, targetPath);
        w.line("if ext is None:");
        w.indentBlock(() => w.line("return None"));
        emitGetterModeDispatch(w, extProfileInfo);
        const configItems = (ext.subExtensions ?? []).map((sub) => {
            const valueField = sub.valueFieldType ? pyValueFieldName(sub.valueFieldType) : "value";
            const isArray = sub.max === "*";
            return `{"name": ${JSON.stringify(sub.url)}, "valueField": ${JSON.stringify(valueField)}, "isArray": ${isArray ? "True" : "False"}}`;
        });
        w.line(`config = [${configItems.join(", ")}]`);
        w.line("return extract_complex_extension(ext, config)");
    });
    w.line();
};

const generateComplexExtensionSetter = (
    w: Python,
    ext: ProfileExtension,
    className: string,
    baseName: string,
    targetPath: string[],
    extProfileInfo: ExtensionProfileInfo | undefined,
): void => {
    const paramType = buildSetterParamType("dict", extProfileInfo);
    w.line(`def set_${baseName}(self, value: ${paramType}) -> "${className}":`);
    w.indentBlock(() => {
        emitSetterDispatchPreamble(w, ext, targetPath, extProfileInfo);
        w.line("else:");
        w.indentBlock(() => {
            w.line("sub_extensions = []");
            for (const sub of ext.subExtensions ?? []) {
                const valueField = sub.valueFieldType ? pyValueFieldName(sub.valueFieldType) : "value";
                if (sub.max === "*") {
                    w.line(`for item in value.get(${JSON.stringify(sub.url)}, []):`);
                    w.indentBlock(() => {
                        w.line(
                            `sub_extensions.append({"url": ${JSON.stringify(sub.url)}, ${JSON.stringify(valueField)}: item})`,
                        );
                    });
                } else {
                    w.line(`if value.get(${JSON.stringify(sub.url)}) is not None:`);
                    w.indentBlock(() => {
                        w.line(
                            `sub_extensions.append({"url": ${JSON.stringify(sub.url)}, ${JSON.stringify(valueField)}: value[${JSON.stringify(sub.url)}]})`,
                        );
                    });
                }
            }
            const extObj = `{"url": ${JSON.stringify(ext.url)}, "extension": sub_extensions}`;
            emitExtPush(w, ext, targetPath, extObj);
        });
        w.line("return self");
    });
    w.line();
};

// ---------------------------------------------------------------------------
// Single-value extension
// ---------------------------------------------------------------------------

const generateSingleValueExtensionGetter = (
    w: Python,
    ext: ProfileExtension,
    baseName: string,
    targetPath: string[],
    valueField: string,
    pyType: string,
    extProfileInfo: ExtensionProfileInfo | undefined,
): void => {
    emitGetterOverloads(w, `get_${baseName}`, pyType, extProfileInfo);
    w.indentBlock(() => {
        emitExtLookup(w, ext, targetPath);
        w.line("if ext is None:");
        w.indentBlock(() => w.line("return None"));
        emitGetterModeDispatch(w, extProfileInfo);
        w.line(`return get_extension_value(ext, ${JSON.stringify(valueField)})`);
    });
    w.line();
};

const generateSingleValueExtensionSetter = (
    w: Python,
    ext: ProfileExtension,
    className: string,
    baseName: string,
    targetPath: string[],
    valueField: string,
    extProfileInfo: ExtensionProfileInfo | undefined,
): void => {
    const paramType = buildSetterParamType("Any", extProfileInfo);
    w.line(`def set_${baseName}(self, value: ${paramType}) -> "${className}":`);
    w.indentBlock(() => {
        emitSetterDispatchPreamble(w, ext, targetPath, extProfileInfo);
        w.line("else:");
        w.indentBlock(() => {
            const extObj = `{"url": ${JSON.stringify(ext.url)}, ${JSON.stringify(valueField)}: value}`;
            emitExtPush(w, ext, targetPath, extObj);
        });
        w.line("return self");
    });
    w.line();
};

// ---------------------------------------------------------------------------
// Generic extension (unknown value type)
// ---------------------------------------------------------------------------

const generateGenericExtensionGetter = (
    w: Python,
    ext: ProfileExtension,
    baseName: string,
    targetPath: string[],
    extProfileInfo: ExtensionProfileInfo | undefined,
): void => {
    emitGetterOverloads(w, `get_${baseName}`, "dict", extProfileInfo);
    w.indentBlock(() => {
        emitExtLookup(w, ext, targetPath);
        w.line("if ext is None:");
        w.indentBlock(() => w.line("return None"));
        emitGetterModeDispatch(w, extProfileInfo);
        w.line("return ext if isinstance(ext, dict) else ext.model_dump(by_alias=True, exclude_none=True)");
    });
    w.line();
};

const generateGenericExtensionSetter = (
    w: Python,
    ext: ProfileExtension,
    className: string,
    baseName: string,
    targetPath: string[],
    extProfileInfo: ExtensionProfileInfo | undefined,
): void => {
    const paramType = buildSetterParamType("dict", extProfileInfo);
    w.line(`def set_${baseName}(self, value: ${paramType}) -> "${className}":`);
    w.indentBlock(() => {
        emitSetterDispatchPreamble(w, ext, targetPath, extProfileInfo);
        w.line("else:");
        w.indentBlock(() => {
            const extObj = `{"url": ${JSON.stringify(ext.url)}, **value}`;
            emitExtPush(w, ext, targetPath, extObj);
        });
        w.line("return self");
    });
    w.line();
};
