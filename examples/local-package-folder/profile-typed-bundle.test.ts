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

describe("type-discriminated bundle slices", () => {
    test("create() auto-populates a PatientEntry stub (min: 1)", () => {
        const bundle = createBundle();
        const entry = bundle.toResource().entry;
        expect(entry).toHaveLength(1);
        expect(entry![0]!.resource as unknown).toEqual({ resourceType: "Patient" });
    });

    test("setPatientEntry inserts a typed patient entry", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({
            resource: { resourceType: "Patient", name: [{ family: "Smith" }] },
        } as never);

        const raw = bundle.getPatientEntry("raw")!;
        expect(raw.resource!.resourceType as string).toBe("Patient");
        expect((raw.resource as unknown as Record<string, unknown>).name).toEqual([{ family: "Smith" }]);
    });

    test("setPatientEntry replaces existing patient entry (no duplicates)", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({
            resource: { resourceType: "Patient", name: [{ family: "Smith" }] },
        } as never);
        bundle.setPatientEntry({
            resource: { resourceType: "Patient", name: [{ family: "Jones" }] },
        } as never);

        const patients = bundle.toResource().entry!.filter((e) => (e.resource?.resourceType as string) === "Patient");
        expect(patients).toHaveLength(1);
        expect((patients[0]!.resource as unknown as Record<string, unknown>).name).toEqual([{ family: "Jones" }]);
    });

    test("setOrganizationEntry adds an organization entry", () => {
        const bundle = createBundle();
        bundle.setOrganizationEntry({
            resource: { resourceType: "Organization", name: "Acme Corp" },
        } as never);

        const raw = bundle.getOrganizationEntry("raw")!;
        expect(raw.resource!.resourceType as string).toBe("Organization");
        expect((raw.resource as unknown as Record<string, unknown>).name).toBe("Acme Corp");
    });

    test("getPatientEntry('flat') returns the entry as-is (no keys stripped)", () => {
        const bundle = createBundle();
        bundle.setPatientEntry({
            fullUrl: "urn:uuid:patient-1",
            resource: { resourceType: "Patient", active: true },
        } as never);

        const flat = bundle.getPatientEntry("flat")!;
        expect(flat.fullUrl).toBe("urn:uuid:patient-1");
        expect(flat.resource!.resourceType as string).toBe("Patient");
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
            .setPatientEntry({
                resource: { resourceType: "Patient", active: true },
            } as never)
            .setOrganizationEntry({
                resource: { resourceType: "Organization", name: "Clinic" },
            } as never);

        expect(bundle.getPatientEntry("raw")!.resource!.resourceType as string).toBe("Patient");
        expect(bundle.getOrganizationEntry("raw")!.resource!.resourceType as string).toBe("Organization");
        expect(bundle.toResource().entry).toHaveLength(2);
    });
});
