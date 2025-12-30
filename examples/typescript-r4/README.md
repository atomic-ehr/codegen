# TypeScript R4 Example

Complete FHIR R4 type generation with resource creation, profile usage, and bundle composition.

## Overview

This example demonstrates how to use the Atomic EHR Codegen toolkit to generate TypeScript interfaces for the entire FHIR R4 core specification. It includes:

- Full FHIR R4 resource type definitions
- Profile support with type-safe extensions
- Bundle composition utilities
- Real-world usage patterns

## Configuration Options

Edit `generate.ts` to customize generation:

```typescript
.typescript({
  withDebugComment: false,      // Include generation metadata comments
  generateProfile: true,         // Generate profile-specific types
  openResourceTypeSet: false     // Allow open resource type definitions
})
```

## Using Generated Types

### Import and Use Resources

```typescript
import { Patient, Observation } from './fhir-types/index.js';

const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [
    {
      use: 'official',
      family: 'Smith',
      given: ['John']
    }
  ],
  birthDate: '1980-01-15',
  gender: 'male'
};

const observation: Observation = {
  resourceType: 'Observation',
  id: 'obs-1',
  status: 'final',
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '39156-5',
        display: 'BMI'
      }
    ]
  },
  subject: {
    reference: 'Patient/patient-1'
  },
  value: {
    quantity: {
      value: 25.5,
      unit: 'kg/m2'
    }
  }
};
```

### Working with Profiles

```typescript
import { USCorePatient } from './fhir-types/profiles/index.js';

const usPatient: USCorePatient = {
  resourceType: 'Patient',
  // US Core requires certain extensions and fields
  ...
};
```

### Bundle Operations

```typescript
import { Bundle } from './fhir-types/index.js';

const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      resource: patient,
      request: {
        method: 'POST',
        url: 'Patient'
      }
    },
    {
      resource: observation,
      request: {
        method: 'POST',
        url: 'Observation'
      }
    }
  ]
};
```

## Running the Demo

After generating types, run the included demo:

```bash
bun run examples/typescript-r4/demo.ts
```

This demonstrates:
- Resource creation
- Profile usage (bodyweight profile)
- Bundle composition
- Type safety validation

## File Structure

```
typescript-r4/
├── README.md                    # This file
├── generate.ts                  # Type generation script
├── demo.ts                      # Usage demonstration
├── fhir-types/                  # Generated types (created after generation)
│   ├── index.ts                 # Main exports
│   ├── resources/               # FHIR resources
│   ├── types/                   # Complex types (HumanName, Address, etc.)
│   ├── enums/                   # Value set enums
│   └── profiles/                # Profile-specific types
└── type-tree.yaml              # Dependency tree (debug output)
```

## Customization

### Include Only Specific Resources

Uncomment the `treeShake` section in `generate.ts`:

```typescript
.treeShake({
  "hl7.fhir.r4.core#4.0.1": {
    "http://hl7.org/fhir/StructureDefinition/Patient": {},
    "http://hl7.org/fhir/StructureDefinition/Observation": {},
  }
})
```

### Enable Debug Comments

Set `withDebugComment: true` to include generation metadata useful for understanding generated code structure.

### Export TypeSchema for Inspection

Add `.introspection({ typeSchemas: "./debug" })` to review NDJSON files and understand transformation.
