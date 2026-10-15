import { isResourceIdentifier, type SnapshotProfileTypeSchema } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { type ProfileImports, profileModuleImports, profilePyType, pyImportFrom, resolveFhirType } from "./imports";
import { generateExtensionMethods } from "./profile-extensions";
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
    imports: ProfileImports;
    tsIndex: TypeSchemaIndex;
    flatProfile: SnapshotProfileTypeSchema;
    baseTypeName: string;
    /** Base type with generic params filled in when slices are type-discriminated (e.g. `Bundle[Patient | Organization, Resource]`). Equals `baseTypeName` when no type params apply. */
    annotatedBaseTypeName: string;
    className: string;
    isResourceBase: boolean;
    factoryInfo: ProfileFactoryInfo;
    sliceDefs: SliceDef[];
    resolvedNames: ResolvedProfileMethods;
    errorLines: string[];
    warningLines: string[];
};

// ---------------------------------------------------------------------------
// Class method generators
// ---------------------------------------------------------------------------

const generateFromResourceMethod = (
    w: Python,
    annotatedBaseTypeName: string,
    className: string,
    isResourceBase: boolean,
): void => {
    w.line("@classmethod");
    w.line(`def from_resource(cls, resource: ${annotatedBaseTypeName}) -> "${className}":`);
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

const generateApplyMethod = (
    w: Python,
    imports: ProfileImports,
    annotatedBaseTypeName: string,
    className: string,
    isResourceBase: boolean,
): void => {
    w.line("@classmethod");
    w.line(`def apply(cls, resource: ${annotatedBaseTypeName}) -> "${className}":`);
    w.indentBlock(() => {
        if (isResourceBase) w.line(`${imports.helpers.use("ensure_profile")}(resource, cls.canonical_url)`);
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
        w.line(`def create(cls, ${buildParamSignature(factoryInfo, w.nameFormatFunction)}) -> "${className}":`);
        w.indentBlock(() =>
            w.line(`return cls.apply(cls.create_resource(${buildCallArgs(factoryInfo, w.nameFormatFunction)}))`),
        );
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
        imports,
        tsIndex,
        flatProfile,
        baseTypeName,
        annotatedBaseTypeName,
        className,
        isResourceBase,
        errorLines,
        warningLines,
        factoryInfo,
        sliceDefs,
        resolvedNames,
    } = ctx;
    const hasParams = factoryInfo.params.length > 0 || factoryInfo.sliceAutoFields.length > 0;

    w.line(`def __init__(self, resource: ${annotatedBaseTypeName}) -> None:`);
    w.indentBlock(() => w.line("self._resource = resource"));
    w.line();

    generateFromResourceMethod(w, annotatedBaseTypeName, className, isResourceBase);
    generateApplyMethod(w, imports, annotatedBaseTypeName, className, isResourceBase);
    generateCreateResource(w, imports, baseTypeName, annotatedBaseTypeName, isResourceBase, hasParams, factoryInfo);
    w.line();
    generateCreateMethod(w, className, hasParams, factoryInfo);

    w.line(`def to_resource(self) -> ${annotatedBaseTypeName}:`);
    w.indentBlock(() => w.line("return self._resource"));
    w.line();

    if (factoryInfo.params.length > 0 || factoryInfo.accessors.length > 0)
        generateFieldAccessors(w, imports, className, factoryInfo, resolvedNames.allBaseNames);

    const extensions = flatProfile.extensions ?? [];
    if (extensions.length > 0)
        generateExtensionMethods(w, imports, tsIndex, flatProfile, className, resolvedNames.extensions);

    if (sliceDefs.length > 0) {
        generateSliceGetters(w, imports, sliceDefs, resolvedNames.slices);
        generateSliceSetters(w, imports, className, sliceDefs, resolvedNames.slices);
    }

    generateValidateMethod(w, className, errorLines, warningLines);
};

export const generateProfileModule = (
    w: Python,
    tsIndex: TypeSchemaIndex,
    flatProfile: SnapshotProfileTypeSchema,
): void => {
    w.generateDisclaimer();
    w.line("from __future__ import annotations");
    w.line();
    const imports = profileModuleImports(w, tsIndex, flatProfile);
    const className = pyProfileClassName(flatProfile);
    const baseTypeName = profilePyType(imports, flatProfile.base);
    const isResourceBase = isResourceIdentifier(flatProfile.base);
    const canonicalUrl = flatProfile.identifier.url ?? "";
    const factoryInfo = collectProfileFactoryInfo(imports, tsIndex, flatProfile);
    const sliceDefs = collectSliceDefs(imports, tsIndex, flatProfile);
    const typedResources = [
        ...new Set(
            sliceDefs
                .filter((s) => s.isTypeDiscriminated)
                .map((s) => s.typeDiscriminatorType)
                .filter((resource): resource is string => resource !== undefined),
        ),
    ];
    const annotatedBaseTypeName =
        typedResources.length > 0
            ? `${baseTypeName}[${typedResources.join(" | ")}, ${imports.types.use(resolveFhirType(tsIndex, flatProfile, "Resource"))}]`
            : baseTypeName;
    const extensions = flatProfile.extensions ?? [];
    const resolvedNames = resolveProfileMethodBaseNames(extensions, sliceDefs, Object.keys(flatProfile.fields));
    const { errorLines, warningLines } = collectValidateBody(imports, flatProfile, tsIndex, w.nameFormatFunction);

    w.line(`class ${className}:`);
    w.indentBlock(() => {
        if (flatProfile.description) {
            w.line(`"""${flatProfile.description}`);
            w.line();
            w.line(`CanonicalURL: ${canonicalUrl}`);
            w.line(`"""`);
            w.line();
        }
        // The snapshot's base is the nearest non-profile schema in the hierarchy
        // (see buildProfileSnapshot), so no further resolution is needed: an
        // extension profile bases on Extension and gets no resource type.
        if (isResourceBase) w.line(`resource_type: str = ${JSON.stringify(flatProfile.base.name)}`);
        w.line(`canonical_url: str = ${JSON.stringify(canonicalUrl)}`);
        w.line();
        generateStaticSliceFields(w, imports, sliceDefs);
        generateClassBody({
            w,
            imports,
            tsIndex,
            flatProfile,
            baseTypeName,
            annotatedBaseTypeName,
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

export const generateProfilesInit = (
    w: Python,
    tsIndex: TypeSchemaIndex,
    profiles: SnapshotProfileTypeSchema[],
): void => {
    w.generateDisclaimer();
    const seen = new Set<string>();
    for (const profile of profiles) {
        const className = pyProfileClassName(profile);
        const moduleName = pyProfileModuleName(tsIndex, profile);
        if (seen.has(className)) continue;
        seen.add(className);
        pyImportFrom(w, `.${moduleName}`, className);
    }
    // Explicit re-export so strict mypy (no_implicit_reexport) sees these names.
    w.line();
    w.squareBlock(["__all__", "="], () => {
        for (const className of [...seen].sort()) w.line(`'${className}',`);
    });
};

/** Profile class names a package exports, deduped and sorted — the names its
 *  `__init__.py` re-exports from `.profiles`. */
export const collectProfileClassNames = (profiles: SnapshotProfileTypeSchema[]): string[] =>
    [...new Set(profiles.map(pyProfileClassName))].sort();
