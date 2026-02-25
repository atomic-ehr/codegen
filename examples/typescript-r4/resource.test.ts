/**
 * FHIR R4 Resource Creation Tests
 *
 * Tests for basic resource creation: Patient, Observation, Bundle.
 */

import { expect, test } from "bun:test";
import assert from "node:assert";
import type { Bundle, BundleEntry } from "./fhir-types/hl7-fhir-r4-core/Bundle";
import type { Observation, ObservationReferenceRange } from "./fhir-types/hl7-fhir-r4-core/Observation";
import type { Address, ContactPoint, HumanName, Identifier, Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";

function createPatient(): Patient {
    const identifier: Identifier = {
        system: "http://hospital.example.org/identifiers/patient",
        value: "12345",
        use: "official",
    };

    const name: HumanName = {
        family: "Smith",
        given: ["John", "Jacob"],
        use: "official",
        prefix: ["Mr."],
    };

    const telecom: ContactPoint[] = [
        { system: "phone", value: "555-555-5555", use: "home" },
        { system: "email", value: "john.smith@example.com", use: "work" },
    ];

    const address: Address = {
        line: ["123 Main St"],
        city: "Anytown",
        state: "CA",
        postalCode: "12345",
        country: "USA",
        use: "home",
    };

    return {
        resourceType: "Patient",
        id: "pt-1",
        identifier: [identifier],
        active: true,
        name: [name],
        telecom: telecom,
        gender: "male",
        birthDate: "1974-12-25",
        address: [address],
    };
}

function createObservation(patientId: string): Observation {
    const referenceRange: ObservationReferenceRange = {
        low: { value: 3.1, unit: "mmol/L", system: "http://unitsofmeasure.org", code: "mmol/L" },
        high: { value: 6.2, unit: "mmol/L", system: "http://unitsofmeasure.org", code: "mmol/L" },
        text: "3.1 to 6.2 mmol/L",
    };

    return {
        resourceType: "Observation",
        id: "glucose-obs-1",
        status: "final",
        category: [
            {
                coding: [
                    {
                        system: "http://terminology.hl7.org/CodeSystem/observation-category",
                        code: "laboratory",
                        display: "Laboratory",
                    },
                ],
                text: "Laboratory",
            },
        ],
        code: {
            coding: [{ system: "http://loinc.org", code: "15074-8", display: "Glucose [Moles/volume] in Blood" }],
            text: "Blood glucose measurement",
        },
        subject: { reference: `Patient/${patientId}`, display: "John Smith" },
        effectiveDateTime: "2023-03-15T09:30:00Z",
        issued: "2023-03-15T10:15:00Z",
        valueQuantity: { value: 6.3, unit: "mmol/L", system: "http://unitsofmeasure.org", code: "mmol/L" },
        referenceRange: [referenceRange],
        dataAbsentReason: {
            coding: [{ system: "http://terminology.hl7.org/CodeSystem/data-absent-reason", code: "not-performed" }],
        },
    };
}

function createBundle(patient: Patient, observation: Observation): Bundle {
    const patientEntry: BundleEntry = { fullUrl: `urn:uuid:${patient.id}`, resource: patient };
    const observationEntry: BundleEntry = { fullUrl: `urn:uuid:${observation.id}`, resource: observation };

    return {
        resourceType: "Bundle",
        id: "bundle-1",
        type: "collection",
        entry: [patientEntry, observationEntry],
    };
}

test("Patient resource", () => {
    const patient = createPatient();
    expect(patient).toMatchSnapshot();
});

test("Observation resource", () => {
    const observation = createObservation("pt-1");
    expect(observation).toMatchSnapshot();
});

test("Bundle with resources", () => {
    const patient = createPatient();
    assert(patient.id);
    const observation = createObservation(patient.id);
    const bundle = createBundle(patient, observation);

    expect(bundle.entry).toHaveLength(2);
    expect(bundle).toMatchSnapshot();
});
