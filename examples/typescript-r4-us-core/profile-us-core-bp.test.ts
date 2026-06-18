/**
 * US Core Blood Pressure Profile Class API Tests
 *
 * The create/apply mechanics and category auto-population are demonstrated in
 * profile-r4-bp.test.ts against the base R4 profile. This file keeps one
 * self-contained create demo plus the scenarios that only work / only matter on
 * US Core: a from() round-trip (the R4 BP discriminator is array-shaped here) and
 * Bundle<T> + multi-profile is() narrowing.
 */

import { describe, expect, test } from "bun:test";
import type { Bundle } from "./fhir-types/hl7-fhir-r4-core/Bundle";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import { USCoreBloodPressureProfile, USCorePatientProfile } from "./fhir-types/hl7-fhir-us-core/profiles";

describe("demo: create a US Core blood pressure observation", () => {
    test("build a valid BP resource step by step", () => {
        // Create a new BP profile — auto-sets code, category, and component stubs.
        // Note the US Core slice names: setSystolic / setDiastolic.
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

describe("demo: read a US Core blood pressure observation from JSON", () => {
    // R4 BP omits a from() demo because its component discriminator stores
    // code.coding as a plain object; US Core BP has correct array-shaped
    // discriminators, so from() works here.
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

describe("demo: filter Bundle<T> with profile is()", () => {
    test("is() narrows by resourceType + meta.profile across a typed bundle and a raw collection", () => {
        const patient: Patient = {
            resourceType: "Patient",
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
            identifier: [{ system: "http://hospital.example.org/mrn", value: "MRN-001" }],
            name: [{ family: "Lovelace", given: ["Ada"] }],
        };
        const bp: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure"] },
            status: "final",
            category: [
                {
                    coding: [
                        { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" },
                    ],
                },
            ],
            code: { coding: [{ code: "85354-9", system: "http://loinc.org" }] },
            subject: { reference: "Patient/pt-1" },
            effectiveDateTime: "2024-06-15",
            component: [
                {
                    code: { coding: [{ code: "8480-6", system: "http://loinc.org" }] },
                    valueQuantity: { value: 120, unit: "mmHg" },
                },
                {
                    code: { coding: [{ code: "8462-4", system: "http://loinc.org" }] },
                    valueQuantity: { value: 80, unit: "mmHg" },
                },
            ],
        };
        const otherObs: Observation = {
            resourceType: "Observation",
            status: "final",
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
        };

        // Bundle<T> propagation narrows entry[].resource to Patient | Observation at the type level
        const bundle: Bundle<Patient | Observation> = {
            resourceType: "Bundle",
            type: "transaction",
            entry: [{ resource: patient }, { resource: bp }, { resource: otherObs }],
        };

        // is() adds runtime narrowing on top of Bundle<T>: filters by resourceType + meta.profile
        const bps = (bundle.entry ?? []).map((e) => e.resource).filter(USCoreBloodPressureProfile.is);
        expect(bps).toEqual([bp]);

        const patients = (bundle.entry ?? []).map((e) => e.resource).filter(USCorePatientProfile.is);
        expect(patients).toEqual([patient]);

        // Same guard also works on a plain unknown[] — no Bundle<T> required
        const mixed: unknown[] = [patient, bp, otherObs, { resourceType: "Patient" }, null, "not a resource"];
        expect(mixed.filter(USCoreBloodPressureProfile.is)).toEqual([bp]);

        // Hand survivors to from() for typed reads
        const wrapped = bps.map((o) => USCoreBloodPressureProfile.from(o));
        expect(wrapped[0]!.getSystolic()!.value).toBe(120);
        expect(wrapped[0]!.getDiastolic()!.value).toBe(80);
    });
});
