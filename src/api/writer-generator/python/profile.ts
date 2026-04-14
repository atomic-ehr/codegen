import { snakeCase } from "@root/api/writer-generator/utils";
import {
    type ChoiceFieldInstance,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNestedIdentifier,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isResourceIdentifier,
    type ProfileTypeSchema,
    type RegularField,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { canonicalToName, deriveResourceName, PRIMITIVE_TYPE_MAP, pyFhirPackageByName } from "./naming-utils";
import { generateExtensionMethods, pyTypeFromIdentifier } from "./profile-extensions";
import {
    pyFieldName,
    pyProfileClassName,
    pyProfileModuleName,
    pySliceStaticName,
    pySnakeName,
    type ResolvedProfileMethods,
    resolveProfileMethodBaseNames,
} from "./profile-naming";
import {
    collectRequiredSliceNames,
    collectSliceDefs,
    generateSliceGetters,
    generateSliceSetters,
    generateStaticSliceFields,
    type SliceDef,
} from "./profile-slices";
import { collectValidateBody } from "./profile-validation";
import type { Python } from "./writer";

const emitImport = (w: Python, module: string, names: string[], maxLen = 100): void => {
    if (names.length === 0) return;
    const oneLine = `from ${module} import ${names.join(", ")}`;
    if (oneLine.length <= maxLen || names.length === 1) {
        w.line(oneLine);
        return;
    }
    w.line(`from ${module} import (`);
    w.indentBlock(() => {
        for (const name of names) w.line(`${name},`);
    });
    w.line(")");
};

/** Full Python type annotation for a field (appends `list[...]` for arrays). */
const fieldPyType = (
    field: RegularField | ChoiceFieldInstance,
    resolveRef?: TypeSchemaIndex["findLastSpecializationByIdentifier"],
): string => {
    const resolved = resolveRef ? resolveRef(field.type) : field.type;
    const base = pyTypeFromIdentifier(resolved);
    return field.array ? `list[${base}]` : base;
};

type ProfileFactoryInfo = {
    autoFields: { name: string; value: string }[];
    sliceAutoFields: { name: string; pyType: string; typeId: TypeIdentifier; sliceNames: string[] }[];
    params: { name: string; pyType: string; typeId: TypeIdentifier }[];
    accessors: { name: string; pyType: string; typeId: TypeIdentifier }[];
};

/** Try to promote a required single-choice declaration to a direct param. */
const tryPromoteChoice = (
    field: NonNullable<ProfileTypeSchema["fields"]>[string],
    fields: NonNullable<ProfileTypeSchema["fields"]>,
    params: ProfileFactoryInfo["params"],
    promotedChoices: Set<string>,
): void => {
    if (!isChoiceDeclarationField(field) || !field.required || field.choices.length !== 1) return;
    const choiceName = field.choices[0];
    if (!choiceName) return;
    const choiceField = fields[choiceName];
    if (!choiceField || !isChoiceInstanceField(choiceField)) return;
    const pyType = pyTypeFromIdentifier(choiceField.type) + (choiceField.array ? "[]" : "");
    params.push({ name: choiceName, pyType, typeId: choiceField.type });
    promotedChoices.add(choiceName);
};

const collectChoiceAccessors = (
    flatProfile: ProfileTypeSchema,
    promotedChoices: Set<string>,
): ProfileFactoryInfo["accessors"] => {
    const accessors: ProfileFactoryInfo["accessors"] = [];
    for (const [name, field] of Object.entries(flatProfile.fields ?? {})) {
        if (field.excluded) continue;
        if (!isChoiceInstanceField(field)) continue;
        if (promotedChoices.has(name)) continue;
        const pyType = pyTypeFromIdentifier(field.type) + (field.array ? "[]" : "");
        accessors.push({ name, pyType, typeId: field.type });
    }
    return accessors;
};

const collectProfileFactoryInfo = (tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema): ProfileFactoryInfo => {
    const autoFields: ProfileFactoryInfo["autoFields"] = [];
    const sliceAutoFields: ProfileFactoryInfo["sliceAutoFields"] = [];
    const params: ProfileFactoryInfo["params"] = [];
    const autoAccessors: ProfileFactoryInfo["accessors"] = [];
    const fields = flatProfile.fields ?? {};
    const promotedChoices = new Set<string>();
    const resolveRef = tsIndex.findLastSpecializationByIdentifier;

    if (isResourceIdentifier(flatProfile.base)) {
        autoFields.push({ name: "resourceType", value: JSON.stringify(flatProfile.base.name) });
    }

    for (const [name, field] of Object.entries(fields)) {
        if (field.excluded) continue;
        if (isChoiceInstanceField(field)) continue;

        if (isChoiceDeclarationField(field)) {
            tryPromoteChoice(field, fields, params, promotedChoices);
            continue;
        }

        if (field.valueConstraint) {
            const value = JSON.stringify(field.valueConstraint.value);
            autoFields.push({ name, value: field.array ? `[${value}]` : value });
            if (isNotChoiceDeclarationField(field) && field.type) {
                const pyType = fieldPyType(field, resolveRef);
                autoAccessors.push({ name, pyType, typeId: field.type });
            }
            continue;
        }

        if (isNotChoiceDeclarationField(field)) {
            const sliceNames = collectRequiredSliceNames(field);
            if (sliceNames) {
                if (field.type) {
                    const pyType = fieldPyType(field, resolveRef);
                    sliceAutoFields.push({ name, pyType, typeId: field.type, sliceNames });
                    autoAccessors.push({ name, pyType, typeId: field.type });
                }
                continue;
            }
        }

        if (field.required) {
            const pyType = fieldPyType(field, resolveRef);
            params.push({ name, pyType, typeId: field.type });
        }
    }

    collectBaseRequiredParams(tsIndex, flatProfile, resolveRef, params, [
        ...autoFields.map((f) => f.name),
        ...sliceAutoFields.map((f) => f.name),
        ...params.map((f) => f.name),
        ...promotedChoices,
    ]);

    const accessors = [...autoAccessors, ...collectChoiceAccessors(flatProfile, promotedChoices)];
    return { autoFields, sliceAutoFields, params, accessors };
};

/** Include base-type required fields not already covered by profile constraints. */
const collectBaseRequiredParams = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    resolveRef: TypeSchemaIndex["findLastSpecializationByIdentifier"],
    params: ProfileFactoryInfo["params"],
    coveredNames: string[],
): void => {
    const covered = new Set(coveredNames);
    const baseSchema = tsIndex.resolveType(flatProfile.base);
    if (!baseSchema || !("fields" in baseSchema) || !baseSchema.fields) return;
    for (const [name, field] of Object.entries(baseSchema.fields)) {
        if (covered.has(name)) continue;
        if (!field.required) continue;
        if (isChoiceInstanceField(field)) continue;
        if (isChoiceDeclarationField(field)) continue;
        if (isNotChoiceDeclarationField(field) && field.type) {
            const pyType = fieldPyType(field, resolveRef);
            params.push({ name, pyType, typeId: field.type });
        }
    }
};

const generateProfileModule = (w: Python, tsIndex: TypeSchemaIndex, profile: ProfileTypeSchema): void => {
    const flatProfile = tsIndex.flatProfile(profile);
    const className = pyProfileClassName(flatProfile);
    const baseTypeName = flatProfile.base.name;
    const isResourceBase = isResourceIdentifier(flatProfile.base);
    const canonicalUrl = flatProfile.identifier.url ?? "";
    const factoryInfo = collectProfileFactoryInfo(tsIndex, flatProfile);
    const sliceDefs = collectSliceDefs(tsIndex, flatProfile);
    const extensions = flatProfile.extensions ?? [];
    const resolvedNames = resolveProfileMethodBaseNames(extensions, sliceDefs);
    const errorLines: string[] = [];
    const warningLines: string[] = [];
    const helpers = collectValidateBody(
        flatProfile,
        tsIndex.findLastSpecializationByIdentifier,
        errorLines,
        warningLines,
    );
    const helperImports = ["build_resource"];
    if (isResourceBase) helperImports.push("ensure_profile");
    if (factoryInfo.sliceAutoFields.length > 0) helperImports.push("ensure_slice_defaults");
    if (sliceDefs.length > 0) {
        helperImports.push(
            "apply_slice_match",
            "get_array_slice",
            "matches_value",
            "set_array_slice",
            "strip_match_keys",
        );
        if (sliceDefs.some((s) => s.constrainedChoice)) {
            helperImports.push("wrap_slice_choice", "unwrap_slice_choice");
        }
    }
    if (extensions.length > 0) {
        helperImports.push("is_extension", "get_extension_value", "push_extension");
        if (extensions.some((ext) => ext.isComplex && ext.subExtensions)) {
            helperImports.push("extract_complex_extension");
        }
        if (extensions.some((ext) => ext.path.split(".").some((s) => s !== "extension"))) {
            helperImports.push("ensure_path");
        }
    }
    for (const h of [...helpers].sort()) helperImports.push(h);

    // Collect additional type imports needed for factory params and accessors
    const typeImports = new Map<string, Set<string>>(); // module → set of names
    const addTypeImport = (typeId: TypeIdentifier) => {
        if (isPrimitiveIdentifier(typeId) || PRIMITIVE_TYPE_MAP[typeId.name] !== undefined) return;
        const name = deriveResourceName(typeId);
        if (name === baseTypeName) return; // already imported
        const pkg = pyFhirPackageByName(w.opts.rootPackageName, typeId.package);
        let modulePath: string;
        if (isResourceIdentifier(typeId)) {
            modulePath = `${pkg}.${snakeCase(typeId.name)}`;
        } else if (isNestedIdentifier(typeId)) {
            const path = canonicalToName(typeId.url, false);
            const parentName = path?.split("#")[0];
            modulePath = parentName ? `${pkg}.${snakeCase(parentName)}` : `${pkg}.base`;
        } else {
            modulePath = `${pkg}.base`;
        }
        let names = typeImports.get(modulePath);
        if (!names) {
            names = new Set();
            typeImports.set(modulePath, names);
        }
        names.add(name);
    };
    for (const p of factoryInfo.params) addTypeImport(p.typeId);
    for (const f of factoryInfo.sliceAutoFields) addTypeImport(f.typeId);
    for (const a of factoryInfo.accessors) addTypeImport(a.typeId);

    w.line("from __future__ import annotations");
    w.line();

    if (sliceDefs.length > 0) {
        w.line("from typing import Any");
        w.line();
    }

    const basePkg = pyFhirPackageByName(w.opts.rootPackageName, flatProfile.base.package);
    if (isResourceBase) {
        emitImport(w, `${basePkg}.${snakeCase(baseTypeName)}`, [baseTypeName]);
    } else {
        emitImport(w, `${basePkg}.base`, [baseTypeName]);
    }
    for (const [modulePath, names] of [...typeImports.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        emitImport(w, modulePath, [...names].sort());
    }
    emitImport(w, ".profile_helpers", helperImports);
    w.line();
    w.line();

    w.line(`class ${className}:`);
    w.indentBlock(() => {
        if (flatProfile.description) {
            w.line(`"""${flatProfile.description}`);
            w.line();
            w.line(`CanonicalURL: ${canonicalUrl}`);
            w.line(`"""`);
            w.line();
        }
        w.line(`canonical_url: str = ${JSON.stringify(canonicalUrl)}`);
        w.line();
        generateStaticSliceFields(w, sliceDefs);
        generateClassBody(
            w,
            tsIndex,
            flatProfile,
            baseTypeName,
            className,
            isResourceBase,
            errorLines,
            warningLines,
            factoryInfo,
            sliceDefs,
            resolvedNames,
        );
    });
    w.line();
};

const generateClassBody = (
    w: Python,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    baseTypeName: string,
    className: string,
    isResourceBase: boolean,
    errorLines: string[],
    warningLines: string[],
    factoryInfo: ProfileFactoryInfo,
    sliceDefs: SliceDef[],
    resolvedNames: ResolvedProfileMethods,
): void => {
    const hasParams = factoryInfo.params.length > 0 || factoryInfo.sliceAutoFields.length > 0;

    // __init__
    w.line(`def __init__(self, resource: ${baseTypeName}) -> None:`);
    w.indentBlock(() => {
        w.line("self._resource = resource");
    });
    w.line();

    // from_resource — validates
    w.line("@classmethod");
    w.line(`def from_resource(cls, resource: ${baseTypeName}) -> "${className}":`);
    w.indentBlock(() => {
        if (isResourceBase) {
            w.line('meta = getattr(resource, "meta", None)');
            w.line('profiles = getattr(meta, "profile", None) if meta is not None else None');
            w.line("if profiles is None or cls.canonical_url not in profiles:");
            w.indentBlock(() => {
                w.line(`raise ValueError(f"${className}: meta.profile must include {cls.canonical_url}")`);
            });
        }
        w.line("profile = cls(resource)");
        w.line("result = profile.validate()");
        w.line('if result["errors"]:');
        w.indentBlock(() => {
            w.line('raise ValueError("; ".join(result["errors"]))');
        });
        w.line("return profile");
    });
    w.line();

    // apply — sets meta.profile then wraps without validation
    w.line("@classmethod");
    w.line(`def apply(cls, resource: ${baseTypeName}) -> "${className}":`);
    w.indentBlock(() => {
        if (isResourceBase) {
            w.line("ensure_profile(resource, cls.canonical_url)");
        }
        w.line("return cls(resource)");
    });
    w.line();

    // create_resource — with factory params
    generateCreateResource(w, baseTypeName, className, isResourceBase, hasParams, factoryInfo);
    w.line();

    // create — convenience wrapper
    if (hasParams) {
        w.line("@classmethod");
        w.line(`def create(cls, ${buildParamSignature(factoryInfo)}) -> "${className}":`);
        w.indentBlock(() => {
            w.line(`return cls.apply(cls.create_resource(${buildCallArgs(factoryInfo)}))`);
        });
    } else {
        w.line("@classmethod");
        w.line(`def create(cls) -> "${className}":`);
        w.indentBlock(() => {
            w.line("return cls.apply(cls.create_resource())");
        });
    }
    w.line();

    // to_resource
    w.line(`def to_resource(self) -> ${baseTypeName}:`);
    w.indentBlock(() => {
        w.line("return self._resource");
    });
    w.line();

    // Field accessors
    if (factoryInfo.params.length > 0 || factoryInfo.accessors.length > 0) {
        generateFieldAccessors(w, className, factoryInfo, resolvedNames.allBaseNames);
    }

    // Extension accessors
    const extensions = flatProfile.extensions ?? [];
    if (extensions.length > 0) {
        generateExtensionMethods(w, tsIndex, flatProfile, className, resolvedNames.extensions);
    }

    // Slice accessors
    if (sliceDefs.length > 0) {
        generateSliceGetters(w, className, sliceDefs, resolvedNames.slices);
        generateSliceSetters(w, className, sliceDefs, resolvedNames.slices);
    }

    // validate
    w.line("def validate(self) -> dict[str, list[str]]:");
    w.indentBlock(() => {
        w.line(`profile_name = "${className}"`);
        w.line("errors: list[str] = []");
        w.line("warnings: list[str] = []");
        for (const expr of errorLines) w.line(expr);
        for (const expr of warningLines) w.line(expr);
        w.line('return {"errors": errors, "warnings": warnings}');
    });
};

/** Build `*, param1: Type1, param2: Type2` keyword-only signature. */
const buildParamSignature = (factoryInfo: ProfileFactoryInfo): string => {
    const parts: string[] = [];
    for (const f of factoryInfo.sliceAutoFields) {
        parts.push(`${pyFieldName(f.name)}: ${f.pyType} | None = None`);
    }
    for (const p of factoryInfo.params) {
        parts.push(`${pyFieldName(p.name)}: ${p.pyType}`);
    }
    if (parts.length === 0) return "";
    return `*, ${parts.join(", ")}`;
};

/** Build call-site args matching the param signature. */
const buildCallArgs = (factoryInfo: ProfileFactoryInfo): string => {
    const parts: string[] = [];
    for (const f of factoryInfo.sliceAutoFields) {
        const name = pyFieldName(f.name);
        parts.push(`${name}=${name}`);
    }
    for (const p of factoryInfo.params) {
        const name = pyFieldName(p.name);
        parts.push(`${name}=${name}`);
    }
    return parts.join(", ");
};

const generateCreateResource = (
    w: Python,
    baseTypeName: string,
    _className: string,
    isResourceBase: boolean,
    hasParams: boolean,
    factoryInfo: ProfileFactoryInfo,
): void => {
    w.line("@classmethod");
    if (hasParams) {
        w.line(`def create_resource(cls, ${buildParamSignature(factoryInfo)}) -> ${baseTypeName}:`);
    } else {
        w.line(`def create_resource(cls) -> ${baseTypeName}:`);
    }
    w.indentBlock(() => {
        // ensure_slice_defaults for sliceAutoFields
        for (const f of factoryInfo.sliceAutoFields) {
            const fieldName = pyFieldName(f.name);
            const matchRefs = f.sliceNames.map((s) => `cls.${pySliceStaticName(s)}`);
            if (matchRefs.length === 1) {
                w.line(`${fieldName}_with_defaults = ensure_slice_defaults(list(${fieldName} or []), ${matchRefs[0]})`);
            } else {
                w.line(`${fieldName}_with_defaults = ensure_slice_defaults(`);
                w.indentBlock(() => {
                    w.line(`list(${fieldName} or []),`);
                    for (const ref of matchRefs) w.line(`${ref},`);
                });
                w.line(")");
            }
        }
        if (factoryInfo.sliceAutoFields.length > 0) w.line();

        const buildArgs: string[] = [];
        for (const f of factoryInfo.autoFields) {
            buildArgs.push(`${pyFieldName(f.name)}=${f.value}`);
        }
        for (const f of factoryInfo.sliceAutoFields) {
            buildArgs.push(`${pyFieldName(f.name)}=${pyFieldName(f.name)}_with_defaults`);
        }
        for (const p of factoryInfo.params) {
            buildArgs.push(`${pyFieldName(p.name)}=${pyFieldName(p.name)}`);
        }
        if (isResourceBase) {
            buildArgs.push(`meta={"profile": [cls.canonical_url]}`);
        }

        if (buildArgs.length <= 2) {
            w.line(`return build_resource(${baseTypeName}, ${buildArgs.join(", ")})`);
        } else {
            w.line(`return build_resource(`);
            w.indentBlock(() => {
                w.line(`${baseTypeName},`);
                for (const arg of buildArgs) {
                    w.line(`${arg},`);
                }
            });
            w.line(")");
        }
    });
};

const generateFieldAccessors = (
    w: Python,
    className: string,
    factoryInfo: ProfileFactoryInfo,
    extSliceMethodBaseNames: Set<string>,
): void => {
    // Accessors for factory params (required base fields)
    for (const p of factoryInfo.params) {
        const fieldName = pyFieldName(p.name);
        const methodSuffix = pySnakeName(p.name);
        w.line(`def get_${methodSuffix}(self) -> ${p.pyType} | None:`);
        w.indentBlock(() => {
            w.line(`return getattr(self._resource, ${JSON.stringify(fieldName)}, None)`);
        });
        w.line();
        w.line(`def set_${methodSuffix}(self, value: ${p.pyType}) -> "${className}":`);
        w.indentBlock(() => {
            w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, value)`);
            w.line("return self");
        });
        w.line();
    }

    // Accessors for auto-fields and choice instance fields (skip if extension/slice has same name)
    for (const a of factoryInfo.accessors) {
        const methodSuffix = pySnakeName(a.name);
        if (extSliceMethodBaseNames.has(methodSuffix)) continue;
        const fieldName = pyFieldName(a.name);
        w.line(`def get_${methodSuffix}(self) -> ${a.pyType} | None:`);
        w.indentBlock(() => {
            w.line(`return getattr(self._resource, ${JSON.stringify(fieldName)}, None)`);
        });
        w.line();
        w.line(`def set_${methodSuffix}(self, value: ${a.pyType}) -> "${className}":`);
        w.indentBlock(() => {
            w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, value)`);
            w.line("return self");
        });
        w.line();
    }
};

const generateProfilesInit = (w: Python, tsIndex: TypeSchemaIndex, profiles: ProfileTypeSchema[]): void => {
    w.cat("__init__.py", () => {
        w.generateDisclaimer();
        const seen = new Set<string>();
        for (const profile of profiles) {
            const className = pyProfileClassName(profile);
            const moduleName = pyProfileModuleName(tsIndex, profile);
            if (seen.has(className)) continue;
            seen.add(className);
            w.pyImportFrom(`.${moduleName}`, className);
        }
    });
};

/** Entry point called from `python/writer.ts` when `generateProfile` is true. */
export const generateNewProfiles = (w: Python, tsIndex: TypeSchemaIndex, profiles: ProfileTypeSchema[]): void => {
    if (profiles.length === 0) return;
    w.cd("profiles", () => {
        w.cp("profile_helpers.py", "profile_helpers.py");
        for (const profile of profiles) {
            const moduleName = pyProfileModuleName(tsIndex, profile);
            w.cat(`${moduleName}.py`, () => {
                w.generateDisclaimer();
                generateProfileModule(w, tsIndex, profile);
            });
        }
        generateProfilesInit(w, tsIndex, profiles);
    });
};
