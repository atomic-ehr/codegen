import type { CanonicalUrl, PkgName } from "@root/typeschema/types";
import { extractNameFromCanonical } from "@root/typeschema/types";
import type {
    CollisionResolution,
    IrReport,
    ResolveCollisionsConf,
    TreeShakeReport,
    TypeSchemaCollisions,
} from "./types";

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

type VersionMark = "selected" | "auto" | undefined;
type VersionGroup = { entries: CollisionEntry[]; mark: VersionMark };

const groupCollisionVersions = (entries: CollisionEntry[], resolution?: CollisionResolution): VersionGroup[] => {
    const uniqueSchemas = new Map<string, CollisionEntry[]>();
    for (const entry of entries) {
        const key = JSON.stringify(entry.typeSchema);
        if (!uniqueSchemas.has(key)) uniqueSchemas.set(key, []);
        uniqueSchemas.get(key)?.push(entry);
    }

    const sorted = [...uniqueSchemas.values()].sort((a, b) => b.length - a.length);
    const markVersion = (group: CollisionEntry[], i: number): VersionMark => {
        if (resolution)
            return group.some(
                (e) => e.sourceCanonical === resolution.canonical && e.sourcePackage === resolution.package,
            )
                ? "selected"
                : undefined;
        return i === 0 ? "auto" : undefined;
    };
    return sorted.map((group, i) => ({ entries: group, mark: markVersion(group, i) }));
};

const versionMarkLabel: Record<string, string> = { selected: " (selected)", auto: " (auto)" };

const generateCollisionVersionLines = (versions: VersionGroup[]): string[] => {
    let version = 1;
    return versions.map((v) => {
        const sourceList = v.entries
            .map((e) => {
                const name = extractNameFromCanonical(e.sourceCanonical as CanonicalUrl) ?? e.sourceCanonical;
                return `${name} (${e.sourcePackage})`;
            })
            .join(", ");
        const mark = v.mark ? versionMarkLabel[v.mark] : "";
        return `  - Version ${version++}${mark}: ${sourceList}`;
    });
};

const generateCollisionsSection = (
    lines: string[],
    collisions: IrReport["collisions"],
    resolveCollisions?: ResolveCollisionsConf,
): void => {
    if (!collisions) return;

    lines.push("## Schema Collisions", "");
    lines.push("The following canonicals have multiple schema versions with different content.");
    lines.push("To inspect collision versions, export TypeSchemas using `.introspection({ typeSchemas: 'path' })`");
    lines.push("and check `<pkg>/collisions/<name>/1.json, 2.json, ...` files.", "");

    const allCollisions: { url: string; firstSource: CollisionEntry }[] = [];

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
                const versions = groupCollisionVersions(entries, resolveCollisions?.[canonical]);
                const versionLines = generateCollisionVersionLines(versions);
                lines.push(`- \`${canonical}\` (${versions.length} versions)`);
                lines.push(...versionLines);
                if (entries[0]) allCollisions.push({ url: canonical, firstSource: entries[0] });
            }
            lines.push("");
        }
    }

    if (allCollisions.length > 0) {
        const unresolved = allCollisions.filter((c) => !resolveCollisions?.[c.url]);
        if (unresolved.length > 0) {
            lines.push("### Suggested `resolveCollisions` config", "");
            lines.push("Add to `.typeSchema({ resolveCollisions: { ... } })` to resolve remaining collisions:", "");
            lines.push("```typescript");
            lines.push(".typeSchema({");
            lines.push("    resolveCollisions: {");
            for (const { url, firstSource } of unresolved) {
                lines.push(`        "${url}": {`);
                lines.push(`            package: "${firstSource.sourcePackage}",`);
                lines.push(`            canonical: "${firstSource.sourceCanonical}",`);
                lines.push("        },");
            }
            lines.push("    },");
            lines.push("})");
            lines.push("```", "");
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
        generateCollisionsSection(lines, report.collisions, report.resolveCollisions);
    }

    return lines.join("\n");
};
