/**
 * US Core Blood Pressure Profile Class API Tests
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { USCoreBloodPressureProfile } from "./fhir-types/hl7-fhir-us-core/profiles";

describe("demo: create a US Core blood pressure observation", () => {
    test("build a valid BP resource step by step", () => {
        // Create a new BP profile — auto-sets code, category, and component stubs
        const profile = USCoreBloodPressureProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });

        // Not yet valid: effective[x] and component valueQuantity are required
        expect(profile.validate().errors).toEqual([
            "USCoreBloodPressureProfile: at least one of effectiveDateTime, effectivePeriod is required",
            "USCoreBloodPressureProfile.component[systolic].valueQuantity is required",
            "USCoreBloodPressureProfile.component[diastolic].valueQuantity is required",
        ]);

        // Fill in the remaining required fields
        profile
            .setEffectiveDateTime("2024-06-15")
            .setSystolic({ value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" })
            .setDiastolic({ value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" });

        // Now the resource is fully valid
        expect(profile.validate().errors).toEqual([]);
        expect(profile.toResource()).toMatchSnapshot();
    });
});

describe("demo: apply US Core BP profile to an existing Observation", () => {
    test("wrap a plain Observation and populate profiled fields", () => {
        // Start with an existing Observation — e.g. received from another system
        const obs: Observation = {
            resourceType: "Observation",
            status: "preliminary",
            code: { coding: [{ code: "85354-9", system: "http://loinc.org" }] },
            subject: { reference: "Patient/pt-1" },
        };

        // apply() adds meta.profile, sets fixed values (code), and auto-populates required slices
        const profile = USCoreBloodPressureProfile.apply(obs);

        // Not yet valid: effective[x] and component valueQuantity are required
        expect(profile.validate().errors).toEqual([
            "USCoreBloodPressureProfile: at least one of effectiveDateTime, effectivePeriod is required",
            "USCoreBloodPressureProfile.component[systolic].valueQuantity is required",
            "USCoreBloodPressureProfile.component[diastolic].valueQuantity is required",
        ]);

        // The profile mutates the original resource — no copy is made
        expect(profile.toResource()).toBe(obs);
        expect(obs.meta?.profile).toContain("http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure");

        // Fill in the remaining fields via fluent setters
        profile
            .setStatus("final")
            .setEffectiveDateTime("2024-06-15")
            .setSystolic({ value: 120, unit: "mmHg" })
            .setDiastolic({ value: 80, unit: "mmHg" });

        expect(profile.validate().errors).toEqual([]);
    });
});

describe("demo: read a US Core blood pressure observation from JSON", () => {
    test("parse an API response and use typed getters", () => {
        const json: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure"] },
            status: "final",
            category: [
                {
                    coding: [
                        { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
                    ],
                    text: "Vital Signs",
                },
            ],
            code: { coding: [{ code: "85354-9", system: "http://loinc.org", display: "Blood pressure panel" }] },
            subject: { reference: "Patient/pt-1" },
            effectiveDateTime: "2024-06-15",
            component: [
                {
                    code: { coding: [{ code: "8480-6", system: "http://loinc.org" }] },
                    valueQuantity: { value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
                },
                {
                    code: { coding: [{ code: "8462-4", system: "http://loinc.org" }] },
                    valueQuantity: { value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
                },
            ],
        };

        // from() validates the resource against the profile before wrapping
        const profile = USCoreBloodPressureProfile.from(json);

        // Typed getters for profiled fields
        expect(profile.getStatus()).toBe("final");
        expect(profile.getSubject()!.reference).toBe("Patient/pt-1");
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15");

        // Component slice accessors — flat mode returns valueQuantity directly
        expect(profile.getSystolic()!.value).toBe(120);
        expect(profile.getDiastolic()!.value).toBe(80);

        // Raw mode returns the full component element including discriminator code
        expect(profile.getSystolic("raw")!.valueQuantity!.value).toBe(120);
        expect(profile.getSystolic("raw")!.code?.coding?.[0]?.code).toBe("8480-6");

        // Category slice — flat returns SliceFlat type, raw includes full element
        expect(profile.getVSCat()!.text).toBe("Vital Signs");
        expect(profile.getVSCat("raw")!.coding).toEqual([
            { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
        ]);
    });
});

describe("category auto-population", () => {
    test("custom category is preserved, VSCat is appended", () => {
        const profile = USCoreBloodPressureProfile.create({
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
        const profile = USCoreBloodPressureProfile.create({
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
