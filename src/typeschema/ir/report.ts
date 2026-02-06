import type { PkgName } from "@root/typeschema/types";
import type { IrReport } from "./types";

export const generateIrReportReadme = (report: IrReport): string => {
    const lines: string[] = ["# IR Report", ""];

    const irPackages = [
        ...new Set<PkgName>([
            ...Object.keys(report.treeShake?.packages ?? {}),
            ...Object.keys(report.logicalPromotion?.packages ?? {}),
        ]),
    ].sort();

    const hasIrChanges = irPackages.length > 0 || (report.treeShake?.skippedPackages.length ?? 0) > 0;
    const hasCollisions = Object.keys(report.collisions ?? {}).length > 0;

    if (!hasIrChanges && !hasCollisions) {
        lines.push("No IR modifications applied.");
        return lines.join("\n");
    }

    if (report.treeShake?.skippedPackages.length) {
        lines.push("## Skipped Packages", "");
        for (const pkg of report.treeShake.skippedPackages) {
            lines.push(`- ${pkg}`);
        }
        lines.push("");
    }

    for (const pkgName of irPackages) {
        lines.push(`## Package: \`${pkgName}\``, "");

        const treeShakePkg = report.treeShake?.packages[pkgName];
        const logicalPromotionPkg = report.logicalPromotion?.packages[pkgName];

        if (logicalPromotionPkg?.promotedCanonicals.length) {
            lines.push("### Promoted Logical Models", "");
            for (const canonical of logicalPromotionPkg.promotedCanonicals) {
                lines.push(`- \`${canonical}\``);
            }
            lines.push("");
        }

        if (treeShakePkg) {
            const canonicalsWithChanges = Object.entries(treeShakePkg.canonicals).filter(
                ([_, data]) => data.skippedFields.length > 0,
            );

            if (canonicalsWithChanges.length > 0) {
                lines.push("### Modified Canonicals", "");
                for (const [canonical, data] of canonicalsWithChanges) {
                    lines.push(`#### \`${canonical}\``, "");
                    lines.push("Skipped fields:", "");
                    for (const field of data.skippedFields) {
                        lines.push(`- \`${field}\``);
                    }
                    lines.push("");
                }
            }

            if (treeShakePkg.skippedCanonicals.length > 0) {
                lines.push("### Skipped Canonicals", "");
                for (const canonical of treeShakePkg.skippedCanonicals) {
                    lines.push(`- \`${canonical}\``);
                }
                lines.push("");
            }
        }
    }

    if (hasCollisions && report.collisions) {
        lines.push("## Schema Collisions", "");
        lines.push("The following canonicals have multiple schema versions with different content.");
        lines.push("To inspect collision versions, export TypeSchemas using `.introspection({ typeSchemas: 'path' })`");
        lines.push("and check `{pkg}-collisions/{name}/1.json, 2.json, ...` files.", "");

        const collisionPackages = Object.keys(report.collisions).sort();
        for (const pkgName of collisionPackages) {
            const collisionsPkg = report.collisions[pkgName as PkgName];
            if (!collisionsPkg) throw new Error(`Missing collisions for package ${pkgName}`);
            const sortedEntries = Object.entries(collisionsPkg).sort(([a], [b]) => {
                const nameA = a.split("/").pop() ?? a;
                const nameB = b.split("/").pop() ?? b;
                return nameA.localeCompare(nameB);
            });

            if (sortedEntries.length > 0) {
                lines.push(`### \`${pkgName}\``, "");
                for (const [canonical, versions] of sortedEntries) {
                    lines.push(`- \`${canonical}\` (${versions.length} versions)`);
                }
                lines.push("");
            }
        }
    }

    return lines.join("\n");
};
