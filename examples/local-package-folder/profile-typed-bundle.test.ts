/**
 * Type discriminator slicing demo — ExampleTypedBundle profile.
 *
 * The profile slices Bundle.entry[] by resource type:
 *   - PatientEntry (min: 1, max: 1) — entry where resource is Patient
 *   - OrganizationEntry (min: 0, max: *) — entry where resource is Organization
 */

import { describe, expect, test } from "bun:test";
import { ExampleTypedBundleProfile } from "./fhir-types/example-folder-structures/profiles/Bundle_ExampleTypedBundle";

const createBundle = () => ExampleTypedBundleProfile.create({ type: "collection" });

const smithPatient = { resourceType: "Patient", name: [{ family: "Smith" }] } as const;
const jonesPatient = { resourceType: "Patient", name: [{ family: "Jones" }] } as const;
const activePatient = { resourceType: "Patient", active: true } as const;
const acmeOrg = { resourceType: "Organization", name: "Acme Corp" } as const;
const clinicOrg = { resourceType: "Organization", name: "Clinic" } as const;

describe("type-discriminated bundle slices", () => {
    test("create() auto-populates a PatientEntry stub (min: 1)", () => {
        const bundle = createBundle();
        const entry = bundle.toResource().entry;
        expect(entry).toHaveLength(1);
        expect(entry![0]!.resource as unknown).toEqual({ resourceType: "Patient" });
    });

    test("setPatientEntry inserts a typed patient entry", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({ resource: smithPatient } as never);

        expect(bundle.getPatientEntry()!.resource as unknown).toEqual(smithPatient);
    });

    test("setPatientEntry replaces existing patient entry (no duplicates)", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({ resource: smithPatient } as never);
        bundle.setPatientEntry({ resource: jonesPatient } as never);

        const patients = bundle.toResource().entry!.filter((e) => (e.resource as { resourceType: string })?.resourceType === "Patient");
        expect(patients).toHaveLength(1);
        expect(bundle.getPatientEntry()!.resource as unknown).toEqual(jonesPatient);
    });

    test("setOrganizationEntry adds an organization entry", () => {
        const bundle = createBundle();
        bundle.setOrganizationEntry({ resource: acmeOrg } as never);

        expect(bundle.getOrganizationEntry()!.resource as unknown).toEqual(acmeOrg);
    });

    test("getPatientEntry('flat') returns the entry as-is (no keys stripped)", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({ fullUrl: "urn:uuid:patient-1", resource: activePatient } as never);

        const flat = bundle.getPatientEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:patient-1");
        expect(flat.resource as unknown).toEqual(activePatient);
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
            .setPatientEntry({ resource: activePatient } as never)
            .setOrganizationEntry({ resource: clinicOrg } as never);

        expect(bundle.getPatientEntry()!.resource as unknown).toEqual(activePatient);
        expect(bundle.getOrganizationEntry()!.resource as unknown).toEqual(clinicOrg);
        expect(bundle.toResource().entry).toHaveLength(2);
    });

    test("set/get PatientEntry with full BundleEntry input", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({ fullUrl: "urn:uuid:p1", resource: smithPatient } as never);

        const raw = bundle.getPatientEntry("raw")!;
        expect(raw.fullUrl).toBe("urn:uuid:p1");
        expect(raw.resource as unknown).toEqual(smithPatient);

        const flat = bundle.getPatientEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:p1");
        expect(flat.resource as unknown).toEqual(smithPatient);
    });

    test("set/get OrganizationEntry with full BundleEntry input", () => {
        const bundle = createBundle();
        bundle.setOrganizationEntry({ fullUrl: "urn:uuid:o1", resource: acmeOrg } as never);

        const raw = bundle.getOrganizationEntry("raw")!;
        expect(raw.fullUrl).toBe("urn:uuid:o1");
        expect(raw.resource as unknown).toEqual(acmeOrg);

        const flat = bundle.getOrganizationEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:o1");
        expect(flat.resource as unknown).toEqual(acmeOrg);
    });
});
