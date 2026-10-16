/**
 * A profile's choice accessors are typed against the base resource.
 *
 * `RequiredValueObservation` makes `Observation.value[x]` required and narrows it to Quantity
 * and `Reference(MolecularSequence)`, the same target the base R5 Observation allows.
 */

import { describe, expect, test } from "bun:test";
import { RequiredValueObservationProfile } from "./fhir-types/example-folder-structures/profiles/Observation_RequiredValueObservation";

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

describe("the generated modules", () => {
    test("the profile's value accessors", async () => {
        expect(
            await Bun.file(
                `${typesDir}/example-folder-structures/profiles/Observation_RequiredValueObservation.ts`,
            ).text(),
        ).toMatchSnapshot();
    });
});
