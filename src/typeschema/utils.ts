import type { CodegenLogger } from "@root/utils/codegen-logger";
import {
    type CanonicalUrl,
    type Field,
    type Identifier,
    isComplexTypeTypeSchema,
    isLogicalTypeSchema,
    isProfileTypeSchema,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type ProfileTypeSchema,
    type RegularTypeSchema,
    type TypeSchema,
} from "./types";

///////////////////////////////////////////////////////////
// TypeSchema processing

export const groupByPackages = (typeSchemas: TypeSchema[]) => {
    const grouped = {} as Record<string, TypeSchema[]>;
    for (const ts of typeSchemas) {
        const packageName = ts.identifier.package;
        if (!grouped[packageName]) {
            grouped[packageName] = [];
        }
        grouped[packageName].push(ts);
    }
    for (const [_packageName, typeSchemas] of Object.entries(grouped)) {
        typeSchemas.sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
    }
    return grouped;
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
    resourceChildren: (id: Identifier) => Identifier[];
    tryHierarchy: (schema: TypeSchema) => TypeSchema[] | undefined;
    hierarchy: (schema: TypeSchema) => TypeSchema[];
    findLastSpecialization: (schema: TypeSchema) => TypeSchema;
    findLastSpecializationByIdentifier: (id: Identifier) => Identifier;
    flatProfile: (schema: ProfileTypeSchema) => ProfileTypeSchema;
    isWithMetaField: (profile: ProfileTypeSchema) => boolean;
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
            throw new Error(`Duplicate schema: ${r1} and ${r2}`);
        }
        index[url][pkg] = schema;
    };
    for (const schema of schemas) {
        append(schema);
    }
    const relations = resourceRelatives(schemas);

    const resolve = (id: Identifier) => index[id.url]?.[id.package];

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
                    `Failed to resolve base type: ${(res.map((e) => `${e.identifier.url} (${e.identifier.kind})`)).join(", ")}`,
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
                    mergedFields[fieldName] = { ...mergedFields[fieldName], ...fieldConstraints };
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

    return {
        _schemaIndex: index,
        _relations: relations,
        collectComplexTypes: () => schemas.filter(isComplexTypeTypeSchema),
        collectResources: () => schemas.filter(isResourceTypeSchema),
        collectLogicalModels: () => schemas.filter(isLogicalTypeSchema),
        collectProfiles: () => schemas.filter(isProfileTypeSchema),
        resolve,
        resourceChildren,
        tryHierarchy,
        hierarchy,
        findLastSpecialization,
        findLastSpecializationByIdentifier,
        flatProfile,
        isWithMetaField,
    };
};
