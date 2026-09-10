import { expect, test } from "bun:test";
import { validateReference } from "../../../../../assets/api/writer-generator/typescript/profile-helpers";

test("validateReference accepts an Organization for a Resource target", () => {
    expect(
        validateReference({ subject: { reference: "Organization/synthetic" } }, "Audit", "subject", ["Resource"]),
    ).toEqual([]);
});

test("validateReference accepts a Practitioner for a Resource target", () => {
    expect(
        validateReference({ subject: { reference: "Practitioner/synthetic" } }, "Audit", "subject", ["Resource"]),
    ).toEqual([]);
});

test("validateReference accepts a Patient for a Patient target", () => {
    expect(validateReference({ subject: { reference: "Patient/synthetic" } }, "Audit", "subject", ["Patient"])).toEqual(
        [],
    );
});

test("validateReference rejects an Organization for a Patient target", () => {
    expect(
        validateReference({ subject: { reference: "Organization/synthetic" } }, "Audit", "subject", ["Patient"]),
    ).toHaveLength(1);
});
