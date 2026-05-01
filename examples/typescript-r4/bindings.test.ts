/**
 * Demo: parse helpers for coded fields.
 *
 * Generated `bindings.ts` exports a `parse<Binding>` for each ValueSet-bound
 * field.  These parsers replace the unsafe `as Patient["gender"]` cast by
 * validating the input string at runtime and throwing on unknown values.
 * `parse<Binding>Coding` additionally fills in `system` and `display` from the
 * binding's lookup table, so callers can supply just the code.
 */

import { describe, expect, test } from "bun:test";
import {
    AdministrativeGenderCodes,
    AdministrativeGenderConcepts,
    parseAdministrativeGender,
    parseAdministrativeGenderCoding,
} from "./fhir-types/hl7-fhir-r4-core/bindings";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";

describe("demo: typed Patient.gender via parseAdministrativeGender", () => {
    test("CSV-like row goes through the parser, not an `as` cast", () => {
        const row = { gender: "female", birthDate: "1990-04-15" };

        const patient: Patient = {
            resourceType: "Patient",
            gender: parseAdministrativeGender(row.gender, "Patient.gender"),
            birthDate: row.birthDate,
        };

        expect(patient.gender).toBe("female");
    });

    test("parser throws on values outside the binding", () => {
        expect(() => parseAdministrativeGender("FEMALE", "Patient.gender")).toThrow(
            /Patient.gender: invalid value "FEMALE"/,
        );
    });

    test("Codes tuple is the literal union source-of-truth", () => {
        expect(AdministrativeGenderCodes).toEqual(["male", "female", "other", "unknown"]);
    });
});

describe("demo: ValueSet-bound Coding via parseAdministrativeGenderCoding", () => {
    test("supplying only the code fills in system and display", () => {
        const coding = parseAdministrativeGenderCoding("male");

        expect(coding).toEqual({
            system: "http://hl7.org/fhir/administrative-gender",
            code: "male",
            display: "Male",
        });
    });

    test("lookup table is exposed for direct access", () => {
        expect(AdministrativeGenderConcepts.unknown).toEqual({
            system: "http://hl7.org/fhir/administrative-gender",
            code: "unknown",
            display: "Unknown",
        });
    });

    test("parser throws on values outside the binding", () => {
        expect(() => parseAdministrativeGenderCoding("XX", "Patient.coding")).toThrow(
            /Patient.coding: invalid code "XX"/,
        );
    });
});
