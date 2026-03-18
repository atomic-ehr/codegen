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
import type { BundleEntry } from "./fhir-types/hl7-fhir-r4-core/Bundle";
import type { DomainResource } from "./fhir-types/hl7-fhir-r4-core/DomainResource";
import type { Organization } from "./fhir-types/hl7-fhir-r4-core/Organization";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";

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

    test("set/get PatientEntry with full BundleEntry<Patient> input", () => {
        const bundle = createBundle();
        const input: BundleEntry<Patient> = { fullUrl: "urn:uuid:p1", resource: smithPatient };
        bundle.setPatientEntry(input);

        const raw = bundle.getPatientEntry("raw")!;
        expect(raw.fullUrl).toBe("urn:uuid:p1");
        expect(raw.resource).toEqual(smithPatient);

        const flat = bundle.getPatientEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:p1");
        expect(flat.resource).toEqual(smithPatient);
    });

    test("set/get OrganizationEntry with full BundleEntry<Organization> input", () => {
        const bundle = createBundle();
        const input: BundleEntry<Organization> = { fullUrl: "urn:uuid:o1", resource: acmeOrg };
        bundle.setOrganizationEntry(input);

        const raw = bundle.getOrganizationEntry("raw")!;
        expect(raw.fullUrl).toBe("urn:uuid:o1");
        expect(raw.resource).toEqual(acmeOrg);

        const flat = bundle.getOrganizationEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:o1");
        expect(flat.resource).toEqual(acmeOrg);
    });
});

describe("generic type-family fields — compile-time narrowing", () => {
    test("BundleEntry<Patient>.resource is Patient (access Patient-specific fields without cast)", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({ resource: smithPatient });

        const entry = bundle.getPatientEntry()!;
        // entry.resource is Patient — .name is available directly, no cast needed
        const family: string | undefined = entry.resource?.name?.[0]?.family;
        expect(family).toBe("Smith");
    });

    test("BundleEntry<Organization>.resource is Organization (access Organization-specific fields without cast)", () => {
        const bundle = createBundle();
        bundle.setOrganizationEntry({ resource: acmeOrg });

        const entry = bundle.getOrganizationEntry()!;
        // entry.resource is Organization — .name is string, not HumanName[]
        const name: string | undefined = entry.resource?.name;
        expect(name).toBe("Acme Corp");
    });

    test("BundleEntry<T> defaults to BundleEntry<Resource> — unparameterized usage unchanged", () => {
        const entry: BundleEntry = { resource: smithPatient };
        expect(entry.resource?.resourceType).toBe("Patient");
    });

    test("DomainResource<T> narrows contained to T[]", () => {
        const container: DomainResource<Patient> = {
            resourceType: "Patient",
            contained: [smithPatient, jonesPatient],
        };
        // contained is Patient[] — .name available directly
        const family: string | undefined = container.contained?.[0]?.name?.[0]?.family;
        expect(family).toBe("Smith");
    });

    test("BundleEntry<Patient> rejects Organization at compile time", () => {
        const patientEntry: BundleEntry<Patient> = { resource: smithPatient };
        expect(patientEntry.resource?.resourceType).toBe("Patient");

        // Uncomment to verify compile error:
        // @ts-expect-error — Organization is not assignable to Patient
        const _bad: BundleEntry<Patient> = { resource: acmeOrg };
        void _bad;
    });
});
