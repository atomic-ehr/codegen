/**
 * Repairing a profile whose reference targets exceed its base by narrowing the profile.
 *
 * `WidenedRelatedPerson` restates `RelatedPerson.patient` (base: Patient) with Patient and
 * Person. `generate.ts` builds `fhir-types-narrow-profile/` with a `canonicalManager.patches`
 * entry that narrows the profile's `RelatedPerson.patient` back to Patient; the base stays as
 * the FHIR specification defines it.
 */

import { describe, expect, test } from "bun:test";
import { WidenedRelatedPersonProfile } from "./fhir-types-narrow-profile/example-reference-targets/profiles/RelatedPerson_WidenedRelatedPerson";
import type { Reference } from "./fhir-types-narrow-profile/hl7-fhir-r5-core/Reference";
import type { RelatedPerson } from "./fhir-types-narrow-profile/hl7-fhir-r5-core/RelatedPerson";

const typesDir = `${import.meta.dir}/fhir-types-narrow-profile`;

describe("demo: a related person for a Patient", () => {
    test("the factory takes the Patient reference the base allows", () => {
        const profile = WidenedRelatedPersonProfile.create({ patient: { reference: "Patient/pt-1", type: "Patient" } });

        const resource = profile.toResource();

        expect(profile.validate().errors).toEqual([]);
        expect(resource).toMatchSnapshot();
    });
});

test("validate() rejects the Person target the patch dropped", () => {
    const fromWire: RelatedPerson = JSON.parse('{"resourceType":"RelatedPerson","patient":{"reference":"Person/p-1"}}');

    expect(WidenedRelatedPersonProfile.apply(fromWire).validate().errors).toEqual([
        "WidenedRelatedPerson: field 'patient' references 'Person' but only Patient are allowed",
    ]);
});

// Type-level assertions: never executed, checked by the example's `tsc --project` run —
// a `@ts-expect-error` directive that stops erroring fails the build.
export const _narrowProfileTypes = () => {
    const person: Reference<"Person"> = { reference: "Person/p-1", type: "Person" };
    // @ts-expect-error The base RelatedPerson admits only Patient.
    const base: RelatedPerson = { resourceType: "RelatedPerson", patient: person };
    // @ts-expect-error The factory input admits only Patient.
    WidenedRelatedPersonProfile.createResource({ patient: person });
    // @ts-expect-error The setter admits only Patient.
    WidenedRelatedPersonProfile.apply(base).setPatient(person);
};

describe("the generated modules", () => {
    test("the base RelatedPerson keeps its Patient-only target", async () => {
        const base = await Bun.file(`${typesDir}/hl7-fhir-r5-core/RelatedPerson.ts`).text();
        expect(base).toContain('patient: Reference<"Patient">;');
    });

    test("the profile admits only Patient", async () => {
        expect(
            await Bun.file(
                `${typesDir}/example-reference-targets/profiles/RelatedPerson_WidenedRelatedPerson.ts`,
            ).text(),
        ).toMatchSnapshot();
    });
});
