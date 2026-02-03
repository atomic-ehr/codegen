import type { PkgName } from "@root/typeschema/types";
import type { IrReport } from "./types";

export const generateIrReportReadme = (report: IrReport): string => {
    const lines: string[] = ["# IR Report", ""];

    const allPackages = new Set<PkgName>([
        ...Object.keys(report.treeShake?.packages ?? {}),
        ...Object.keys(report.logicalPromotion?.packages ?? {}),
    ]);

    if (allPackages.size === 0) {
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

    for (const pkgName of [...allPackages].sort()) {
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

    return lines.join("\n");
};
