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

const resourceRelatives = (schemas: TypeSchema[]): TypeRelation[] => {
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
    hierarchy: (schema: TypeSchema) => TypeSchema[];
    findLastSpecialization: (id: Identifier) => Identifier;
    flatProfile: (schema: ProfileTypeSchema) => ProfileTypeSchema;
    isWithMetaField: (profile: ProfileTypeSchema) => boolean;
};

export const mkTypeSchemaIndex = (schemas: TypeSchema[]): TypeSchemaIndex => {
    const index = {} as Record<CanonicalUrl, Record<PackageName, TypeSchema>>;
    const append = (schema: TypeSchema) => {
        const url = schema.identifier.url;
        if (!index[url]) {
            index[url] = {};
        }
        index[url][schema.identifier.package] = schema;
    };
    for (const schema of schemas) {
        append(schema);
    }
    const relations = resourceRelatives(schemas);

    const resolve = (id: Identifier) => index[id.url]?.[id.package];

    const resourceChildren = (id: Identifier): Identifier[] => {
        return relations.filter((relative) => relative.parent.name === id.name).map((relative) => relative.child);
    };

    const hierarchy = (schema: TypeSchema): TypeSchema[] => {
        const res: TypeSchema[] = [];
        let cur: TypeSchema | undefined = schema;
        while (cur) {
            res.push(cur);
            const base = (cur as RegularTypeSchema).base;
            if (base === undefined) break;
            const resolved = resolve(base);
            if (!resolved) {
                throw new Error(
                    `Failed to resolve base type: ${(res.map((e) => `${e.identifier.url} (${e.identifier.kind})`)).join(", ")}`,
                );
            }
            cur = resolved;
        }
        return res;
    };

    const findLastSpecialization = (id: Identifier): Identifier => {
        const schema = resolve(id);
        if (!schema) return id;

        const nonConstraintSchema = hierarchy(schema).find((s) => s.identifier.kind !== "profile");
        if (!nonConstraintSchema) {
            throw new Error(`No non-constraint schema found in hierarchy for ${id.name}`);
        }
        return nonConstraintSchema.identifier;
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
        return hierarchy(profile)
            .filter(isSpecializationTypeSchema)
            .some((schema) => {
                console.log(schema.fields?.meta);
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
        hierarchy,
        findLastSpecialization,
        flatProfile,
        isWithMetaField,
    };
};
