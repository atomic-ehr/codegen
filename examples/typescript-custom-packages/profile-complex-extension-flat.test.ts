/**
 * Complex extension flat contract — what the generated factory accepts and what the
 * parent's getter returns.
 *
 * `NotedComplexExtension` is a complex extension with a required ordinary field
 * (`Extension.id`, min 1) beside its sub-extension slices, and `NotedPatient` carries it
 * as an extension slice — so the extension module and the parent's accessors are both
 * exercised. The `required` / `optional` / `identified` extensions cover the factory
 * input variants on their own.
 */

import { describe, expect, test } from "bun:test";
import { IdentifiedComplexExtensionProfile } from "./fhir-types/example-folder-structures/profiles/Extension_IdentifiedComplexExtension";
import { NotedComplexExtensionProfile } from "./fhir-types/example-folder-structures/profiles/Extension_NotedComplexExtension";
import { OptionalComplexExtensionProfile } from "./fhir-types/example-folder-structures/profiles/Extension_OptionalComplexExtension";
import { RequiredComplexExtensionProfile } from "./fhir-types/example-folder-structures/profiles/Extension_RequiredComplexExtension";
import { NotedPatientProfile } from "./fhir-types/example-folder-structures/profiles/Patient_NotedPatient";

const profilesDir = `${import.meta.dir}/fhir-types/example-folder-structures/profiles`;

describe("demo: carry a complex extension on a patient", () => {
    test("the flat input builds the sub-extensions and keeps the required ordinary field", () => {
        const patient = NotedPatientProfile.create().setNoted({ id: "note-1", note: "hello" });

        const resource = patient.toResource();

        expect(patient.validate().errors).toEqual([]);
        expect(resource).toMatchSnapshot();
    });

    test("the getter returns a flat value missing a member its type declares as required", () => {
        const patient = NotedPatientProfile.apply({
            resourceType: "Patient",
            extension: [
                {
                    url: NotedComplexExtensionProfile.canonicalUrl,
                    id: "note-1",
                    extension: [{ url: "detail", valueString: "d" }],
                },
            ],
        });

        // The getter is typed with the factory's flat type while extraction only ever
        // fills sub-extension values — `note` is declared required but is absent.
        const flat = patient.getNoted();
        // @ts-expect-error the getter's type promises members extraction never fills
        expect(flat).toEqual({ detail: "d" });
        expect(flat?.note).toBeUndefined();
    });
});

describe("demo: the extension factory input variants", () => {
    test("required, optional, and identified inputs", () => {
        expect(RequiredComplexExtensionProfile.createResource({ requiredValue: "present" })).toEqual({
            url: RequiredComplexExtensionProfile.canonicalUrl,
            extension: [{ url: "requiredValue", valueString: "present" }],
        });
        expect(OptionalComplexExtensionProfile.createResource().extension).toEqual([]);
        expect(IdentifiedComplexExtensionProfile.createResource({ id: "known", optionalValue: "present" })).toEqual({
            id: "known",
            url: IdentifiedComplexExtensionProfile.canonicalUrl,
            extension: [{ url: "optionalValue", valueString: "present" }],
        });
    });

    test("the raw input passes extensions through untouched", () => {
        expect(
            RequiredComplexExtensionProfile.create({
                extension: [{ url: "requiredValue", valueString: "present" }],
            }).toResource().extension,
        ).toEqual([{ url: "requiredValue", valueString: "present" }]);
        expect(IdentifiedComplexExtensionProfile.createResource({ id: "known", extension: [] })).toEqual({
            id: "known",
            url: IdentifiedComplexExtensionProfile.canonicalUrl,
            extension: [],
        });
    });
});

// Type-level assertions: never executed, checked by the example's `tsc --project` run —
// a `@ts-expect-error` directive that stops erroring fails the build.
export const _flatContractTypes = () => {
    // The factory input still requires what the profile requires.
    // @ts-expect-error Required sub-extension input cannot be omitted.
    RequiredComplexExtensionProfile.createResource();
    // @ts-expect-error The wrapper has the same required input contract.
    RequiredComplexExtensionProfile.create();
    // @ts-expect-error Flat inputs must retain required ordinary fields.
    IdentifiedComplexExtensionProfile.createResource({ optionalValue: "present" });
    // @ts-expect-error The parent's setter inherits the extension's flat contract.
    NotedPatientProfile.create().setNoted({ note: "hello" });
};

describe("the generated modules", () => {
    test("the complex extension the patient carries", async () => {
        expect(await Bun.file(`${profilesDir}/Extension_NotedComplexExtension.ts`).text()).toMatchSnapshot();
    });

    test("the extension whose flat input keeps a required ordinary field", async () => {
        expect(await Bun.file(`${profilesDir}/Extension_IdentifiedComplexExtension.ts`).text()).toMatchSnapshot();
    });

    test("the parent's accessors", async () => {
        expect(await Bun.file(`${profilesDir}/Patient_NotedPatient.ts`).text()).toMatchSnapshot();
    });
});
