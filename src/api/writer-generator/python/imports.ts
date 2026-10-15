import type { SectionHandle } from "@root/api/writer-generator/section-writer";
import { snakeCase } from "@root/api/writer-generator/utils";
import type { Writer } from "@root/api/writer-generator/writer";
import {
    type CanonicalUrl,
    isNestedIdentifier,
    isPrimitiveIdentifier,
    isProfileTypeSchema,
    isResourceIdentifier,
    isSnapshotProfileTypeSchema,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    canonicalToName,
    deriveResourceName,
    PRIMITIVE_TYPE_MAP,
    pyFhirPackageByName,
    pyPackage,
} from "./naming-utils";
import { pyProfileClassName, pyProfileModuleName } from "./profile-naming";
import type { Python } from "./writer";

export type LibraryImports = SectionHandle<never, string>;

export type FhirTypeImports = SectionHandle<never, TypeIdentifier>;
export type ProfileImports = {
    types: FhirTypeImports;
    typing: LibraryImports;
    pydantic: LibraryImports;
    helpers: LibraryImports;
};

/** Import sections of a type module (`base.py` or a resource module): one per imported module, plus `types` for FHIR types. */
export type TypeModuleImports = {
    pydantic: LibraryImports;
    typing: LibraryImports;
    typingExtensions: LibraryImports;
    fhirpy: LibraryImports;
    types: FhirTypeImports;
    preprocessor: LibraryImports;
};

export const profilePyType = (imports: ProfileImports, id: TypeIdentifier): string => {
    const primitive = PRIMITIVE_TYPE_MAP[id.name];
    if (isPrimitiveIdentifier(id) || primitive !== undefined) {
        return primitive === "PositiveInt" ? imports.pydantic.use(primitive) : (primitive ?? "str");
    }
    return imports.types.use(id);
};

export const resolveFhirType = (
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    name: string,
): TypeIdentifier => {
    const schema = tsIndex.resolveByUrl(
        snapshot.identifier.package,
        `http://hl7.org/fhir/StructureDefinition/${name}` as CanonicalUrl,
    );
    if (!schema) throw new Error(`'${name}' not found for ${snapshot.identifier.package}.`);
    return schema.identifier;
};

/** `from __future__` stays first; each section below imports only the names its module's code uses. */
export const typeModuleImports = (w: Python, packageName: string, module: string): TypeModuleImports => {
    w.line("from __future__ import annotations");
    const pydantic = moduleImports(w, "pydantic");
    // `List` is a FHIR resource class too, so the typing alias keeps them apart.
    const typing = moduleImports(w, "typing", (name) => (name === "List" ? "PyList" : name));
    const typingExtensions = moduleImports(w, "typing_extensions");
    const fhirpy = moduleImports(w, `${w.opts.rootPackageName}.fhirpy_base_model`);
    w.line();
    const types = w.section<never, TypeIdentifier>({
        name: deriveResourceName,
        render: (_definitions, usages) => {
            const byModule: Record<string, string[]> = {};
            for (const { key, local } of usages) {
                const from = pyPackage(w.opts.rootPackageName, key);
                // Types declared in this module are written by name.
                if (from === module) continue;
                const name = deriveResourceName(key);
                (byModule[from] ??= []).push(name === local ? name : `${name} as ${local}`);
            }
            for (const [from, names] of Object.entries(byModule).sort(([a], [b]) => a.localeCompare(b)))
                pyImportFrom(w, from, ...names.sort());
        },
    });
    const pyFhirPackage = pyFhirPackageByName(w.opts.rootPackageName, packageName);
    const preprocessor = moduleImports(w, `${pyFhirPackage}.resource_preprocessor`);
    return { pydantic, typing, typingExtensions, fhirpy, types, preprocessor };
};

/** One `from <module> import ...` line naming the symbols used from `module`. */
const moduleImports = (w: Python, module: string, name = (key: string) => key): LibraryImports => {
    return w.section<never, string>({
        name,
        render: (_definitions, usages) => {
            if (usages.length === 0) return;
            const names = usages.map(({ key, local }) => (key === local ? key : `${key} as ${local}`));
            pyImportFrom(w, module, ...names.sort());
        },
    });
};

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

export const profileModuleImports = (
    w: Python,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
): ProfileImports => {
    const className = pyProfileClassName(snapshot);
    const tImports = w.section<never, string>({
        name: (key) => key,
        render: (_definitions, usages) => {
            if (usages.length === 0) return;
            pyImportFrom(
                w,
                "typing",
                ...usages.map(({ key, local }) => (key === local ? key : `${key} as ${local}`)).sort(),
            );
            w.line();
        },
    });
    const pImports = w.section<never, string>({
        name: (key) => key,
        render: (_definitions, usages) => {
            if (usages.length === 0) return;
            pyImportFrom(
                w,
                "pydantic",
                ...usages.map(({ key, local }) => (key === local ? key : `${key} as ${local}`)).sort(),
            );
            w.line();
        },
    });
    const typeInfo = (id: TypeIdentifier): { module: string; name: string } => {
        const schema = tsIndex.resolveType(id);
        if (schema && (isProfileTypeSchema(schema) || isSnapshotProfileTypeSchema(schema))) {
            return {
                module: `${pyFhirPackageByName(w.opts.rootPackageName, id.package)}.profiles.${pyProfileModuleName(tsIndex, schema)}`,
                name: pyProfileClassName(schema),
            };
        }
        return { module: modulePathForTypeId(w.opts.rootPackageName, id), name: deriveResourceName(id) };
    };
    const typeImports = w.section<never, TypeIdentifier>({
        name: (id) => {
            const name = typeInfo(id).name;
            return name === className ? `${name}Type` : name;
        },
        render: (_definitions, usages) => {
            const groups: Record<string, string[]> = {};
            for (const { key, local } of usages) {
                const { module, name } = typeInfo(key);
                (groups[module] ??= []).push(name === local ? name : `${name} as ${local}`);
            }
            for (const [module, names] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
                pyImportFrom(w, module, ...[...new Set(names)].sort());
            }
        },
    });
    const helperImports = w.section<never, string>({
        name: (key) => key,
        render: (_definitions, usages) => {
            if (usages.length > 0)
                pyImportFrom(
                    w,
                    `${w.opts.rootPackageName}.profile_helpers`,
                    ...usages.map(({ key, local }) => (key === local ? key : `${key} as ${local}`)).sort(),
                );
        },
    });
    const imports: ProfileImports = {
        typing: tImports,
        pydantic: pImports,
        types: typeImports,
        helpers: helperImports,
    };
    w.line();
    w.line();
    return imports;
};

const MAX_IMPORT_LINE_LENGTH = 100;

export const pyImportFrom = (w: Writer, pyPackage: string, ...entities: string[]): void => {
    const oneLine = `from ${pyPackage} import ${entities.join(", ")}`;

    if (shouldUseSingleLineImport(oneLine, entities)) {
        w.line(oneLine);
    } else {
        writeMultiLineImport(w, pyPackage, entities);
    }
};

const shouldUseSingleLineImport = (oneLine: string, entities: string[]): boolean => {
    return oneLine.length <= MAX_IMPORT_LINE_LENGTH || entities.length === 1;
};

const writeMultiLineImport = (w: Writer, pyPackage: string, entities: string[]): void => {
    w.line(`from ${pyPackage} import (`);
    w.indentBlock(() => {
        let i = 0;
        while (i < entities.length) {
            const { line, next } = buildImportLine(entities, i, MAX_IMPORT_LINE_LENGTH);
            w.line(line);
            i = next;
        }
    });
    w.line(")");
};

const buildImportLine = (entities: string[], start: number, maxLen: number): { line: string; next: number } => {
    let line = "";
    let i = start;
    while (i < entities.length && line.length < maxLen) {
        if (line.length > 0) line += ", ";
        line += entities[i];
        i++;
    }
    if (i < entities.length) line += ", \\";
    return { line, next: i };
};
