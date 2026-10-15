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
    tsResourceName,
    tsSliceFlatAllTypeName,
    tsSliceFlatTypeName,
    tsSliceStaticName,
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
import { collectSliceDefs, generateSliceGetters, generateSliceSetters, type SliceDef } from "./profile-slices";
import { generateValidateMethod } from "./profile-validation";
import { tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

const generateStaticSliceFields = (w: TypeScript, sliceDefs: SliceDef[]) => {
    for (const sliceDef of sliceDefs) {
        const staticName = `${tsSliceStaticName(sliceDef.sliceName)}SliceMatch`;
        const json = JSON.stringify(sliceDef.match);
        const prefix = `private static readonly ${staticName}: Record<string, unknown> = `;
        if (prefix.length + json.length <= (w.opts.lineWidth ?? 120)) {
            w.lineSM(`${prefix}${json}`);
        } else {
            w.curlyBlock([prefix.trimEnd()], () => {
                for (const [key, value] of Object.entries(sliceDef.match)) {
                    w.line(`${JSON.stringify(key)}: ${JSON.stringify(value)},`);
                }
            });
        }
    }
    if (sliceDefs.length > 0) w.line();
};

/** Convert a JS value to a TypeScript type literal string (e.g. `{ code: "vital-signs"; system: "http://..." }`). */
const valueToTypeLiteral = (value: unknown): string => {
    if (value === null || value === undefined) return "undefined";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return `[${value.map(valueToTypeLiteral).join(", ")}]`;
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${valueToTypeLiteral(v)}`)
            .join("; ");
        return `{ ${entries} }`;
    }
    return "unknown";
};

const generateSliceInputTypes = (
    w: TypeScript,
    imports: ProfileImports,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
) => {
    if (sliceDefs.length === 0) return;
    const tsProfileName = tsResourceName(snapshot.identifier);
    for (const sliceDef of sliceDefs) {
        const inputTypeName = tsSliceFlatTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const flatTypeName = tsSliceFlatAllTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const matchFields = sliceDef.typeDiscriminator ? [] : Object.keys(sliceDef.match);
        const allExcluded = [...new Set([...sliceDef.excluded, ...matchFields])];
        if (sliceDef.constrainedChoice) {
            const cc = sliceDef.constrainedChoice;
            allExcluded.push(cc.choiceBase);
            for (const name of cc.allChoiceNames) {
                if (!allExcluded.includes(name)) allExcluded.push(name);
            }
        }
        const excludedNames = allExcluded.map((name) => JSON.stringify(name));
        const requiredNames = sliceDef.required.map((name) => JSON.stringify(name));
        const baseType = sliceDef.typedBaseType;
        let inputTypeExpr = baseType;
        if (excludedNames.length > 0) {
            inputTypeExpr = `Omit<${inputTypeExpr}, ${excludedNames.join(" | ")}>`;
        }
        if (requiredNames.length > 0) {
            inputTypeExpr = `${inputTypeExpr} & Required<Pick<${baseType}, ${requiredNames.join(" | ")}>>`;
        }
        if (sliceDef.constrainedChoice) {
            inputTypeExpr = `${inputTypeExpr} & ${tsTypeFromIdentifier(imports.types, sliceDef.constrainedChoice.variantType)}`;
        }
        // Input type — setter parameter, no discriminator fields
        w.lineSM(`export type ${inputTypeName} = ${inputTypeExpr}`);
        // Flat type — getter return, includes readonly discriminator values as literal types
        const safeMatchEntries =
            matchFields.length > 0 && !sliceDef.constrainedChoice
                ? matchFields
                      .filter((key) => {
                          const v = sliceDef.match[key];
                          return Array.isArray(v) || typeof v !== "object" || v === null;
                      })
                      .map((key) => ({ key, typeLiteral: valueToTypeLiteral(sliceDef.match[key]) }))
                : [];
        if (safeMatchEntries.length > 0) {
            w.curlyBlock([`export type ${flatTypeName} = ${inputTypeName} &`], () => {
                for (const entry of safeMatchEntries) {
                    w.lineSM(`readonly ${entry.key}: ${entry.typeLiteral}`);
                }
            });
        } else {
            w.lineSM(`export type ${flatTypeName} = ${inputTypeName}`);
        }
        w.line();
    }
};

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
        generateSliceSetters(w, imports, sliceDefs, snapshot, methodNames);
        generateSliceGetters(w, imports, sliceDefs, snapshot, methodNames);

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
