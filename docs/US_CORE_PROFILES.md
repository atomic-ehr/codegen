# US Core Profile Types Documentation

This guide explains how to use the generated US Core profile types in your TypeScript applications.

## Overview

US Core profiles extend base FHIR resources with additional constraints, required fields, and extensions specific to US healthcare implementations. The codegen tool generates TypeScript interfaces that enforce these constraints at compile time.

## Quick Start

### 1. Generate US Core Types

```bash
# Create TypeSchema from US Core package
bun run atomic-codegen typeschema create hl7.fhir.us.core --output ./schemas/us-core.ndjson

# Generate TypeScript types
bun run atomic-codegen generate typescript --input ./schemas/us-core.ndjson --output ./src/types
```

### 2. Import and Use Profile Types

```typescript
// Import base FHIR types
import { Patient, Observation } from './types/resources';

// Import US Core profile types
import { 
  USCorePatientProfile, 
  USCoreObservationProfile 
} from './types/resources/profiles/uscore';

// Import US Core value sets
import { 
  USCoreRaceValueSet, 
  USCoreEthnicityValueSet,
  USCoreSimpleObservationCategoryValueSet 
} from './types/valuesets';
```

## Profile Types

### US Core Patient Profile

The US Core Patient profile requires specific fields and supports US-specific extensions:

```typescript
const usCorePatient: USCorePatientProfile = {
  resourceType: "Patient",
  id: "example-patient",
  
  // Required fields
  name: [{ 
    family: "Smith", 
    given: ["John", "Michael"] 
  }],
  gender: "male",
  identifier: [{
    system: "http://hl7.org/fhir/sid/us-ssn",
    value: "123-45-6789"
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
    },
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
    }
  ]
};
```

### US Core Observation Profile

The US Core Observation profile includes constraints for vital signs and laboratory results:

```typescript
const usCoreObservation: USCoreObservationProfile = {
  resourceType: "Observation",
  id: "example-observation",
  
  // Required fields
  status: "final",
  category: [{
    coding: [{
      system: "http://terminology.hl7.org/CodeSystem/observation-category",
      code: "vital-signs" as USCoreSimpleObservationCategoryValueSet,
      display: "Vital Signs"
    }]
  }],
  code: {
    coding: [{
      system: "http://loinc.org",
      code: "8867-4",
      display: "Heart rate"
    }]
  },
  subject: {
    reference: "Patient/example-patient"
  },
  effectiveDateTime: "2023-08-05T10:30:00Z",
  valueQuantity: {
    value: 72,
    unit: "beats/min",
    system: "http://unitsofmeasure.org",
    code: "/min"
  }
};
```

## Profile Constraints

### Required Fields

Profile types enforce required fields at compile time:

```typescript
// ❌ This will cause a TypeScript error - missing required fields
const invalidPatient: USCorePatientProfile = {
  resourceType: "Patient",
  id: "invalid"
  // Missing: name, gender, identifier
};

// ✅ This compiles successfully
const validPatient: USCorePatientProfile = {
  resourceType: "Patient",
  id: "valid",
  name: [{ family: "Doe", given: ["Jane"] }],
  gender: "female",
  identifier: [{ system: "http://example.org", value: "12345" }]
};
```

### Cardinality Constraints

Profile types enforce minimum and maximum cardinality:

```typescript
// US Core Patient requires at least one name
const patient: USCorePatientProfile = {
  resourceType: "Patient",
  id: "example",
  name: [], // ❌ TypeScript error - array must have at least one element
  gender: "unknown",
  identifier: [{ system: "http://example.org", value: "123" }]
};
```

### Must Support Elements

Elements marked as "Must Support" in US Core are included in the profile types with appropriate documentation:

```typescript
interface USCorePatientProfile extends Patient {
  /** Must Support: Patient name */
  name: HumanName[];
  
  /** Must Support: Administrative gender */
  gender: "male" | "female" | "other" | "unknown";
  
  /** Must Support: Patient identifier */
  identifier: Identifier[];
  
  /** Must Support: US Core Race Extension */
  extension?: Extension[];
}
```

## Value Sets

US Core profiles use specific value sets that are generated as TypeScript union types:

```typescript
// US Core Race value set
type USCoreRaceValueSet = 
  | "1002-5"  // American Indian or Alaska Native
  | "2028-9"  // Asian
  | "2054-5"  // Black or African American
  | "2076-8"  // Native Hawaiian or Other Pacific Islander
  | "2106-3"  // White
  | "UNK";    // Unknown

// US Core Ethnicity value set
type USCoreEthnicityValueSet =
  | "2135-2"  // Hispanic or Latino
  | "2186-5"  // Not Hispanic or Latino
  | "UNK";    // Unknown

// Usage with proper type safety
const raceExtension: Extension = {
  url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
  extension: [{
    url: "ombCategory",
    valueCoding: {
      system: "urn:oid:2.16.840.1.113883.6.238",
      code: "2106-3" as USCoreRaceValueSet, // ✅ Type-safe
      display: "White"
    }
  }]
};
```

## Reference Types

Profile-aware reference types ensure type safety when referencing other resources:

```typescript
import { ProfileReference, USCorePatientProfile } from './types';

// Type-safe reference to US Core Patient
const patientReference: ProfileReference<USCorePatientProfile> = {
  reference: "Patient/us-core-patient-123",
  type: "Patient"
};

// Usage in observations
const observation: USCoreObservationProfile = {
  resourceType: "Observation",
  id: "example",
  status: "final",
  category: [/* ... */],
  code: { /* ... */ },
  subject: patientReference, // ✅ Type-safe reference
  effectiveDateTime: "2023-08-05T10:30:00Z",
  valueQuantity: { /* ... */ }
};
```

## Validation Helpers

The generated types include utility functions for runtime validation:

```typescript
import { isUSCorePatientProfile, validateUSCoreConstraints } from './types/profiles/uscore';

// Type guard
if (isUSCorePatientProfile(patient)) {
  // TypeScript knows this is a USCorePatientProfile
  console.log(patient.name[0].family); // Safe access
}

// Runtime validation
const validationResult = validateUSCoreConstraints(patient);
if (!validationResult.valid) {
  console.error('Validation errors:', validationResult.errors);
}
```

## Best Practices

### 1. Use Profile Types for API Boundaries

```typescript
// API endpoint that accepts US Core patients
export async function createPatient(patient: USCorePatientProfile): Promise<void> {
  // TypeScript ensures the patient meets US Core requirements
  await saveToDatabase(patient);
}
```

### 2. Leverage Union Types for Flexibility

```typescript
// Accept either base FHIR or US Core patients
type AcceptedPatient = Patient | USCorePatientProfile;

function processPatient(patient: AcceptedPatient) {
  // Handle both base and profile types
  if ('extension' in patient && patient.extension) {
    // Process US Core extensions
  }
}
```

### 3. Use Type Guards for Runtime Checks

```typescript
function isUSCorePatient(patient: Patient): patient is USCorePatientProfile {
  return patient.name !== undefined && 
         patient.gender !== undefined && 
         patient.identifier !== undefined;
}
```

### 4. Document Profile Requirements

```typescript
/**
 * Creates a US Core compliant patient record
 * 
 * @param patient - Must include name, gender, and identifier per US Core requirements
 * @returns Promise resolving to created patient ID
 */
async function createUSCorePatient(patient: USCorePatientProfile): Promise<string> {
  // Implementation
}
```

## Integration with FHIR Servers

### Sending Profile-Compliant Resources

```typescript
import { Bundle, USCorePatientProfile } from './types';

async function sendToFHIRServer(patient: USCorePatientProfile) {
  const bundle: Bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [{
      resource: patient,
      request: {
        method: "POST",
        url: "Patient"
      }
    }]
  };
  
  // Send to FHIR server with confidence that it meets US Core requirements
  await fetch('/fhir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json' },
    body: JSON.stringify(bundle)
  });
}
```

### Receiving and Validating Resources

```typescript
async function fetchUSCorePatient(id: string): Promise<USCorePatientProfile> {
  const response = await fetch(`/fhir/Patient/${id}`);
  const patient = await response.json() as Patient;
  
  // Validate it meets US Core requirements
  if (!isUSCorePatientProfile(patient)) {
    throw new Error('Patient does not meet US Core profile requirements');
  }
  
  return patient; // Now typed as USCorePatientProfile
}
```

## Troubleshooting

### Common TypeScript Errors

1. **Missing Required Fields**
   ```
   Property 'name' is missing in type '...' but required in type 'USCorePatientProfile'
   ```
   Solution: Add all required fields specified by the US Core profile.

2. **Invalid Value Set Codes**
   ```
   Type '"invalid-code"' is not assignable to type 'USCoreRaceValueSet'
   ```
   Solution: Use only codes defined in the US Core value sets.

3. **Cardinality Violations**
   ```
   Type '[]' is not assignable to type '[HumanName, ...HumanName[]]'
   ```
   Solution: Ensure arrays meet minimum cardinality requirements.

### Debugging Profile Generation

If profile types aren't generating correctly:

1. Check the TypeSchema output for profile definitions
2. Verify the US Core package is properly loaded
3. Enable verbose logging during generation
4. Check for profile inheritance chains

## Advanced Usage

### Custom Profile Extensions

For organization-specific extensions on top of US Core:

```typescript
interface MyOrganizationPatientProfile extends USCorePatientProfile {
  extension?: (Extension | MyCustomExtension)[];
}

interface MyCustomExtension extends Extension {
  url: "http://myorg.com/fhir/StructureDefinition/custom-field";
  valueString: string;
}
```

### Profile Composition

Combine multiple profiles for complex use cases:

```typescript
type ComprehensivePatient = USCorePatientProfile & {
  // Additional constraints or extensions
  telecom: ContactPoint[]; // Make telecom required
};
```

This documentation provides a comprehensive guide to using US Core profile types generated by the atomic-ehr codegen tool. The generated types provide compile-time safety while maintaining compatibility with the FHIR specification and US Core requirements.
