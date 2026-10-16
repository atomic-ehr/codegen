import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-empty-validate");

/**
 * A profile that constrains nothing `validate()` checks still gets a
 * `validate()` method, with no checks in its body. `profile_name` is only
 * passed to checks, so it is declared only when there is one (ruff F841).
 */
describe("Python profile with nothing to validate", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.emptyvalidate", version: "0.1.0" },
            path: FIXTURE_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .python({ inMemoryOnly: true, generateProfile: true, client: "none" })
        .generate();

    const profileKey = "generated/example_test_emptyvalidate/profiles/patient_unconstrained_patient.py";
    const profileFile = result.filesGenerated.python?.[profileKey];

    it("should succeed", () => {
        expect(result.success).toBeTrue();
        expect(profileFile).toBeDefined();
    });

    it("does not declare profile_name without checks", () => {
        expect(profileFile).not.toContain("profile_name");
    });

    it("matches snapshot", () => {
        expect(profileFile).toMatchSnapshot();
    });
});
