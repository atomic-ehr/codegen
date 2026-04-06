/**
 * Type discriminator slicing demo — ExampleTypedBundle profile.
 *
 * The profile slices Bundle.entry[] by resource type:
 *   - PatientEntry (min: 1, max: 1) — entry where resource is Patient
 *   - OrganizationEntry (min: 0, max: *) — entry where resource is Organization
 *
 * Generic type parameters (BundleEntry<Patient>, BundleEntry<Organization>) let
 * the compiler narrow `entry.resource` to the concrete resource type — no casts needed.
 */

import { describe, expect, test } from "bun:test";
import { ExampleTypedBundleProfile } from "./fhir-types/example-folder-structures/profiles/Bundle_ExampleTypedBundle";
import type { Organization } from "./fhir-types/hl7-fhir-r4-core/Organization";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";

const smithPatient: Patient = { resourceType: "Patient", name: [{ family: "Smith" }] };
const activePatient: Patient = { resourceType: "Patient", active: true };
const clinicOrg: Organization = { resourceType: "Organization", name: "Clinic" };

describe("type-discriminated bundle slices", () => {
    test("create() starts with no entry — PatientEntry must be set by user", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" });
        expect(bundle.toResource().entry).toBeUndefined();
        expect(bundle.validate().errors).toEqual([
            "ExampleTypedBundle.entry: slice 'PatientEntry' requires at least 1 item(s), found 0",
        ]);
    });

    test("setPatientEntry inserts a typed patient entry", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" });
        bundle.setPatientEntry({ resource: smithPatient });

        const entry = bundle.getPatientEntry()!;
        expect(entry.resource).toEqual(smithPatient);
        expect(bundle.validate().errors).toEqual([]);
    });

    test("setPatientEntry replaces existing patient entry (no duplicates)", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" });
        bundle.setPatientEntry({ resource: smithPatient });
        bundle.setPatientEntry({ resource: activePatient });

        const entries = bundle.toResource().entry!;
        expect(entries).toHaveLength(1);
        expect(entries[0]!.resource).toEqual(activePatient);
    });

    test("getPatientEntry('flat') returns the entry as-is (no keys stripped)", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" });
        bundle.setPatientEntry({ fullUrl: "urn:uuid:patient-1", resource: activePatient });

        const flat = bundle.getPatientEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:patient-1");
        expect(flat.resource).toEqual(activePatient);
    });

    test("fluent chaining across slice setters", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" })
            .setPatientEntry({ resource: activePatient })
            .setOrganizationEntry([{ resource: clinicOrg }]);

        expect(bundle.toResource().entry).toHaveLength(2);
        expect(bundle.getPatientEntry()!.resource).toEqual(activePatient);
        expect(bundle.getOrganizationEntry()[0]!.resource).toEqual(clinicOrg);
    });

    test("setOrganizationEntry replaces all org entries (unbounded slice)", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" })
            .setPatientEntry({ resource: activePatient })
            .setOrganizationEntry([{ resource: clinicOrg }])
            .setOrganizationEntry([{ resource: { resourceType: "Organization", name: "Acme" } }]);

        const entries = bundle.toResource().entry!;
        expect(entries).toHaveLength(2);
        expect(bundle.getOrganizationEntry()[0]!.resource!.name).toBe("Acme");
    });

    test("setOrganizationEntry supports multiple items (max: *)", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" })
            .setPatientEntry({ resource: activePatient })
            .setOrganizationEntry([
                { resource: clinicOrg },
                { resource: { resourceType: "Organization", name: "Acme" } },
            ]);

        const entries = bundle.toResource().entry!;
        expect(entries).toHaveLength(3);
        const orgs = bundle.getOrganizationEntry();
        expect(orgs).toHaveLength(2);
        expect(orgs[0]!.resource).toEqual(clinicOrg);
        expect(orgs[1]!.resource!.name).toBe("Acme");
    });
});
