/**
 * US Core Provenance Profile Class API Tests
 *
 * US Core restates `Provenance.target`, whose base type is `Reference(Any)` —
 * its only declared target is the abstract `Resource` type, which admits a
 * reference to any resource. The generator expands that family into its member
 * resources, so the emitted check lists the instantiable types a reference can
 * actually have — the abstract Resource and DomainResource are left out.
 *
 * `target` is `1..*`, so the element holds a list of References; the check reads
 * every entry.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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

describe("the generated reference check on target", () => {
    test("the generated validation lists the member resource types", () => {
        expect(generatedSource).toContain(
            'validateReference(res, profileName, "target", ["Bundle","CodeSystem","Observation","OperationOutcome","Patient","Provenance"])',
        );
    });

    test("an allowed target passes", () => {
        const profile = USCoreProvenanceProfile.create({ ...baseArgs, target: [{ reference: "Patient/pt-1" }] });

        expect(profile.validate().errors).toEqual([]);
    });

    test.each(["Organization/org-1", "NotAResource/x"])("a target referencing %s is reported", (reference) => {
        const profile = USCoreProvenanceProfile.create({ ...baseArgs, target: [{ reference }] });

        expect(profile.validate().errors).toEqual([
            `USCoreProvenance: field 'target' references '${reference.split("/")[0]}' but only Bundle, CodeSystem, Observation, OperationOutcome, Patient, Provenance are allowed`,
        ]);
    });

    test("every entry of the list is checked, not just the first", () => {
        const profile = USCoreProvenanceProfile.create({
            ...baseArgs,
            target: [{ reference: "Patient/pt-1" }, { reference: "NotAResource/x" }],
        });

        expect(profile.validate().errors).toEqual([
            "USCoreProvenance: field 'target' references 'NotAResource' but only Bundle, CodeSystem, Observation, OperationOutcome, Patient, Provenance are allowed",
        ]);
    });

    // One error per offending type, so a list of many wrong references of the
    // same type does not bury the rest of validate()'s output.
    test("a repeated offending type is reported once", () => {
        const profile = USCoreProvenanceProfile.create({
            ...baseArgs,
            target: [{ reference: "NotAResource/x" }, { reference: "NotAResource/y" }],
        });

        expect(profile.validate().errors).toHaveLength(1);
    });
});
