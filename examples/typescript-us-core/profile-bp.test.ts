/**
 * US Core Blood Pressure Profile Class API Tests
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { USCoreBloodPressureProfile } from "./fhir-types/hl7-fhir-us-core/profiles";

const createBp = () =>
    USCoreBloodPressureProfile.create({
        status: "final",
        subject: { reference: "Patient/pt-1" },
    });

describe("demo", () => {
    test("import a profiled Observation from an API and read components", () => {
        const apiResponse: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure"] },
            status: "final",
            // singular coding matches the slice discriminator format used by the profile
            category: [
                {
                    coding: {
                        code: "vital-signs",
                        system: "http://terminology.hl7.org/CodeSystem/observation-category",
                    },
                },
            ] as any,
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

        const profile = USCoreBloodPressureProfile.from(apiResponse);

        expect(profile.getSystolic()).toEqual({
            value: 120,
            unit: "mmHg",
            system: "http://unitsofmeasure.org",
            code: "mm[Hg]",
        });
        expect(profile.getDiastolic()).toEqual({
            value: 80,
            unit: "mmHg",
            system: "http://unitsofmeasure.org",
            code: "mm[Hg]",
        });
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15");
    });

    test("apply profile to a bare Observation and populate it", () => {
        const bareObservation: Observation = { resourceType: "Observation", status: "preliminary", code: {} };
        const profile = USCoreBloodPressureProfile.apply(bareObservation);

        profile
            .setStatus("final")
            .setCode({ coding: [{ code: "85354-9", system: "http://loinc.org" }] })
            .setSubject({ reference: "Patient/pt-1" })
            .setVSCat({})
            .setEffectiveDateTime("2024-06-15")
            .setSystolic({ value: 120, unit: "mmHg" })
            .setDiastolic({ value: 80, unit: "mmHg" });

        expect(profile.validate().errors).toEqual([]);
        expect(profile.toResource().meta?.profile).toContain(
            "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure",
        );
    });
});

describe("US Core blood pressure profile", () => {
    const profile = createBp();

    test("canonicalUrl is exposed", () => {
        expect(USCoreBloodPressureProfile.canonicalUrl).toBe(
            "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure",
        );
    });

    test("create() auto-sets code and meta.profile", () => {
        const obs = profile.toResource();
        expect(obs.resourceType).toBe("Observation");
        expect(obs.code!.coding![0]!.code).toBe("85354-9");
        expect(obs.code!.coding![0]!.system).toBe("http://loinc.org");
        expect(obs.meta?.profile).toEqual(["http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure"]);
    });

    test("freshly created profile is not yet valid (missing effective)", () => {
        const { errors } = profile.validate();
        expect(errors).toEqual([
            "USCoreBloodPressureProfile: at least one of effectiveDateTime, effectivePeriod is required",
        ]);
    });

    test("create() auto-populates component with systolic/diastolic stubs", () => {
        const fresh = createBp();
        const obs = fresh.toResource();
        expect(obs.component).toHaveLength(2);
        expect(fresh.getSystolic("raw")).toBeDefined();
        expect(fresh.getDiastolic("raw")).toBeDefined();
    });

    test("setSystolic / getSystolic / getSystolicRaw", () => {
        profile.setSystolic({ value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" });

        expect(profile.getSystolic()).toEqual({
            value: 120,
            unit: "mmHg",
            system: "http://unitsofmeasure.org",
            code: "mm[Hg]",
        });

        const raw = profile.getSystolic("raw")!;
        expect(raw.valueQuantity!.value).toBe(120);
        expect(raw.code?.coding?.[0]?.code).toBe("8480-6");
    });

    test("setDiastolic / getDiastolic / getDiastolicRaw", () => {
        profile.setDiastolic({ value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" });

        expect(profile.getDiastolic()).toEqual({
            value: 80,
            unit: "mmHg",
            system: "http://unitsofmeasure.org",
            code: "mm[Hg]",
        });

        const raw = profile.getDiastolic("raw")!;
        expect(raw.valueQuantity!.value).toBe(80);
        expect(raw.code?.coding?.[0]?.code).toBe("8462-4");
    });

    test("both systolic and diastolic are in the component array", () => {
        const obs = profile.toResource();
        expect(obs.component).toHaveLength(2);

        expect(profile.getSystolic("raw")!.valueQuantity!.value).toBe(120);
        expect(profile.getDiastolic("raw")!.valueQuantity!.value).toBe(80);
    });

    test("setSystolic replaces an existing systolic component", () => {
        profile.setSystolic({ value: 130, unit: "mmHg" });

        expect(profile.toResource().component).toHaveLength(2);
        expect(profile.getSystolic("raw")!.valueQuantity!.value).toBe(130);
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
            .setSystolic({ value: 120, unit: "mmHg" })
            .setDiastolic({ value: 80, unit: "mmHg" });

        expect(result).toBe(profile);
        expect(profile.getStatus()).toBe("final");
        expect(profile.getVSCat()!.text).toBe("Vital Signs");
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15");
        expect(profile.getSubject()!.reference).toBe("Patient/pt-2");
        expect(profile.getSystolic("raw")!.valueQuantity!.value).toBe(120);
        expect(profile.getDiastolic("raw")!.valueQuantity!.value).toBe(80);
    });

    test("setSystolic with no args inserts discriminator-only component", () => {
        const fresh = createBp();
        fresh.setSystolic();

        const raw = fresh.getSystolic("raw")!;
        expect(raw.code?.coding?.[0]?.code).toBe("8480-6");
        expect(raw.valueQuantity).toBeUndefined();
    });

    test("create() with custom category preserves user values and adds required VSCat", () => {
        const custom = USCoreBloodPressureProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
            category: [{ text: "My Category" }],
        });
        const obs = custom.toResource();
        expect(obs.category).toHaveLength(2);
        expect(obs.category![0]!.text).toBe("My Category");
        expect((obs.category![1] as Record<string, unknown>).coding).toEqual({
            code: "vital-signs",
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
        });
    });

    test("create() with empty category still adds required VSCat", () => {
        const custom = USCoreBloodPressureProfile.create({
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
        const custom = USCoreBloodPressureProfile.create({
            status: "final",
            subject: { reference: "Patient/pt-1" },
            // category with VSCat discriminator already present (singular coding matches internal format)
            category: [
                {
                    coding: {
                        code: "vital-signs",
                        system: "http://terminology.hl7.org/CodeSystem/observation-category",
                    },
                },
            ] as any,
        });
        const obs = custom.toResource();
        expect(obs.category).toHaveLength(1);
    });
});
