import type { CanonicalUrl, PkgName } from "../types";

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
