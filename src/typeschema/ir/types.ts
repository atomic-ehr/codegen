import type { CanonicalUrl, PkgName, TypeSchema } from "../types";

export type TypeSchemaCollisions = Record<
    PkgName,
    Record<
        CanonicalUrl,
        {
            typeSchema: TypeSchema;
            sourcePackage: PkgName;
            sourceCanonical: CanonicalUrl;
        }[]
    >
>;

export type CollisionResolution = { package: string; canonical: string };
export type ResolveCollisionsConf = Record<string, CollisionResolution>;

export type IrConf = {
    treeShake?: TreeShakeConf;
    promoteLogical?: LogicalPromotionConf;
    resolveCollisions?: ResolveCollisionsConf;
};

export type LogicalPromotionConf = Record<PkgName, CanonicalUrl[]>;

export type TreeShakeConf = Record<string, Record<string, TreeShakeRule>>;

export type TreeShakeRule = { ignoreFields?: string[]; selectFields?: string[]; ignoreExtensions?: string[] };

export type IrReport = {
    treeShake?: TreeShakeReport;
    logicalPromotion?: LogicalPromotionReport;
    collisions?: TypeSchemaCollisions;
    resolveCollisions?: ResolveCollisionsConf;
};

export type LogicalPromotionReport = {
    packages: Record<
        PkgName,
        {
            promotedCanonicals: CanonicalUrl[];
        }
    >;
};

export type TreeShakeReport = {
    skippedPackages: PkgName[];
    packages: Record<
        PkgName,
        {
            skippedCanonicals: CanonicalUrl[];
            canonicals: Record<
                CanonicalUrl,
                {
                    skippedFields: string[];
                }
            >;
        }
    >;
};
