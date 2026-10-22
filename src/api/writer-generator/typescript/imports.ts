import type { FhirTypeImports, SectionHandle } from "@root/api/writer-generator/section-writer";
import { pascalCase } from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
    type Identifier,
    isNestedIdentifier,
    type SnapshotProfileTypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { tsNameFromCanonical, tsResourceName } from "./name";
import { collectSubExtensionSlices, resolveExtensionProfile } from "./profile-extensions";
import type { TypeScript } from "./writer";

export type ProfileImports = {
    types: FhirTypeImports;
    helpers: SectionHandle<never, string>;
};

/** Profile imports plus module-level constants: `const.def(name, expr)` declares `const name = expr;`. */
export type ProfileSections = ProfileImports & { const: SectionHandle<string, string> };

export const resolveFhirType = (
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    name: string,
): Identifier => {
    const url = `http://hl7.org/fhir/StructureDefinition/${name}` as CanonicalUrl;
    const schema = tsIndex.resolveByUrl(snapshot.identifier.package, url);
    if (!schema) throw new Error(`'${url}' not found for ${snapshot.identifier.package}.`);
    return schema.identifier;
};

const profileHelperImports = (w: TypeScript): ProfileImports["helpers"] =>
    w.section<never, string>({
        name: (name) => name,
        render: (_definitions, usages) => {
            if (usages.length === 0) return;
            w.tsImport(
                "../../profile-helpers",
                ...usages.map(({ key, local }) => (key === local ? key : `${key} as ${local}`)),
            );
            w.line();
        },
    });

export const profileConstants = (w: TypeScript): ProfileSections["const"] =>
    w.section<string, string>({
        name: (name) => name,
        defRender: (name, expr) => w.lineSM(`const ${name} = ${expr}`),
        render: (definitions) => {
            if (definitions.length === 0) return;
            for (const { local, value } of definitions) w.lineSM(`const ${local} = ${value}`);
            w.line();
        },
    });

export const profileModuleImports = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
): ProfileImports => {
    const terminologyImports = w.enumTerminologyLinks(tsIndex, snapshot).imports;
    const types = w.section<never, Identifier>({
        name: (id) => tsResourceName(tsIndex.specializationOf(id)),
        render: (_definitions, usages) => {
            const grouped: Record<string, string[]> = {};
            for (const { key: constraint, local } of usages) {
                const key = tsIndex.specializationOf(constraint);
                let modulePath = `../../${w.modulePath(key)}`;
                if (isNestedIdentifier(key)) {
                    const path = tsNameFromCanonical(key.url, true);
                    if (path) modulePath = `../../${w.packageDir(key)}/${pascalCase(path)}`;
                }
                const name = tsResourceName(key);
                (grouped[modulePath] ??= []).push(name === local ? name : `${name} as ${local}`);
            }
            for (const [modulePath, names] of Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))) {
                w.tsImport(modulePath, ...names.sort(), { typeOnly: true });
            }
            if (Object.keys(grouped).length > 0) w.line();
        },
    });

    // Value imports into emitted terminology modules: enum validations whose
    // code lists are fully explained by emitted systems reference them instead
    // of inlining literals.
    const sortedTerminology = Object.entries(terminologyImports).sort(([left], [right]) => left.localeCompare(right));
    for (const [moduleDir, symbols] of sortedTerminology) {
        w.tsImport(`../../${moduleDir}/terminology`, ...[...symbols].sort());
    }
    if (sortedTerminology.length > 0) w.line();

    // Import extension profile classes for delegation in setters
    const extProfileImports: Record<string, { modulePath: string; hasFlatInput: boolean }> = {};
    for (const ext of snapshot.extensions ?? []) {
        const info = resolveExtensionProfile(tsIndex, snapshot.identifier.package, ext);
        if (!info) continue;
        extProfileImports[info.className] ??= {
            modulePath: info.modulePath,
            hasFlatInput: collectSubExtensionSlices(info.snapshot).length > 0,
        };
    }
    for (const [className, { modulePath, hasFlatInput }] of Object.entries(extProfileImports).sort(([a], [b]) =>
        a.localeCompare(b),
    )) {
        const imports = [className, ...(hasFlatInput ? [`type ${className}Flat`] : [])];
        w.tsImport(modulePath, ...imports);
    }
    if (Object.keys(extProfileImports).length > 0) w.line();
    const helpers = profileHelperImports(w);
    return { types, helpers };
};
