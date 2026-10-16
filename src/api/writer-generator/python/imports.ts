import type { FhirTypeImports, SectionHandle } from "@root/api/writer-generator/section-writer";
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

export type ImportRenderer = (module: string, ...entities: string[]) => void;

export type LibraryImports = SectionHandle<never, string>;

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
    w.line();
    const render = createImportRenderer(w);
    const pydantic = moduleImports(w, render, "pydantic");
    // `List` is a FHIR resource class too, so the typing alias keeps them apart.
    const typing = moduleImports(w, render, "typing", (name) => (name === "List" ? "PyList" : name));
    const typingExtensions = moduleImports(w, render, "typing_extensions");
    const fhirpy = moduleImports(w, render, `${w.opts.rootPackageName}.fhirpy_base_model`);
    const types = w.section<never, TypeIdentifier>({
        name: deriveResourceName,
        render: (_definitions, usages) => {
            for (const { key, local } of usages) {
                const from = pyPackage(w.opts.rootPackageName, key);
                // Types declared in this module are written by name.
                if (from === module) continue;
                const name = deriveResourceName(key);
                render(from, name === local ? name : `${name} as ${local}`);
            }
        },
    });
    const pyFhirPackage = pyFhirPackageByName(w.opts.rootPackageName, packageName);
    const preprocessor = moduleImports(w, render, `${pyFhirPackage}.resource_preprocessor`);
    return { pydantic, typing, typingExtensions, fhirpy, types, preprocessor };
};

/** One `from <module> import ...` line naming the symbols used from `module`. */
const moduleImports = (
    w: Python,
    render: ImportRenderer,
    module: string,
    name = (key: string) => key,
): LibraryImports => {
    return w.section<never, string>({
        name,
        render: (_definitions, usages) => {
            if (usages.length === 0) return;
            const names = usages.map(({ key, local }) => (key === local ? key : `${key} as ${local}`));
            render(module, ...names);
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
    const render = createImportRenderer(w);
    const tImports = moduleImports(w, render, "typing");
    const pImports = moduleImports(w, render, "pydantic");
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
            for (const { key, local } of usages) {
                const { module, name } = typeInfo(key);
                render(module, name === local ? name : `${name} as ${local}`);
            }
        },
    });
    const helperImports = moduleImports(w, render, `${w.opts.rootPackageName}.profile_helpers`);
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

const MAX_IMPORT_LINE_LENGTH = 88;

/** Sections render bottom-up, so this first section collects the reachable
 * imports from the sections below it before rendering the complete block. */
export const createImportRenderer = (w: Python): ImportRenderer => {
    const modules: Record<string, Set<string>> = {};
    w.section<never, never>({
        name: () => "",
        render: () => {
            const group = (module: string): number => {
                if (module === "typing") return 0;
                if (module === "pydantic" || module === "typing_extensions") return 1;
                return module.startsWith(".") ? 3 : 2;
            };
            const entries = Object.entries(modules).sort(
                ([a], [b]) =>
                    group(a) - group(b) ||
                    Number(a.startsWith(".")) - Number(b.startsWith(".")) ||
                    compareImports(a, b),
            );
            let previousGroup: number | undefined;
            for (const [module, names] of entries) {
                const currentGroup = group(module);
                if (previousGroup !== undefined && previousGroup !== currentGroup) w.line();
                pyImportFrom(w, module, ...names);
                previousGroup = currentGroup;
            }
        },
    });
    return (module, ...entities) => {
        if (entities.length === 0) return;
        const names = (modules[module] ??= new Set<string>());
        for (const entity of entities) names.add(entity);
    };
};

const compareImports = (left: string, right: string): number =>
    left.toLowerCase().localeCompare(right.toLowerCase(), "en", { numeric: true }) || left.localeCompare(right);

const CONSTANT_IMPORT_NAME = /^[A-Z][A-Z_0-9]*$/;
const CLASS_IMPORT_NAME = /^[A-Z]/;

const importNameGroup = (name: string): number => {
    if (CONSTANT_IMPORT_NAME.test(name.split(" as ")[0] ?? name)) return 0;
    return CLASS_IMPORT_NAME.test(name) ? 1 : 2;
};

export const pyImportFrom = (w: Writer, module: string, ...entities: string[]): void => {
    const names = [...new Set(entities)].sort(
        (a, b) => importNameGroup(a) - importNameGroup(b) || compareImports(a, b),
    );
    const plain = names.filter((name) => !name.includes(" as "));
    const aliased = names.filter((name) => name.includes(" as "));
    // Ruff I001 keeps each aliased import on its own line.
    for (const group of [plain, ...aliased.map((name) => [name])]) {
        if (group.length === 0) continue;
        const oneLine = `from ${module} import ${group.join(", ")}`;
        if (oneLine.length <= MAX_IMPORT_LINE_LENGTH) {
            w.line(oneLine);
        } else {
            w.line(`from ${module} import (`);
            w.indentBlock(() => {
                for (const name of group) w.line(`${name},`);
            });
            w.line(")");
        }
    }
};
