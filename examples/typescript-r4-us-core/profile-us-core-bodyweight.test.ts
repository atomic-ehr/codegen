/**
 * US Core Body Weight Profile Class API Tests
 *
 * The general profile-class API (apply/from/slice accessors) is demonstrated in
 * profile-r4-bodyweight.test.ts against the base R4 profile. This file keeps one
 * self-contained create demo plus the scenarios specific to US Core body weight,
 * which constrains value[x] to valueQuantity.
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { USCoreBodyWeightProfile } from "./fhir-types/hl7-fhir-us-core/profiles";

describe("demo: create a US Core body weight observation", () => {
    test("build a valid body weight resource step by step", () => {
        // Create a new body weight profile — auto-sets code and category
        const profile = USCoreBodyWeightProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });

        // Not yet valid: effective[x] is required by the vitalsigns base profile
        expect(profile.validate().errors).toEqual([
            "USCoreBodyWeightProfile: at least one of effectiveDateTime, effectivePeriod is required",
        ]);

        // Fill in the remaining required fields
        profile
            .setEffectiveDateTime("2024-06-15")
            .setValueQuantity({ value: 75, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" });

        // Now the resource is fully valid
        expect(profile.validate().errors).toEqual([]);
        expect(profile.toResource()).toMatchSnapshot();
    });
});

describe("validation", () => {
    test("catches disallowed value[x] variants", () => {
        const resource: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight"] },
            status: "final",
            category: [
                {
                    coding: [
                        { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
                    ],
                },
            ],
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            subject: { reference: "Patient/pt-1" },
            effectiveDateTime: "2024-06-15",
            valueString: "not allowed",
        };

        const profile = USCoreBodyWeightProfile.apply(resource);
        const { errors } = profile.validate();
        expect(errors).toContain("USCoreBodyWeightProfile: field 'valueString' must not be present");
    });
});

describe("value[x] choice is mutually exclusive on a constrained profile", () => {
    test("switching variants clears the previous one, even when the declaration narrows value[x]", () => {
        // Body weight constrains value[x] to valueQuantity, so the choice
        // declaration lists only that variant — but the base value* instances
        // still have setters. Mutual exclusion must hold across all of them,
        // not just the single declared variant.
        const profile = USCoreBodyWeightProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });

        // Two variants that are NOT the declared one — neither cleared the other
        // before the fix (siblings were derived from the narrowed declaration).
        profile.setValueString("first");
        profile.setValueCodeableConcept({ text: "second" });
        expect(profile.getValueString()).toBeUndefined();
        expect(profile.getValueCodeableConcept()).toEqual({ text: "second" });

        // The declared variant clears the others too.
        profile.setValueQuantity({ value: 70, unit: "kg" });
        const resource = profile.toResource();
        const valueKeys = Object.keys(resource).filter((k) => k.startsWith("value"));
        expect(valueKeys).toEqual(["valueQuantity"]);
    });
});
