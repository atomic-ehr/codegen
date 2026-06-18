/**
 * Inherited base-required field demo — ExampleTypedBundle profile.
 *
 * `Bundle.type` is required by base R4 Bundle (1..1). The ExampleTypedBundle
 * profile differential only slices `entry` — it never re-states `type`. The
 * generated validate() must still flag a missing `type`, otherwise a resource
 * that omits it passes TypeScript-side validation only to be rejected by the
 * FHIR server at write time.
 *
 * This exercises the generated code (not codegen internals): build the resource,
 * drop the inherited field, and observe validate() catch it at runtime.
 */

import { describe, expect, test } from "bun:test";
import { ExampleTypedBundleProfile } from "./fhir-types/example-folder-structures/profiles/Bundle_ExampleTypedBundle";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";

const patient: Patient = { resourceType: "Patient", name: [{ family: "Smith" }] };

describe("demo: inherited base-required field (Bundle.type)", () => {
    test("validate() flags a missing inherited-required field and clears once set", () => {
        // A fully valid bundle: required `type` set, PatientEntry slice satisfied.
        const bundle = ExampleTypedBundleProfile.create({ type: "collection" }).setPatientEntry({ resource: patient });
        expect(bundle.validate().errors).toEqual([]);

        // Drop `type` — inherited from base Bundle, never re-stated in the profile
        // differential. validate() must still report it as missing.
        delete (bundle.toResource() as { type?: unknown }).type;
        expect(bundle.validate().errors).toEqual(["ExampleTypedBundle: required field 'type' is missing"]);

        // Restoring the inherited field clears the error.
        bundle.setType("collection");
        expect(bundle.validate().errors).toEqual([]);
    });
});
