import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-inherited-required");

/**
 * Regression for codegen-8iw: a profile whose differential does NOT re-state
 * a base-R4 required field (Provenance.target / .recorded) must still emit
 * validateRequired() for those fields in the generated validate() method.
 *
 * The fixture mirrors the real de.cognovis.fhir.praxis PraxisProposalProvenance
 * profile: its differential touches only activity, agent.role, agent.type, and
 * entity — target and recorded are inherited from base R4 Provenance.
 */
describe("Profile inherited base-required fields (codegen-8iw)", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "cognovis.test.praxis", version: "0.0.1" },
            path: FIXTURE_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();

    const profileKey = Object.keys(result.filesGenerated.typescript ?? {}).find((k) =>
        k.includes("Provenance_PraxisProposalProvenance"),
    );
    const profileFile = () => (profileKey ? result.filesGenerated.typescript![profileKey] : undefined);

    it("should succeed", () => {
        expect(result.success).toBeTrue();
    });

    it("generates the Provenance profile class", () => {
        expect(profileKey).toBeDefined();
    });

    it("emits validateRequired() for the differential-stated required fields", () => {
        const file = profileFile();
        expect(file).toBeDefined();
        expect(file).toContain('validateRequired(res, profileName, "activity")');
        expect(file).toContain('validateRequired(res, profileName, "agent")');
    });

    it("emits validateRequired() for base-R4 required fields the profile inherits", () => {
        const file = profileFile();
        expect(file).toBeDefined();
        // target and recorded are required by base R4 Provenance and are NOT
        // re-stated in the profile differential — these are the fields the bug
        // silently dropped before the inheritedRequiredFields fix.
        expect(file).toContain('validateRequired(res, profileName, "target")');
        expect(file).toContain('validateRequired(res, profileName, "recorded")');
    });
});
