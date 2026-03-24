import {
    type CanonicalUrl,
    type Field,
    type Identifier,
    isChoiceDeclarationField,
    isLogicalTypeSchema,
    isPrimitiveTypeSchema,
    isProfileTypeSchema,
    isSpecializationTypeSchema,
    isValueSetTypeSchema,
    type NestedTypeSchema,
    type PkgName,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { LogicalPromotionConf } from "./types";

export const promoteLogical = (tsIndex: TypeSchemaIndex, promotes: LogicalPromotionConf): TypeSchemaIndex => {
    const promoteSets: Record<PkgName, Set<CanonicalUrl>> = Object.fromEntries(
        Object.entries(promotes).map(([pkg, urls]) => [pkg, new Set(urls)]),
    );

    const identifierToString = (i: TypeIdentifier): string => `${i.package}-${i.version}-${i.kind}-${i.url}`;
    const renames: Record<string, TypeIdentifier> = Object.fromEntries(
        tsIndex.schemas
            .map((schema) => {
                const promo = promoteSets[schema.identifier.package]?.has(schema.identifier.url);
                if (!promo) return undefined;
                if (!isLogicalTypeSchema(schema))
                    throw new Error(`Unexpected schema kind: ${JSON.stringify(schema.identifier)}`);
                return [identifierToString(schema.identifier), { ...schema.identifier, kind: "resource" }] as const;
            })
            .filter((e) => e !== undefined),
    );
    const replace = (i: TypeIdentifier): TypeIdentifier => renames[identifierToString(i)] || i;
    const replaceInFields = (fields: Record<string, Field> | undefined) => {
        if (!fields) return undefined;
        return Object.fromEntries(
            Object.entries(fields).map(([k, f]) => {
                if (isChoiceDeclarationField(f)) return [k, f];
                return [k, { ...f, type: f.type ? replace(f.type as Identifier) : undefined }];
            }),
        );
    };

    const schemas = tsIndex.schemas.map((schema) => {
        if (isPrimitiveTypeSchema(schema) || isValueSetTypeSchema(schema)) return schema;

        const cloned = JSON.parse(JSON.stringify(schema));
        cloned.identifier = replace(cloned.identifier);
        cloned.dependencies = cloned.dependencies?.map(replace);
        if (isSpecializationTypeSchema(cloned) || isProfileTypeSchema(cloned)) {
            cloned.fields = replaceInFields(cloned.fields);
            cloned.nested = cloned.nested?.map((n: NestedTypeSchema) => {
                return {
                    ...n,
                    base: replace(n.base),
                    fields: replaceInFields(n.fields),
                };
            });
        }
        return cloned;
    });

    const promotedIndex = tsIndex.replaceSchemas(schemas);
    promotedIndex.irReport().logicalPromotion = {
        packages: Object.fromEntries(
            Object.entries(promotes).map(([pkgName, urls]) => [pkgName, { promotedCanonicals: [...urls].sort() }]),
        ),
    };
    return promotedIndex;
};
