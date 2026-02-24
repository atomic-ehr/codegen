# TypeScript R4 Example

Complete FHIR R4 type generation with resource creation, profile usage, extensions, and bundle composition.

## Overview

This example demonstrates how to use the Atomic EHR Codegen toolkit to generate TypeScript interfaces for the FHIR R4 core specification. It includes:

- FHIR R4 resource type definitions
- Profile support with type-safe slices
- Extension support with proper typing for array primitives
- Bundle composition utilities

## Quick Start

```bash
# Generate types
bun run examples/typescript-r4/generate.ts

# Run tests
bun test ./examples/typescript-r4/
```

## Tests

- **resource.test.ts** - Tests for Patient, Observation, Profile class API, and Bundle creation
- **extension.test.ts** - Tests for FHIR extensions (resource-level, primitive, complex type, array elements)

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
  .setVscat({ text: 'Vital Signs' });

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
typescript-r4/
├── README.md                # This file
├── generate.ts              # Type generation script
├── resource.test.ts         # Resource and profile tests
├── extension.test.ts        # Extension tests
├── __snapshots__/           # Test snapshots
├── tsconfig.json            # TypeScript configuration
└── fhir-types/              # Generated types
    ├── hl7-fhir-r4-core/
    │   ├── index.ts         # Package exports
    │   ├── Patient.ts       # Resource types
    │   ├── Element.ts       # Base types with extension support
    │   ├── Extension.ts     # Extension type with all value[x] variants
    │   └── profiles/        # Profile classes
    ├── type-schemas/        # TypeSchema JSON (debug)
    └── type-tree.yaml       # Dependency tree (debug)
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
