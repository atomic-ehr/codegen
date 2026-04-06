/**
 * US Core Body Weight Profile Class API Tests
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

describe("demo: apply US Core body weight profile to an existing Observation", () => {
    test("wrap a plain Observation and populate profiled fields", () => {
        // Start with an existing Observation — e.g. received from another system
        const obs: Observation = {
            resourceType: "Observation",
            status: "preliminary",
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            subject: { reference: "Patient/pt-1" },
        };

        // apply() adds meta.profile, sets fixed values (code), and auto-populates required slices
        const profile = USCoreBodyWeightProfile.apply(obs);

        // Not yet valid: effective[x] is required
        expect(profile.validate().errors).toEqual([
            "USCoreBodyWeightProfile: at least one of effectiveDateTime, effectivePeriod is required",
        ]);

        // The profile mutates the original resource — no copy is made
        expect(profile.toResource()).toBe(obs);
        expect(obs.meta?.profile).toContain("http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight");

        // Fill in the remaining fields via fluent setters
        profile
            .setStatus("final")
            .setEffectiveDateTime("2024-06-15")
            .setValueQuantity({ value: 75, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" });

        expect(profile.validate().errors).toEqual([]);
    });
});

describe("demo: read a US Core body weight observation from JSON", () => {
    test("parse an API response and use typed getters", () => {
        const json: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight"] },
            status: "final",
            category: [
                {
                    coding: [
                        { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
                    ],
                    text: "Vital Signs",
                },
            ],
            code: { coding: [{ code: "29463-7", system: "http://loinc.org", display: "Body weight" }] },
            subject: { reference: "Patient/pt-1" },
            effectiveDateTime: "2024-06-15",
            valueQuantity: { value: 75, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" },
        };

        // from() validates the resource against the profile before wrapping
        const profile = USCoreBodyWeightProfile.from(json);

        // Typed getters provide direct access to profiled fields
        expect(profile.getStatus()).toBe("final");
        expect(profile.getSubject()!.reference).toBe("Patient/pt-1");
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15");
        expect(profile.getValueQuantity()!.value).toBe(75);
        expect(profile.getValueQuantity()!.unit).toBe("kg");

        // Code is a fixed value — auto-set by the profile, read-only (no setter)
        expect(profile.getCode()!.coding![0]!.code).toBe("29463-7");

        // getVSCat() returns SliceFlat — typed with readonly discriminator literals
        // Discriminator keys are stripped at runtime, user data remains
        expect(profile.getVSCat()!.text).toBe("Vital Signs");

        // getVSCat("raw") returns the full CodeableConcept including discriminator
        expect(profile.getVSCat("raw")!.coding).toEqual([
            { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
        ]);
    });
});

describe("slice input/flat type split", () => {
    test("setVSCat accepts SliceFlatInput, getVSCat returns SliceFlat", () => {
        const profile = USCoreBodyWeightProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });

        // setVSCat accepts SliceFlatInput — only user data, discriminators auto-applied
        profile.setVSCat({ text: "Vital Signs" });

        // getVSCat() returns SliceFlat — includes readonly discriminator type info
        const flat = profile.getVSCat()!;
        expect(flat.text).toBe("Vital Signs");

        // getVSCat("raw") returns the full CodeableConcept with discriminator values
        expect(profile.getVSCat("raw")!.coding).toEqual([
            { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
        ]);
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
