/**
 * FHIR R4 Profile Class API Tests
 *
 * Tests for Profile class usage with bodyweight observation.
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { observation_bodyweightProfile as bodyweightProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight";

describe("bodyweight profile creation", () => {
    let fromCreate: Observation;
    let fromCreateResource: Observation;
    let fromFrom: Observation;

    test("create() returns a profile wrapping the resource", () => {
        const profile = bodyweightProfile.create({
            status: "final",
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            category: [],
            subject: { reference: "Patient/pt-1" },
        });
        fromCreate = profile.toResource();

        expect(fromCreate.resourceType).toBe("Observation");
        expect(fromCreate.status).toBe("final");
        expect(fromCreate.code!.coding![0]!.code).toBe("29463-7");
        expect(fromCreate.subject!.reference).toBe("Patient/pt-1");
    });

    test("createResource() returns a plain Observation", () => {
        fromCreateResource = bodyweightProfile.createResource({
            status: "final",
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            category: [],
            subject: { reference: "Patient/pt-1" },
        });

        expect(fromCreateResource.resourceType).toBe("Observation");
        expect(fromCreateResource.status).toBe("final");
        expect(fromCreateResource.code!.coding![0]!.code).toBe("29463-7");
        expect(fromCreateResource.subject!.reference).toBe("Patient/pt-1");
    });

    test("from() wraps an existing Observation", () => {
        const obs: Observation = { resourceType: "Observation", code: {}, status: "preliminary" };
        const profile = bodyweightProfile.from(obs);

        profile
            .setStatus("final")
            .setCode({ coding: [{ code: "29463-7", system: "http://loinc.org" }] })
            .setCategory([])
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
});

describe("bodyweight profile getters and setters", () => {
    const profile = bodyweightProfile.create({
        status: "final",
        code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
        category: [],
        subject: { reference: "Patient/pt-1" },
    });

    test("getStatus / setStatus", () => {
        expect(profile.getStatus()).toBe("final");
        profile.setStatus("amended");
        expect(profile.getStatus()).toBe("amended");
        expect(profile.toResource().status).toBe("amended");
    });

    test("getCode / setCode", () => {
        expect(profile.getCode()!.coding![0]!.code).toBe("29463-7");
        const newCode = { coding: [{ code: "3141-9", system: "http://loinc.org" }] };
        profile.setCode(newCode);
        expect(profile.getCode()).toEqual(newCode);
    });

    test("getCategory / setCategory", () => {
        expect(profile.getCategory()).toEqual([]);
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
        code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
        category: [],
        subject: { reference: "Patient/pt-1" },
    });

    test("getVscat returns undefined when no matching slice", () => {
        expect(profile.getVscat()).toBeUndefined();
        expect(profile.getVscatRaw()).toBeUndefined();
    });

    test("setVscat with no args inserts discriminator-only element", () => {
        profile.setVscat();

        const raw = profile.getVscatRaw()!;
        expect(raw.coding as unknown).toEqual({
            code: "vital-signs",
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
        });
    });

    test("setVscat adds category with discriminator values", () => {
        profile.setVscat({ text: "Vital Signs" });

        const raw = profile.getVscatRaw()!;
        expect(raw.text).toBe("Vital Signs");
        expect(raw.coding as unknown).toEqual({
            code: "vital-signs",
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
        });
    });

    test("getVscat returns simplified view without discriminator", () => {
        const simplified = profile.getVscat();
        expect(simplified).toEqual({ text: "Vital Signs" });
        expect("coding" in simplified!).toBe(false);
    });

    test("getVscatRaw returns full element including discriminator", () => {
        const raw = profile.getVscatRaw()!;
        expect(raw.text).toBe("Vital Signs");
        expect(raw.coding).toBeDefined();
    });

    test("setVscat replaces existing slice element", () => {
        profile.setVscat({ text: "Updated" });

        expect(profile.getVscat()!.text).toBe("Updated");
        expect(profile.toResource().category!.length).toBe(1);
    });
});

describe("bodyweight profile choice type accessors", () => {
    const profile = bodyweightProfile.create({
        status: "final",
        code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
        category: [],
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
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            category: [],
            subject: { reference: "Patient/pt-1" },
        });
        const p = bodyweightProfile.from(obs);

        p.setValueQuantity({ value: 90, unit: "kg" });
        expect((obs as any).valueQuantity.value).toBe(90);

        p.setEffectiveDateTime("2024-03-01");
        expect((obs as any).effectiveDateTime).toBe("2024-03-01");
    });
});

describe("bodyweight profile mutability", () => {
    test("profile mutates the underlying resource", () => {
        const obs = bodyweightProfile.createResource({
            status: "final",
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            category: [],
            subject: { reference: "Patient/pt-1" },
        });
        const profile = bodyweightProfile.from(obs);

        profile.setStatus("amended");
        expect(obs.status).toBe("amended");

        profile.setVscat({ text: "Vital Signs" });
        expect(obs.category!.length).toBe(1);
    });
});
