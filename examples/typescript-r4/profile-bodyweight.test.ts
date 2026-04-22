/**
 * FHIR R4 Bodyweight Profile Class API Tests
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import {
    observation_bodyweightProfile as bodyweightProfile,
    type Observation_bodyweight_Category_VSCatSliceFlat as VSCatFlat,
    type Observation_bodyweight_Category_VSCatSliceFlatAll as VSCatFlatAll,
} from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight";

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

        // Slice getter returns SliceFlat — includes both user data and discriminator values
        const vsCat = profile.getVSCat()!;
        expect(vsCat).toEqual({
            text: "Vital Signs",
            coding: [{ code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" }],
        });
    });
});

describe("demo: filter a mixed collection with is()", () => {
    test("is() narrows unknown values to profile matches", () => {
        // A mixed bag: a matching bodyweight, a non-matching Observation, a non-Observation, and junk
        const bodyweight: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/StructureDefinition/bodyweight"] },
            status: "final",
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            subject: { reference: "Patient/pt-1" },
            effectiveDateTime: "2024-06-15",
            valueQuantity: { value: 75, unit: "kg" },
        };
        const otherObs: Observation = {
            resourceType: "Observation",
            status: "final",
            code: { coding: [{ code: "8867-4", system: "http://loinc.org" }] },
        };
        const resources: unknown[] = [bodyweight, otherObs, { resourceType: "Patient" }, null, "not a resource"];

        // is() is a cheap type guard — no validation, no instance constructed
        const matches = resources.filter(bodyweightProfile.is);

        expect(matches).toEqual([bodyweight]);
    });
});

describe("is() type guard", () => {
    test("returns true for Observation with matching meta.profile", () => {
        const obs: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/StructureDefinition/bodyweight"] },
            status: "final",
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
        };
        expect(bodyweightProfile.is(obs)).toBe(true);
    });

    test("returns false when meta.profile does not include canonical url", () => {
        const obs: Observation = {
            resourceType: "Observation",
            status: "final",
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
        };
        expect(bodyweightProfile.is(obs)).toBe(false);
    });

    test("returns false for wrong resourceType", () => {
        expect(bodyweightProfile.is({ resourceType: "Patient" })).toBe(false);
    });

    test("returns false for non-object inputs", () => {
        expect(bodyweightProfile.is(null)).toBe(false);
        expect(bodyweightProfile.is(undefined)).toBe(false);
        expect(bodyweightProfile.is("string")).toBe(false);
        expect(bodyweightProfile.is(42)).toBe(false);
    });

    test("does not validate — only checks identity", () => {
        // A resource that claims the profile but is otherwise invalid still passes is()
        const bogus = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/StructureDefinition/bodyweight"] },
        };
        expect(bodyweightProfile.is(bogus)).toBe(true);
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
    test("setVSCat accepts SliceFlatInput, getVSCat returns SliceFlat", () => {
        const profile = bodyweightProfile.create({ status: "final", subject: { reference: "Patient/pt-1" } });

        // Setter accepts SliceFlatInput — only user-supplied fields, no discriminators
        const input: VSCatFlat = { text: "Vital Signs" };
        profile.setVSCat(input);

        // Getter returns SliceFlatAll — includes discriminator values + user data
        const flat: VSCatFlatAll = profile.getVSCat()!;
        expect(flat).toEqual({
            text: "Vital Signs",
            coding: [{ code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" }],
        });
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
