/**
 * FHIR R4 Resource Creation Demo
 *
 * This file demonstrates how to:
 * 1. Create a Patient resource
 * 2. Create an Observation resource
 * 3. Bundle them together in a FHIR Bundle
 */

import type { Bundle, BundleEntry } from "./fhir-types/hl7-fhir-r4-core/Bundle";
import type { CodeableConcept } from "./fhir-types/hl7-fhir-r4-core/CodeableConcept";
import type { Coding } from "./fhir-types/hl7-fhir-r4-core/Coding";
import type { Observation, ObservationReferenceRange } from "./fhir-types/hl7-fhir-r4-core/Observation";
import type { Address, ContactPoint, HumanName, Identifier, Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import type { Quantity } from "./fhir-types/hl7-fhir-r4-core/Quantity";
import type { Reference } from "./fhir-types/hl7-fhir-r4-core/Reference";

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
        {
            system: "phone",
            value: "555-555-5555",
            use: "home",
        },
        {
            system: "email",
            value: "john.smith@example.com",
            use: "work",
        },
    ];

    const address: Address = {
        line: ["123 Main St"],
        city: "Anytown",
        state: "CA",
        postalCode: "12345",
        country: "USA",
        use: "home",
    };

    const patient: Patient = {
        resourceType: "Patient",
        id: "patient-1",
        identifier: [identifier],
        active: true,
        name: [name],
        telecom: telecom,
        gender: "male",
        birthDate: "1974-12-25",
        address: [address],
    };

    return patient;
}

function createObservation(patientId: string): Observation {
    const glucoseCoding: Coding = {
        system: "http://loinc.org",
        code: "15074-8",
        display: "Glucose [Moles/volume] in Blood",
    };

    const glucoseConcept: CodeableConcept = {
        coding: [glucoseCoding],
        text: "Blood glucose measurement",
    };

    const referenceRange: ObservationReferenceRange = {
        low: {
            value: 3.1,
            unit: "mmol/L",
            system: "http://unitsofmeasure.org",
            code: "mmol/L",
        },
        high: {
            value: 6.2,
            unit: "mmol/L",
            system: "http://unitsofmeasure.org",
            code: "mmol/L",
        },
        text: "3.1 to 6.2 mmol/L",
    };

    const glucoseValue: Quantity = {
        value: 6.3,
        unit: "mmol/L",
        system: "http://unitsofmeasure.org",
        code: "mmol/L",
    };

    const patientReference: Reference<"Patient"> = {
        reference: `Patient/${patientId}`,
        display: "John Smith",
    };

    const observation: Observation = {
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
        code: glucoseConcept,
        subject: patientReference,
        effectiveDateTime: "2023-03-15T09:30:00Z",
        issued: "2023-03-15T10:15:00Z",
        valueQuantity: glucoseValue,
        referenceRange: [referenceRange],
    };

    return observation;
}

function createBundle(patient: Patient, observation: Observation): Bundle {
    const patientEntry: BundleEntry = {
        fullUrl: `urn:uuid:${patient.id}`,
        resource: patient,
    };

    const observationEntry: BundleEntry = {
        fullUrl: `urn:uuid:${observation.id}`,
        resource: observation,
    };

    const bundle: Bundle = {
        resourceType: "Bundle",
        id: "bundle-1",
        type_: "collection",
        entry: [patientEntry, observationEntry],
    };

    return bundle;
}

function runDemo() {
    console.log("Creating FHIR R4 resources demo...");

    const patient = createPatient();
    console.log("Created patient:", patient.id);

    const observation = createObservation(patient.id!);
    console.log("Created observation:", observation.id);

    const bundle = createBundle(patient, observation);
    console.log("Created bundle with", bundle.entry?.length, "resources");

    console.log("Bundle JSON:");
    console.log(JSON.stringify(bundle, null, 2));
}

runDemo();
