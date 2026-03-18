/**
 * Type discriminator slicing demo — ExampleTypedBundle profile.
 *
 * The profile slices Bundle.entry[] by resource type:
 *   - PatientEntry (min: 1, max: 1) — entry where resource is Patient
 *   - OrganizationEntry (min: 0, max: *) — entry where resource is Organization
 */

import { describe, expect, test } from "bun:test";
import type { Organization } from "./fhir-types/hl7-fhir-r4-core/Organization";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import { ExampleTypedBundleProfile } from "./fhir-types/example-folder-structures/profiles/Bundle_ExampleTypedBundle";

const createBundle = () => ExampleTypedBundleProfile.create({ type: "collection" });

const smithPatient: Patient = { resourceType: "Patient", name: [{ family: "Smith" }] };
const jonesPatient: Patient = { resourceType: "Patient", name: [{ family: "Jones" }] };
const activePatient: Patient = { resourceType: "Patient", active: true };
const acmeOrg: Organization = { resourceType: "Organization", name: "Acme Corp" };
const clinicOrg: Organization = { resourceType: "Organization", name: "Clinic" };

describe("type-discriminated bundle slices", () => {
    test("create() auto-populates a PatientEntry stub (min: 1)", () => {
        const bundle = createBundle();
        const entry = bundle.toResource().entry;
        expect(entry).toHaveLength(1);
        expect(entry![0]!.resource).toEqual({ resourceType: "Patient" });
    });

    test("setPatientEntry inserts a typed patient entry", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({ resource: smithPatient });

        const entry = bundle.getPatientEntry()!;
        expect(entry.resource).toEqual(smithPatient);
    });

    test("setPatientEntry replaces existing patient entry (no duplicates)", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({ resource: smithPatient });
        bundle.setPatientEntry({ resource: jonesPatient });

        const patients = bundle.toResource().entry!.filter((e) => e.resource?.resourceType === "Patient");
        expect(patients).toHaveLength(1);
        expect(bundle.getPatientEntry()!.resource).toEqual(jonesPatient);
    });

    test("setOrganizationEntry adds an organization entry", () => {
        const bundle = createBundle();
        bundle.setOrganizationEntry({ resource: acmeOrg });

        expect(bundle.getOrganizationEntry()!.resource).toEqual(acmeOrg);
    });

    test("getPatientEntry('flat') returns the entry as-is (no keys stripped)", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({ fullUrl: "urn:uuid:patient-1", resource: activePatient });

        const flat = bundle.getPatientEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:patient-1");
        expect(flat.resource).toEqual(activePatient);
    });

    test("validate() checks PatientEntry cardinality", () => {
        const bundle = ExampleTypedBundleProfile.apply({
            resourceType: "Bundle",
            type: "collection",
        });
        const { errors } = bundle.validate();
        expect(errors).toEqual(["ExampleTypedBundle.entry: slice 'PatientEntry' requires at least 1 item(s), found 0"]);
    });

    test("fluent chaining across slice setters", () => {
        const bundle = createBundle()
            .setPatientEntry({ resource: activePatient })
            .setOrganizationEntry({ resource: clinicOrg });

        expect(bundle.getPatientEntry()!.resource).toEqual(activePatient);
        expect(bundle.getOrganizationEntry()!.resource).toEqual(clinicOrg);
        expect(bundle.toResource().entry).toHaveLength(2);
    });

    test("set/get PatientEntry with full BundleEntry input", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({ fullUrl: "urn:uuid:p1", resource: smithPatient });

        const raw = bundle.getPatientEntry("raw")!;
        expect(raw.fullUrl).toBe("urn:uuid:p1");
        expect(raw.resource).toEqual(smithPatient);

        const flat = bundle.getPatientEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:p1");
        expect(flat.resource).toEqual(smithPatient);
    });

    test("set/get OrganizationEntry with full BundleEntry input", () => {
        const bundle = createBundle();
        bundle.setOrganizationEntry({ fullUrl: "urn:uuid:o1", resource: acmeOrg });

        const raw = bundle.getOrganizationEntry("raw")!;
        expect(raw.fullUrl).toBe("urn:uuid:o1");
        expect(raw.resource).toEqual(acmeOrg);

        const flat = bundle.getOrganizationEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:o1");
        expect(flat.resource).toEqual(acmeOrg);
    });
});
