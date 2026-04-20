/**
 * KBV_PR_FOR_Patient profile — regression test for duplicate meta key (#137).
 *
 * KBV profiles require `meta` (min: 1). The codegen now merges caller meta
 * with the auto-set meta.profile via spread.
 */

import { describe, expect, test } from "bun:test";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import { KBV_PR_FOR_PatientProfile } from "./fhir-types/kbv-ita-for/profiles/Patient_KBV_PR_FOR_Patient";

const canonicalUrl = "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Patient";

describe("demo: KBV Patient with required meta", () => {
    test("create preserves caller meta fields alongside meta.profile", () => {
        const profile = KBV_PR_FOR_PatientProfile.create({
            name: [{ family: "Müller", given: ["Hans"] }],
            birthDate: "1990-01-15",
            id: "patient-1",
            meta: { versionId: "1", lastUpdated: "2024-01-01T00:00:00Z" },
        });

        const resource = profile.toResource();
        expect(resource.meta?.profile).toContain(canonicalUrl);
        expect(resource.meta?.versionId).toBe("1");
        expect(resource.meta?.lastUpdated).toBe("2024-01-01T00:00:00Z");
    });

    test("createResource merges meta correctly", () => {
        const resource = KBV_PR_FOR_PatientProfile.createResource({
            name: [{ family: "Schmidt" }],
            birthDate: "1985-06-20",
            id: "patient-2",
            meta: { versionId: "2" },
        });

        expect(resource.meta?.profile).toContain(canonicalUrl);
        expect(resource.meta?.versionId).toBe("2");
    });
});

describe("demo: apply and from work correctly", () => {
    test("apply adds meta.profile to an existing Patient", () => {
        const patient: Patient = {
            resourceType: "Patient",
            name: [{ family: "Weber" }],
            birthDate: "2000-03-10",
        };

        const profile = KBV_PR_FOR_PatientProfile.apply(patient);

        expect(profile.toResource()).toBe(patient);
        expect(patient.meta?.profile).toContain(canonicalUrl);
    });

    test("from wraps a valid KBV Patient", () => {
        const json: Patient = {
            resourceType: "Patient",
            id: "patient-3",
            meta: { profile: [canonicalUrl], versionId: "3" },
            name: [{ family: "Fischer", given: ["Anna"] }],
            birthDate: "1975-11-30",
        };

        const profile = KBV_PR_FOR_PatientProfile.from(json);

        expect(profile.getMeta()?.versionId).toBe("3");
        expect(profile.getName()).toEqual([{ family: "Fischer", given: ["Anna"] }]);
        expect(profile.getBirthDate()).toBe("1975-11-30");
    });

    test("from throws when meta.profile is missing", () => {
        const json: Patient = {
            resourceType: "Patient",
            name: [{ family: "Koch" }],
            birthDate: "1960-01-01",
        };

        expect(() => KBV_PR_FOR_PatientProfile.from(json)).toThrow(/meta.profile must include/);
    });
});
