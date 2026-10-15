import { snakeCase } from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
    isProfileTypeSchema,
    type ProfileExtension,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { type ProfileImports, profilePyType, resolveFhirType } from "./imports";
import { pyValueFieldName } from "./profile-naming";
import type { Python } from "./writer";

// ---------------------------------------------------------------------------
// Extension-profile resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an extension to its generated profile class (if any exists in the
 * same package). Checks `ext.profile` first, falls back to URL lookup.
 * Returns undefined when no profile class is available.
 */
export const resolveExtensionProfile = (
    tsIndex: TypeSchemaIndex,
    pkgName: string,
    ext: ProfileExtension,
): TypeIdentifier | undefined => {
    if (ext.profile) {
        const schema = tsIndex.resolve(ext.profile);
        if (schema) {
            return schema.identifier;
        }
    }
    if (!ext.url) return undefined;
    const schema = tsIndex.resolveByUrl(pkgName, ext.url as CanonicalUrl);
    if (!schema || !isProfileTypeSchema(schema)) return undefined;
    if (schema.identifier.package !== pkgName) return undefined;
    return schema.identifier;
};

// ---------------------------------------------------------------------------
// Extension getters / setters
// ---------------------------------------------------------------------------

export const generateExtensionMethods = (
    w: Python,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    className: string,
    extensionBaseNames: Record<string, string>,
): void => {
    const pkgName = snapshot.identifier.package;
    const extensionType = imports.types.use(resolveFhirType(tsIndex, snapshot, "Extension"));
    for (const ext of snapshot.extensions ?? []) {
        if (!ext.url) continue;
        const baseName = extensionBaseNames[`${ext.url}:${ext.path}`] ?? snakeCase(ext.nameCandidates.recommended);
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");
        const profileId = resolveExtensionProfile(tsIndex, pkgName, ext);
        const profileClass = profileId ? imports.types.use(profileId) : undefined;

        if (ext.isComplex && ext.subExtensions) {
            generateComplexExtensionGetter(w, imports, extensionType, ext, baseName, targetPath, profileClass);
            generateComplexExtensionSetter(
                w,
                imports,
                extensionType,
                ext,
                className,
                baseName,
                targetPath,
                profileClass,
            );
        } else if (ext.valueFieldTypes?.length === 1 && ext.valueFieldTypes[0]) {
            const valueType = ext.valueFieldTypes[0];
            const valueField = pyValueFieldName(valueType, w.nameFormatFunction);
            const pyType = profilePyType(imports, valueType);
            generateSingleValueExtensionGetter(
                w,
                imports,
                extensionType,
                ext,
                baseName,
                targetPath,
                valueField,
                pyType,
                profileClass,
            );
            generateSingleValueExtensionSetter(
                w,
                imports,
                extensionType,
                ext,
                className,
                baseName,
                targetPath,
                valueField,
                pyType,
                profileClass,
            );
        } else {
            generateGenericExtensionGetter(w, imports, extensionType, ext, baseName, targetPath, profileClass);
            generateGenericExtensionSetter(
                w,
                imports,
                extensionType,
                ext,
                className,
                baseName,
                targetPath,
                profileClass,
            );
        }
    }
};

// ---------------------------------------------------------------------------
// Emit helpers
// ---------------------------------------------------------------------------

const emitExtLookup = (w: Python, imports: ProfileImports, ext: ProfileExtension, targetPath: string[]): void => {
    if (targetPath.length === 0) {
        w.line(`exts = getattr(self._resource, "extension", None) or []`);
    } else {
        w.line(
            `target = ${imports.helpers.use("ensure_path")}(self._resource.model_dump(by_alias=True, exclude_none=True) if hasattr(self._resource, "model_dump") else self._resource, ${JSON.stringify(targetPath)})`,
        );
        w.line(`exts = target.get("extension", []) if isinstance(target, dict) else []`);
    }
    w.line(
        `ext = next((e for e in exts if ${imports.helpers.use("is_extension")}(e, ${JSON.stringify(ext.url)})), None)`,
    );
};

const emitExtPush = (w: Python, imports: ProfileImports, targetPath: string[], extExpr: string): void => {
    if (targetPath.length === 0) {
        w.line(`${imports.helpers.use("push_extension")}(self._resource, ${extExpr})`);
    } else {
        w.line(`target = ${imports.helpers.use("ensure_path")}(self._resource, ${JSON.stringify(targetPath)})`);
        w.line(`${imports.helpers.use("push_extension")}(target, ${extExpr})`);
    }
};

/**
 * Emit the overload signatures + concrete `def` line for a getter. The caller
 * is responsible for the indented body (lookup + mode dispatch + flat path).
 */
const emitGetterOverloads = (
    w: Python,
    imports: ProfileImports,
    extensionType: string,
    methodName: string,
    flatPyType: string,
    profileClass: string | undefined,
    withVFlat = false,
): void => {
    // `vflat` validates through the extension's profile class before extracting,
    // so it exists only where that class does.
    const hasVFlat = withVFlat && profileClass !== undefined;

    w.line(`@${imports.typing.use("overload")}`);
    w.line(`def ${methodName}(self) -> ${flatPyType} | None: ...`);
    if (hasVFlat) {
        w.line(`@${imports.typing.use("overload")}`);
        w.line(`def ${methodName}(self, mode: ${imports.typing.use("Literal")}["vflat"]) -> ${flatPyType} | None: ...`);
    }
    w.line(`@${imports.typing.use("overload")}`);
    w.line(`def ${methodName}(self, mode: ${imports.typing.use("Literal")}["raw"]) -> ${extensionType} | None: ...`);
    if (profileClass) {
        w.line(`@${imports.typing.use("overload")}`);
        w.line(
            `def ${methodName}(self, mode: ${imports.typing.use("Literal")}["profile"]) -> ${profileClass} | None: ...`,
        );
    }

    const modes = ['"raw"'];
    if (hasVFlat) modes.unshift('"vflat"');
    if (profileClass) modes.push('"profile"');
    const modeType = `${imports.typing.use("Literal")}[${modes.join(", ")}] | None`;
    const returnUnion = profileClass
        ? `${flatPyType} | ${extensionType} | ${profileClass} | None`
        : `${flatPyType} | ${extensionType} | None`;
    w.line(`def ${methodName}(self, mode: ${modeType} = None) -> ${returnUnion}:`);
};

/**
 * Emit the mode-dispatch block that runs after the ext lookup: returns the
 * raw Extension when `mode == "raw"`, wraps in a profile class when
 * `mode == "profile"`, otherwise falls through to the caller-supplied flat
 * body.
 */
const emitGetterModeDispatch = (w: Python, extensionType: string, profileClass: string | undefined): void => {
    w.line(`ext_obj = ext if not isinstance(ext, dict) else ${extensionType}(**ext)`);
    w.line(`if mode == "raw":`);
    w.indentBlock(() => w.line("return ext_obj"));
    if (profileClass) {
        w.line(`if mode == "profile":`);
        w.indentBlock(() => w.line(`return ${profileClass}.apply(ext_obj)`));
    }
};

/**
 * Emit the shared setter dispatch preamble: `if isinstance(value, ProfileClass)`
 * → push toResource(); `elif is_extension(value)` → validate url, raise on
 * mismatch, push as-is. Caller emits the `else:` flat body afterwards.
 */
const emitSetterDispatchPreamble = (
    w: Python,
    imports: ProfileImports,
    ext: ProfileExtension,
    targetPath: string[],
    profileClass: string | undefined,
): void => {
    let startedChain = false;
    if (profileClass) {
        w.line(`if isinstance(value, ${profileClass}):`);
        w.indentBlock(() => emitExtPush(w, imports, targetPath, "value.to_resource()"));
        startedChain = true;
    }
    const keyword = startedChain ? "elif" : "if";
    w.line(`${keyword} ${imports.helpers.use("is_extension")}(value):`);
    w.indentBlock(() => {
        w.line(`${imports.helpers.use("validate_extension_url")}(value, ${JSON.stringify(ext.url)})`);
        emitExtPush(w, imports, targetPath, "value");
    });
};

/** Build the Python type string for the `value` parameter of a setter. */
const buildSetterParamType = (extensionType: string, flatType: string, profileClass: string | undefined): string => {
    const parts: string[] = [];
    if (profileClass) parts.push(profileClass);
    parts.push(`${extensionType}`, flatType);
    return `"${parts.join(" | ")}"`;
};

// ---------------------------------------------------------------------------
// Unified getter skeleton
// ---------------------------------------------------------------------------

const generateExtensionGetter = (
    w: Python,
    imports: ProfileImports,
    extensionType: string,
    ext: ProfileExtension,
    baseName: string,
    flatPyType: string,
    targetPath: string[],
    profileClass: string | undefined,
    emitFlatReturn: () => void,
    withVFlat = false,
): void => {
    emitGetterOverloads(w, imports, extensionType, `get_${baseName}`, flatPyType, profileClass, withVFlat);
    w.indentBlock(() => {
        emitExtLookup(w, imports, ext, targetPath);
        w.line("if ext is None:");
        w.indentBlock(() => w.line("return None"));
        emitGetterModeDispatch(w, extensionType, profileClass);
        emitFlatReturn();
    });
    w.line();
};

// ---------------------------------------------------------------------------
// Complex extension (has sub-extensions)
// ---------------------------------------------------------------------------

const generateComplexExtensionGetter = (
    w: Python,
    imports: ProfileImports,
    extensionType: string,
    ext: ProfileExtension,
    baseName: string,
    targetPath: string[],
    profileClass: string | undefined,
): void => {
    generateExtensionGetter(
        w,
        imports,
        extensionType,
        ext,
        baseName,
        `dict[str, ${imports.typing.use("Any")}]`,
        targetPath,
        profileClass,
        () => {
            const configItems = (ext.subExtensions ?? []).map((sub) => {
                const valueField = sub.valueFieldType
                    ? pyValueFieldName(sub.valueFieldType, w.nameFormatFunction)
                    : "value";
                const isArray = sub.max === "*";
                return `{"name": ${JSON.stringify(sub.url)}, "valueField": ${JSON.stringify(valueField)}, "isArray": ${isArray ? "True" : "False"}}`;
            });
            w.line(`config = [${configItems.join(", ")}]`);
            // `vflat` — a validated read. `extract_complex_extension` sets a key only
            // for a sub-extension it finds, so a non-conformant extension otherwise
            // comes back as a dict quietly missing its required members, and the
            // caller meets a KeyError with no FHIR context.
            if (profileClass) {
                w.line(`if mode == "vflat":`);
                w.indentBlock(() => {
                    w.line(`result = ${profileClass}.apply(ext_obj).validate()`);
                    w.line(`if result["errors"]:`);
                    w.indentBlock(() => w.line(`raise ValueError("; ".join(result["errors"]))`));
                });
            }
            w.line(`return ${imports.helpers.use("extract_complex_extension")}(ext, config)`);
        },
        profileClass !== undefined,
    );
};

// ---------------------------------------------------------------------------
// Unified setter skeleton
// ---------------------------------------------------------------------------

const generateExtensionSetter = (
    w: Python,
    imports: ProfileImports,
    extensionType: string,
    ext: ProfileExtension,
    className: string,
    baseName: string,
    flatParamType: string,
    targetPath: string[],
    profileClass: string | undefined,
    emitElseBody: () => void,
): void => {
    const paramType = buildSetterParamType(extensionType, flatParamType, profileClass);
    w.line(`def set_${baseName}(self, value: ${paramType}) -> "${className}":`);
    w.indentBlock(() => {
        emitSetterDispatchPreamble(w, imports, ext, targetPath, profileClass);
        w.line("else:");
        w.indentBlock(emitElseBody);
        w.line("return self");
    });
    w.line();
};

const generateComplexExtensionSetter = (
    w: Python,
    imports: ProfileImports,
    extensionType: string,
    ext: ProfileExtension,
    className: string,
    baseName: string,
    targetPath: string[],
    profileClass: string | undefined,
): void => {
    generateExtensionSetter(
        w,
        imports,
        extensionType,
        ext,
        className,
        baseName,
        `dict[str, ${imports.typing.use("Any")}]`,
        targetPath,
        profileClass,
        () => {
            // In the else branch `value` is the flat dict form (models/profile classes were
            // handled above); assert it so field access below type-checks and misuse fails loudly.
            w.line(`assert ${imports.helpers.use("is_record")}(value)`);
            w.line("sub_extensions = []");
            for (const sub of ext.subExtensions ?? []) {
                const valueField = sub.valueFieldType
                    ? pyValueFieldName(sub.valueFieldType, w.nameFormatFunction)
                    : "value";
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
            // Wrap in an Extension model so Pydantic coerces the sub-extension dicts and
            // serializes their value fields with FHIR aliases (valueCoding, not value_coding).
            const extObj = `${extensionType}(url=${JSON.stringify(ext.url)}, extension=sub_extensions)`;
            emitExtPush(w, imports, targetPath, extObj);
        },
    );
};

// ---------------------------------------------------------------------------
// Single-value extension
// ---------------------------------------------------------------------------

const generateSingleValueExtensionGetter = (
    w: Python,
    imports: ProfileImports,
    extensionType: string,
    ext: ProfileExtension,
    baseName: string,
    targetPath: string[],
    valueField: string,
    pyType: string,
    profileClass: string | undefined,
): void => {
    generateExtensionGetter(w, imports, extensionType, ext, baseName, pyType, targetPath, profileClass, () => {
        w.line(
            `return ${imports.typing.use("cast")}('${pyType} | None', ${imports.helpers.use("get_extension_value")}(ext, ${JSON.stringify(valueField)}))`,
        );
    });
};

const generateSingleValueExtensionSetter = (
    w: Python,
    imports: ProfileImports,
    extensionType: string,
    ext: ProfileExtension,
    className: string,
    baseName: string,
    targetPath: string[],
    valueField: string,
    pyType: string,
    profileClass: string | undefined,
): void => {
    // Type the input as the value's own type (symmetric with the getter) instead of `Any`.
    generateExtensionSetter(
        w,
        imports,
        extensionType,
        ext,
        className,
        baseName,
        pyType,
        targetPath,
        profileClass,
        () => {
            // The profile-class arm is handled by isinstance above and the Extension arm by
            // is_extension; assert the remainder so the value type-checks and misuse fails loudly.
            w.line(`assert not isinstance(value, ${extensionType})`);
            // Wrap in an Extension model so the value field serializes with its FHIR alias.
            emitExtPush(
                w,
                imports,
                targetPath,
                `${extensionType}(url=${JSON.stringify(ext.url)}, ${valueField}=value)`,
            );
        },
    );
};

// ---------------------------------------------------------------------------
// Generic extension (unknown value type)
// ---------------------------------------------------------------------------

const generateGenericExtensionGetter = (
    w: Python,
    imports: ProfileImports,
    extensionType: string,
    ext: ProfileExtension,
    baseName: string,
    targetPath: string[],
    profileClass: string | undefined,
): void => {
    generateExtensionGetter(
        w,
        imports,
        extensionType,
        ext,
        baseName,
        `dict[str, ${imports.typing.use("Any")}]`,
        targetPath,
        profileClass,
        () => {
            w.line(
                `return ${imports.typing.use("cast")}("dict[str, ${imports.typing.use("Any")}] | None", ext if isinstance(ext, dict) else ext.model_dump(by_alias=True, exclude_none=True))`,
            );
        },
    );
};

const generateGenericExtensionSetter = (
    w: Python,
    imports: ProfileImports,
    extensionType: string,
    ext: ProfileExtension,
    className: string,
    baseName: string,
    targetPath: string[],
    profileClass: string | undefined,
): void => {
    generateExtensionSetter(
        w,
        imports,
        extensionType,
        ext,
        className,
        baseName,
        `dict[str, ${imports.typing.use("Any")}]`,
        targetPath,
        profileClass,
        () => {
            // In the else branch `value` is the flat dict form (models/profile classes were
            // handled above); assert it so `**value` type-checks and misuse fails loudly.
            w.line(`assert ${imports.helpers.use("is_record")}(value)`);
            emitExtPush(w, imports, targetPath, `{"url": ${JSON.stringify(ext.url)}, **value}`);
        },
    );
};
