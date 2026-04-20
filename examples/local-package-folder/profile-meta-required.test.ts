/**
 * PatientMetaRequired profile demo — exercises a profile where `meta` is required (min: 1).
 *
 * Regression test for #137: `createResource()` merges the caller's meta fields
 * with the auto-set `meta.profile` array via spread.
 */

import { describe, expect, test } from "bun:test";
import { PatientMetaRequiredProfile } from "./fhir-types/example-folder-structures/profiles/Patient_PatientMetaRequired";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";

const canonicalUrl = "http://example.org/fhir/StructureDefinition/PatientMetaRequired";

describe("demo: create a patient with required meta", () => {
    test("create sets meta.profile and preserves caller meta fields", () => {
        const profile = PatientMetaRequiredProfile.create({
            meta: { versionId: "1", lastUpdated: "2024-01-01T00:00:00Z" },
        });

        const resource = profile.toResource();

        // meta.profile is auto-set by the profile class
        expect(resource.meta?.profile).toContain(canonicalUrl);
        // Caller-provided meta fields are preserved via spread
        expect(resource.meta?.versionId).toBe("1");
        expect(resource.meta?.lastUpdated).toBe("2024-01-01T00:00:00Z");

        // Valid — meta is present and required field is satisfied
        expect(profile.validate().errors).toEqual([]);
        expect(resource).toMatchSnapshot();
    });

    test("createResource also merges meta correctly", () => {
        const resource = PatientMetaRequiredProfile.createResource({
            meta: { versionId: "2" },
        });

        expect(resource.meta?.profile).toContain(canonicalUrl);
        expect(resource.meta?.versionId).toBe("2");
    });
});

describe("demo: apply profile to an existing Patient", () => {
    test("apply adds meta.profile to a plain Patient", () => {
        const patient: Patient = {
            resourceType: "Patient",
            name: [{ family: "Smith" }],
        };

        const profile = PatientMetaRequiredProfile.apply(patient);

        // apply() mutates the original resource
        expect(profile.toResource()).toBe(patient);
        expect(patient.meta?.profile).toContain(canonicalUrl);

        // Valid — meta is now present
        expect(profile.validate().errors).toEqual([]);
    });

    test("apply preserves existing meta fields", () => {
        const patient: Patient = {
            resourceType: "Patient",
            meta: { versionId: "5", lastUpdated: "2025-06-15T12:00:00Z" },
            name: [{ family: "Doe" }],
        };

        const profile = PatientMetaRequiredProfile.apply(patient);

        // Existing meta fields are preserved
        expect(patient.meta?.versionId).toBe("5");
        expect(patient.meta?.lastUpdated).toBe("2025-06-15T12:00:00Z");
        // meta.profile is added alongside existing fields
        expect(patient.meta?.profile).toContain(canonicalUrl);

        expect(profile.validate().errors).toEqual([]);
    });
});

describe("demo: read a Patient from JSON via from()", () => {
    test("from() wraps a valid Patient with meta.profile set", () => {
        const json: Patient = {
            resourceType: "Patient",
            meta: {
                profile: [canonicalUrl],
                versionId: "3",
            },
            name: [{ family: "Jones" }],
        };

        const profile = PatientMetaRequiredProfile.from(json);

        expect(profile.getMeta()?.versionId).toBe("3");
        expect(profile.toResource()).toBe(json);
    });

    test("from() throws when meta.profile is missing", () => {
        const json: Patient = {
            resourceType: "Patient",
            name: [{ family: "Jones" }],
        };

        expect(() => PatientMetaRequiredProfile.from(json)).toThrow(/meta.profile must include/);
    });
});

describe("validate", () => {
    test("validate reports error when meta is absent", () => {
        // Construct directly to bypass factory methods that auto-set meta
        const profile = new (
            PatientMetaRequiredProfile as unknown as {
                new (r: Patient): PatientMetaRequiredProfile;
            }
        )({ resourceType: "Patient" });

        expect(profile.validate().errors).toEqual(["PatientMetaRequired: required field 'meta' is missing"]);
    });
});
