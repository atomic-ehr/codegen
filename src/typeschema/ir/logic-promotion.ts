import {
    type CanonicalUrl,
    type Field,
    type Identifier,
    isChoiceDeclarationField,
    isPrimitiveTypeSchema,
    isProfileTypeSchema,
    isSpecializationTypeSchema,
    isValueSetTypeSchema,
    type NestedType,
    type PkgName,
} from "@root/typeschema/types";
import { mkTypeSchemaIndex, type TypeSchemaIndex } from "@root/typeschema/utils";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { LogicalPromotion } from "./types";

export const promoteLogical = (
    tsIndex: TypeSchemaIndex,
    promotes: LogicalPromotion,
    { logger }: { logger?: CodegenLogger },
): TypeSchemaIndex => {
    const promoteSets: Record<PkgName, Set<CanonicalUrl>> = Object.fromEntries(
        Object.entries(promotes).map(([pkg, urls]) => [pkg, new Set(urls)]),
    );

    const identifierToString = (i: Identifier): string => `${i.package}-${i.version}-${i.kind}-${i.url}`;
    const renames: Record<string, Identifier> = Object.fromEntries(
        tsIndex.schemas
            .map((schema) => {
                const promo = promoteSets[schema.identifier.package]?.has(schema.identifier.url);
                if (!promo) return undefined;
                if (schema.identifier.kind !== "logical")
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
                return [k, { ...f, type: f.type ? replace(f.type) : undefined }];
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
            cloned.nested = cloned.nested?.map((n: NestedType) => {
                return {
                    ...n,
                    base: replace(n.base),
                    nested: replaceInFields(n.fields),
                };
            });
        }
        return cloned;
    });
    const shakedIndex = mkTypeSchemaIndex(schemas, { register: tsIndex.register, logger });
    return shakedIndex;
};
