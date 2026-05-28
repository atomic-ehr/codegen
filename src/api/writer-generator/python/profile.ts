import { snakeCase } from "@root/api/writer-generator/utils";
import {
    isNestedIdentifier,
    isPrimitiveIdentifier,
    isResourceIdentifier,
    type ProfileExtension,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { canonicalToName, deriveResourceName, PRIMITIVE_TYPE_MAP, pyFhirPackageByName } from "./naming-utils";
import { type ExtensionProfileInfo, generateExtensionMethods, resolveExtensionProfile } from "./profile-extensions";
import {
    buildCallArgs,
    buildParamSignature,
    collectProfileFactoryInfo,
    generateCreateResource,
    generateFieldAccessors,
    type ProfileFactoryInfo,
} from "./profile-factory";
import {
    pyProfileClassName,
    pyProfileModuleName,
    type ResolvedProfileMethods,
    resolveProfileMethodBaseNames,
} from "./profile-naming";
import {
    collectSliceDefs,
    generateSliceGetters,
    generateSliceSetters,
    generateStaticSliceFields,
    type SliceDef,
} from "./profile-slices";
import { collectValidateBody } from "./profile-validation";
import type { Python } from "./writer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileGenContext = {
    w: Python;
    tsIndex: TypeSchemaIndex;
    flatProfile: SnapshotProfileTypeSchema;
    baseTypeName: string;
    className: string;
    isResourceBase: boolean;
    factoryInfo: ProfileFactoryInfo;
    sliceDefs: SliceDef[];
    resolvedNames: ResolvedProfileMethods;
    errorLines: string[];
    warningLines: string[];
};

// ---------------------------------------------------------------------------
// Import utilities
// ---------------------------------------------------------------------------

const modulePathForTypeId = (rootPackageName: string, typeId: TypeIdentifier): string => {
    const pkg = pyFhirPackageByName(rootPackageName, typeId.package);
    if (isResourceIdentifier(typeId)) return `${pkg}.${snakeCase(typeId.name)}`;
    if (isNestedIdentifier(typeId)) {
        const path = canonicalToName(typeId.url, false);
        const parentName = path?.split("#")[0];
        return parentName ? `${pkg}.${snakeCase(parentName)}` : `${pkg}.base`;
    }
    return `${pkg}.base`;
};

const addExactTypeImport = (
    typeImports: Map<string, Set<string>>,
    rootPackageName: string,
    skipName: string,
    typeId: TypeIdentifier,
): void => {
    if (isPrimitiveIdentifier(typeId) || PRIMITIVE_TYPE_MAP[typeId.name] !== undefined) return;
    const name = deriveResourceName(typeId);
    if (!name || name === skipName) return;
    const modulePath = modulePathForTypeId(rootPackageName, typeId);
    const names = typeImports.get(modulePath) ?? new Set<string>();
    names.add(name);
    typeImports.set(modulePath, names);
};

const addTypeImport = (
    typeImports: Map<string, Set<string>>,
    rootPackageName: string,
    skipName: string,
    resolveRef: TypeSchemaIndex["findLastSpecializationByIdentifier"],
    typeId: TypeIdentifier,
): void => {
    const ids: TypeIdentifier[] = [typeId];
    const resolved = resolveRef(typeId);
    if (resolved !== typeId) ids.push(resolved);
    for (const id of ids) {
        if (isPrimitiveIdentifier(id) || PRIMITIVE_TYPE_MAP[id.name] !== undefined) continue;
        const name = deriveResourceName(id);
        if (name === skipName) continue;
        const modulePath = modulePathForTypeId(rootPackageName, id);
        let names = typeImports.get(modulePath);
        if (!names) {
            names = new Set();
            typeImports.set(modulePath, names);
        }
        names.add(name);
    }
};

// ---------------------------------------------------------------------------
// Import collection
// ---------------------------------------------------------------------------

const collectHelperImports = (
    isResourceBase: boolean,
    factoryInfo: ProfileFactoryInfo,
    sliceDefs: SliceDef[],
    extensions: ProfileExtension[],
    validationHelpers: Set<string>,
): string[] => {
    const imports = ["build_resource"];
    if (isResourceBase) imports.push("ensure_profile");
    if (factoryInfo.sliceAutoFields.length > 0) imports.push("ensure_slice_defaults");
    if (sliceDefs.length > 0) {
        const hasNonTyped = sliceDefs.some((s) => !s.isTypeDiscriminated);
        const hasTypedBounded = sliceDefs.some((s) => s.isTypeDiscriminated && !(s.array && s.max === 0));
        const hasTypedUnbounded = sliceDefs.some((s) => s.isTypeDiscriminated && s.array && s.max === 0);
        if (hasNonTyped) imports.push("apply_slice_match", "matches_value", "strip_match_keys");
        if (hasTypedBounded || hasNonTyped) imports.push("get_array_slice", "set_array_slice");
        if (hasTypedUnbounded) imports.push("get_array_slices", "set_array_slices");
        if (sliceDefs.some((s) => s.constrainedChoice)) imports.push("wrap_slice_choice", "unwrap_slice_choice");
    }
    if (extensions.length > 0) {
        imports.push("_get_key", "is_extension", "get_extension_value", "push_extension");
        if (extensions.some((ext) => ext.isComplex && ext.subExtensions)) imports.push("extract_complex_extension");
        if (extensions.some((ext) => ext.path.split(".").some((s) => s !== "extension"))) imports.push("ensure_path");
    }
    imports.push(...validationHelpers);
    imports.sort();
    return imports;
};

const collectTypeImports = (
    rootPackageName: string,
    baseTypeName: string,
    resolveRef: TypeSchemaIndex["findLastSpecializationByIdentifier"],
    factoryInfo: ProfileFactoryInfo,
    sliceDefs: SliceDef[],
    schemas: TypeSchemaIndex["schemas"],
): Map<string, Set<string>> => {
    const typeImports = new Map<string, Set<string>>();
    for (const p of factoryInfo.params) addTypeImport(typeImports, rootPackageName, baseTypeName, resolveRef, p.typeId);
    for (const f of factoryInfo.sliceAutoFields)
        addTypeImport(typeImports, rootPackageName, baseTypeName, resolveRef, f.typeId);
    for (const a of factoryInfo.accessors)
        addTypeImport(typeImports, rootPackageName, baseTypeName, resolveRef, a.typeId);
    for (const s of sliceDefs) {
        if (!s.isTypeDiscriminated) continue;
        if (s.elementTypeId) addExactTypeImport(typeImports, rootPackageName, baseTypeName, s.elementTypeId);
        if (!s.typeDiscriminatorResource) continue;
        const resourceId = schemas.find(
            (schema) => schema.identifier.kind === "resource" && schema.identifier.name === s.typeDiscriminatorResource,
        )?.identifier;
        if (resourceId) addTypeImport(typeImports, rootPackageName, baseTypeName, resolveRef, resourceId);
    }
    return typeImports;
};

const collectExtProfileImports = (
    tsIndex: TypeSchemaIndex,
    flatProfile: SnapshotProfileTypeSchema,
    extensions: ProfileExtension[],
): Map<string, ExtensionProfileInfo> => {
    const extProfileImports = new Map<string, ExtensionProfileInfo>();
    for (const ext of extensions) {
        if (!ext.url) continue;
        const info = resolveExtensionProfile(tsIndex, flatProfile.identifier.package, ext);
        if (info && !extProfileImports.has(info.className)) extProfileImports.set(info.className, info);
    }
    return extProfileImports;
};

// ---------------------------------------------------------------------------
// Import emission
// ---------------------------------------------------------------------------

const emitModuleImports = (
    w: Python,
    flatProfile: SnapshotProfileTypeSchema,
    isResourceBase: boolean,
    extensions: ProfileExtension[],
    sliceDefs: SliceDef[],
    typeImports: Map<string, Set<string>>,
    extProfileImports: Map<string, ExtensionProfileInfo>,
    helperImports: string[],
): void => {
    w.line("from __future__ import annotations");
    w.line();

    const typingNames: string[] = [];
    if (sliceDefs.length > 0 || extensions.length > 0) typingNames.push("Any");
    if (extensions.length > 0) typingNames.push("Literal", "overload");
    if (typingNames.length > 0) {
        w.pyImportFrom("typing", ...[...typingNames].sort());
        w.line();
    }

    const baseTypeName = flatProfile.base.name;
    const basePkg = pyFhirPackageByName(w.opts.rootPackageName, flatProfile.base.package);
    if (isResourceBase) {
        w.pyImportFrom(`${basePkg}.${snakeCase(baseTypeName)}`, baseTypeName);
    } else {
        w.pyImportFrom(`${basePkg}.base`, baseTypeName);
    }
    if (extensions.length > 0) w.pyImportFrom(`${basePkg}.base`, "Extension");
    for (const [modulePath, names] of [...typeImports.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        w.pyImportFrom(modulePath, ...[...names].sort());
    }
    for (const [extClassName, info] of [...extProfileImports.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        w.pyImportFrom(`.${info.moduleName}`, extClassName);
    }
    w.pyImportFrom(".profile_helpers", ...helperImports);
    w.line();
    w.line();
};

// ---------------------------------------------------------------------------
// Class method generators
// ---------------------------------------------------------------------------

const generateFromResourceMethod = (
    w: Python,
    baseTypeName: string,
    className: string,
    isResourceBase: boolean,
): void => {
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
        w.indentBlock(() => w.line('raise ValueError("; ".join(result["errors"]))'));
        w.line("return profile");
    });
    w.line();
};

const generateApplyMethod = (w: Python, baseTypeName: string, className: string, isResourceBase: boolean): void => {
    w.line("@classmethod");
    w.line(`def apply(cls, resource: ${baseTypeName}) -> "${className}":`);
    w.indentBlock(() => {
        if (isResourceBase) w.line("ensure_profile(resource, cls.canonical_url)");
        w.line("return cls(resource)");
    });
    w.line();
};

const generateCreateMethod = (
    w: Python,
    className: string,
    hasParams: boolean,
    factoryInfo: ProfileFactoryInfo,
): void => {
    w.line("@classmethod");
    if (hasParams) {
        w.line(`def create(cls, ${buildParamSignature(factoryInfo)}) -> "${className}":`);
        w.indentBlock(() => w.line(`return cls.apply(cls.create_resource(${buildCallArgs(factoryInfo)}))`));
    } else {
        w.line(`def create(cls) -> "${className}":`);
        w.indentBlock(() => w.line("return cls.apply(cls.create_resource())"));
    }
    w.line();
};

const generateValidateMethod = (w: Python, className: string, errorLines: string[], warningLines: string[]): void => {
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

// ---------------------------------------------------------------------------
// Class body + module
// ---------------------------------------------------------------------------

const generateClassBody = (ctx: ProfileGenContext): void => {
    const {
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
    } = ctx;
    const hasParams = factoryInfo.params.length > 0 || factoryInfo.sliceAutoFields.length > 0;

    w.line(`def __init__(self, resource: ${baseTypeName}) -> None:`);
    w.indentBlock(() => w.line("self._resource = resource"));
    w.line();

    generateFromResourceMethod(w, baseTypeName, className, isResourceBase);
    generateApplyMethod(w, baseTypeName, className, isResourceBase);
    generateCreateResource(w, baseTypeName, isResourceBase, hasParams, factoryInfo);
    w.line();
    generateCreateMethod(w, className, hasParams, factoryInfo);

    w.line(`def to_resource(self) -> ${baseTypeName}:`);
    w.indentBlock(() => w.line("return self._resource"));
    w.line();

    if (factoryInfo.params.length > 0 || factoryInfo.accessors.length > 0)
        generateFieldAccessors(w, className, factoryInfo, resolvedNames.allBaseNames);

    const extensions = flatProfile.extensions ?? [];
    if (extensions.length > 0) generateExtensionMethods(w, tsIndex, flatProfile, className, resolvedNames.extensions);

    if (sliceDefs.length > 0) {
        generateSliceGetters(w, className, sliceDefs, resolvedNames.slices);
        generateSliceSetters(w, className, sliceDefs, resolvedNames.slices);
    }

    generateValidateMethod(w, className, errorLines, warningLines);
};

const generateProfileModule = (w: Python, tsIndex: TypeSchemaIndex, flatProfile: SnapshotProfileTypeSchema): void => {
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
    const validationHelpers = collectValidateBody(
        flatProfile,
        tsIndex.findLastSpecializationByIdentifier,
        errorLines,
        warningLines,
    );

    const helperImports = collectHelperImports(isResourceBase, factoryInfo, sliceDefs, extensions, validationHelpers);
    const typeImports = collectTypeImports(
        w.opts.rootPackageName,
        baseTypeName,
        tsIndex.findLastSpecializationByIdentifier,
        factoryInfo,
        sliceDefs,
        tsIndex.schemas,
    );
    const extProfileImports = collectExtProfileImports(tsIndex, flatProfile, extensions);

    emitModuleImports(
        w,
        flatProfile,
        isResourceBase,
        extensions,
        sliceDefs,
        typeImports,
        extProfileImports,
        helperImports,
    );

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
        generateClassBody({
            w,
            tsIndex,
            flatProfile,
            baseTypeName,
            className,
            isResourceBase,
            factoryInfo,
            sliceDefs,
            resolvedNames,
            errorLines,
            warningLines,
        });
    });
    w.line();
};

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

const generateProfilesInit = (w: Python, tsIndex: TypeSchemaIndex, profiles: SnapshotProfileTypeSchema[]): void => {
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
export const generateNewProfiles = (
    w: Python,
    tsIndex: TypeSchemaIndex,
    profiles: SnapshotProfileTypeSchema[],
): void => {
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
