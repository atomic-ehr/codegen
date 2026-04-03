/**
 * FHIR R4 Bodyweight Profile Class API Tests
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { observation_bodyweightProfile as bodyweightProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight";

describe("demo: create a bodyweight observation", () => {
    test("build a valid bodyweight resource step by step", () => {
        // Create a new bodyweight profile — auto-sets code and category
        const profile = bodyweightProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });

        // Not yet valid: effective[x] is required by the vitalsigns base profile
        expect(profile.validate().errors).toEqual([
            "observation-bodyweight: at least one of effectiveDateTime, effectivePeriod is required",
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

describe("demo: apply bodyweight profile to an existing Observation", () => {
    test("wrap a plain Observation and populate profiled fields", () => {
        // Start with an existing Observation — e.g. received from another system
        const obs: Observation = {
            resourceType: "Observation",
            status: "preliminary",
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            subject: { reference: "Patient/pt-1" },
        };

        // apply() adds meta.profile, sets fixed values (code), and auto-populates required slices
        const profile = bodyweightProfile.apply(obs);

        // Not yet valid: effective[x] is required by the vitalsigns base profile
        expect(profile.validate().errors).toEqual([
            "observation-bodyweight: at least one of effectiveDateTime, effectivePeriod is required",
        ]);

        // The profile mutates the original resource — no copy is made
        expect(profile.toResource()).toBe(obs);
        expect(obs.meta?.profile).toContain("http://hl7.org/fhir/StructureDefinition/bodyweight");

        // Fill in the remaining fields via fluent setters
        profile
            .setStatus("final")
            .setEffectiveDateTime("2024-06-15")
            .setValueQuantity({ value: 75, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" });

        expect(profile.validate().errors).toEqual([]);
    });
});

describe("demo: read a bodyweight observation from JSON", () => {
    test("parse an API response and use typed getters", () => {
        const json: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/StructureDefinition/bodyweight"] },
            status: "final",
            category: [
                {
                    coding: [
                        { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
                    ],
                    text: "Vital Signs",
                },
            ],
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            subject: { reference: "Patient/pt-1" },
            effectiveDateTime: "2024-06-15",
            valueQuantity: { value: 75, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" },
        };

        // from() validates the resource against the profile before wrapping
        const profile = bodyweightProfile.from(json);

        // Typed getters provide direct access to profiled fields
        expect(profile.getStatus()).toBe("final");
        expect(profile.getSubject()!.reference).toBe("Patient/pt-1");
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15");
        expect(profile.getValueQuantity()!.value).toBe(75);
        expect(profile.getValueQuantity()!.unit).toBe("kg");

        // Code is a fixed value — auto-set by the profile, read-only (no setter)
        expect(profile.getCode()!.coding![0]!.code).toBe("29463-7");

        // Slice accessor strips discriminator keys (coding) by default — only user data remains
        expect(profile.getVSCat()).toEqual({ text: "Vital Signs" });
        // Use "raw" mode to see the full element including discriminator
        expect(profile.getVSCat("raw")!.coding).toEqual([
            { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
        ]);
        expect(profile.getVSCat("raw")!.text).toBe("Vital Signs");
    });
});

describe("factory method equivalence", () => {
    test("create(), createResource(), and apply() produce equal resources", () => {
        const args = { status: "final" as const, subject: { reference: "Patient/pt-1" as const } };

        const fromCreate = bodyweightProfile.create(args).toResource();
        const fromCreateResource = bodyweightProfile.createResource(args);
        const fromApply = bodyweightProfile
            .apply({ resourceType: "Observation", status: "preliminary", code: { text: "Body weight" } })
            .setStatus("final")
            .setSubject({ reference: "Patient/pt-1" })
            .toResource();

        expect(fromCreate).toEqual(fromCreateResource);
        expect(fromCreate).toEqual(fromApply);
    });
});

describe("slice accessors", () => {
    test("setVSCat merges discriminator and strips it in flat mode", () => {
        const profile = bodyweightProfile.create({ status: "final", subject: { reference: "Patient/pt-1" } });
        profile.setVSCat({ text: "Vital Signs" });

        expect(profile.getVSCat()).toEqual({ text: "Vital Signs" });
        expect(profile.getVSCat("raw")!.coding).toBeDefined();
        expect(profile.getVSCat("raw")!.text).toBe("Vital Signs");
    });

    test("SliceInput and SliceFlat types serve different purposes", () => {
        const profile = bodyweightProfile.create({ status: "final", subject: { reference: "Patient/pt-1" } });

        // setVSCat accepts SliceInput — no discriminator fields, they're auto-applied
        profile.setVSCat({ text: "Vital Signs" });

        // getVSCat() returns SliceInput — discriminator keys are stripped at runtime
        const flat = profile.getVSCat()!;
        expect(flat.text).toBe("Vital Signs");
        expect("coding" in flat).toBe(false);

        // SliceFlat type includes readonly discriminator literals for documentation:
        // type VSCatSliceFlat = VSCatSliceInput & { readonly coding: [{ code: "vital-signs"; ... }] }
        // It's available as a type-level reference but not used in getter/setter signatures
    });

    test("setVSCat replaces existing slice element", () => {
        const profile = bodyweightProfile.create({ status: "final", subject: { reference: "Patient/pt-1" } });
        profile.setVSCat({ text: "First" });
        profile.setVSCat({ text: "Second" });

        expect(profile.getVSCat()!.text).toBe("Second");
        expect(profile.toResource().category).toHaveLength(1);
    });
});

describe("choice type accessors", () => {
    test("effectiveDateTime and effectivePeriod are independent choices", () => {
        const profile = bodyweightProfile.create({ status: "final", subject: { reference: "Patient/pt-1" } });

        expect(profile.getEffectiveDateTime()).toBeUndefined();
        expect(profile.getEffectivePeriod()).toBeUndefined();

        profile.setEffectiveDateTime("2024-01-15");
        expect(profile.getEffectiveDateTime()).toBe("2024-01-15");

        profile.setEffectivePeriod({ start: "2024-01-15", end: "2024-01-16" });
        expect(profile.getEffectivePeriod()).toEqual({ start: "2024-01-15", end: "2024-01-16" });
    });
});
