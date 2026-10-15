import {
    isProfileIdentifier,
    isResourceIdentifier,
    isSnapshotProfileIdentifier,
    packageMeta,
    packageMetaToFhir,
    type SnapshotProfileTypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { type ProfileImports, type ProfileSections, profileConstants, profileModuleImports } from "./imports";
import {
    type ProfileMethodBaseNames,
    resolveProfileMethodBaseNames,
    tsProfileClassName,
    tsProfileModuleName,
} from "./name";
import {
    generateExtensionExtractedTypes,
    generateExtensionMethods,
    generateInlineExtensionInputTypes,
} from "./profile-extensions";
import {
    collectProfileFactoryInfo,
    generateFactoryMethods,
    generateFieldAccessors,
    generateFlatInputType,
    generateRawType,
    type ProfileFactoryInfo,
} from "./profile-factory";
import {
    collectSliceDefs,
    generateSliceInputTypes,
    generateSliceMethods,
    generateStaticSliceFields,
    type SliceDef,
} from "./profile-slices";
import { generateValidateMethod } from "./profile-validation";
import type { TypeScript } from "./writer";

const generateProfileClass = (
    w: TypeScript,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
    factoryInfo: ProfileFactoryInfo,
    methodNames: ProfileMethodBaseNames,
) => {
    const profileClassName = tsProfileClassName(snapshot);
    const sections: ProfileSections = { ...imports, const: profileConstants(w) };
    const canonicalUrl = snapshot.identifier.url;
    sections.const.def("canonicalUrl", JSON.stringify(canonicalUrl));
    w.comment("CanonicalURL:", canonicalUrl, `(pkg: ${packageMetaToFhir(packageMeta(snapshot))})`);

    w.curlyBlock(["export", "class", profileClassName], () => {
        const specializationBase = tsIndex.findLastSpecializationByIdentifier(snapshot.base);
        if (isResourceIdentifier(specializationBase)) {
            w.lineSM(`static readonly resourceType = ${JSON.stringify(specializationBase.name)}`);
        } else if (isProfileIdentifier(specializationBase) || isSnapshotProfileIdentifier(specializationBase)) {
            w.logger()?.error(
                `Cannot emit static resourceType for profile '${profileClassName}': base '${snapshot.base.url}' does not resolve to a specialization`,
            );
        }
        w.lineSM(`static readonly canonicalUrl = ${sections.const.use("canonicalUrl")}`);
        w.line();
        generateStaticSliceFields(w, sliceDefs);
        generateFactoryMethods(w, sections, tsIndex, snapshot, factoryInfo);
        generateFieldAccessors(w, factoryInfo);

        w.line("// Extensions");
        generateExtensionMethods(w, imports, tsIndex, snapshot, methodNames);

        w.line("// Slices");
        generateSliceMethods(w, imports, snapshot, sliceDefs, methodNames);

        w.line("// Validation");
        generateValidateMethod(w, sections, tsIndex, snapshot);
    });
    w.line();
};

export const generateProfileModule = (w: TypeScript, tsIndex: TypeSchemaIndex, snapshot: SnapshotProfileTypeSchema) => {
    w.generateDisclaimer();
    const imports = profileModuleImports(w, tsIndex, snapshot);
    const sliceDefs = collectSliceDefs(imports, tsIndex, snapshot);
    const factoryInfo = collectProfileFactoryInfo(imports, tsIndex, snapshot);
    const methodNames = resolveProfileMethodBaseNames(snapshot, sliceDefs);

    generateInlineExtensionInputTypes(w, imports, tsIndex, snapshot);
    generateExtensionExtractedTypes(w, tsIndex, snapshot, methodNames);
    generateSliceInputTypes(w, imports, snapshot, sliceDefs);

    generateRawType(w, imports, snapshot, factoryInfo);
    generateFlatInputType(w, imports, tsIndex, snapshot, factoryInfo);

    generateProfileClass(w, imports, tsIndex, snapshot, sliceDefs, factoryInfo, methodNames);
};

export const generateProfileIndex = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    profiles: SnapshotProfileTypeSchema[],
) => {
    const exports: Map<string, string> = new Map();
    for (const snapshot of profiles) {
        const className = tsProfileClassName(snapshot);
        if (!exports.has(className)) {
            exports.set(className, tsProfileModuleName(tsIndex, snapshot));
        }
    }
    for (const className of [...exports.keys()].sort()) {
        w.tsExport(`./${exports.get(className)}`, className);
    }
};
