/**
 * A profile whose reference target is wider than its base's.
 *
 * `WidenedRelatedPerson` restates `RelatedPerson.patient` with Patient and Person, but the
 * base R5 `RelatedPerson.patient` allows only Patient. The generator keeps the base's
 * targets and reports the dropped Person as a warning, so the profile's input types stay
 * assignable to the base resource it builds.
 */

import { describe, expect, test } from "bun:test";
import { WidenedRelatedPersonProfile } from "./fhir-types/example-folder-structures/profiles/RelatedPerson_WidenedRelatedPerson";
import type { Reference } from "./fhir-types/hl7-fhir-r5-core/Reference";
import type { RelatedPerson } from "./fhir-types/hl7-fhir-r5-core/RelatedPerson";

const profilesDir = `${import.meta.dir}/fhir-types/example-folder-structures/profiles`;

describe("demo: create a related person for a patient", () => {
    test("the factory takes the Patient reference the base allows", () => {
        const profile = WidenedRelatedPersonProfile.create({ patient: { reference: "Patient/pt-1" } });

        const resource = profile.toResource();

        expect(profile.validate().errors).toEqual([]);
        expect(resource).toMatchSnapshot();
    });
});

describe("the dropped Person target", () => {
    test("validate() rejects a Person reference read from the wire", () => {
        const fromWire: RelatedPerson = JSON.parse(
            '{"resourceType":"RelatedPerson","patient":{"reference":"Person/p-1"}}',
        );

        expect(WidenedRelatedPersonProfile.apply(fromWire).validate().errors).toEqual([
            "WidenedRelatedPerson: field 'patient' references 'Person' but only Patient are allowed",
        ]);
    });
});

// Type-level assertions: never executed, checked by the example's `tsc --project` run —
// a `@ts-expect-error` directive that stops erroring fails the build.
export const _referenceWideningTypes = () => {
    const person: Reference<"Person"> = { reference: "Person/p-1", type: "Person" };
    // @ts-expect-error The factory input keeps the base's Patient-only target.
    WidenedRelatedPersonProfile.createResource({ patient: person });

    const profile = WidenedRelatedPersonProfile.create({ patient: { reference: "Patient/pt-1" } });
    // @ts-expect-error The setter keeps the base's Patient-only target.
    profile.setPatient(person);
};

describe("the generated module", () => {
    test("the profile keeps the base's Patient-only target", async () => {
        expect(await Bun.file(`${profilesDir}/RelatedPerson_WidenedRelatedPerson.ts`).text()).toMatchSnapshot();
    });
});
