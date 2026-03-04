/**
 * FHIR R4 Blood Pressure Profile Class API Tests
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { observation_bpProfile as bpProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_observation_bp";

const createBp = () =>
    bpProfile.create({
        status: "final",
        category: [],
        subject: { reference: "Patient/pt-1" },
    });

describe("blood pressure profile", () => {
    const profile = bpProfile.create({
        status: "final",
        category: [],
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

    test("freshly created profile is not yet valid (missing slices/effective)", () => {
        const errors = profile.validate();
        expect(errors).toEqual([
            "observation-bp.category: slice 'VSCat' requires at least 1 item(s), found 0",
            "effective: at least one of effectiveDateTime, effectivePeriod is required",
            "observation-bp.component: slice 'SystolicBP' requires at least 1 item(s), found 0",
            "observation-bp.component: slice 'DiastolicBP' requires at least 1 item(s), found 0",
        ]);
    });

    test("setSystolicBp / getSystolicBp / getSystolicBpRaw", () => {
        expect(profile.getSystolicBp()).toBeUndefined();
        expect(profile.getSystolicBpRaw()).toBeUndefined();

        profile.setSystolicBp({
            valueQuantity: { value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
        });

        expect(profile.getSystolicBp()).toEqual({
            valueQuantity: { value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
        });

        expect(profile.getSystolicBpRaw() as unknown).toEqual({
            valueQuantity: { value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
            code: { coding: { code: "8480-6", system: "http://loinc.org" } },
        });
    });

    test("setDiastolicBp / getDiastolicBp / getDiastolicBpRaw", () => {
        profile.setDiastolicBp({
            valueQuantity: { value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
        });

        expect(profile.getDiastolicBp()).toEqual({
            valueQuantity: { value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
        });

        expect(profile.getDiastolicBpRaw() as unknown).toEqual({
            valueQuantity: { value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
            code: { coding: { code: "8462-4", system: "http://loinc.org" } },
        });
    });

    test("both systolic and diastolic populate the component array", () => {
        const obs = profile.toResource();
        expect(obs.component).toHaveLength(2);

        const systolicCode = profile.getSystolicBpRaw()!.code as Record<string, unknown>;
        const diastolicCode = profile.getDiastolicBpRaw()!.code as Record<string, unknown>;
        expect(systolicCode.coding).toEqual({ code: "8480-6", system: "http://loinc.org" });
        expect(diastolicCode.coding).toEqual({ code: "8462-4", system: "http://loinc.org" });
        expect(profile.getSystolicBpRaw()!.valueQuantity!.value).toBe(120);
        expect(profile.getDiastolicBpRaw()!.valueQuantity!.value).toBe(80);
    });

    test("setSystolicBp replaces an existing systolic component", () => {
        profile.setSystolicBp({ valueQuantity: { value: 130, unit: "mmHg" } });

        expect(profile.toResource().component).toHaveLength(2);
        expect(profile.getSystolicBpRaw()!.valueQuantity!.value).toBe(130);
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

    test("setEffectiveDateTime / getEffectiveDateTime", () => {
        profile.setEffectiveDateTime("2024-06-15T10:30:00Z");
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15T10:30:00Z");
        expect(profile.getValueQuantity()).toBeUndefined();
    });

    test("fluent chaining across all accessor types", () => {
        const result = profile
            .setStatus("final")
            .setVscat({ text: "Vital Signs" })
            .setEffectiveDateTime("2024-06-15")
            .setSubject({ reference: "Patient/pt-2" })
            .setSystolicBp({ valueQuantity: { value: 120, unit: "mmHg" } })
            .setDiastolicBp({ valueQuantity: { value: 80, unit: "mmHg" } });

        expect(result).toBe(profile);
        expect(profile.getStatus()).toBe("final");
        expect(profile.getVscat()!.text).toBe("Vital Signs");
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15");
        expect(profile.getSubject()!.reference).toBe("Patient/pt-2");
        expect(profile.getSystolicBpRaw()!.valueQuantity!.value).toBe(120);
        expect(profile.getDiastolicBpRaw()!.valueQuantity!.value).toBe(80);
    });

    test("setSystolicBp with no args inserts discriminator-only component", () => {
        const fresh = createBp();
        fresh.setSystolicBp();

        const raw = fresh.getSystolicBpRaw()!;
        const rawCode = raw.code as Record<string, unknown>;
        expect(rawCode.coding).toEqual({ code: "8480-6", system: "http://loinc.org" });
        expect(raw.valueQuantity).toBeUndefined();
    });
});
