import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-boolean-discriminator");

/**
 * Regression: a slice discriminated by a boolean value.
 *
 * The discriminator match used to go out through `JSON.stringify`, so a
 * `fixedBoolean: true` landed in the generated module as the JavaScript literal
 * `true`. The static match is a class-body attribute, so the module raised
 * `NameError` while it was being imported, not when `validate()` ran.
 *
 * The fixture is a plain R4 differential: nothing restricts a `type: "value"`
 * discriminator to a string-typed element, and `Patient.communication.preferred`
 * is boolean.
 */
describe("Python slice discriminated by a boolean value", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.booleandiscriminator", version: "0.1.0" },
            path: FIXTURE_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .python({ inMemoryOnly: true, generateProfile: true, client: "none" })
        .generate();

    const profileKey =
        "generated/example_test_booleandiscriminator/profiles/patient_preferred_communication_patient.py";
    const profileFile = result.filesGenerated.python?.[profileKey];

    it("should succeed", () => {
        expect(result.success).toBeTrue();
        expect(profileFile).toBeDefined();
    });

    it("spells the discriminator of the static slice match as a Python literal", () => {
        expect(profileFile).toContain('_primary_slice_match: dict[str, Any] = {"preferred":True}');
    });

    it("spells the discriminator of the slice validation call as a Python literal", () => {
        expect(profileFile).toContain(
            'validate_slice_cardinality(self._resource, profile_name, "communication", {"preferred":True}, "primary", 1, 1)',
        );
    });

    it("emits no JavaScript literal anywhere in the module", () => {
        expect(profileFile).not.toMatch(/\btrue\b/);
        expect(profileFile).not.toMatch(/\bfalse\b/);
        expect(profileFile).not.toMatch(/\bnull\b/);
    });

    it("matches snapshot", () => {
        expect(profileFile).toMatchSnapshot();
    });
});
