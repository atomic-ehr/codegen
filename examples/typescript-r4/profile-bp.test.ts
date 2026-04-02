/**
 * FHIR R4 Blood Pressure Profile Class API Tests
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { observation_bpProfile as bpProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_observation_bp";

describe("demo: create a blood pressure observation", () => {
    test("build a valid BP resource step by step", () => {
        // Create a new BP profile — auto-sets code, category, and component stubs
        const profile = bpProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });

        // Not yet valid: effective[x] is required by the vitalsigns base profile
        expect(profile.validate().errors).toEqual([
            "observation-bp: at least one of effectiveDateTime, effectivePeriod is required",
        ]);

        // Fill in the remaining required fields
        profile
            .setEffectiveDateTime("2024-06-15")
            .setSystolicBP({ value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" })
            .setDiastolicBP({ value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" });

        // Now the resource is fully valid
        expect(profile.validate().errors).toEqual([]);
        expect(profile.toResource()).toMatchSnapshot();
    });
});

describe("demo: apply BP profile to an existing Observation", () => {
    test("wrap a plain Observation and populate profiled fields", () => {
        // Start with an existing Observation — e.g. received from another system
        const obs: Observation = {
            resourceType: "Observation",
            status: "preliminary",
            code: { coding: [{ code: "85354-9", system: "http://loinc.org" }] },
            subject: { reference: "Patient/pt-1" },
        };

        // apply() adds meta.profile, sets fixed values (code), and auto-populates required slices
        const profile = bpProfile.apply(obs);

        // Not yet valid: effective[x] is required
        expect(profile.validate().errors).toEqual([
            "observation-bp: at least one of effectiveDateTime, effectivePeriod is required",
        ]);

        // The profile mutates the original resource — no copy is made
        expect(profile.toResource()).toBe(obs);
        expect(obs.meta?.profile).toContain("http://hl7.org/fhir/StructureDefinition/bp");

        // Fill in the remaining fields via fluent setters
        profile
            .setStatus("final")
            .setEffectiveDateTime("2024-06-15")
            .setSystolicBP({ value: 120, unit: "mmHg" })
            .setDiastolicBP({ value: 80, unit: "mmHg" });

        expect(profile.validate().errors).toEqual([]);
    });
});

// Note: from() demo is omitted for R4 BP because the R4 component slice discriminator stores
// code.coding as a plain object (not an array) — a known upstream issue in the R4 FHIR schema.
// See the US Core BP test for a from() demo that works with correct array-shaped discriminators.

describe("component slice replacement", () => {
    test("setSystolicBP replaces existing stub, component stays at 2", () => {
        const profile = bpProfile.create({ status: "final", subject: { reference: "Patient/pt-1" } });
        expect(profile.toResource().component).toHaveLength(2);

        profile.setSystolicBP({ value: 130, unit: "mmHg" });
        expect(profile.toResource().component).toHaveLength(2);
        expect(profile.getSystolicBP()!.value).toBe(130);
    });
});

describe("category auto-population", () => {
    test("custom category is preserved, VSCat is appended", () => {
        const profile = bpProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
            category: [{ text: "My Category" }],
        });
        const obs = profile.toResource();
        expect(obs.category).toHaveLength(2);
        expect(obs.category![0]!.text).toBe("My Category");
        expect(obs.category![1]!.coding).toEqual([
            { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
        ]);
    });

    test("existing VSCat is not duplicated", () => {
        const profile = bpProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
            category: [
                {
                    coding: [
                        { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
                    ],
                },
            ],
        });
        expect(profile.toResource().category).toHaveLength(1);
    });
});
