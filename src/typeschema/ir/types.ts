import type { CanonicalUrl, PkgName } from "../types";

export type LogicalPromotion = Record<PkgName, CanonicalUrl[]>;

export type TreeShake = Record<string, Record<string, TreeShakeRule>>;

export type TreeShakeRule = { ignoreFields?: string[]; selectFields?: string[] };

export type IRReport = {
    treeShake: TreeShakeReport;
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
