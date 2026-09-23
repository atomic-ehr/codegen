/**
 * What a narrowed `Reference<T>` actually constrains.
 *
 * A FHIR reference carries the pointer in `reference` and an optional
 * restatement of what it points at in `type`. The generated type parameter
 * reaches both: `reference` through a template literal on its prefix, `type`
 * directly. An element whose targets are a family (`Reference(Any)` → `Resource`)
 * widens to `string`, so both stay open.
 *
 * The `@ts-expect-error` directives are real assertions — the example is
 * typechecked with `tsc --project`, so a directive that stops erroring fails the
 * build.
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import type { Provenance } from "./fhir-types/hl7-fhir-r4-core/Provenance";
import type { Reference } from "./fhir-types/hl7-fhir-r4-core/Reference";

// Observation.subject is Reference<"Device" | "Group" | "Location" | "Patient">
type Subject = NonNullable<Observation["subject"]>;
// Provenance.target is Reference<string /* Resource */>[]
type Target = Provenance["target"][number];

describe("a narrowed reference constrains the pointer", () => {
    test("an allowed target passes", () => {
        const subject: Subject = { reference: "Patient/pt-1" };
        expect(subject.reference).toBe("Patient/pt-1");
    });

    test("a target the element does not allow does not compile", () => {
        // @ts-expect-error Practitioner is not among the declared targets
        const subject: Subject = { reference: "Practitioner/pr-1" };
        expect(subject).toBeDefined();
    });

    test("a string that is not a resource reference at all does not compile", () => {
        // @ts-expect-error Banana is not a resource type
        const subject: Subject = { reference: "Banana/1" };
        expect(subject).toBeDefined();
    });
});

describe("a narrowed reference constrains the restated type", () => {
    test("the matching type passes", () => {
        const subject: Subject = { reference: "Patient/pt-1", type: "Patient" };
        expect(subject.type).toBe("Patient");
    });

    test("a type the element does not allow does not compile", () => {
        // @ts-expect-error Practitioner is not among the declared targets
        const subject: Subject = { type: "Practitioner" };
        expect(subject).toBeDefined();
    });

    test("a nonsense type does not compile", () => {
        // @ts-expect-error Banana is not a resource type
        const subject: Subject = { type: "Banana" };
        expect(subject).toBeDefined();
    });
});

describe("a family target stays open", () => {
    test("any resource may be referenced and restated", () => {
        const target: Target = { reference: "Practitioner/pr-1", type: "Practitioner" };
        expect(target.type).toBe("Practitioner");
    });

    test("a narrowed reference is assignable to the family-typed element", () => {
        const patient: Reference<"Patient"> = { reference: "Patient/pt-1", type: "Patient" };
        const targets: Provenance["target"] = [patient];
        expect(targets).toHaveLength(1);
    });
});
