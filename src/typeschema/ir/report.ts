import type { CanonicalUrl, PkgName } from "@root/typeschema/types";
import { extractNameFromCanonical } from "@root/typeschema/types";
import type { IrReport, TreeShakeReport, TypeSchemaCollisions } from "./types";

type TreeShakePackageReport = TreeShakeReport["packages"][PkgName];
type CollisionEntry = TypeSchemaCollisions[PkgName][CanonicalUrl][number];

const generateSkippedPackagesSection = (lines: string[], skippedPackages: string[]): void => {
    lines.push("## Skipped Packages", "");
    for (const pkg of skippedPackages) {
        lines.push(`- ${pkg}`);
    }
    lines.push("");
};

const generatePackageSection = (
    lines: string[],
    pkgName: PkgName,
    treeShakePkg: TreeShakePackageReport | undefined,
    promotedCanonicals: string[] | undefined,
): void => {
    lines.push(`## Package: \`${pkgName}\``, "");

    if (promotedCanonicals?.length) {
        lines.push("### Promoted Logical Models", "");
        for (const canonical of promotedCanonicals) {
            lines.push(`- \`${canonical}\``);
        }
        lines.push("");
    }

    if (!treeShakePkg) return;

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
};

const generateCollisionVersionLines = (entries: CollisionEntry[]): string[] => {
    const uniqueSchemas = new Map<string, CollisionEntry[]>();
    for (const entry of entries) {
        const key = JSON.stringify(entry.typeSchema);
        if (!uniqueSchemas.has(key)) uniqueSchemas.set(key, []);
        uniqueSchemas.get(key)?.push(entry);
    }

    const versionLines: string[] = [];
    const sortedVersions = [...uniqueSchemas.values()].sort((a, b) => b.length - a.length);
    let version = 1;
    for (const schemaEntries of sortedVersions) {
        const sourceList = schemaEntries
            .map((e) => {
                const name = extractNameFromCanonical(e.sourceCanonical as CanonicalUrl) ?? e.sourceCanonical;
                return `${name} (${e.sourcePackage})`;
            })
            .join(", ");
        versionLines.push(`  - Version ${version++}: ${sourceList}`);
    }
    return versionLines;
};

const generateCollisionsSection = (lines: string[], collisions: IrReport["collisions"]): void => {
    if (!collisions) return;

    lines.push("## Schema Collisions", "");
    lines.push("The following canonicals have multiple schema versions with different content.");
    lines.push("To inspect collision versions, export TypeSchemas using `.introspection({ typeSchemas: 'path' })`");
    lines.push("and check `<pkg>/collisions/<name>/1.json, 2.json, ...` files.", "");

    const collisionPackages = Object.keys(collisions).sort();
    for (const pkgName of collisionPackages) {
        const collisionsPkg = collisions[pkgName as PkgName];
        if (!collisionsPkg) throw new Error(`Missing collisions for package ${pkgName}`);

        const sortedEntries = Object.entries(collisionsPkg).sort(([a], [b]) => {
            const nameA = a.split("/").pop() ?? a;
            const nameB = b.split("/").pop() ?? b;
            return nameA.localeCompare(nameB);
        });

        if (sortedEntries.length > 0) {
            lines.push(`### \`${pkgName}\``, "");
            for (const [canonical, entries] of sortedEntries) {
                const versionLines = generateCollisionVersionLines(entries);
                lines.push(`- \`${canonical}\` (${versionLines.length} versions)`);
                lines.push(...versionLines);
            }
            lines.push("");
        }
    }
};

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
        generateSkippedPackagesSection(lines, report.treeShake.skippedPackages);
    }

    for (const pkgName of irPackages) {
        generatePackageSection(
            lines,
            pkgName,
            report.treeShake?.packages[pkgName],
            report.logicalPromotion?.packages[pkgName]?.promotedCanonicals,
        );
    }

    if (hasCollisions) {
        generateCollisionsSection(lines, report.collisions);
    }

    return lines.join("\n");
};
