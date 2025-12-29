import * as afs from "node:fs/promises";
import * as Path from "node:path";
import type { TreeShakeReport } from "@root/typeschema/tree-shake";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import * as YAML from "yaml";
import type { ResolutionTree } from "./register";
import {
    type CanonicalUrl,
    type Field,
    type Identifier,
    isComplexTypeTypeSchema,
    isLogicalTypeSchema,
    isProfileTypeSchema,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type ProfileExtension,
    type ProfileTypeSchema,
    type RegularTypeSchema,
    type TypeSchema,
} from "./types";

///////////////////////////////////////////////////////////
// TypeSchema processing

export const groupByPackages = (typeSchemas: TypeSchema[]): Record<PackageName, TypeSchema[]> => {
    const grouped = {} as Record<PackageName, TypeSchema[]>;
    for (const ts of typeSchemas) {
        const pkgName = ts.identifier.package;
        if (!grouped[pkgName]) grouped[pkgName] = [];
        grouped[pkgName].push(ts);
    }
    for (const [packageName, typeSchemas] of Object.entries(grouped)) {
        const dict: Record<string, TypeSchema> = {};
        for (const ts of typeSchemas) {
            dict[JSON.stringify(ts.identifier)] = ts;
        }
        const tmp = Object.values(dict);
        tmp.sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
        grouped[packageName] = tmp;
    }
    return grouped;
};

const buildDependencyGraph = (schemas: RegularTypeSchema[]): Record<string, string[]> => {
    const nameToMap: Record<string, RegularTypeSchema> = {};
    for (const schema of schemas) {
        nameToMap[schema.identifier.name] = schema;
    }

    const graph: Record<string, string[]> = {};
    for (const schema of schemas) {
        const name = schema.identifier.name;
        const base = schema.base?.name;
        if (!graph[name]) {
            graph[name] = [];
        }
        if (base && nameToMap[base]) {
            graph[name].push(base);
        }
    }
    return graph;
};

const topologicalSort = (graph: Record<string, string[]>): string[] => {
    const sorted: string[] = [];
    const visited: Record<string, boolean> = {};
    const temp: Record<string, boolean> = {};

    const visit = (node: string) => {
        if (temp[node]) {
            throw new Error(`Graph has cycles ${node}`);
        }
        if (!visited[node]) {
            temp[node] = true;
            for (const neighbor of graph[node] ?? []) {
                visit(neighbor);
            }
            temp[node] = false;
            visited[node] = true;
            sorted.push(node);
        }
    };

    for (const node in graph) {
        if (!visited[node]) {
            visit(node);
        }
    }
    return sorted;
};

export const sortAsDeclarationSequence = (schemas: RegularTypeSchema[]): RegularTypeSchema[] => {
    const graph = buildDependencyGraph(schemas);
    const sorted = topologicalSort(graph);
    return sorted
        .map((name) => schemas.find((schema) => schema.identifier.name === name))
        .filter(Boolean) as RegularTypeSchema[];
};

///////////////////////////////////////////////////////////
// Type Schema Relations

interface TypeRelation {
    parent: Identifier;
    child: Identifier;
}

const resourceRelatives = (schemas: TypeSchema[]): TypeRelation[] => {
    const regularSchemas = schemas.filter(
        (e) => isResourceTypeSchema(e) || isLogicalTypeSchema(e) || isComplexTypeTypeSchema(e),
    );
    const directPairs: TypeRelation[] = [];

    for (const schema of regularSchemas) {
        if (schema.base) {
            directPairs.push({ parent: schema.base, child: schema.identifier });
        }
    }

    const allPairs: TypeRelation[] = [...directPairs];
    const findTransitiveRelatives = (parentRef: Identifier): Identifier[] => {
        const directChildren = directPairs
            .filter((pair) => pair.parent.name === parentRef.name)
            .map((pair) => pair.child);

        const transitiveChildren: Identifier[] = [];
        for (const child of directChildren) {
            transitiveChildren.push(...findTransitiveRelatives(child));
        }

        return [...directChildren, ...transitiveChildren];
    };

    for (const pair of directPairs) {
        const transitiveChildren = findTransitiveRelatives(pair.child);
        for (const transitiveChild of transitiveChildren) {
            if (
                !directPairs.some((dp) => dp.parent.name === pair.parent.name && dp.child.name === transitiveChild.name)
            ) {
                allPairs.push({ parent: pair.parent, child: transitiveChild });
            }
        }
    }

    return allPairs;
};

///////////////////////////////////////////////////////////
// Type Schema Index

export type PackageName = string;
export type TypeSchemaIndex = {
    _schemaIndex: Record<CanonicalUrl, Record<PackageName, TypeSchema>>;
    _relations: TypeRelation[];
    schemas: TypeSchema[];
    schemasByPackage: Record<PackageName, TypeSchema[]>;
    collectComplexTypes: () => RegularTypeSchema[];
    collectResources: () => RegularTypeSchema[];
    collectLogicalModels: () => RegularTypeSchema[];
    collectProfiles: () => ProfileTypeSchema[];
    resolve: (id: Identifier) => TypeSchema | undefined;
    resolveByUrl: (pkgName: PackageName, url: CanonicalUrl) => TypeSchema | undefined;
    resourceChildren: (id: Identifier) => Identifier[];
    tryHierarchy: (schema: TypeSchema) => TypeSchema[] | undefined;
    hierarchy: (schema: TypeSchema) => TypeSchema[];
    findLastSpecialization: (schema: TypeSchema) => TypeSchema;
    findLastSpecializationByIdentifier: (id: Identifier) => Identifier;
    flatProfile: (schema: ProfileTypeSchema) => ProfileTypeSchema;
    isWithMetaField: (profile: ProfileTypeSchema) => boolean;
    entityTree: () => EntityTree;
    exportTree: (filename: string) => Promise<void>;
    treeShakeReport: () => TreeShakeReport | undefined;
};

type EntityTree = Record<PackageName, Record<Identifier["kind"], Record<CanonicalUrl, object>>>;

export const mkTypeSchemaIndex = (
    schemas: TypeSchema[],
    {
        resolutionTree,
        logger,
        treeShakeReport,
    }: {
        resolutionTree?: ResolutionTree;
        logger?: CodegenLogger;
        treeShakeReport?: TreeShakeReport;
    },
): TypeSchemaIndex => {
    const index: Record<CanonicalUrl, Record<PackageName, TypeSchema>> = {};
    const nestedIndex: Record<CanonicalUrl, Record<PackageName, TypeSchema>> = {};
    const append = (schema: TypeSchema) => {
        const url = schema.identifier.url;
        const pkg = schema.identifier.package;
        if (!index[url]) index[url] = {};

        if (index[url][pkg] && pkg !== "shared") {
            const r1 = JSON.stringify(schema.identifier, undefined, 2);
            const r2 = JSON.stringify(index[url][pkg]?.identifier, undefined, 2);
            if (r1 !== r2) throw new Error(`Duplicate schema: ${r1} and ${r2}`);
            return;
        }
        index[url][pkg] = schema;

        if (isSpecializationTypeSchema(schema) || isProfileTypeSchema(schema)) {
            if (schema.nested) {
                schema.nested.forEach((nschema) => {
                    const nurl = nschema.identifier.url;
                    const npkg = nschema.identifier.package;
                    nestedIndex[nurl] ??= {};
                    nestedIndex[nurl][npkg] = nschema;
                });
            }
        }
    };
    for (const schema of schemas) {
        append(schema);
    }
    const relations = resourceRelatives(schemas);

    const resolve = (id: Identifier) => {
        if (id.kind === "nested") return nestedIndex[id.url]?.[id.package];
        return index[id.url]?.[id.package];
    };
    const resolveByUrl = (pkgName: PackageName, url: CanonicalUrl) => {
        if (resolutionTree) {
            const resolution = resolutionTree[pkgName]?.[url]?.[0];
            if (resolution) {
                return index[url]?.[resolution.pkg.name];
            }
        }
        return index[url]?.[pkgName];
    };

    const resourceChildren = (id: Identifier): Identifier[] => {
        return relations.filter((relative) => relative.parent.name === id.name).map((relative) => relative.child);
    };

    const tryHierarchy = (schema: TypeSchema): TypeSchema[] | undefined => {
        const res: TypeSchema[] = [];
        let cur: TypeSchema | undefined = schema;
        while (cur) {
            res.push(cur);
            const base = (cur as RegularTypeSchema).base;
            if (base === undefined) break;
            const resolved = resolve(base);
            if (!resolved) {
                logger?.warn(
                    `Failed to resolve base type: ${res.map((e) => `${e.identifier.url} (${e.identifier.kind})`).join(", ")}`,
                );
                return undefined;
            }
            cur = resolved;
        }
        return res;
    };

    const hierarchy = (schema: TypeSchema): TypeSchema[] => {
        const genealogy = tryHierarchy(schema);
        if (genealogy === undefined) {
            throw new Error(`Failed to resolve base type: ${schema.identifier.url} (${schema.identifier.kind})`);
        }
        return genealogy;
    };

    const findLastSpecialization = (schema: TypeSchema): TypeSchema => {
        const nonConstraintSchema = hierarchy(schema).find((s) => s.identifier.kind !== "profile");
        if (!nonConstraintSchema) {
            throw new Error(`No non-constraint schema found in hierarchy for: ${schema.identifier.name}`);
        }
        return nonConstraintSchema;
    };

    const findLastSpecializationByIdentifier = (id: Identifier): Identifier => {
        const schema = resolve(id);
        if (!schema) return id;
        return findLastSpecialization(schema).identifier;
    };

    const flatProfile = (schema: ProfileTypeSchema): ProfileTypeSchema => {
        const hierarchySchemas = hierarchy(schema);
        const constraintSchemas = hierarchySchemas.filter((s) => s.identifier.kind === "profile");
        const nonConstraintSchema = hierarchySchemas.find((s) => s.identifier.kind !== "profile");

        if (!nonConstraintSchema)
            throw new Error(`No non-constraint schema found in hierarchy for ${schema.identifier.name}`);

        const mergedFields = {} as Record<string, Field>;
        for (const anySchema of constraintSchemas.slice().reverse()) {
            const schema = anySchema as RegularTypeSchema;
            if (!schema.fields) continue;

            for (const [fieldName, fieldConstraints] of Object.entries(schema.fields)) {
                if (mergedFields[fieldName]) {
                    mergedFields[fieldName] = {
                        ...mergedFields[fieldName],
                        ...fieldConstraints,
                    };
                } else {
                    mergedFields[fieldName] = { ...fieldConstraints };
                }
            }
        }

        const deps: { [url: string]: Identifier } = {};
        for (const e of constraintSchemas.flatMap((e) => (e as RegularTypeSchema).dependencies ?? [])) {
            deps[e.url] = e;
        }

        const dependencies = Object.values(deps);
        const extensionMap = new Map<string, ProfileExtension>();
        for (const anySchema of constraintSchemas.slice().reverse()) {
            const extensions = (anySchema as ProfileTypeSchema).extensions ?? [];
            for (const ext of extensions) {
                const key = `${ext.path}|${ext.name}|${ext.url ?? ""}`;
                extensionMap.set(key, ext);
            }
        }
        const mergedExtensions = Array.from(extensionMap.values());

        return {
            ...schema,
            base: nonConstraintSchema.identifier,
            fields: mergedFields,
            dependencies: dependencies,
            extensions: mergedExtensions.length > 0 ? mergedExtensions : undefined,
        };
    };

    const isWithMetaField = (profile: ProfileTypeSchema): boolean => {
        const genealogy = tryHierarchy(profile);
        if (!genealogy) return false;
        return genealogy.filter(isSpecializationTypeSchema).some((schema) => {
            return schema.fields?.meta !== undefined;
        });
    };

    const entityTree = () => {
        const tree: EntityTree = {};
        for (const [pkgId, shemas] of Object.entries(groupByPackages(schemas))) {
            tree[pkgId] = {
                "primitive-type": {},
                "complex-type": {},
                resource: {},
                "value-set": {},
                nested: {},
                binding: {},
                profile: {},
                logical: {},
            };
            for (const schema of shemas) {
                tree[pkgId][schema.identifier.kind][schema.identifier.url] = {};
            }
        }
        return tree;
    };

    const exportTree = async (filename: string) => {
        const tree = entityTree();
        const raw = filename.endsWith(".yaml") ? YAML.stringify(tree) : JSON.stringify(tree, undefined, 2);
        await afs.mkdir(Path.dirname(filename), { recursive: true });
        await afs.writeFile(filename, raw);
    };

    return {
        _schemaIndex: index,
        _relations: relations,
        schemas,
        schemasByPackage: groupByPackages(schemas),
        collectComplexTypes: () => schemas.filter(isComplexTypeTypeSchema),
        collectResources: () => schemas.filter(isResourceTypeSchema),
        collectLogicalModels: () => schemas.filter(isLogicalTypeSchema),
        collectProfiles: () => schemas.filter(isProfileTypeSchema),
        resolve,
        resolveByUrl,
        resourceChildren,
        tryHierarchy,
        hierarchy,
        findLastSpecialization,
        findLastSpecializationByIdentifier,
        flatProfile,
        isWithMetaField,
        entityTree,
        exportTree,
        treeShakeReport: () => treeShakeReport,
    };
};
