import { describe, expect, it } from "bun:test";
import { type GenerationReport, prettyReport } from "@root/api/builder";

const mkReport = (overrides: Partial<GenerationReport> = {}): GenerationReport => ({
    success: true,
    outputDir: "./generated",
    filesGenerated: {},
    errors: [],
    warnings: [],
    duration: 42,
    ...overrides,
});

describe("prettyReport input fixes", () => {
    it("renders an Input fixes section for each report entry kind", () => {
        const report = mkReport({
            inputReport: [
                {
                    kind: "index-recovery",
                    package: { name: "de.basisprofil.r4", version: "1.6.0-ballot2" },
                    reason: "unparseable",
                    recovered: 120,
                },
                {
                    kind: "exclusion",
                    package: { name: "hl7.fhir.r4.core", version: "4.0.1" },
                    url: "http://example.org/StructureDefinition/broken",
                    reason: "references R5-only type",
                },
                { kind: "deprecation", message: "`ignorePackageIndex` is deprecated; use `packageIndex`." },
            ],
        });

        const out = prettyReport(report);
        expect(out).toContain("Input fixes (3):");
        expect(out).toContain("  - recovered index for de.basisprofil.r4@1.6.0-ballot2: unparseable, 120 resources");
        expect(out).toContain(
            "  - excluded http://example.org/StructureDefinition/broken (hl7.fhir.r4.core@4.0.1): references R5-only type",
        );
        expect(out).toContain("  - deprecation: `ignorePackageIndex` is deprecated; use `packageIndex`.");
    });

    it("omits the section when the input report is empty or absent", () => {
        expect(prettyReport(mkReport({ inputReport: [] }))).not.toContain("Input fixes");
        expect(prettyReport(mkReport())).not.toContain("Input fixes");
    });
});
