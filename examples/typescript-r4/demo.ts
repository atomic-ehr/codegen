/**
 * FHIR R4 Resource Creation Demo
 *
 * This file demonstrates how to:
 * 1. Create a Patient resource
 * 2. Create an Observation resource
 * 3. Create a body weight observation using the Profile class API
 * 4. Use the fluent Profile builder pattern
 * 5. Bundle them together in a FHIR Bundle
 */

import type { Bundle, BundleEntry } from "./fhir-types/hl7-fhir-r4-core/Bundle";
import type { CodeableConcept } from "./fhir-types/hl7-fhir-r4-core/CodeableConcept";
import type { Coding } from "./fhir-types/hl7-fhir-r4-core/Coding";
import type { Observation, ObservationReferenceRange } from "./fhir-types/hl7-fhir-r4-core/Observation";
import type { Address, ContactPoint, HumanName, Identifier, Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import {
    Observation_bodyweightProfile,
    type observation_bodyweight,
} from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_bodyweight";
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
        id: "pt-1",
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

function createBodyWeightObservation(patientId: string): Observation {
    // Create the base observation
    const baseObservation: Observation = {
        resourceType: "Observation",
        id: "bodyweight-obs-1",
        status: "final",
        code: {
            coding: [
                {
                    code: "29463-7",
                    system: "http://loinc.org",
                    display: "Body weight",
                },
            ],
        },
        subject: {
            reference: `Patient/${patientId}`,
            display: "John Smith",
        },
        effectiveDateTime: "2023-03-15T09:30:00Z",
        valueQuantity: {
            value: 75.5,
            unit: "kg",
            system: "http://unitsofmeasure.org",
            code: "kg",
        },
    };

    console.log("Base observation:", JSON.stringify(baseObservation, null, 2));

    // Use the Profile class to add profile-specific slices
    const profile = new Observation_bodyweightProfile(baseObservation).setVscat({ text: "Vital Signs" }); // Add VSCat slice with vital-signs coding

    // Get the resource back (as base Observation type)
    const bodyweightObservation = profile.toResource();
    console.log("Body weight observation with profile:", JSON.stringify(bodyweightObservation, null, 2));

    // Validate the observation
    console.log("\n--- Validation: bodyweight observation ---");

    const isStatusCorrect = bodyweightObservation.status === "final";
    const isCodeCorrect =
        bodyweightObservation.code?.coding?.[0]?.code === "29463-7" &&
        bodyweightObservation.code?.coding?.[0]?.system === "http://loinc.org";
    const hasValueQuantity = bodyweightObservation.valueQuantity !== undefined;
    const isValueQuantityCorrect =
        bodyweightObservation.valueQuantity?.value === 75.5 && bodyweightObservation.valueQuantity?.unit === "kg";
    // Note: The slice match applies coding as an object, so we check both formats
    const hasVitalSignsCategory = bodyweightObservation.category?.some((cat) => {
        const coding = cat.coding as unknown;
        if (Array.isArray(coding)) {
            return coding.some((c) => c.code === "vital-signs");
        }
        // Handle case where coding is applied as object (from slice match)
        return (coding as { code?: string })?.code === "vital-signs";
    });

    console.log("Status is 'final':", isStatusCorrect);
    console.log("Code is LOINC 29463-7 (Body weight):", isCodeCorrect);
    console.log("Has valueQuantity:", hasValueQuantity);
    console.log("ValueQuantity is correct (75.5 kg):", isValueQuantityCorrect);
    console.log("Has vital-signs category:", hasVitalSignsCategory);

    if (!isStatusCorrect || !isCodeCorrect || !hasValueQuantity || !isValueQuantityCorrect || !hasVitalSignsCategory) {
        throw new Error("Bodyweight observation is not valid");
    }

    // Demonstrate getter methods
    console.log("\n--- Profile getter methods ---");

    const vscatSlice = profile.getVscat();
    console.log("getVscat() (simplified):", JSON.stringify(vscatSlice, null, 2));

    const vscatRaw = profile.getVscatRaw();
    console.log("getVscatRaw() (full FHIR):", JSON.stringify(vscatRaw, null, 2));

    // Get the typed profile interface
    const typedProfile: observation_bodyweight = profile.toProfile();
    console.log("\n--- Typed profile interface ---");
    console.log("Profile subject (typed as Reference<Patient>):", typedProfile.subject);
    console.log("Profile category (required array):", typedProfile.category);

    return bodyweightObservation;
}

function createBundle(patient: Patient, observation: Observation, bodyweightObs: Observation): Bundle {
    const patientEntry: BundleEntry = {
        fullUrl: `urn:uuid:${patient.id}`,
        resource: patient,
    };

    const observationEntry: BundleEntry = {
        fullUrl: `urn:uuid:${observation.id}`,
        resource: observation,
    };

    const bodyweightEntry: BundleEntry = {
        fullUrl: `urn:uuid:${bodyweightObs.id}`,
        resource: bodyweightObs,
    };

    const bundle: Bundle = {
        resourceType: "Bundle",
        id: "bundle-1",
        type: "collection",
        entry: [patientEntry, observationEntry, bodyweightEntry],
    };

    return bundle;
}

function runDemo() {
    console.log("=".repeat(60));
    console.log("Creating FHIR R4 resources demo with Profile class API...");
    console.log("=".repeat(60));

    const patient = createPatient();
    console.log("Created patient:", patient.id);

    if (!patient.id) throw new Error("Failed to create patient");
    const observation = createObservation(patient.id);
    console.log("Created glucose observation:", observation.id);

    console.log(`\n${"=".repeat(60)}`);
    console.log("Bodyweight profile demo using Profile class:");
    console.log("=".repeat(60));

    const bodyweightObs = createBodyWeightObservation(patient.id);
    console.log("\nCreated body weight observation with profile:", bodyweightObs.id);

    const bundle = createBundle(patient, observation, bodyweightObs);
    console.log("\nCreated bundle with", bundle.entry?.length, "resources");

    console.log(`\n${"=".repeat(60)}`);
    console.log("Final Bundle JSON:");
    console.log("=".repeat(60));
    console.log(JSON.stringify(bundle, null, 2));
}

runDemo();
