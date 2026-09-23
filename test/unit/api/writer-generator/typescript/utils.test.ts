import { describe, expect, test } from "bun:test";
import { fieldTsType } from "@root/api/writer-generator/typescript/utils";
import type { CanonicalUrl, Name, ProfileIdentifier, RegularField, TypeIdentifier } from "@root/typeschema/types";

const makeIdentifier = (kind: TypeIdentifier["kind"], name: string): TypeIdentifier => ({
    kind,
    package: "test-package",
    version: "1.0.0",
    name: name as Name,
    url: `http://example.org/StructureDefinition/${name}` as CanonicalUrl,
});

const referenceType = makeIdentifier("complex-type", "Reference");
const patient = makeIdentifier("resource", "Patient");
const group = makeIdentifier("resource", "Group");
const usCorePatient = makeIdentifier("profile", "USCorePatient") as ProfileIdentifier;
const testPatient = makeIdentifier("profile", "TestPatient") as ProfileIdentifier;

const resolveRef = (ref: TypeIdentifier): TypeIdentifier => {
    if (ref.name === usCorePatient.name || ref.name === testPatient.name) return patient;
    return ref;
};

describe("fieldTsType reference targets", () => {
    test("plain resource targets have no comment", () => {
        const field: RegularField = { type: referenceType, reference: { resource: [patient, group] } };
        expect(fieldTsType(field, resolveRef)).toBe(`Reference<"Patient" | "Group">`);
    });

    test("profile target replaced by its resource type keeps the profile url as a comment", () => {
        const field: RegularField = {
            type: referenceType,
            reference: { resource: [patient], profiles: [usCorePatient] },
        };
        expect(fieldTsType(field, resolveRef)).toBe(
            `Reference<"Patient" /* http://example.org/StructureDefinition/USCorePatient */>`,
        );
    });

    test("multiple profiles of the same resource are listed in one comma-separated comment", () => {
        const field: RegularField = {
            type: referenceType,
            reference: { resource: [group, patient], profiles: [usCorePatient, testPatient] },
        };
        expect(fieldTsType(field, resolveRef)).toBe(
            `Reference<"Group" | "Patient" /* http://example.org/StructureDefinition/USCorePatient, http://example.org/StructureDefinition/TestPatient */>`,
        );
    });
});
