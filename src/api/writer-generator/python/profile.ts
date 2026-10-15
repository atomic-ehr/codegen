import { isResourceIdentifier, type SnapshotProfileTypeSchema } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { createImportRenderer, type ProfileImports, profileModuleImports } from "./imports";
import { generateExtensionMethods } from "./profile-extensions";
import {
    collectProfileFactoryInfo,
    generateFactoryMethods,
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
// Class method generators
// ---------------------------------------------------------------------------

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
// Profile class
// ---------------------------------------------------------------------------

const generateProfileClass = (
    w: Python,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
    factoryInfo: ProfileFactoryInfo,
    methodNames: ProfileMethodBaseNames,
): void => {
    const className = pyProfileClassName(snapshot);
    const isResourceBase = isResourceIdentifier(snapshot.base);
    const canonicalUrl = snapshot.identifier.url ?? "";

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
        generateFactoryMethods(w, imports, tsIndex, snapshot, factoryInfo, sliceDefs);
        generateFieldAccessors(w, imports, snapshot, factoryInfo, methodNames);

        const extensions = snapshot.extensions ?? [];
        if (extensions.length > 0) generateExtensionMethods(w, imports, tsIndex, snapshot, className, methodNames);

        if (sliceDefs.length > 0) {
            generateSliceGetters(w, imports, sliceDefs, methodNames);
            generateSliceSetters(w, imports, className, sliceDefs, methodNames);
        }

        const { errorLines, warningLines } = collectValidateBody(imports, tsIndex, snapshot, w.nameFormatFunction);
        generateValidateMethod(w, className, errorLines, warningLines);
    });
    w.line();
};

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export const generateProfileModule = (
    w: Python,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
): void => {
    w.generateDisclaimer();
    const imports = profileModuleImports(w, tsIndex, snapshot);
    const sliceDefs = collectSliceDefs(imports, tsIndex, snapshot);
    const factoryInfo = collectProfileFactoryInfo(imports, tsIndex, snapshot);
    const methodNames = resolveProfileMethodBaseNames(snapshot, sliceDefs);
    generateProfileClass(w, imports, tsIndex, snapshot, sliceDefs, factoryInfo, methodNames);
};

export const generateProfileIndex = (
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
