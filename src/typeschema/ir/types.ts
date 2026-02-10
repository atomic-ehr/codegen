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

export type IrConf = {
    treeShake?: TreeShakeConf;
    promoteLogical?: LogicalPromotionConf;
};

export type LogicalPromotionConf = Record<PkgName, CanonicalUrl[]>;

export type TreeShakeConf = Record<string, Record<string, TreeShakeRule>>;

export type TreeShakeRule = { ignoreFields?: string[]; selectFields?: string[] };

export type IrReport = {
    treeShake?: TreeShakeReport;
    logicalPromotion?: LogicalPromotionReport;
    collisions?: TypeSchemaCollisions;
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
