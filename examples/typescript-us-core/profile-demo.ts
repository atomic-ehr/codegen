/**
 * Demo file showing how to use generated FHIR profile classes.
 *
 * Profile classes provide a fluent API for working with FHIR profiles,
 * making it easy to set extensions and slices with proper discriminator values.
 *
 * Run this demo with: bun run examples/typescript-us-core/profile-demo.ts
 */

import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import { USCoreBloodPressureProfileProfile } from "./fhir-types/hl7-fhir-us-core/profiles/UscoreBloodPressureProfile";
import { USCorePatientProfileProfile } from "./fhir-types/hl7-fhir-us-core/profiles/UscorePatientProfile";

// =============================================================================
// Example 1: Creating a US Core Patient with extensions (flat API)
// =============================================================================
function createPatientExample(): Patient {
    console.log("=== Example 1: US Core Patient Profile ===\n");

    // Create a new patient profile builder with a base Patient resource
    const patientProfile = new USCorePatientProfileProfile({ resourceType: "Patient" });

    // Use fluent API with FLAT object structure - no nested extensions!
    patientProfile
        .setRace({
            // Flat API - just provide the values directly
            ombCategory: {
                system: "urn:oid:2.16.840.1.113883.6.238",
                code: "2106-3",
                display: "White",
            },
            text: "White",
        })
        .setEthnicity({
            // Flat API - no need to deal with extension arrays
            ombCategory: {
                system: "urn:oid:2.16.840.1.113883.6.238",
                code: "2186-5",
                display: "Not Hispanic or Latino",
            },
            text: "Not Hispanic or Latino",
        })
        .setSex({
            system: "http://hl7.org/fhir/us/core/CodeSystem/birthsex",
            code: "M",
            display: "Male",
        });

    // Get the underlying FHIR resource
    const patient = patientProfile.toResource();

    // Add additional fields directly to the resource
    patient.id = "example-patient-1";
    patient.identifier = [
        {
            system: "http://hospital.example.org/patients",
            value: "12345",
        },
    ];
    patient.name = [
        {
            family: "Smith",
            given: ["John", "William"],
        },
    ];
    patient.gender = "male";
    patient.birthDate = "1970-01-15";

    console.log("Created Patient resource:");
    console.log(JSON.stringify(patient, null, 2));
    console.log("\n");

    return patient;
}

// =============================================================================
// Example 2: Creating a Blood Pressure Observation with slices
// =============================================================================
function createBloodPressureExample(): Observation {
    console.log("=== Example 2: US Core Blood Pressure Profile ===\n");

    // Create a blood pressure profile builder with a base Observation resource
    const bpProfile = new USCoreBloodPressureProfileProfile({ resourceType: "Observation" } as Observation);

    // Use fluent API to set slices - discriminator values are auto-applied
    bpProfile
        .setVscat({
            // The coding for vital-signs is auto-applied by the profile
        })
        .setSystolic({
            // The code for systolic (8480-6) is auto-applied by the profile
            valueQuantity: {
                value: 120,
                unit: "mmHg",
                system: "http://unitsofmeasure.org",
                code: "mm[Hg]",
            },
        })
        .setDiastolic({
            // The code for diastolic (8462-4) is auto-applied by the profile
            valueQuantity: {
                value: 80,
                unit: "mmHg",
                system: "http://unitsofmeasure.org",
                code: "mm[Hg]",
            },
        });

    // Get the underlying FHIR resource
    const observation = bpProfile.toResource();

    // Add additional fields
    observation.id = "blood-pressure-1";
    observation.status = "final";
    observation.code = {
        coding: [
            {
                system: "http://loinc.org",
                code: "85354-9",
                display: "Blood pressure panel with all children optional",
            },
        ],
        text: "Blood Pressure",
    };
    observation.effectiveDateTime = "2024-01-15T10:30:00Z";
    observation.subject = {
        reference: "Patient/example-patient-1",
    };

    console.log("Created Blood Pressure Observation:");
    console.log(JSON.stringify(observation, null, 2));
    console.log("\n");

    return observation;
}

// =============================================================================
// Example 3: Wrapping an existing resource
// =============================================================================
function wrapExistingResource(): Patient {
    console.log("=== Example 3: Wrapping an Existing Resource ===\n");

    // Existing patient resource (e.g., from API)
    const existingPatient: Patient = {
        resourceType: "Patient",
        id: "existing-patient",
        name: [{ family: "Doe", given: ["Jane"] }],
        gender: "female",
    };

    // Wrap it with the profile class to add US Core extensions
    const patientProfile = new USCorePatientProfileProfile(existingPatient);

    // Add extensions using the fluent API
    patientProfile.setSex({
        system: "http://hl7.org/fhir/us/core/CodeSystem/birthsex",
        code: "F",
        display: "Female",
    });

    const updatedPatient = patientProfile.toResource();

    console.log("Updated Patient with extensions:");
    console.log(JSON.stringify(updatedPatient, null, 2));
    console.log("\n");

    return updatedPatient;
}

// =============================================================================
// Example 4: Using reset methods
// =============================================================================
function resetExtensionExample(): Patient {
    console.log("=== Example 4: Resetting Extensions ===\n");

    // Create patient with extensions
    const patientProfile = new USCorePatientProfileProfile({ resourceType: "Patient" });
    patientProfile
        .setSex({
            system: "http://hl7.org/fhir/us/core/CodeSystem/birthsex",
            code: "M",
            display: "Male",
        })
        .setInterpreterRequired({
            system: "http://terminology.hl7.org/CodeSystem/v2-0136",
            code: "Y",
            display: "Yes",
        });

    console.log("Before reset - extensions count:", patientProfile.toResource().extension?.length);

    // Reset interpreter required extension
    patientProfile.resetInterpreterRequired();

    console.log("After resetInterpreterRequired - extensions count:", patientProfile.toResource().extension?.length);

    const patient = patientProfile.toResource();
    console.log("Patient after reset:");
    console.log(JSON.stringify(patient, null, 2));
    console.log("\n");

    return patient;
}

// =============================================================================
// Run all examples
// =============================================================================
console.log("FHIR Profile Usage Demo\n");
console.log("This demo shows how to use generated profile classes to work with");
console.log("FHIR profiles in a type-safe manner.\n");
console.log("=".repeat(70) + "\n");

createPatientExample();
createBloodPressureExample();
wrapExistingResource();
resetExtensionExample();

console.log("=".repeat(70));
console.log("\nDemo completed successfully!");
