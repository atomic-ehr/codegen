#!/usr/bin/env bun

/**
 * US Core Profile Usage Demo
 *
 * This example demonstrates how to use the generated US Core profile types
 * in a TypeScript application. This is a mock example showing the intended
 * usage patterns without requiring actual FHIR package generation.
 */

// Mock type definitions to demonstrate usage patterns
// In a real application, these would be imported from generated types

// Base FHIR types (simplified for demo)
interface Patient {
  resourceType: "Patient";
  id?: string;
  name?: HumanName[];
  gender?: "male" | "female" | "other" | "unknown";
  identifier?: Identifier[];
  extension?: Extension[];
}

interface HumanName {
  family?: string;
  given?: string[];
  use?: "usual" | "official" | "temp" | "nickname" | "anonymous" | "old" | "maiden";
}

interface Identifier {
  system?: string;
  value?: string;
  use?: "usual" | "official" | "temp" | "secondary" | "old";
}

interface Extension {
  url: string;
  extension?: Extension[];
  valueString?: string;
  valueCoding?: Coding;
  valueBoolean?: boolean;
}

interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

// US Core Profile Types (as they would be generated)
interface USCorePatientProfile extends Patient {
  /** Must Support: Patient name - required by US Core */
  name: HumanName[];

  /** Must Support: Administrative gender - required by US Core */
  gender: "male" | "female" | "other" | "unknown";

  /** Must Support: Patient identifier - required by US Core */
  identifier: Identifier[];

  /** US Core extensions with proper typing */
  extension?: (Extension | USCoreRaceExtension | USCoreEthnicityExtension)[];
}

interface USCoreRaceExtension extends Extension {
  url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race";
  extension: Array<{
    url: "ombCategory" | "detailed" | "text";
    valueCoding?: {
      system: "urn:oid:2.16.840.1.113883.6.238";
      code: USCoreRaceValueSet;
      display: string;
    };
    valueString?: string;
  }>;
}

interface USCoreEthnicityExtension extends Extension {
  url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity";
  extension: Array<{
    url: "ombCategory" | "detailed" | "text";
    valueCoding?: {
      system: "urn:oid:2.16.840.1.113883.6.238";
      code: USCoreEthnicityValueSet;
      display: string;
    };
    valueString?: string;
  }>;
}

// US Core Value Sets (as they would be generated)
type USCoreRaceValueSet =
  | "1002-5"  // American Indian or Alaska Native
  | "2028-9"  // Asian
  | "2054-5"  // Black or African American
  | "2076-8"  // Native Hawaiian or Other Pacific Islander
  | "2106-3"  // White
  | "UNK";    // Unknown

type USCoreEthnicityValueSet =
  | "2135-2"  // Hispanic or Latino
  | "2186-5"  // Not Hispanic or Latino
  | "UNK";    // Unknown

// Profile-aware reference types
interface ProfileReference<T> {
  reference: string;
  type?: string;
  display?: string;
}

// Type guards (as they would be generated)
function isUSCorePatientProfile(patient: Patient): patient is USCorePatientProfile {
  return patient.name !== undefined &&
         patient.gender !== undefined &&
         patient.identifier !== undefined &&
         Array.isArray(patient.name) && patient.name.length > 0 &&
         Array.isArray(patient.identifier) && patient.identifier.length > 0;
}

// Demo functions
async function demonstrateUSCorePatientUsage() {
  console.log('🏥 US Core Patient Profile Usage Demo');
  console.log('====================================\n');

  // Example 1: Creating a US Core compliant patient
  console.log('📝 Example 1: Creating a US Core Patient');

  const usCorePatient: USCorePatientProfile = {
    resourceType: "Patient",
    id: "us-core-patient-demo",

    // Required by US Core
    name: [{
      family: "Smith",
      given: ["Jane", "Marie"],
      use: "official"
    }],
    gender: "female",
    identifier: [{
      system: "http://hl7.org/fhir/sid/us-ssn",
      value: "123-45-6789",
      use: "usual"
    }],

    // US Core extensions with proper typing
    extension: [
      {
        url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
        extension: [{
          url: "ombCategory",
          valueCoding: {
            system: "urn:oid:2.16.840.1.113883.6.238",
            code: "2106-3" as USCoreRaceValueSet,
            display: "White"
          }
        }]
      } as USCoreRaceExtension,
      {
        url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity",
        extension: [{
          url: "ombCategory",
          valueCoding: {
            system: "urn:oid:2.16.840.1.113883.6.238",
            code: "2186-5" as USCoreEthnicityValueSet,
            display: "Not Hispanic or Latino"
          }
        }]
      } as USCoreEthnicityExtension
    ]
  };

  console.log('✅ US Core Patient created successfully');
  console.log(`   Name: ${usCorePatient.name?.[0]?.given?.join(' ')} ${usCorePatient.name?.[0]?.family}`);
  console.log(`   Gender: ${usCorePatient.gender}`);
  console.log(`   Identifier: ${usCorePatient.identifier?.[0]?.value}`);
  console.log(`   Extensions: ${usCorePatient.extension?.length || 0} US Core extensions`);
  console.log('');

  // Example 2: Type validation
  console.log('🔍 Example 2: Type Validation');

  const basePatient: Patient = {
    resourceType: "Patient",
    id: "base-patient",
    name: [{ family: "Doe", given: ["John"] }]
  };

  if (isUSCorePatientProfile(basePatient)) {
    console.log('✅ Patient meets US Core requirements');
  } else {
    console.log('❌ Patient does not meet US Core requirements');
    console.log('   Missing: gender and/or identifier');
  }
  console.log('');

  // Example 3: Profile-aware references
  console.log('🔗 Example 3: Profile-aware References');

  const patientReference: ProfileReference<USCorePatientProfile> = {
    reference: "Patient/us-core-patient-demo",
    type: "Patient",
    display: "Jane Marie Smith"
  };

  console.log('✅ Profile-aware reference created');
  console.log(`   Reference: ${patientReference.reference}`);
  console.log(`   Display: ${patientReference.display}`);
  console.log('');

  // Example 4: Value set usage
  console.log('🎯 Example 4: Value Set Usage');

  const validRaceCodes: USCoreRaceValueSet[] = ["1002-5", "2028-9", "2054-5", "2076-8", "2106-3", "UNK"];
  const validEthnicityCodes: USCoreEthnicityValueSet[] = ["2135-2", "2186-5", "UNK"];

  console.log('✅ US Core value sets defined');
  console.log(`   Race codes: ${validRaceCodes.length} options`);
  console.log(`   Ethnicity codes: ${validEthnicityCodes.length} options`);
  console.log('');

  return usCorePatient;
}

async function demonstrateAPIUsage() {
  console.log('🌐 API Integration Example');
  console.log('=========================\n');

  // Example API function that accepts US Core patients
  async function createPatientInEHR(patient: USCorePatientProfile): Promise<string> {
    // Simulate API call
    console.log('📤 Sending US Core Patient to EHR system...');
    console.log(`   Patient: ${patient.name?.[0]?.given?.join(' ')} ${patient.name?.[0]?.family}`);

    // In a real implementation, this would make an HTTP request
    // return fetch('/fhir/Patient', { method: 'POST', body: JSON.stringify(patient) });

    return `Patient/${patient.id}`;
  }

  // Example API function that validates US Core compliance
  function validateUSCoreCompliance(patient: Patient): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!patient.name || patient.name.length === 0) {
      errors.push('Missing required field: name');
    }

    if (!patient.gender) {
      errors.push('Missing required field: gender');
    }

    if (!patient.identifier || patient.identifier.length === 0) {
      errors.push('Missing required field: identifier');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  const patient = await demonstrateUSCorePatientUsage();

  // Validate compliance
  const validation = validateUSCoreCompliance(patient);
  if (validation.valid) {
    console.log('✅ Patient passes US Core validation');

    // Create in EHR
    const patientId = await createPatientInEHR(patient);
    console.log(`✅ Patient created with ID: ${patientId}`);
  } else {
    console.log('❌ Patient validation failed:');
    validation.errors.forEach(error => console.log(`   - ${error}`));
  }
}

async function main() {
  console.log('🚀 US Core Profile Types Usage Demo');
  console.log('===================================\n');

  console.log('This demo shows how to use generated US Core profile types:');
  console.log('1. Type-safe patient creation with required fields');
  console.log('2. Extension handling with proper typing');
  console.log('3. Value set integration for coded values');
  console.log('4. Profile validation and type guards');
  console.log('5. API integration patterns');
  console.log('');

  try {
    await demonstrateAPIUsage();

    console.log('');
    console.log('🎉 Demo completed successfully!');
    console.log('');
    console.log('Key benefits of generated US Core types:');
    console.log('✅ Compile-time validation of profile constraints');
    console.log('✅ IntelliSense support for required fields');
    console.log('✅ Type-safe extension handling');
    console.log('✅ Value set integration with union types');
    console.log('✅ Profile-aware reference types');
    console.log('✅ Runtime validation helpers');

  } catch (error) {
    console.error('❌ Demo error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
