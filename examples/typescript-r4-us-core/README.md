# TypeScript Example

Complete TypeScript type generation for FHIR R4 core **and** US Core profiles, covering
resource creation, profile usage, extensions, slices, and bundle composition.

A single `generate.ts` pulls US Core 8.0.1 (which depends on FHIR R4 core), so one
`fhir-types/` tree contains both the base R4 types/profiles (`hl7-fhir-r4-core/`) and the
US Core profiles (`hl7-fhir-us-core/`).

## Overview

This example demonstrates how to use the Atomic EHR Codegen toolkit to generate TypeScript
interfaces for FHIR. It includes:

- FHIR R4 resource type definitions
- Base R4 profiles (bodyweight, blood pressure) and US Core profiles (Patient, blood pressure, body weight)
- Profile support with type-safe slices
- Extension support with proper typing for array primitives, plus US Core flat extension accessors (race, ethnicity, birth sex)
- Bundle composition utilities

## Quick Start

```bash
# Generate types (R4 core + US Core)
bun run examples/typescript-r4-us-core/generate.ts

# Run tests
bun test ./examples/typescript-r4-us-core/
```

## Tests

- **resource.test.ts** - Patient, Observation, Profile class API, and Bundle creation
- **extension-profile.test.ts** / **raw-extension.test.ts** - FHIR extensions (resource-level, primitive, complex type, array elements)
- **profile-r4-bodyweight.test.ts** / **profile-r4-bp.test.ts** - base R4 profile class API (canonical profile-API demos)
- **profile-us-core-patient.test.ts** - US Core Patient profile: race/ethnicity/birth-sex extensions, field accessors
- **profile-us-core-bp.test.ts** / **profile-us-core-bodyweight.test.ts** - US Core-specific slicing and constrained `value[x]` validation

## Configuration

Edit `generate.ts` to customize generation:

```typescript
.typescript({
  withDebugComment: false,      // Include generation metadata comments
  generateProfile: true,        // Generate profile-specific types
  openResourceTypeSet: false    // Allow open resource type definitions
})
```

## Using Generated Types

### Import and Use Resources

```typescript
import type { Patient, Observation } from './fhir-types/hl7-fhir-r4-core';

const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ use: 'official', family: 'Smith', given: ['John'] }],
  birthDate: '1980-01-15',
  gender: 'male'
};
```

### Working with Extensions

```typescript
import type { Patient } from './fhir-types/hl7-fhir-r4-core/Patient';
import type { HumanName } from './fhir-types/hl7-fhir-r4-core/HumanName';

const name: HumanName = {
  family: 'van Beethoven',
  given: ['Ludwig', 'Maria'],
  // Extension on primitive element
  _family: {
    extension: [{
      url: 'http://hl7.org/fhir/StructureDefinition/humanname-own-prefix',
      valueString: 'van'
    }]
  },
  // Array element extensions with null handling
  _given: [
    { extension: [{ url: 'http://example.org/name-source', valueCode: 'birth-certificate' }] },
    null  // No extension for second element
  ]
};

const patient: Patient = {
  resourceType: 'Patient',
  id: 'ext-demo',
  // Resource-level extension
  extension: [{
    url: 'http://hl7.org/fhir/StructureDefinition/patient-birthPlace',
    valueAddress: { city: 'Springfield', country: 'US' }
  }],
  name: [name]
};
```

### Working with Profiles

```typescript
import type { Observation } from './fhir-types/hl7-fhir-r4-core/Observation';
import { bodyweightProfile } from './fhir-types/hl7-fhir-r4-core/profiles/Observation_bodyweight';

const baseObservation: Observation = {
  resourceType: 'Observation',
  status: 'final',
  code: { coding: [{ code: '29463-7', system: 'http://loinc.org' }] },
  valueQuantity: { value: 75.5, unit: 'kg' }
};

// Use profile class to add required slices
const profile = new bodyweightProfile(baseObservation)
  .setVSCat({ text: 'Vital Signs' });

const observation = profile.toResource();
```

### Bundle Operations

```typescript
import type { Bundle } from './fhir-types/hl7-fhir-r4-core/Bundle';

const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    { fullUrl: 'urn:uuid:pt-1', resource: patient },
    { fullUrl: 'urn:uuid:obs-1', resource: observation }
  ]
};
```

## File Structure

```
typescript-r4-us-core/
├── README.md                       # This file
├── generate.ts                     # Type generation script (R4 core + US Core)
├── resource.test.ts                # Resource and profile tests
├── extension-profile.test.ts       # Extension profile tests
├── raw-extension.test.ts           # Raw extension tests
├── profile-r4-bodyweight.test.ts      # Base R4 profile API
├── profile-r4-bp.test.ts              # Base R4 profile API
├── profile-us-core-*.test.ts       # US Core profile tests
├── __snapshots__/                  # Test snapshots
├── tsconfig.json                   # TypeScript configuration
└── fhir-types/                     # Generated types (gitignored)
    ├── hl7-fhir-r4-core/           # Base R4 resources, profiles, extensions
    ├── hl7-fhir-us-core/           # US Core profiles
    ├── type-schemas/               # TypeSchema JSON (debug)
    └── type-tree.yaml              # Dependency tree (debug)
```

## Customization

### Tree Shaking

Include only specific resources by configuring `treeShake`:

```typescript
.typeSchema({
  treeShake: {
    "hl7.fhir.r4.core": {
      "http://hl7.org/fhir/StructureDefinition/Patient": {},
      "http://hl7.org/fhir/StructureDefinition/Observation": {},
    }
  }
})
```

### Introspection Output

Add introspection to inspect generated schemas:

```typescript
.introspection({
  typeSchemas: "type-schemas",
  typeTree: "type-tree.yaml"
})
```
