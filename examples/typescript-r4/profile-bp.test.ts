/**
 * FHIR R4 Blood Pressure Profile Class API Tests
 */

import { describe, expect, test } from "bun:test";
import { observation_bpProfile as bpProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_observation_bp";

const createBp = () =>
    bpProfile.create({
        status: "final",
        subject: { reference: "Patient/pt-1" },
    });

describe("blood pressure profile", () => {
    const profile = bpProfile.create({
        status: "final",
        subject: { reference: "Patient/pt-1" },
    });

    test("canonicalUrl is exposed", () => {
        expect(bpProfile.canonicalUrl).toBe("http://hl7.org/fhir/StructureDefinition/bp");
    });

    test("create() auto-sets code and meta.profile", () => {
        const obs = profile.toResource();
        expect(obs.resourceType).toBe("Observation");
        expect(obs.code!.coding![0]!.code).toBe("85354-9");
        expect(obs.code!.coding![0]!.system).toBe("http://loinc.org");
        expect(obs.meta?.profile).toEqual(["http://hl7.org/fhir/StructureDefinition/bp"]);
    });

    test("freshly created profile is not yet valid (missing effective)", () => {
        const { errors } = profile.validate();
        expect(errors).toEqual(["observation-bp: at least one of effectiveDateTime, effectivePeriod is required"]);
    });

    test("create() auto-populates component with systolic/diastolic stubs", () => {
        const fresh = createBp();
        const obs = fresh.toResource();
        expect(obs.component).toHaveLength(2);
        // stubs contain only discriminator match values
        expect(fresh.getSystolicBP("raw")).toBeDefined();
        expect(fresh.getDiastolicBP("raw")).toBeDefined();
    });

    test("setSystolicBP / getSystolicBP / getSystolicBPRaw", () => {
        profile.setSystolicBP({ value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" });

        expect(profile.getSystolicBP()).toEqual({
            value: 120,
            unit: "mmHg",
            system: "http://unitsofmeasure.org",
            code: "mm[Hg]",
        });

        expect(profile.getSystolicBP("raw") as unknown).toEqual({
            valueQuantity: { value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
            code: { coding: { code: "8480-6", system: "http://loinc.org" } },
        });
    });

    test("setDiastolicBP / getDiastolicBP / getDiastolicBPRaw", () => {
        profile.setDiastolicBP({ value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" });

        expect(profile.getDiastolicBP()).toEqual({
            value: 80,
            unit: "mmHg",
            system: "http://unitsofmeasure.org",
            code: "mm[Hg]",
        });

        expect(profile.getDiastolicBP("raw") as unknown).toEqual({
            valueQuantity: { value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
            code: { coding: { code: "8462-4", system: "http://loinc.org" } },
        });
    });

    test("both systolic and diastolic are in the component array", () => {
        const obs = profile.toResource();
        // auto-populated stubs + set values = still 2 items (set replaces stubs)
        expect(obs.component).toHaveLength(2);

        const systolicCode = profile.getSystolicBP("raw")!.code as Record<string, unknown>;
        const diastolicCode = profile.getDiastolicBP("raw")!.code as Record<string, unknown>;
        expect(systolicCode.coding).toEqual({ code: "8480-6", system: "http://loinc.org" });
        expect(diastolicCode.coding).toEqual({ code: "8462-4", system: "http://loinc.org" });
        expect(profile.getSystolicBP("raw")!.valueQuantity!.value).toBe(120);
        expect(profile.getDiastolicBP("raw")!.valueQuantity!.value).toBe(80);
    });

    test("setSystolicBP replaces an existing systolic component", () => {
        profile.setSystolicBP({ value: 130, unit: "mmHg" });

        expect(profile.toResource().component).toHaveLength(2);
        expect(profile.getSystolicBP("raw")!.valueQuantity!.value).toBe(130);
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

    test("setEffectiveDateTime / getEffectiveDateTime", () => {
        profile.setEffectiveDateTime("2024-06-15T10:30:00Z");
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15T10:30:00Z");
        expect(profile.getValueQuantity()).toBeUndefined();
    });

    test("fluent chaining across all accessor types", () => {
        const result = profile
            .setStatus("final")
            .setVSCat({ text: "Vital Signs" })
            .setEffectiveDateTime("2024-06-15")
            .setSubject({ reference: "Patient/pt-2" })
            .setSystolicBP({ value: 120, unit: "mmHg" })
            .setDiastolicBP({ value: 80, unit: "mmHg" });

        expect(result).toBe(profile);
        expect(profile.getStatus()).toBe("final");
        expect(profile.getVSCat()!.text).toBe("Vital Signs");
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15");
        expect(profile.getSubject()!.reference).toBe("Patient/pt-2");
        expect(profile.getSystolicBP("raw")!.valueQuantity!.value).toBe(120);
        expect(profile.getDiastolicBP("raw")!.valueQuantity!.value).toBe(80);
    });

    test("setSystolicBP with no args inserts discriminator-only component", () => {
        const fresh = createBp();
        fresh.setSystolicBP();

        const raw = fresh.getSystolicBP("raw")!;
        const rawCode = raw.code as Record<string, unknown>;
        expect(rawCode.coding).toEqual({ code: "8480-6", system: "http://loinc.org" });
        expect(raw.valueQuantity).toBeUndefined();
    });

    test("create() with custom category preserves user values and adds required VSCat", () => {
        const custom = bpProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
            category: [{ text: "My Category" }],
        });
        const obs = custom.toResource();
        // User category kept, VSCat auto-added
        expect(obs.category).toHaveLength(2);
        expect(obs.category![0]!.text).toBe("My Category");
        expect((obs.category![1] as Record<string, unknown>).coding).toEqual({
            code: "vital-signs",
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
        });
    });

    test("create() with empty category still adds required VSCat", () => {
        const custom = bpProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
            category: [],
        });
        const obs = custom.toResource();
        expect(obs.category).toHaveLength(1);
        expect((obs.category![0] as Record<string, unknown>).coding).toEqual({
            code: "vital-signs",
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
        });
    });

    test("create() with category already containing VSCat does not duplicate it", () => {
        const custom = bpProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
            category: [
                {
                    coding: {
                        code: "vital-signs",
                        system: "http://terminology.hl7.org/CodeSystem/observation-category",
                    } as unknown,
                } as never,
            ],
        });
        const obs = custom.toResource();
        expect(obs.category).toHaveLength(1);
    });
});
