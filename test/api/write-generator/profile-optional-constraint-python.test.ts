import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-optional-constraint");

/**
 * The Python side of the fixture the TypeScript optional-constraint test uses,
 * pinning what the Python writer emits today — the defect included.
 *
 * `ServiceRequest.category` is 0..* with a `patternCodeableConcept`, but the
 * emitted `validate_fixed_value` call carries no arity, so the helper falls back
 * to `matches_value`'s "some repetition conforms" reading where FHIR applies a
 * constraint declared on a repeating element to every one of them.
 */
describe("Python optional and repeating profile constraints", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.optionalconstraint", version: "0.1.0" },
            path: FIXTURE_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .python({ inMemoryOnly: true, generateProfile: true, client: "none" })
        .generate();

    const profileKey =
        "generated/example_test_optionalconstraint/profiles/service_request_optional_category_service_request.py";
    const profileFile = result.filesGenerated.python?.[profileKey];

    it("should succeed", () => {
        expect(result.success).toBeTrue();
        expect(profileFile).toBeDefined();
    });

    it("matches snapshot", () => {
        expect(profileFile).toMatchSnapshot();
    });
});
