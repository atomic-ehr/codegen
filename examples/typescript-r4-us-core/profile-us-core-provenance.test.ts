/**
 * US Core Provenance Profile Class API Tests
 *
 * US Core restates `Provenance.target`, whose base type is `Reference(Any)` —
 * its only declared target is the abstract `Resource` type, which admits a
 * reference to any resource. The generator expands that family into its member
 * resources, so the emitted check lists the instantiable types a reference can
 * actually have — the abstract Resource and DomainResource are left out.
 *
 * The check still never runs, though: `target` is `1..*`, and the helper reads
 * `.reference` from the array itself rather than from each entry.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Provenance } from "./fhir-types/hl7-fhir-r4-core/Provenance";
import { USCoreProvenanceProfile } from "./fhir-types/hl7-fhir-us-core/profiles/Provenance_USCoreProvenance";

const generatedSource = readFileSync(
    new URL("./fhir-types/hl7-fhir-us-core/profiles/Provenance_USCoreProvenance.ts", import.meta.url),
    "utf8",
);

const baseArgs = {
    recorded: "2024-06-15T10:00:00Z",
    agent: [{ who: { reference: "Practitioner/pr-1" as const } }],
};

describe("demo: record provenance for a resource", () => {
    test("build a provenance resource targeting a Patient", () => {
        const profile = USCoreProvenanceProfile.create({
            ...baseArgs,
            target: [{ reference: "Patient/pt-1" }],
        });

        expect(profile.validate().errors).toEqual([]);
        expect(profile.toResource()).toMatchSnapshot();
    });
});

describe("the generated reference check on target never runs", () => {
    test("the generated validation lists the member resource types", () => {
        expect(generatedSource).toContain(
            'validateReference(res, profileName, "target", ["Bundle","CodeSystem","Observation","OperationOutcome","Patient","Provenance"])',
        );
    });

    // `target` is an array, so the emitted check cannot fail for any input —
    // not even a reference to something that is not a FHIR resource at all.
    test.each(["Patient/pt-1", "Organization/org-1", "NotAResource/x"])(
        "a target referencing %s reports no error",
        (reference) => {
            const profile = USCoreProvenanceProfile.create({ ...baseArgs, target: [{ reference }] });

            expect(profile.validate().errors).toEqual([]);
        },
    );

    // Reaching the same check with a single value instead of an array (an
    // invalid cardinality, used here only to make the check execute) shows what
    // it does when it runs: an allowed resource passes, a type that is not a
    // resource does not.
    const singleTarget = (reference: string) =>
        ({ resourceType: "Provenance", ...baseArgs, target: { reference } }) as unknown as Provenance;

    test("the check accepts an allowed resource once it executes", () => {
        expect(new USCoreProvenanceProfile(singleTarget("Patient/pt-1")).validate().errors).toEqual([]);
    });

    test("the check rejects a type that is not a resource once it executes", () => {
        expect(new USCoreProvenanceProfile(singleTarget("NotAResource/x")).validate().errors).toEqual([
            "USCoreProvenance: field 'target' references 'NotAResource' but only Bundle, CodeSystem, Observation, OperationOutcome, Patient, Provenance are allowed",
        ]);
    });
});
