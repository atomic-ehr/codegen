/**
 * FHIR R4 Bodyweight Profile Class API Tests
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { observation_bodyweightProfile as bodyweightProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight";

describe("bodyweight profile creation", () => {
    let fromCreate: Observation;
    let fromCreateResource: Observation;
    let fromFrom: Observation;

    test("create() returns a profile wrapping the resource with auto-set code", () => {
        const profile = bodyweightProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });
        fromCreate = profile.toResource();

        expect(fromCreate.resourceType).toBe("Observation");
        expect(fromCreate.status).toBe("final");
        expect(fromCreate.code!.coding![0]!.code).toBe("29463-7");
        expect(fromCreate.code!.coding![0]!.system).toBe("http://loinc.org");
        expect(fromCreate.subject!.reference).toBe("Patient/pt-1");
    });

    test("createResource() returns a plain Observation with auto-set code", () => {
        fromCreateResource = bodyweightProfile.createResource({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });

        expect(fromCreateResource.resourceType).toBe("Observation");
        expect(fromCreateResource.status).toBe("final");
        expect(fromCreateResource.code!.coding![0]!.code).toBe("29463-7");
        expect(fromCreateResource.subject!.reference).toBe("Patient/pt-1");
    });

    test("apply() wraps an existing Observation", () => {
        const obs: Observation = { resourceType: "Observation", code: {}, status: "preliminary" };
        const profile = bodyweightProfile.apply(obs);

        profile
            .setStatus("final")
            .setCode({ coding: [{ code: "29463-7", system: "http://loinc.org" }] })
            .setCategory([
                {
                    coding: {
                        code: "vital-signs",
                        system: "http://terminology.hl7.org/CodeSystem/observation-category",
                    },
                } as any,
            ])
            .setSubject({ reference: "Patient/pt-1" });

        fromFrom = profile.toResource();

        expect(fromFrom).toBe(obs); // same reference
        expect(profile.getStatus()).toBe("final");
        expect(profile.getCode()!.coding![0]!.code).toBe("29463-7");
        expect(profile.getSubject()!.reference).toBe("Patient/pt-1");
    });

    test("all three methods produce equal resources", () => {
        expect(fromCreate).toEqual(fromCreateResource);
        expect(fromCreate).toEqual(fromFrom);
    });

    test("all three methods set meta.profile", () => {
        const expected = ["http://hl7.org/fhir/StructureDefinition/bodyweight"];
        expect(fromCreate.meta?.profile).toEqual(expected);
        expect(fromCreateResource.meta?.profile).toEqual(expected);
        expect(fromFrom.meta?.profile).toEqual(expected);
    });
});

describe("bodyweight profile getters and setters", () => {
    const profile = bodyweightProfile.create({
        status: "final",
        subject: { reference: "Patient/pt-1" },
    });

    test("getStatus / setStatus", () => {
        expect(profile.getStatus()).toBe("final");
        profile.setStatus("amended");
        expect(profile.getStatus()).toBe("amended");
        expect(profile.toResource().status).toBe("amended");
    });

    test("getCode / setCode", () => {
        // Code is auto-set but still has getter/setter
        expect(profile.getCode()!.coding![0]!.code).toBe("29463-7");
        const newCode = { coding: [{ code: "3141-9", system: "http://loinc.org" }] };
        profile.setCode(newCode);
        expect(profile.getCode()).toEqual(newCode);
    });

    test("getCategory / setCategory", () => {
        // category is auto-populated with VSCat discriminator
        expect(profile.getCategory()).toHaveLength(1);
        const newCategory = [{ text: "Laboratory" }];
        profile.setCategory(newCategory);
        expect(profile.getCategory()).toEqual(newCategory);
    });

    test("getSubject / setSubject", () => {
        expect(profile.getSubject()!.reference).toBe("Patient/pt-1");
        profile.setSubject({ reference: "Patient/pt-2" });
        expect(profile.getSubject()!.reference).toBe("Patient/pt-2");
    });
});

describe("bodyweight profile slice accessors", () => {
    const profile = bodyweightProfile.create({
        status: "final",
        subject: { reference: "Patient/pt-1" },
    });

    test("getVSCat returns empty simplified view from auto-populated stub", () => {
        // category is auto-populated with VSCat discriminator match
        expect(profile.getVSCat("raw")).toBeDefined();
        const raw = profile.getVSCat("raw")!;
        expect(raw.coding as unknown).toEqual({
            code: "vital-signs",
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
        });
        // simplified view strips discriminator keys, leaving empty object
        expect(profile.getVSCat()).toEqual({});
    });

    test("setVSCat adds category with discriminator values", () => {
        profile.setVSCat({ text: "Vital Signs" });

        const raw = profile.getVSCat("raw")!;
        expect(raw.text).toBe("Vital Signs");
        expect(raw.coding as unknown).toEqual({
            code: "vital-signs",
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
        });
    });

    test("getVSCat returns simplified view without discriminator", () => {
        const simplified = profile.getVSCat();
        expect(simplified).toEqual({ text: "Vital Signs" });
        expect("coding" in simplified!).toBe(false);
    });

    test("getVSCatRaw returns full element including discriminator", () => {
        const raw = profile.getVSCat("raw")!;
        expect(raw.text).toBe("Vital Signs");
        expect(raw.coding).toBeDefined();
    });

    test("setVSCat replaces existing slice element", () => {
        profile.setVSCat({ text: "Updated" });

        expect(profile.getVSCat()!.text).toBe("Updated");
        expect(profile.toResource().category!.length).toBe(1);
    });
});

describe("bodyweight profile choice type accessors", () => {
    const profile = bodyweightProfile.create({
        status: "final",
        subject: { reference: "Patient/pt-1" },
    });

    test("choice accessors return undefined when not set", () => {
        expect(profile.getEffectiveDateTime()).toBeUndefined();
        expect(profile.getEffectivePeriod()).toBeUndefined();
        expect(profile.getValueQuantity()).toBeUndefined();
    });

    test("setEffectiveDateTime / getEffectiveDateTime", () => {
        profile.setEffectiveDateTime("2024-01-15");
        expect(profile.getEffectiveDateTime()).toBe("2024-01-15");
        expect(profile.toResource().effectiveDateTime).toBe("2024-01-15");
    });

    test("setEffectivePeriod / getEffectivePeriod", () => {
        profile.setEffectivePeriod({ start: "2024-01-15", end: "2024-01-16" });
        expect(profile.getEffectivePeriod()).toEqual({ start: "2024-01-15", end: "2024-01-16" });
    });

    test("setValueQuantity / getValueQuantity", () => {
        profile.setValueQuantity({ value: 75, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" });
        expect(profile.getValueQuantity()!.value).toBe(75);
        expect(profile.getValueQuantity()!.unit).toBe("kg");
    });

    test("choice accessors support fluent chaining", () => {
        const result = profile.setEffectiveDateTime("2024-02-01").setValueQuantity({ value: 80, unit: "kg" });
        expect(result).toBe(profile);
        expect(profile.getEffectiveDateTime()).toBe("2024-02-01");
        expect(profile.getValueQuantity()!.value).toBe(80);
    });

    test("choice accessors mutate the underlying resource", () => {
        const obs = bodyweightProfile.createResource({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });
        const p = bodyweightProfile.apply(obs);

        p.setValueQuantity({ value: 90, unit: "kg" });
        expect((obs as any).valueQuantity.value).toBe(90);

        p.setEffectiveDateTime("2024-03-01");
        expect((obs as any).effectiveDateTime).toBe("2024-03-01");
    });
});

describe("bodyweight profile static metadata", () => {
    test("canonicalUrl is exposed as a static property", () => {
        expect(bodyweightProfile.canonicalUrl).toBe("http://hl7.org/fhir/StructureDefinition/bodyweight");
    });
});

describe("bodyweight profile mutability", () => {
    test("profile mutates the underlying resource", () => {
        const obs = bodyweightProfile.createResource({
            status: "final",
            subject: { reference: "Patient/pt-1" },
        });
        const profile = bodyweightProfile.apply(obs);

        profile.setStatus("amended");
        expect(obs.status).toBe("amended");

        profile.setVSCat({ text: "Vital Signs" });
        expect(obs.category!.length).toBe(1);
    });
});
