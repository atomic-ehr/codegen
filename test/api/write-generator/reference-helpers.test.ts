import { describe, expect, it } from "bun:test";
import { validateReference } from "../../../assets/api/writer-generator/typescript/profile-helpers";

/**
 * What `validateReference` makes of each shape a FHIR reference can take.
 *
 * `Reference.reference` is a relative or absolute URL to a FHIR resource, and
 * the resource type is the segment before the id — optionally followed by
 * `/_history/<vid>`. A `urn:` or `#contained` reference carries no type at all,
 * so nothing can be checked for those.
 *
 * The matrix is snapshotted so a change in how the type is read shows up as an
 * outcome diff rather than as a silent behaviour change.
 */

const ALLOWED = ["Patient", "Organization"];

const REFERENCES = [
    // relative, the form the generated types constrain
    "Patient/123",
    "Patient/123/_history/2",
    "Organization/org-1",
    "Practitioner/pr-1",
    "Banana/1",
    // absolute — equally legal FHIR, and common across servers and in Bundles
    "http://ex.org/fhir/Patient/123",
    "https://ex.org/fhir/Patient/123/_history/2",
    "http://ex.org/Patient/123",
    "http://ex.org/fhir/Practitioner/pr-1",
    "https://ex.org/fhir/Banana/1",
    // no resource type is recoverable from these
    "urn:uuid:3fdc72f4-a11d-4a9d-9260-a9f745779e1d",
    "urn:oid:1.2.3.4",
    "#contained-1",
    "no-slash",
];

describe("validateReference over every reference form", () => {
    it("matches snapshot", () => {
        const outcomes = Object.fromEntries(
            REFERENCES.map((reference) => [
                reference,
                validateReference({ subject: { reference } }, "P", "subject", ALLOWED)[0] ?? "accepted",
            ]),
        );
        expect(outcomes).toMatchSnapshot();
    });

    it("accepts an allowed relative reference", () => {
        expect(validateReference({ subject: { reference: "Patient/123" } }, "P", "subject", ALLOWED)).toEqual([]);
    });

    it("rejects a relative reference to a type outside the allowed set", () => {
        expect(validateReference({ subject: { reference: "Practitioner/1" } }, "P", "subject", ALLOWED)).toEqual([
            "P: field 'subject' references 'Practitioner' but only Patient, Organization are allowed",
        ]);
    });

    it("ignores a field that is absent", () => {
        expect(validateReference({}, "P", "subject", ALLOWED)).toEqual([]);
    });
});
