import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-optional-constraint");

/**
 * Regression, the Python twin of the TypeScript optional/repeating constraint
 * fixes: a `fixed[x]` / `pattern[x]` constraint has to carry the element's
 * declared arity, because the instance shape alone cannot tell an array-valued
 * element from a wrong value on a single one. Without it Python meant "some
 * repetition conforms" where FHIR means "every one does".
 *
 * The fixture is the StructureDefinition of the TypeScript test, so the fix has
 * to hold for the same profile on both sides.
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

    it("flags a constraint on a repeating element as repeating", () => {
        expect(profileFile).toContain(
            'validate_fixed_value(self._resource, profile_name, "category", {"coding":[{"system":"http://example.test/category","code":"example"}]}, True)',
        );
    });

    it("leaves a constraint on a single-valued element without an arity flag", () => {
        expect(profileFile).toContain('validate_fixed_value(self._resource, profile_name, "doNotPerform", False)');
        expect(profileFile).toContain('validate_fixed_value(self._resource, profile_name, "intent", "order")');
    });

    it("matches snapshot", () => {
        expect(profileFile).toMatchSnapshot();
    });
});
