# TypeScript US Core Example

US Core FHIR profile generation with type-safe profile wrapper classes.

## Overview

This example demonstrates how to generate TypeScript types for the HL7 US Core Implementation Guide, including generated profile classes that provide a fluent API for working with extensions and slices. It includes:

- Full US Core 8.0.1 type definitions
- Profile wrapper classes for type-safe extension handling
- Automatic discriminator application for slices
- Flat API for complex extensions (race, ethnicity, etc.)

## Generating Types

To generate TypeScript types for US Core:

```bash
bun run examples/typescript-us-core/generate.ts
```

This will output to `./examples/typescript-us-core/fhir-types/`

## Configuration

Edit `generate.ts` to customize:

```typescript
.typescript({
  withDebugComment: false,     // Include generation metadata
  generateProfile: true,        // Generate profile wrapper classes
  openResourceTypeSet: false    // Closed resource type union
})
```

## Using Profile Classes

### US Core Patient with Extensions

Profile classes provide a fluent API for setting extensions without dealing with the complex FHIR extension structure:

```typescript
import type { Patient } from './fhir-types/hl7-fhir-r4-core/Patient';
import { USCorePatientProfileProfile } from './fhir-types/hl7-fhir-us-core/profiles/UscorePatientProfile';

// Create a new patient profile builder
const patientProfile = new USCorePatientProfileProfile({ resourceType: 'Patient' });

// Use flat API - no nested extension arrays needed!
patientProfile
  .setRace({
    ombCategory: {
      system: 'urn:oid:2.16.840.1.113883.6.238',
      code: '2106-3',
      display: 'White'
    },
    text: 'White'
  })
  .setEthnicity({
    ombCategory: {
      system: 'urn:oid:2.16.840.1.113883.6.238',
      code: '2186-5',
      display: 'Not Hispanic or Latino'
    },
    text: 'Not Hispanic or Latino'
  })
  .setSex({
    system: 'http://hl7.org/fhir/us/core/CodeSystem/birthsex',
    code: 'M',
    display: 'Male'
  });

// Get the underlying FHIR resource
const patient = patientProfile.toResource();
patient.name = [{ family: 'Smith', given: ['John'] }];
```

### US Core Blood Pressure with Slices

Profile classes automatically apply discriminator values for slices:

```typescript
import type { Observation } from './fhir-types/hl7-fhir-r4-core/Observation';
import { USCoreBloodPressureProfileProfile } from './fhir-types/hl7-fhir-us-core/profiles/UscoreBloodPressureProfile';

const bpProfile = new USCoreBloodPressureProfileProfile({
  resourceType: 'Observation'
} as Observation);

// Discriminator codes (8480-6 for systolic, 8462-4 for diastolic) are auto-applied
bpProfile
  .setVscat()
  .setSystolic({
    valueQuantity: {
      value: 120,
      unit: 'mmHg',
      system: 'http://unitsofmeasure.org',
      code: 'mm[Hg]'
    }
  })
  .setDiastolic({
    valueQuantity: {
      value: 80,
      unit: 'mmHg',
      system: 'http://unitsofmeasure.org',
      code: 'mm[Hg]'
    }
  });

const observation = bpProfile.toResource();
observation.status = 'final';
observation.code = {
  coding: [{
    system: 'http://loinc.org',
    code: '85354-9',
    display: 'Blood pressure panel'
  }]
};
```

### Wrapping Existing Resources

You can wrap existing FHIR resources to add profile-specific extensions:

```typescript
// Existing patient from API
const existingPatient: Patient = {
  resourceType: 'Patient',
  id: 'existing-patient',
  name: [{ family: 'Doe', given: ['Jane'] }],
  gender: 'female'
};

// Wrap with profile class
const patientProfile = new USCorePatientProfileProfile(existingPatient);

// Add US Core extensions
patientProfile.setSex({
  system: 'http://hl7.org/fhir/us/core/CodeSystem/birthsex',
  code: 'F',
  display: 'Female'
});

const updatedPatient = patientProfile.toResource();
```

## Running the Demo

After generating types, run the included demos:

```bash
# Full profile demo with multiple examples
bun run examples/typescript-us-core/profile-demo.ts

# Multi-profile demo
bun run examples/typescript-us-core/multi-profile-demo.ts
```

## File Structure

```
typescript-us-core/
├── README.md                    # This file
├── generate.ts                  # Type generation script
├── profile-demo.ts              # Profile class usage demo
├── multi-profile-demo.ts        # Multi-profile examples
├── multi-profile.test.ts        # Profile tests
├── tsconfig.json                # TypeScript config
├── fhir-types/                  # Generated types (after generation)
│   ├── hl7-fhir-r4-core/        # FHIR R4 core resources
│   ├── hl7-fhir-us-core/        # US Core profiles
│   │   └── profiles/            # Profile wrapper classes
│   └── index.ts                 # Main exports
└── type-tree.yaml               # Dependency tree (debug output)
```

## Profile Class API

Each profile class provides:

- **Constructor**: `new ProfileClass(resource)` - Wrap a FHIR resource
- **Setters**: `setExtensionName(value)` - Set extension with flat API
- **Getters**: `getExtensionName()` - Get extension value (flat)
- **Raw Getters**: `getExtensionNameExtension()` - Get raw FHIR Extension
- **Reset**: `resetExtensionName()` - Remove extension
- **toResource()**: Get the underlying FHIR resource

## Next Steps

- See [typescript-r4/](../typescript-r4/) for basic FHIR R4 generation
- See [examples/](../) overview for other language examples
- Check [../../docs/guides/writer-generator.md](../../docs/guides/writer-generator.md) for generator documentation
