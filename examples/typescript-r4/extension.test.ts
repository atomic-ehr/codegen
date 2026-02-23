/**
 * FHIR R4 Extension Demo Test
 *
 * Uses Bun snapshot testing to validate the generated Patient resource.
 */

import { expect, test } from "bun:test";
import type { HumanName } from "./fhir-types/hl7-fhir-r4-core/HumanName";
import type { Patient, PatientContact } from "./fhir-types/hl7-fhir-r4-core/Patient";

function createPatientWithExtensions(): Patient {
    const name: HumanName = {
        extension: [{ url: "http://example.org/fhir/StructureDefinition/name-verified", valueBoolean: true }],
        family: "van Beethoven",
        _family: {
            extension: [{ url: "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix", valueString: "van" }],
        },
        given: ["Ludwig", "Maria", "Johann"],
        _given: [
            {
                extension: [
                    { url: "http://example.org/fhir/StructureDefinition/name-source", valueCode: "birth-certificate" },
                ],
            },
            null,
            {
                extension: [
                    { url: "http://example.org/fhir/StructureDefinition/name-source", valueCode: "baptism-record" },
                ],
            },
        ],
    };

    const contact: PatientContact = {
        extension: [{ url: "http://example.org/fhir/StructureDefinition/contact-priority", valueInteger: 1 }],
        name: { family: "Watson", given: ["John"] },
        telecom: [{ system: "phone", value: "+44-20-7946-1234" }],
    };

    return {
        resourceType: "Patient",
        id: "ext-demo",
        extension: [
            {
                url: "http://hl7.org/fhir/StructureDefinition/patient-birthPlace",
                valueAddress: { city: "Springfield", country: "US" },
            },
        ],
        modifierExtension: [{ url: "http://example.org/fhir/StructureDefinition/do-not-contact", valueBoolean: false }],
        birthDate: "1990-03-15",
        _birthDate: {
            extension: [
                {
                    url: "http://hl7.org/fhir/StructureDefinition/patient-birthTime",
                    valueDateTime: "1990-03-15T08:22:00-05:00",
                },
            ],
        },
        name: [name],
        contact: [contact],
    };
}

test("Patient with extensions", () => {
    const patient = createPatientWithExtensions();
    expect(patient).toMatchSnapshot();
});
