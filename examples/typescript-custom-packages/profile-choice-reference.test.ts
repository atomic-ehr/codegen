/**
 * A profile's choice accessors are typed against the base resource.
 *
 * `RequiredValueObservation` makes `Observation.value[x]` required and narrows it to Quantity
 * and `Reference(MolecularSequence)`, the same target the base R5 Observation allows.
 */

import { describe, expect, test } from "bun:test";
import { RequiredValueObservationProfile } from "./fhir-types/example-folder-structures/profiles/Observation_RequiredValueObservation";
import type { Observation } from "./fhir-types/hl7-fhir-r5-core/Observation";
import type { Reference } from "./fhir-types/hl7-fhir-r5-core/Reference";

const typesDir = `${import.meta.dir}/fhir-types`;

describe("demo: an observation whose value is a molecular sequence", () => {
    test("the reference setter writes the value the base allows", () => {
        const profile = RequiredValueObservationProfile.create({
            status: "final",
            code: { text: "Sequenced variant" },
        });

        // Setting one variant of value[x] clears the others.
        profile.setValueQuantity({ value: 3, unit: "mm" });
        profile.setValueReference({ reference: "MolecularSequence/seq-1", type: "MolecularSequence" });

        expect(profile.validate().errors).toEqual([]);
        expect(profile.toResource()).toMatchSnapshot();
    });
});

// Type-level assertions: never executed, checked by the example's `tsc --project` run —
// a `@ts-expect-error` directive that stops erroring fails the build.
export const _choiceReferenceTypes = (observation: Observation) => {
    const patient: Reference<"Patient"> = { reference: "Patient/pt-1", type: "Patient" };
    // @ts-expect-error The base Observation.valueReference admits only MolecularSequence.
    RequiredValueObservationProfile.apply(observation).setValueReference(patient);
};

describe("the generated modules", () => {
    test("the profile's value accessors", async () => {
        expect(
            await Bun.file(
                `${typesDir}/example-folder-structures/profiles/Observation_RequiredValueObservation.ts`,
            ).text(),
        ).toMatchSnapshot();
    });
});
