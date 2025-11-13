import * as afs from "node:fs/promises";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import * as YAML from "yaml";
import { extractDependencies } from "./core/transformer";
import {
    type CanonicalUrl,
    type Field,
    type Identifier,
    isBindingSchema,
    isComplexTypeTypeSchema,
    isLogicalTypeSchema,
    isNestedIdentifier,
    isPrimitiveTypeSchema,
    isProfileTypeSchema,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    isValueSetTypeSchema,
    type ProfileTypeSchema,
    type RegularTypeSchema,
    type TypeSchema,
} from "./types";

///////////////////////////////////////////////////////////
// TypeSchema processing

export const groupByPackages = (typeSchemas: TypeSchema[]) => {
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

export type TypeSchemaShakeRule = { ignoreFields?: string[] };

export type TreeShake = Record<string, Record<string, TypeSchemaShakeRule>>;

export const treeShakeTypeSchema = (
    schema: TypeSchema,
    rule: TypeSchemaShakeRule,
    _logger?: CodegenLogger,
): TypeSchema => {
    schema = structuredClone(schema);
    if (isPrimitiveTypeSchema(schema) || isValueSetTypeSchema(schema) || isBindingSchema(schema)) return schema;

    for (const fieldName of rule.ignoreFields ?? []) {
        if (schema.fields && !schema.fields[fieldName]) throw new Error(`Field ${fieldName} not found`);
        if (schema.fields) {
            delete schema.fields[fieldName];
        }
    }

    schema.dependencies = extractDependencies(schema.identifier, schema.base, schema.fields, schema.nested);

    return schema;
};

export const treeShake = (tsIndex: TypeSchemaIndex, treeShake: TreeShake, logger?: CodegenLogger): TypeSchemaIndex => {
    const focusedSchemas: TypeSchema[] = [];
    for (const [pkgId, requires] of Object.entries(treeShake)) {
        for (const [url, rule] of Object.entries(requires)) {
            const schema = tsIndex.resolveByUrl(pkgId, url as CanonicalUrl);
            if (!schema) throw new Error(`Schema not found for ${pkgId} ${url}`);
            const shaked = treeShakeTypeSchema(schema, rule);
            focusedSchemas.push(shaked);
        }
    }
    const collectDeps = (schemas: TypeSchema[], acc: Record<string, TypeSchema>): TypeSchema[] => {
        if (schemas.length === 0) return Object.values(acc);
        for (const schema of schemas) {
            acc[JSON.stringify(schema.identifier)] = schema;
        }

        const newSchemas: TypeSchema[] = [];

        for (const schema of schemas) {
            if (isSpecializationTypeSchema(schema)) {
                if (!schema.dependencies) continue;
                schema.dependencies.forEach((dep) => {
                    const depSchema = tsIndex.resolve(dep);
                    if (!depSchema) throw new Error(`Schema not found for ${dep}`);
                    const id = JSON.stringify(depSchema.identifier);
                    if (!acc[id]) newSchemas.push(depSchema);
                });
                if (schema.nested) {
                    for (const nest of schema.nested) {
                        if (isNestedIdentifier(nest.identifier)) continue;
                        const id = JSON.stringify(nest.identifier);
                        if (!acc[id]) newSchemas.push(nest);
                    }
                }
            }
        }
        return collectDeps(newSchemas, acc);
    };

    const shaked = collectDeps(focusedSchemas, {});
    return mkTypeSchemaIndex(shaked, logger);
};

///////////////////////////////////////////////////////////
// Type Schema Relations

interface TypeRelation {
    parent: Identifier;
    child: Identifier;
}

export const resourceRelatives = (schemas: TypeSchema[]): TypeRelation[] => {
    const regularSchemas = schemas.filter(isResourceTypeSchema);
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

type PackageName = string;
export type TypeSchemaIndex = {
    _schemaIndex: Record<CanonicalUrl, Record<PackageName, TypeSchema>>;
    _relations: TypeRelation[];
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
    exportTree: (filename: string) => Promise<void>;
};

export const mkTypeSchemaIndex = (schemas: TypeSchema[], logger?: CodegenLogger): TypeSchemaIndex => {
    const index = {} as Record<CanonicalUrl, Record<PackageName, TypeSchema>>;
    const append = (schema: TypeSchema) => {
        const url = schema.identifier.url;
        const pkg = schema.identifier.package;
        if (!index[url]) index[url] = {};

        if (index[url][schema.identifier.package] && pkg !== "shared") {
            const r1 = JSON.stringify(schema.identifier, undefined, 2);
            const r2 = JSON.stringify(index[url][pkg]?.identifier, undefined, 2);
            if (r1 !== r2) throw new Error(`Duplicate schema: ${r1} and ${r2}`);
            return;
        }
        index[url][pkg] = schema;
    };
    for (const schema of schemas) {
        append(schema);
    }
    const relations = resourceRelatives(schemas);

    const resolve = (id: Identifier) => index[id.url]?.[id.package];
    const resolveByUrl = (pkgName: PackageName, url: CanonicalUrl) => index[url]?.[pkgName];

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

        return {
            ...schema,
            base: nonConstraintSchema.identifier,
            fields: mergedFields,
            dependencies: dependencies,
        };
    };

    const isWithMetaField = (profile: ProfileTypeSchema): boolean => {
        const genealogy = tryHierarchy(profile);
        if (!genealogy) return false;
        return genealogy.filter(isSpecializationTypeSchema).some((schema) => {
            return schema.fields?.meta !== undefined;
        });
    };

    const exportTree = async (filename: string) => {
        const tree: Record<PackageName, Record<Identifier["kind"], any>> = {};
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
                const _desc = schema.identifier;
                tree[pkgId][schema.identifier.kind][schema.identifier.url] = {};
            }
        }
        const raw = filename.endsWith(".yaml") ? YAML.stringify(tree) : JSON.stringify(tree, undefined, 2);
        await afs.writeFile(filename, raw);
    };

    return {
        _schemaIndex: index,
        _relations: relations,
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
        exportTree,
    };
};
