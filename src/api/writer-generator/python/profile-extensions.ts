import {
    isPrimitiveIdentifier,
    type ProfileExtension,
    type ProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { deriveResourceName, PRIMITIVE_TYPE_MAP } from "./naming-utils";
import { pyExtensionMethodBaseName, pyValueFieldName } from "./profile-naming";
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
// Extension getters / setters
// ---------------------------------------------------------------------------

export const generateExtensionMethods = (
    w: Python,
    _tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    className: string,
    extensionBaseNames: Record<string, string>,
): void => {
    for (const ext of flatProfile.extensions ?? []) {
        if (!ext.url) continue;
        const baseName = extensionBaseNames[`${ext.url}:${ext.path}`] ?? pyExtensionMethodBaseName(ext.name);
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");

        if (ext.isComplex && ext.subExtensions) {
            generateComplexExtensionGetter(w, ext, baseName, targetPath);
            generateComplexExtensionSetter(w, ext, className, baseName, targetPath);
        } else if (ext.valueFieldTypes?.length === 1 && ext.valueFieldTypes[0]) {
            const valueType = ext.valueFieldTypes[0];
            const valueField = pyValueFieldName(valueType);
            const pyType = pyTypeFromIdentifier(valueType);
            generateSingleValueExtensionGetter(w, ext, baseName, targetPath, valueField, pyType);
            generateSingleValueExtensionSetter(w, ext, className, baseName, targetPath, valueField, pyType);
        } else {
            generateGenericExtensionGetter(w, ext, baseName, targetPath);
            generateGenericExtensionSetter(w, ext, className, baseName, targetPath);
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

// ---------------------------------------------------------------------------
// Complex extension (has sub-extensions)
// ---------------------------------------------------------------------------

const generateComplexExtensionGetter = (
    w: Python,
    ext: ProfileExtension,
    baseName: string,
    targetPath: string[],
): void => {
    w.line(`def get_${baseName}(self) -> dict | None:`);
    w.indentBlock(() => {
        emitExtLookup(w, ext, targetPath);
        w.line("if ext is None:");
        w.indentBlock(() => w.line("return None"));
        const configItems = (ext.subExtensions ?? []).map((sub) => {
            const valueField = sub.valueFieldType ? pyValueFieldName(sub.valueFieldType) : "value";
            const isArray = sub.max === "*";
            return `{"name": ${JSON.stringify(sub.url)}, "valueField": ${JSON.stringify(valueField)}, "isArray": ${isArray ? "True" : "False"}}`;
        });
        w.line(`config = [${configItems.join(", ")}]`);
        w.line(
            "return extract_complex_extension(ext, config)",
        );
    });
    w.line();
};

const generateComplexExtensionSetter = (
    w: Python,
    ext: ProfileExtension,
    className: string,
    baseName: string,
    targetPath: string[],
): void => {
    w.line(`def set_${baseName}(self, value: dict) -> "${className}":`);
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
): void => {
    w.line(`def get_${baseName}(self) -> ${pyType} | None:`);
    w.indentBlock(() => {
        emitExtLookup(w, ext, targetPath);
        w.line("if ext is None:");
        w.indentBlock(() => w.line("return None"));
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
    _pyType: string,
): void => {
    w.line(`def set_${baseName}(self, value) -> "${className}":`);
    w.indentBlock(() => {
        const extObj = `{"url": ${JSON.stringify(ext.url)}, ${JSON.stringify(valueField)}: value}`;
        emitExtPush(w, ext, targetPath, extObj);
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
): void => {
    w.line(`def get_${baseName}(self) -> dict | None:`);
    w.indentBlock(() => {
        emitExtLookup(w, ext, targetPath);
        w.line("if ext is None:");
        w.indentBlock(() => w.line("return None"));
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
): void => {
    w.line(`def set_${baseName}(self, value: dict) -> "${className}":`);
    w.indentBlock(() => {
        const extObj = `{"url": ${JSON.stringify(ext.url)}, **value}`;
        emitExtPush(w, ext, targetPath, extObj);
        w.line("return self");
    });
    w.line();
};
