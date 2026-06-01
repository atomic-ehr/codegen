/**
 * PatientFixedMaritalStatus profile — demonstrates the corner case for a *true*
 * fixedCodeableConcept (FHIR `fixed[x]`, which has exact-equality semantics).
 *
 * The generator emits the same merging `applyFixedValue(...)` for `fixed[x]` as it does
 * for `pattern[x]` / slice discriminators. For a genuine `fixed[x]`, FHIR requires the
 * element to be *exactly equal* to the fixed value, so any conflicting or extra caller
 * data must be dropped. The generated code instead merges and keeps it — and `validate()`
 * accepts the result because `validateFixedValue` checks containment, not equality.
 *
 * These tests pin down that current behavior on real generated code, so a future fix that
 * branches on `valueConstraint.kind` ("fixed" -> replace, "pattern" -> merge) has a clear
 * failing anchor to update.
 */

import { describe, expect, test } from "bun:test";
import { PatientFixedMaritalStatusProfile } from "./fhir-types/example-folder-structures/profiles/Patient_PatientFixedMaritalStatus";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";

const maritalSystem = "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus";

describe("demo: create() materializes the fixed maritalStatus", () => {
    test("create() produces exactly the fixed CodeableConcept", () => {
        const profile = PatientFixedMaritalStatusProfile.create();
        const resource = profile.toResource();

        // Built from scratch, so the element equals exactly the fixed value.
        expect(resource.maritalStatus).toEqual({ coding: [{ system: maritalSystem, code: "M" }] });
        expect(profile.validate().errors).toEqual([]);
        expect(resource).toMatchSnapshot();
    });
});

describe("corner case: apply() merges a true fixed[x] instead of replacing it", () => {
    test("conflicting caller coding and text survive the fixed-value apply()", () => {
        // Caller already set maritalStatus to a *different* code in the same system, plus free text.
        const patient: Patient = {
            resourceType: "Patient",
            maritalStatus: {
                text: "Never married (caller-provided)",
                coding: [{ system: maritalSystem, code: "S" }],
            },
        };

        const profile = PatientFixedMaritalStatusProfile.apply(patient);
        const resource = profile.toResource();

        // FHIR `fixed[x]` would require: maritalStatus === { coding: [{ system, code: "M" }] }
        // i.e. the caller's text and the conflicting "S" coding dropped. Instead the merge keeps
        // the caller text and *appends* the fixed "M" coding next to the conflicting "S" one.
        expect(resource.maritalStatus).toEqual({
            text: "Never married (caller-provided)",
            coding: [
                { system: maritalSystem, code: "S" },
                { system: maritalSystem, code: "M" },
            ],
        });

        // ...and validate() passes anyway: validateFixedValue uses containment (matchesValue), so
        // the mere presence of the fixed coding satisfies it even though the resource is not
        // exactly equal to the fixed value a strict `fixed[x]` would mandate.
        expect(profile.validate().errors).toEqual([]);
        expect(resource).toMatchSnapshot();
    });
});
