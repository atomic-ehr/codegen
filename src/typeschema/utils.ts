import type {
    ChoiceFieldDeclaration,
    ChoiceFieldInstance,
    Field,
    Identifier,
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
// Type Schema Reloation

export interface TypeRelation {
    parent: Identifier;
    child: Identifier;
}

export const resourceRelatives = (schemas: TypeSchema[]): TypeRelation[] => {
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

export const resourceChildren = (relatives: TypeRelation[], id: Identifier): Identifier[] => {
    return relatives.filter((relative) => relative.parent.name === id.name).map((relative) => relative.child);
};
