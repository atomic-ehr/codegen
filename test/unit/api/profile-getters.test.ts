import { describe, expect, it } from "bun:test";
import type { Observation } from "../../../examples/typescript-us-core/fhir-types/hl7-fhir-r4-core/Observation";
import type { Patient } from "../../../examples/typescript-us-core/fhir-types/hl7-fhir-r4-core/Patient";
import { USCoreBloodPressureProfileProfile } from "../../../examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/UscoreBloodPressureProfile";
import { USCorePatientProfileProfile } from "../../../examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/UscorePatientProfile";

const createPatient = (): Patient => ({ resourceType: "Patient" });
const createObservation = (): Observation => ({ resourceType: "Observation", status: "final", code: {} });

describe("Profile Getter Methods", () => {
    describe("Extension getters", () => {
        it("returns simplified object via getRace()", () => {
            const profile = new USCorePatientProfileProfile(createPatient());
            profile.setRace({
                ombCategory: { system: "urn:oid:2.16.840.1.113883.6.238", code: "2106-3", display: "White" },
                text: "White",
            });

            const result = profile.getRace();
            expect(result).toBeDefined();
            expect(result?.ombCategory?.code).toBe("2106-3");
            expect(result?.text).toBe("White");
        });

        it("returns raw Extension via getRaceExtension()", () => {
            const profile = new USCorePatientProfileProfile(createPatient());
            profile.setRace({
                ombCategory: { system: "urn:oid:2.16.840.1.113883.6.238", code: "2106-3", display: "White" },
                text: "White",
            });

            const raw = profile.getRaceExtension();
            expect(raw).toBeDefined();
            expect(raw?.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-race");
            expect(raw?.extension).toBeArray();
        });

        it("returns undefined when extension not set", () => {
            const profile = new USCorePatientProfileProfile(createPatient());
            expect(profile.getRace()).toBeUndefined();
        });

        it("simple extension getter returns value directly", () => {
            const profile = new USCorePatientProfileProfile(createPatient());
            profile.setSex({ system: "http://hl7.org/fhir/administrative-gender", code: "male" });

            const result = profile.getSex();
            expect(result).toBeDefined();
            expect(result?.code).toBe("male");
        });

        it("simple extension getSexExtension() returns raw Extension", () => {
            const profile = new USCorePatientProfileProfile(createPatient());
            profile.setSex({ system: "http://hl7.org/fhir/administrative-gender", code: "male" });

            const raw = profile.getSexExtension();
            expect(raw).toBeDefined();
            expect(raw?.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex");
            expect(raw?.valueCoding?.code).toBe("male");
        });
    });

    describe("Slice getters", () => {
        it("returns simplified slice without discriminator via getSystolic()", () => {
            const profile = new USCoreBloodPressureProfileProfile(createObservation());
            profile.setSystolic({
                valueQuantity: { value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
            });

            const result = profile.getSystolic();
            expect(result).toBeDefined();
            expect(result?.valueQuantity?.value).toBe(120);
            // Should NOT include the code discriminator in simplified form
            expect((result as Record<string, unknown>)?.code).toBeUndefined();
        });

        it("returns full slice with discriminator via getSystolicRaw()", () => {
            const profile = new USCoreBloodPressureProfileProfile(createObservation());
            profile.setSystolic({
                valueQuantity: { value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
            });

            const raw = profile.getSystolicRaw();
            expect(raw).toBeDefined();
            expect(raw?.valueQuantity?.value).toBe(120);
            // Raw should include the code discriminator
            expect(raw?.code?.coding?.[0]?.code).toBe("8480-6");
        });

        it("returns undefined when slice not set", () => {
            const profile = new USCoreBloodPressureProfileProfile(createObservation());
            expect(profile.getSystolic()).toBeUndefined();
            expect(profile.getDiastolic()).toBeUndefined();
        });

        it("can get multiple slices independently", () => {
            const profile = new USCoreBloodPressureProfileProfile(createObservation());
            profile.setSystolic({ valueQuantity: { value: 120, unit: "mmHg" } });
            profile.setDiastolic({ valueQuantity: { value: 80, unit: "mmHg" } });

            const systolic = profile.getSystolic();
            const diastolic = profile.getDiastolic();

            expect(systolic?.valueQuantity?.value).toBe(120);
            expect(diastolic?.valueQuantity?.value).toBe(80);
        });
    });

    describe("Round-trip: set and get", () => {
        it("can set and get extension values", () => {
            const profile = new USCorePatientProfileProfile(createPatient());

            // Set values
            profile.setRace({
                ombCategory: { code: "2106-3", display: "White" },
                detailed: [{ code: "2108-9", display: "European" }],
                text: "White European",
            });

            // Get and verify
            const race = profile.getRace();
            expect(race?.text).toBe("White European");

            // Verify the resource has the extension
            const resource = profile.toResource();
            expect(resource.extension).toBeArray();
            expect(
                resource.extension?.some(
                    (e) => e.url === "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
                ),
            ).toBe(true);
        });
    });
});
