/**
 * Test file to verify generated profile types work correctly
 */

import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import { USCorePatientProfile } from "./fhir-types/hl7-fhir-us-core/profiles/USCorePatientProfile";
import { createUSCorePatientProfile } from "./fhir-types/hl7-fhir-us-core/profiles/USCorePatientProfile";

// Test 1: Create a profile from an existing patient resource
const patientResource: Patient = {
	resourceType: "Patient",
	id: "example",
	meta: {
		profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"],
	},
	name: [
		{
			family: "Smith",
			given: ["John"],
		},
	],
	gender: "male",
	birthDate: "1990-01-01",
};

const profile = new USCorePatientProfile(patientResource);

// Test 2: Access constrained fields via property accessors
console.log("Gender:", profile.gender); // ✅ Constrained field (required in profile)
profile.gender = "female"; // ✅ Property setter with validation

// Test 3: Access unconstrained fields via readonly resource property
console.log("Birth date:", profile.resource.birthDate); // ✅ Read access
// profile.resource.birthDate = "1990-01-15"; // ❌ TypeScript error: readonly
// Note: Unconstrained fields should be set on the resource before creating the profile

// Test 4: Use array helpers for constrained array fields (new feature!)
profile.addIdentifier({
	system: "http://example.org/mrn",
	value: "12345",
}); // ✅ Add to constrained field

console.log("Identifiers:", profile.identifier.length);

// Remove identifiers
const removed = profile.removeIdentifier((id) => id.value === "12345"); // ✅ Remove by predicate
console.log("Removed identifiers:", removed);

// Test 5: Use extension accessors (new feature!)
profile.birthsex = {
	url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex",
	valueCode: "M",
}; // ✅ Property setter for extension

console.log("Birth sex:", profile.birthsex?.valueCode); // ✅ Property getter for extension

// Test 5: Collection extension
profile.addGenderIdentity({
	url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity",
	valueCodeableConcept: {
		coding: [
			{
				system: "http://terminology.hl7.org/CodeSystem/v3-NullFlavor",
				code: "ASKU",
				display: "asked but unknown",
			},
		],
	},
}); // ✅ Add to collection extension

console.log("Gender identity extensions:", profile.genderIdentity.length);

// Test 7: Use factory function
const newProfile = createUSCorePatientProfile(); // ✅ Factory creates with proper meta.profile
console.log("New profile URL:", newProfile.resource.meta?.profile?.[0]);

// Test 8: toJSON for serialization
const jsonString = JSON.stringify(profile); // ✅ Serializes to underlying Patient resource
const parsed = JSON.parse(jsonString);
console.log("Serialized resourceType:", parsed.resourceType); // "Patient"
console.log("Has meta.profile:", !!parsed.meta?.profile); // true

// Test 9: Type safety - these should cause TypeScript errors if uncommented:
// profile.resource.birthDate = 123; // ❌ Error: Type 'number' is not assignable to type 'string | undefined'
// profile.addIdentifier("not an identifier"); // ❌ Error: Argument of type 'string' is not assignable to parameter of type 'Identifier'

console.log("✅ All type checks passed!");
