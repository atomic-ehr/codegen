import {
    type CanonicalUrl,
    isProfileTypeSchema,
    type ProfileExtension,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { type ProfileImports, profilePyType, resolveFhirType } from "./imports";
import { type ProfileMethodBaseNames, pyProfileClassName, pyValueFieldName } from "./profile-naming";
import type { Python } from "./writer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The extension's generated profile class; `className` is its rendered import marker. */
type ExtensionProfileInfo = { className: string };

type ExtensionMethodInfo = {
    ext: ProfileExtension;
    snapshot: SnapshotProfileTypeSchema;
    baseName: string;
    targetPath: string[];
    /** Marker of the package's `Extension` type, rendered once per module. */
    extensionType: string;
    extProfileInfo: ExtensionProfileInfo | undefined;
};

// ---------------------------------------------------------------------------
// Extension-profile resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an extension to its generated profile class (if any exists in the
 * same package). Checks `ext.profile` first, falls back to URL lookup.
 * Returns undefined when no profile class is available.
 */
const resolveExtensionProfile = (
    tsIndex: TypeSchemaIndex,
    pkgName: string,
    ext: ProfileExtension,
): TypeIdentifier | undefined => {
    if (ext.profile) {
        const schema = tsIndex.resolve(ext.profile);
        if (schema) return schema.identifier;
    }
    if (!ext.url) return undefined;
    const schema = tsIndex.resolveByUrl(pkgName, ext.url as CanonicalUrl);
    if (!schema || !isProfileTypeSchema(schema)) return undefined;
    if (schema.identifier.package !== pkgName) return undefined;
    return schema.identifier;
};

// ---------------------------------------------------------------------------
// Emit helpers
// ---------------------------------------------------------------------------

const generateExtensionLookup = (w: Python, imports: ProfileImports, info: ExtensionMethodInfo): void => {
    const { ext, targetPath } = info;
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

const generateExtensionPush = (
    w: Python,
    imports: ProfileImports,
    info: ExtensionMethodInfo,
    extExpr: string,
): void => {
    const { targetPath } = info;
    if (targetPath.length === 0) {
        w.line(`${imports.helpers.use("push_extension")}(self._resource, ${extExpr})`);
    } else {
        w.line(`target = ${imports.helpers.use("ensure_path")}(self._resource, ${JSON.stringify(targetPath)})`);
        w.line(`${imports.helpers.use("push_extension")}(target, ${extExpr})`);
    }
};

// ---------------------------------------------------------------------------
// Unified getter skeleton
// ---------------------------------------------------------------------------

/**
 * Emit the overload signatures + concrete `def` line for a getter, then its
 * body: the ext lookup, then the mode dispatch — returns the raw Extension
 * when `mode == "raw"`, wraps in a profile class when `mode == "profile"`,
 * otherwise falls through to the caller-supplied flat body.
 */
const generateExtensionGetter = (
    w: Python,
    imports: ProfileImports,
    info: ExtensionMethodInfo,
    flatType: string,
    generateFlatBody: () => void,
    withVFlat = false,
): void => {
    const { extensionType } = info;
    const methodName = `get_${info.baseName}`;
    const profileClass = info.extProfileInfo?.className;
    // `vflat` validates through the extension's profile class before extracting,
    // so it exists only where that class does.
    const hasVFlat = withVFlat && profileClass !== undefined;

    w.line(`@${imports.typing.use("overload")}`);
    w.line(`def ${methodName}(self) -> ${flatType} | None: ...`);
    if (hasVFlat) {
        w.line(`@${imports.typing.use("overload")}`);
        w.line(`def ${methodName}(self, mode: ${imports.typing.use("Literal")}["vflat"]) -> ${flatType} | None: ...`);
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
        ? `${flatType} | ${extensionType} | ${profileClass} | None`
        : `${flatType} | ${extensionType} | None`;
    w.line(`def ${methodName}(self, mode: ${modeType} = None) -> ${returnUnion}:`);
    w.indentBlock(() => {
        generateExtensionLookup(w, imports, info);
        w.line("if ext is None:");
        w.indentBlock(() => w.line("return None"));
        w.line(`ext_obj = ext if not isinstance(ext, dict) else ${extensionType}(**ext)`);
        w.line(`if mode == "raw":`);
        w.indentBlock(() => w.line("return ext_obj"));
        if (profileClass) {
            w.line(`if mode == "profile":`);
            w.indentBlock(() => w.line(`return ${profileClass}.apply(ext_obj)`));
        }
        generateFlatBody();
    });
};

// ---------------------------------------------------------------------------
// Unified setter skeleton
// ---------------------------------------------------------------------------

/**
 * Emit a setter whose `value` is the profile class (when there is one), the
 * Extension or the flat form, dispatched as: `if isinstance(value, ProfileClass)`
 * → push to_resource(); `elif is_extension(value)` → validate url, raise on
 * mismatch, push as-is; `else:` the caller-supplied flat body.
 */
const generateExtensionSetter = (
    w: Python,
    imports: ProfileImports,
    info: ExtensionMethodInfo,
    flatType: string,
    generateFlatBody: () => void,
): void => {
    const { ext, extensionType } = info;
    const profileClass = info.extProfileInfo?.className;
    const parts: string[] = [];
    if (profileClass) parts.push(profileClass);
    parts.push(`${extensionType}`, flatType);
    const paramType = `"${parts.join(" | ")}"`;
    w.line(`def set_${info.baseName}(self, value: ${paramType}) -> "${pyProfileClassName(info.snapshot)}":`);
    w.indentBlock(() => {
        let startedChain = false;
        if (profileClass) {
            w.line(`if isinstance(value, ${profileClass}):`);
            w.indentBlock(() => generateExtensionPush(w, imports, info, "value.to_resource()"));
            startedChain = true;
        }
        const keyword = startedChain ? "elif" : "if";
        w.line(`${keyword} ${imports.helpers.use("is_extension")}(value):`);
        w.indentBlock(() => {
            w.line(`${imports.helpers.use("validate_extension_url")}(value, ${JSON.stringify(ext.url)})`);
            generateExtensionPush(w, imports, info, "value");
        });
        w.line("else:");
        w.indentBlock(generateFlatBody);
        w.line("return self");
    });
};

// ---------------------------------------------------------------------------
// Complex extension (has sub-extensions)
// ---------------------------------------------------------------------------

const generateComplexExtensionGetter = (w: Python, imports: ProfileImports, info: ExtensionMethodInfo): void => {
    const { ext } = info;
    const profileClass = info.extProfileInfo?.className;
    generateExtensionGetter(
        w,
        imports,
        info,
        `dict[str, ${imports.typing.use("Any")}]`,
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

const generateComplexExtensionSetter = (w: Python, imports: ProfileImports, info: ExtensionMethodInfo): void => {
    const { ext, extensionType } = info;
    generateExtensionSetter(w, imports, info, `dict[str, ${imports.typing.use("Any")}]`, () => {
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
        generateExtensionPush(w, imports, info, extObj);
    });
};

// ---------------------------------------------------------------------------
// Single-value extension
// ---------------------------------------------------------------------------

const generateSingleValueExtensionGetter = (
    w: Python,
    imports: ProfileImports,
    info: ExtensionMethodInfo,
    valueField: string,
    valueType: string,
): void => {
    generateExtensionGetter(w, imports, info, valueType, () => {
        w.line(
            `return ${imports.typing.use("cast")}('${valueType} | None', ${imports.helpers.use("get_extension_value")}(ext, ${JSON.stringify(valueField)}))`,
        );
    });
};

const generateSingleValueExtensionSetter = (
    w: Python,
    imports: ProfileImports,
    info: ExtensionMethodInfo,
    valueField: string,
    valueType: string,
): void => {
    const { ext, extensionType } = info;
    // Type the input as the value's own type (symmetric with the getter) instead of `Any`.
    generateExtensionSetter(w, imports, info, valueType, () => {
        // The profile-class arm is handled by isinstance above and the Extension arm by
        // is_extension; assert the remainder so the value type-checks and misuse fails loudly.
        w.line(`assert not isinstance(value, ${extensionType})`);
        // Wrap in an Extension model so the value field serializes with its FHIR alias.
        generateExtensionPush(
            w,
            imports,
            info,
            `${extensionType}(url=${JSON.stringify(ext.url)}, ${valueField}=value)`,
        );
    });
};

// ---------------------------------------------------------------------------
// Generic extension (unknown value type)
// ---------------------------------------------------------------------------

const generateGenericExtensionGetter = (w: Python, imports: ProfileImports, info: ExtensionMethodInfo): void => {
    generateExtensionGetter(w, imports, info, `dict[str, ${imports.typing.use("Any")}]`, () => {
        w.line(
            `return ${imports.typing.use("cast")}("dict[str, ${imports.typing.use("Any")}] | None", ext if isinstance(ext, dict) else ext.model_dump(by_alias=True, exclude_none=True))`,
        );
    });
};

const generateGenericExtensionSetter = (w: Python, imports: ProfileImports, info: ExtensionMethodInfo): void => {
    const { ext } = info;
    generateExtensionSetter(w, imports, info, `dict[str, ${imports.typing.use("Any")}]`, () => {
        // In the else branch `value` is the flat dict form (models/profile classes were
        // handled above); assert it so `**value` type-checks and misuse fails loudly.
        w.line(`assert ${imports.helpers.use("is_record")}(value)`);
        generateExtensionPush(w, imports, info, `{"url": ${JSON.stringify(ext.url)}, **value}`);
    });
};

// ---------------------------------------------------------------------------
// Extension getters / setters
// ---------------------------------------------------------------------------

export const generateExtensionMethods = (
    w: Python,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    methodNames: ProfileMethodBaseNames,
): void => {
    const extensions = snapshot.extensions ?? [];
    if (!extensions.some((ext) => ext.url)) return;
    const extensionType = imports.types.use(resolveFhirType(tsIndex, snapshot, "Extension"));
    for (const ext of extensions) {
        if (!ext.url) continue;
        const profileId = resolveExtensionProfile(tsIndex, snapshot.identifier.package, ext);
        const info: ExtensionMethodInfo = {
            ext,
            snapshot,
            baseName: methodNames.extension(ext),
            targetPath: ext.path.split(".").filter((segment) => segment !== "extension"),
            extensionType,
            extProfileInfo: profileId ? { className: imports.types.use(profileId) } : undefined,
        };

        // Each extension gets its getter, then its setter.
        if (ext.isComplex && ext.subExtensions) {
            generateComplexExtensionGetter(w, imports, info);
            w.line();
            generateComplexExtensionSetter(w, imports, info);
        } else if (ext.valueFieldTypes?.length === 1 && ext.valueFieldTypes[0]) {
            const firstValueType = ext.valueFieldTypes[0];
            const valueField = pyValueFieldName(firstValueType, w.nameFormatFunction);
            const valueType = profilePyType(imports, firstValueType);
            generateSingleValueExtensionGetter(w, imports, info, valueField, valueType);
            w.line();
            generateSingleValueExtensionSetter(w, imports, info, valueField, valueType);
        } else {
            generateGenericExtensionGetter(w, imports, info);
            w.line();
            generateGenericExtensionSetter(w, imports, info);
        }
        w.line();
    }
};
