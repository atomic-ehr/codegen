import type {
    CanonicalUrl,
    ChoiceFieldDeclaration,
    ChoiceFieldInstance,
    Field,
    Identifier,
    ProfileTypeSchema,
    RegularField,
    RegularTypeSchema,
    TypeSchema,
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

export const collectComplexTypes = (tss: TypeSchema[]): RegularTypeSchema[] =>
    tss.filter((t) => t.identifier.kind === "complex-type");

export const collectResources = (tss: TypeSchema[]): RegularTypeSchema[] =>
    tss.filter((t) => t.identifier.kind === "resource");

export const collectLogicalModels = (tss: TypeSchema[]): RegularTypeSchema[] =>
    tss.filter((t) => t.identifier.kind === "logical");

export const collectProfiles = (tss: TypeSchema[]) => tss.filter((t) => t.identifier.kind === "profile");

///////////////////////////////////////////////////////////
// Field Processing

export const notChoiceDeclaration = (field: Field): RegularField | ChoiceFieldInstance | undefined => {
    if ((field as ChoiceFieldDeclaration).choices) return undefined;
    if ((field as ChoiceFieldInstance).choiceOf) return field as ChoiceFieldInstance;
    return field as RegularField;
};

///////////////////////////////////////////////////////////
// Type Schema Relations

interface TypeRelation {
    parent: Identifier;
    child: Identifier;
}

const resourceRelatives = (schemas: TypeSchema[]): TypeRelation[] => {
    const regularSchemas = collectResources(schemas);
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
    schemaIndex: Record<CanonicalUrl, Record<PackageName, TypeSchema>>;
    relations: TypeRelation[];
    resolve: (id: Identifier) => TypeSchema | undefined;
    resourceChildren: (id: Identifier) => Identifier[];
    hierarchy: (schema: TypeSchema) => TypeSchema[];
    findLastSpecialization: (id: Identifier) => Identifier;
    flatProfile: (schema: ProfileTypeSchema) => ProfileTypeSchema;
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
                throw new Error(`Failed to resolve base type: ${JSON.stringify(base)}`);
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

    return {
        schemaIndex: index,
        relations,
        resolve,
        resourceChildren,
        hierarchy,
        findLastSpecialization,
        flatProfile,
    };
};
