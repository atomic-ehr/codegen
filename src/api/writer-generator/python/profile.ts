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
import { collectSliceDefs, generateSliceMethods, generateStaticSliceFields, type SliceDef } from "./profile-slices";
import { generateValidateMethod } from "./profile-validation";
import type { Python } from "./writer";

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
        generateExtensionMethods(w, imports, tsIndex, snapshot, methodNames);
        generateSliceMethods(w, imports, snapshot, sliceDefs, methodNames);
        generateValidateMethod(w, imports, tsIndex, snapshot);
    });
    w.line();
};

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
    const exports: Record<string, string> = {};
    for (const snapshot of profiles) {
        const className = pyProfileClassName(snapshot);
        exports[className] ??= pyProfileModuleName(tsIndex, snapshot);
    }
    const classNames = Object.keys(exports).sort();
    w.generateDisclaimer();
    const imports = createImportRenderer(w);
    for (const className of classNames) imports(`.${exports[className]}`, className);
    // Explicit re-export so strict mypy (no_implicit_reexport) sees these names.
    w.line();
    w.squareBlock(["__all__", "="], () => {
        for (const className of classNames) w.line(`'${className}',`);
    });
};
