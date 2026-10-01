import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder, prettyReport } from "@root/api/builder";
import { type CodegenLogManager, mkCodegenLogger } from "@root/utils/log";
import { mkErrorLogger } from "@typeschema-test/utils";

const generateWidenedRelatedPerson = (logger: CodegenLogManager) =>
    new APIBuilder({ logger })
        .localStructureDefinitions({
            package: { name: "example.test.referencewidening", version: "0.1.0" },
            path: Path.join(__dirname, "../../assets/profile-reference-widening"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typeSchema({
            treeShake: {
                "example.test.referencewidening": {
                    "http://example.test/StructureDefinition/widened-related-person": {},
                },
            },
        })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();

describe("generation report warnings", async () => {
    const report = await generateWidenedRelatedPerson(mkErrorLogger());

    it("succeeds for a profile that widens a reference target", () => {
        expect(report.success).toBe(true);
    });

    const warning =
        "Profile 'WidenedRelatedPerson' (http://example.test/StructureDefinition/widened-related-person) declares reference target(s) http://hl7.org/fhir/StructureDefinition/Person on 'patient' that an ancestor prohibits; they stay prohibited (allowed: Patient). Fix the package with canonicalManager.patches";

    it("reports the dropped reference target as a warning", () => {
        expect(report.warnings).toEqual([warning]);
        expect(prettyReport(report)).toContain(`Warnings: ${warning}`);
    });
});

describe("generation report warnings for a suppressed tag", async () => {
    const report = await generateWidenedRelatedPerson(
        mkCodegenLogger({ level: "ERROR", suppressTags: ["#nonMonotonicReference"] }),
    );

    it("leaves the suppressed warning out of the report", () => {
        expect(report.success).toBe(true);
        expect(report.warnings).toEqual([]);
    });
});
