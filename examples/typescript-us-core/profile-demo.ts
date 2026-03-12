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
import {
    USCoreBloodPressureProfile as usBpProfile,
    USCorePatientProfile as usPatientProfile,
} from "./fhir-types/hl7-fhir-us-core/profiles";

// =============================================================================
// Example 1: Creating a US Core Patient with extensions (flat API)
// =============================================================================
const createPatientExample = (): Patient => {
    console.log("=== Example 1: US Core Patient Profile ===\n");

    const patient = usPatientProfile.apply({ resourceType: "Patient" } as Patient);

    patient
        .setIdentifier([{ system: "http://hospital.example.org/patients", value: "12345" }])
        .setName([{ family: "Smith", given: ["John", "William"] }])
        .setRace({
            ombCategory: { system: "urn:oid:2.16.840.1.113883.6.238", code: "2106-3", display: "White" },
            text: "White",
        })
        .setEthnicity({
            ombCategory: { code: "2186-5", display: "Not Hispanic or Latino" },
            text: "Not Hispanic or Latino",
        })
        .setSex({ code: "M", display: "Male" });

    const resource = patient.toResource();
    resource.gender = "male";
    resource.birthDate = "1970-01-15";

    console.log("Created Patient resource:");
    console.log(JSON.stringify(resource, null, 2));
    console.log("\n");

    return resource;
};

// =============================================================================
// Example 2: Creating a Blood Pressure Observation with slices
// =============================================================================
const createBloodPressureExample = (): Observation => {
    console.log("=== Example 2: US Core Blood Pressure Profile ===\n");

    const bp = usBpProfile.apply({ resourceType: "Observation" } as Observation);

    bp.setStatus("final")
        .setCode({
            coding: [{ system: "http://loinc.org", code: "85354-9", display: "Blood pressure panel" }],
            text: "Blood Pressure",
        })
        .setSubject({ reference: "Patient/example-patient-1" })
        .setVSCat({})
        .setEffectiveDateTime("2024-01-15T10:30:00Z")
        .setSystolic({ value: 120, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" })
        .setDiastolic({ value: 80, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" });

    const resource = bp.toResource();
    console.log("Created Blood Pressure Observation:");
    console.log(JSON.stringify(resource, null, 2));
    console.log("\n");

    return resource;
};

// =============================================================================
// Example 3: Wrapping an existing resource
// =============================================================================
const wrapExistingResource = (): Patient => {
    console.log("=== Example 3: Wrapping an Existing Resource ===\n");

    const existingPatient: Patient = {
        resourceType: "Patient",
        meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
        identifier: [{ value: "67890" }],
        name: [{ family: "Doe", given: ["Jane"] }],
        gender: "female",
    };

    // from() validates the resource conforms to the profile
    const patient = usPatientProfile.from(existingPatient);

    // Read existing data
    console.log("Name:", patient.getName());
    console.log("Race:", patient.getRace());

    // Enrich with extensions
    patient.setSex({ code: "F", display: "Female" });

    const resource = patient.toResource();
    console.log("Updated Patient with extensions:");
    console.log(JSON.stringify(resource, null, 2));
    console.log("\n");

    return resource;
};

// =============================================================================
// Run all examples
// =============================================================================
console.log("FHIR Profile Usage Demo\n");
console.log("This demo shows how to use generated profile classes to work with");
console.log("FHIR profiles in a type-safe manner.\n");
console.log(`${"=".repeat(70)}\n`);

createPatientExample();
createBloodPressureExample();
wrapExistingResource();

console.log("=".repeat(70));
console.log("\nDemo completed successfully!");
