# Quick Start Guide

Get up and running with @atomic-ehr/type-schema in just a few minutes.

## Prerequisites

- [Bun](https://bun.sh) runtime installed
- Basic knowledge of TypeScript and FHIR

## Installation

```bash
bun install @atomic-ehr/type-schema
```

## Generate Types in 3 Steps

### 1. Install the Package

```bash
# Create a new project
mkdir my-fhir-project
cd my-fhir-project

# Initialize and install
bun init -y
bun install @atomic-ehr/type-schema
```

### 2. Generate TypeScript Types

```bash
# Generate types from FHIR R4 core package
bunx type-schema generate-types -o ./generated

# Or with verbose output to see progress
bunx type-schema generate-types -o ./generated -v
```

### 3. Use the Generated Types

Create a `patient.ts` file:

```typescript
import { Patient, HumanName, ContactPoint } from './generated';

// Create a strongly-typed patient
const patient: Patient = {
  resourceType: 'Patient',
  id: 'example-patient',
  active: true,
  name: [{
    use: 'official',
    family: 'Smith',
    given: ['John', 'Jacob'],
    prefix: ['Mr.']
  }],
  gender: 'male',
  birthDate: '1970-01-01',
  telecom: [{
    system: 'phone',
    value: '555-123-4567',
    use: 'home'
  }, {
    system: 'email',
    value: 'john.smith@example.com'
  }]
};

// TypeScript provides full IntelliSense and type checking
console.log(`Patient: ${patient.name?.[0]?.given?.join(' ')} ${patient.name?.[0]?.family}`);
```

## What's Generated?

After running the generator, you'll have:

```
generated/
├── index.ts              # Main entry point with all exports
├── types/
│   ├── primitives.ts    # FHIR primitive types (string, boolean, etc.)
│   └── complex.ts       # Complex types (CodeableConcept, Reference, etc.)
└── resources/
    ├── Patient.ts       # Patient resource interface
    ├── Observation.ts   # Observation resource interface
    └── ...              # All other FHIR resources
```

## Next Steps

- Learn about [all installation options](./installation.md)
- Explore [basic usage patterns](./basic-usage.md)
- Understand the [generated code structure](../guide/using-generated-types.md)
- Read about [customization options](../guide/customization.md)

## Common Commands

```bash
# Generate with custom FHIR package
bunx type-schema generate-types -o ./generated -p hl7.fhir.r4.core@4.0.1

# Generate TypeSchema intermediate format (for debugging)
bunx type-schema cli hl7.fhir.r4.core@4.0.1 -o schemas.ndjson

# Get help
bunx type-schema generate-types --help
```

## Troubleshooting

If you encounter issues:

1. Ensure Bun is installed: `bun --version`
2. Check network connectivity (package download requires internet)
3. Try with verbose mode: `bunx type-schema generate-types -o ./generated -v`
4. See our [troubleshooting guide](../guide/troubleshooting.md)

## Example Projects

Check out these example projects:

- [Basic FHIR App](https://github.com/atomic-ehr/examples/basic-fhir)
- [React FHIR Forms](https://github.com/atomic-ehr/examples/react-forms)
- [FHIR Server with Types](https://github.com/atomic-ehr/examples/typed-server)