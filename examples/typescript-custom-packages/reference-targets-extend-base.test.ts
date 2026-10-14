/**
 * Repairing a profile whose reference targets exceed its base by extending the base.
 *
 * `WidenedRelatedPerson` restates `RelatedPerson.patient` (base: Patient) with Patient and
 * Person. `generate.ts` builds `fhir-types-extend-base/` with a `canonicalManager.patches`
 * entry that extends the base `RelatedPerson.patient` to Patient and Person, so the profile
 * becomes a valid narrowing of its base.
 */

import { describe, expect, test } from "bun:test";
import { WidenedRelatedPersonProfile } from "./fhir-types-extend-base/example-reference-targets/profiles/RelatedPerson_WidenedRelatedPerson";
import type { Reference } from "./fhir-types-extend-base/hl7-fhir-r5-core/Reference";
import type { RelatedPerson } from "./fhir-types-extend-base/hl7-fhir-r5-core/RelatedPerson";

const typesDir = `${import.meta.dir}/fhir-types-extend-base`;

describe("demo: a related person for a Person", () => {
    test("the factory takes the Person reference the extended base allows", () => {
        const profile = WidenedRelatedPersonProfile.create({ patient: { reference: "Person/p-1", type: "Person" } });

        const resource = profile.toResource();

        expect(profile.validate().errors).toEqual([]);
        expect(resource).toMatchSnapshot();
    });
});

test("validate() rejects a target outside Patient and Person", () => {
    const fromWire: RelatedPerson = JSON.parse('{"resourceType":"RelatedPerson","patient":{"reference":"Group/g-1"}}');

    expect(WidenedRelatedPersonProfile.apply(fromWire).validate().errors).toEqual([
        "WidenedRelatedPerson: field 'patient' references 'Group' but only Patient, Person are allowed",
    ]);
});

// Type-level assertions: never executed, checked by the example's `tsc --project` run —
// a `@ts-expect-error` directive that stops erroring fails the build.
export const _extendBaseTypes = () => {
    const person: Reference<"Person"> = { reference: "Person/p-1", type: "Person" };
    const base: RelatedPerson = { resourceType: "RelatedPerson", patient: person };
    const profile = WidenedRelatedPersonProfile.apply(base);
    profile.setPatient(person);

    const group: Reference<"Group"> = { reference: "Group/g-1", type: "Group" };
    // @ts-expect-error The factory input admits only Patient and Person.
    WidenedRelatedPersonProfile.createResource({ patient: group });
    // @ts-expect-error The setter admits only Patient and Person.
    profile.setPatient(group);
};

describe("the generated modules", () => {
    test("the base RelatedPerson admits Patient and Person", async () => {
        const base = await Bun.file(`${typesDir}/hl7-fhir-r5-core/RelatedPerson.ts`).text();
        expect(base).toContain('patient: Reference<"Patient" | "Person">;');
    });

    test("the profile admits Patient and Person", async () => {
        expect(
            await Bun.file(
                `${typesDir}/example-reference-targets/profiles/RelatedPerson_WidenedRelatedPerson.ts`,
            ).text(),
        ).toMatchSnapshot();
    });
});
