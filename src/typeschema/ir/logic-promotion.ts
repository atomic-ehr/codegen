import {
    type CanonicalUrl,
    type Field,
    type Identifier,
    isChoiceDeclarationField,
    isLogicalTypeSchema,
    isNestedTypeSchema,
    isPrimitiveTypeSchema,
    isProfileNestedTypeSchema,
    isProfileTypeSchema,
    isSpecializationTypeSchema,
    isValueSetTypeSchema,
    type PkgName,
    type SpecializationIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { LogicalPromotionConf } from "./types";

export const promoteLogical = (tsIndex: TypeSchemaIndex, promotes: LogicalPromotionConf): TypeSchemaIndex => {
    const promoteSets: Record<PkgName, Set<CanonicalUrl>> = Object.fromEntries(
        Object.entries(promotes).map(([pkg, urls]) => [pkg, new Set(urls)]),
    );

    const identifierToString = (i: Identifier): string => `${i.package}-${i.version}-${i.kind}-${i.url}`;
    const renames: Record<string, Identifier> = Object.fromEntries(
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
    const replace = (i: Identifier): Identifier => renames[identifierToString(i)] || i;
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
        if (
            isSpecializationTypeSchema(cloned) ||
            isProfileTypeSchema(cloned) ||
            isNestedTypeSchema(cloned) ||
            isProfileNestedTypeSchema(cloned)
        ) {
            cloned.fields = replaceInFields(cloned.fields);
            // A promoted logical model becomes a resource, still a specialization; profiles aren't promoted.
            if (isNestedTypeSchema(cloned)) cloned.declaredIn = replace(cloned.declaredIn) as SpecializationIdentifier;
            if (isNestedTypeSchema(cloned) || isProfileNestedTypeSchema(cloned)) {
                cloned.base = cloned.base ? replace(cloned.base) : undefined;
            }
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
