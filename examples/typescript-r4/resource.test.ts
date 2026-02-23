/**
 * FHIR R4 Resource Creation Tests
 *
 * Tests for:
 * 1. Patient resource creation
 * 2. Observation resource creation
 * 3. Body weight observation using Profile class API
 * 4. Bundle creation
 */

import { expect, test } from "bun:test";
import type { Bundle, BundleEntry } from "./fhir-types/hl7-fhir-r4-core/Bundle";
import type { Observation, ObservationReferenceRange } from "./fhir-types/hl7-fhir-r4-core/Observation";
import type { Address, ContactPoint, HumanName, Identifier, Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import { bodyweightProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_bodyweight";

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

function createBodyWeightObservation(patientId: string): Observation {
    const baseObservation: Observation = {
        resourceType: "Observation",
        id: "bodyweight-obs-1",
        status: "final",
        code: {
            coding: [{ code: "29463-7", system: "http://loinc.org", display: "Body weight" }],
        },
        subject: { reference: `Patient/${patientId}`, display: "John Smith" },
        effectiveDateTime: "2023-03-15T09:30:00Z",
        valueQuantity: { value: 75.5, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" },
    };

    const profile = new bodyweightProfile(baseObservation).setVscat({ text: "Vital Signs" });
    return profile.toResource();
}

function createBundle(patient: Patient, observation: Observation, bodyweightObs: Observation): Bundle {
    const patientEntry: BundleEntry = { fullUrl: `urn:uuid:${patient.id}`, resource: patient };
    const observationEntry: BundleEntry = { fullUrl: `urn:uuid:${observation.id}`, resource: observation };
    const bodyweightEntry: BundleEntry = { fullUrl: `urn:uuid:${bodyweightObs.id}`, resource: bodyweightObs };

    return {
        resourceType: "Bundle",
        id: "bundle-1",
        type: "collection",
        entry: [patientEntry, observationEntry, bodyweightEntry],
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

test("Body weight observation with Profile class", () => {
    const bodyweight = createBodyWeightObservation("pt-1");

    expect(bodyweight.status).toBe("final");
    expect(bodyweight.code?.coding?.[0]?.code).toBe("29463-7");
    expect(bodyweight.valueQuantity?.value).toBe(75.5);

    // Check vital-signs category was added by profile
    const hasVitalSigns = bodyweight.category?.some((cat) => {
        const coding = cat.coding as unknown;
        if (Array.isArray(coding)) {
            return coding.some((c) => c.code === "vital-signs");
        }
        return (coding as { code?: string })?.code === "vital-signs";
    });
    expect(hasVitalSigns).toBe(true);

    expect(bodyweight).toMatchSnapshot();
});

test("Bundle with all resources", () => {
    const patient = createPatient();
    const observation = createObservation(patient.id!);
    const bodyweight = createBodyWeightObservation(patient.id!);
    const bundle = createBundle(patient, observation, bodyweight);

    expect(bundle.entry).toHaveLength(3);
    expect(bundle).toMatchSnapshot();
});
