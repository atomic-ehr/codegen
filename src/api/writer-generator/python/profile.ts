import { isResourceIdentifier, type SnapshotProfileTypeSchema } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    createImportRenderer,
    type ProfileImports,
    profileModuleImports,
    profilePyType,
    resolveFhirType,
} from "./imports";
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
    type ProfileMethodBaseNames,
    pyProfileClassName,
    pyProfileModuleName,
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
    snapshot: SnapshotProfileTypeSchema;
    baseTypeName: string;
    /** Base type with generic params filled in when slices are type-discriminated (e.g. `Bundle[Patient | Organization, Resource]`). Equals `baseTypeName` when no type params apply. */
    annotatedBaseTypeName: string;
    className: string;
    isResourceBase: boolean;
    factoryInfo: ProfileFactoryInfo;
    sliceDefs: SliceDef[];
    methodNames: ProfileMethodBaseNames;
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
        // Every check passes `profile_name`; without checks it would be unused.
        if (errorLines.length > 0 || warningLines.length > 0) w.line(`profile_name = "${className}"`);
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
        snapshot,
        baseTypeName,
        annotatedBaseTypeName,
        className,
        isResourceBase,
        errorLines,
        warningLines,
        factoryInfo,
        sliceDefs,
        methodNames,
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
        generateFieldAccessors(w, imports, className, factoryInfo, methodNames.allBaseNames);

    const extensions = snapshot.extensions ?? [];
    if (extensions.length > 0) generateExtensionMethods(w, imports, tsIndex, snapshot, className, methodNames);

    if (sliceDefs.length > 0) {
        generateSliceGetters(w, imports, sliceDefs, methodNames);
        generateSliceSetters(w, imports, className, sliceDefs, methodNames);
    }

    generateValidateMethod(w, className, errorLines, warningLines);
};

export const generateProfileModule = (
    w: Python,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
): void => {
    w.generateDisclaimer();
    w.line("from __future__ import annotations");
    w.line();
    const imports = profileModuleImports(w, tsIndex, snapshot);
    const className = pyProfileClassName(snapshot);
    const baseTypeName = profilePyType(imports, snapshot.base);
    const isResourceBase = isResourceIdentifier(snapshot.base);
    const canonicalUrl = snapshot.identifier.url ?? "";
    const factoryInfo = collectProfileFactoryInfo(imports, tsIndex, snapshot);
    const sliceDefs = collectSliceDefs(imports, tsIndex, snapshot);
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
            ? `${baseTypeName}[${typedResources.join(" | ")}, ${imports.types.use(resolveFhirType(tsIndex, snapshot, "Resource"))}]`
            : baseTypeName;
    const methodNames = resolveProfileMethodBaseNames(snapshot, sliceDefs);
    const { errorLines, warningLines } = collectValidateBody(imports, tsIndex, snapshot, w.nameFormatFunction);

    w.line(`class ${className}:`);
    w.indentBlock(() => {
        if (snapshot.description) {
            w.line(`"""${snapshot.description}`);
            w.line();
            w.line(`CanonicalURL: ${canonicalUrl}`);
            w.line(`"""`);
            w.line();
        }
        // The snapshot's base is the nearest non-profile schema in the hierarchy
        // (see buildProfileSnapshot), so no further resolution is needed: an
        // extension profile bases on Extension and gets no resource type.
        if (isResourceBase) w.line(`resource_type: str = ${JSON.stringify(snapshot.base.name)}`);
        w.line(`canonical_url: str = ${JSON.stringify(canonicalUrl)}`);
        w.line();
        generateStaticSliceFields(w, imports, sliceDefs);
        generateClassBody({
            w,
            imports,
            tsIndex,
            snapshot,
            baseTypeName,
            annotatedBaseTypeName,
            className,
            isResourceBase,
            factoryInfo,
            sliceDefs,
            methodNames,
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
    const imports = createImportRenderer(w);
    const seen = new Set<string>();
    for (const snapshot of profiles) {
        const className = pyProfileClassName(snapshot);
        const moduleName = pyProfileModuleName(tsIndex, snapshot);
        if (seen.has(className)) continue;
        seen.add(className);
        imports(`.${moduleName}`, className);
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
