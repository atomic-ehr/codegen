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
const acmeOrg: Organization = { resourceType: "Organization", name: "Acme" };

describe("demo: single-element slice (max: 1) — PatientEntry", () => {
    test("create, set, and validate a typed patient entry", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" });

        // No entry yet — validation fails (PatientEntry min: 1)
        expect(bundle.validate().errors).toEqual([
            "ExampleTypedBundle.entry: slice 'PatientEntry' requires at least 1 item(s), found 0",
        ]);

        // Set a single patient entry — typed as BundleEntry<Patient>
        bundle.setPatientEntry({ resource: smithPatient });
        expect(bundle.validate().errors).toEqual([]);

        // Getter returns the entry with resource narrowed to Patient
        const entry = bundle.getPatientEntry()!;
        expect(entry.resource).toEqual(smithPatient);
    });

    test("setPatientEntry replaces existing entry (no duplicates)", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" });
        bundle.setPatientEntry({ resource: smithPatient });
        bundle.setPatientEntry({ resource: activePatient });

        // Only one patient entry — the second call replaced the first
        expect(bundle.toResource().entry).toHaveLength(1);
        expect(bundle.getPatientEntry()!.resource).toEqual(activePatient);
    });
});

describe("demo: unbounded slice (max: *) — OrganizationEntry", () => {
    test("setter accepts an array, getter returns an array", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" }).setPatientEntry({
            resource: activePatient,
        });

        // Set multiple organization entries at once
        bundle.setOrganizationEntry([{ resource: clinicOrg }, { resource: acmeOrg }]);

        // Getter returns all matching entries as an array
        const orgs = bundle.getOrganizationEntry();
        expect(orgs).toHaveLength(2);
        expect(orgs[0]!.resource).toEqual(clinicOrg);
        expect(orgs[1]!.resource).toEqual(acmeOrg);

        // Total entries: 1 patient + 2 organizations
        expect(bundle.toResource().entry).toHaveLength(3);
    });

    test("setOrganizationEntry replaces all previous org entries", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" })
            .setPatientEntry({ resource: activePatient })
            .setOrganizationEntry([{ resource: clinicOrg }, { resource: acmeOrg }]);

        // Replace with a single org — previous two are removed
        bundle.setOrganizationEntry([{ resource: { resourceType: "Organization", name: "NewCo" } }]);

        const orgs = bundle.getOrganizationEntry();
        expect(orgs).toHaveLength(1);
        expect(orgs[0]!.resource!.name).toBe("NewCo");

        // Patient entry unaffected
        expect(bundle.getPatientEntry()!.resource).toEqual(activePatient);
    });

    test("append to existing entries via spread", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" })
            .setPatientEntry({ resource: activePatient })
            .setOrganizationEntry([{ resource: clinicOrg }]);

        // Append a new org by spreading existing entries
        bundle.setOrganizationEntry([...bundle.getOrganizationEntry(), { resource: acmeOrg }]);

        const orgs = bundle.getOrganizationEntry();
        expect(orgs).toHaveLength(2);
        expect(orgs[0]!.resource).toEqual(clinicOrg);
        expect(orgs[1]!.resource).toEqual(acmeOrg);
    });

    test("empty array removes all org entries", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" })
            .setPatientEntry({ resource: activePatient })
            .setOrganizationEntry([{ resource: clinicOrg }]);

        bundle.setOrganizationEntry([]);

        expect(bundle.getOrganizationEntry()).toHaveLength(0);
        // Patient entry still present
        expect(bundle.toResource().entry).toHaveLength(1);
    });
});

describe("fluent chaining across slice types", () => {
    test("chain single and array setters", () => {
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" })
            .setPatientEntry({ fullUrl: "urn:uuid:patient-1", resource: activePatient })
            .setOrganizationEntry([
                { fullUrl: "urn:uuid:org-1", resource: clinicOrg },
                { fullUrl: "urn:uuid:org-2", resource: acmeOrg },
            ]);

        expect(bundle.toResource().entry).toHaveLength(3);
        expect(bundle.getPatientEntry()!.fullUrl).toBe("urn:uuid:patient-1");
        expect(bundle.getOrganizationEntry()[0]!.fullUrl).toBe("urn:uuid:org-1");
        expect(bundle.getOrganizationEntry()[1]!.fullUrl).toBe("urn:uuid:org-2");
    });
});
