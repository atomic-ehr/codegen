# Getting Started with Atomic EHR Codegen

Welcome to Atomic EHR Codegen! This guide will walk you through your first experience with generating TypeScript types from FHIR resources.

## Prerequisites

Before you begin, ensure you have:

- [Bun](https://bun.sh) installed (v1.0.0 or later)
- Basic knowledge of TypeScript and FHIR
- A terminal/command prompt

> **Note**: Throughout this guide, commands are shown for both installed (`atomic-codegen`) and development (`bun run src/cli/index.ts`) versions. Use the appropriate version for your setup.

## Quick Start (5 minutes)

### Step 1: Installation

```bash
# Clone or install the codegen tool
bun install @atomic-ehr/codegen

# Or if working from source
git clone <repository-url>
cd codegen
bun install
```

### Step 2: Generate Your First Types

Let's generate TypeScript types for FHIR R4 core resources:

```bash
# If installed globally
atomic-codegen generate typescript -o ./my-fhir-types

# If working from source (development)
bun run src/cli/index.ts generate typescript -o ./my-fhir-types

# This will:
# 1. Download FHIR R4 core package
# 2. Transform to TypeSchema format
# 3. Generate TypeScript interfaces
# 4. Create organized file structure
```

### Step 3: Explore the Generated Types

After generation completes, you'll have a structure like this:

```
my-fhir-types/
├── index.ts                    # Main entry point
├── types/
│   ├── primitives.ts          # FHIR primitive types
│   └── complex.ts             # Complex data types
└── resources/
    ├── Patient.ts             # Patient resource
    ├── Observation.ts         # Observation resource
    └── ... (all FHIR resources)
```

### Step 4: Use the Generated Types

Create a simple TypeScript file to test your generated types:

```typescript
// test-types.ts
import { Patient, Observation } from './my-fhir-types';

// Create a strongly-typed Patient
const patient: Patient = {
  resourceType: 'Patient',
  id: 'example-patient',
  active: true,
  name: [{
    use: 'official',
    family: 'Smith',
    given: ['John']
  }],
  gender: 'male',
  birthDate: '1990-01-01'
};

// Create a strongly-typed Observation
const observation: Observation = {
  resourceType: 'Observation',
  id: 'example-observation',
  status: 'final',
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: '29463-7',
      display: 'Body Weight'
    }]
  },
  subject: {
    reference: `Patient/${patient.id}`
  },
  valueQuantity: {
    value: 70,
    unit: 'kg',
    system: 'http://unitsofmeasure.org',
    code: 'kg'
  }
};

console.log('Patient:', patient.name?.[0]?.family);
console.log('Observation:', observation.valueQuantity?.value);
```

Run your test:

```bash
bun run test-types.ts
```

## Next Steps

### Working with Specific FHIR Packages

Generate types for US Core profiles:

```bash
# First create TypeSchema from US Core package
atomic-codegen typeschema create hl7.fhir.us.core@6.1.0 -o us-core.ndjson

# Then generate TypeScript types
atomic-codegen generate typescript -i us-core.ndjson -o ./us-core-types
```

### Configuration

Create a configuration file for your project:

```bash
# Initialize configuration
atomic-codegen config init --template typescript
```

This creates `.atomic-codegen.json`:

```json
{
  "$schema": "https://atomic-ehr.github.io/codegen/config-schema.json",
  "version": "1.0.0",
  "project": {
    "name": "my-fhir-project",
    "description": "FHIR TypeScript types"
  },
  "typeschema": {
    "packages": ["hl7.fhir.r4.core@4.0.1"],
    "outputFormat": "ndjson"
  },
  "generator": {
    "target": "typescript",
    "outputDir": "./src/types",
    "includeComments": true
  }
}
```

Now you can generate types using your configuration:

```bash
atomic-codegen generate typescript
```

### Programmatic Usage

Use the codegen library in your Node.js/Bun applications:

```typescript
import { generateTypes } from '@atomic-ehr/codegen/generators';

async function setupFHIRTypes() {
  await generateTypes({
    outputDir: './src/generated-types',
    packagePath: 'hl7.fhir.r4.core@4.0.1',
    verbose: true
  });
  
  console.log('FHIR types generated successfully!');
}

setupFHIRTypes().catch(console.error);
```

## Common Use Cases

### 1. Basic FHIR R4 Development

```bash
# Generate standard FHIR R4 types
atomic-codegen generate typescript -o ./fhir-types
```

### 2. US Healthcare Development

```bash
# Generate US Core profile types
atomic-codegen typeschema create hl7.fhir.us.core@6.1.0 -o us-core.ndjson
atomic-codegen generate typescript -i us-core.ndjson -o ./us-core-types
```

### 3. Custom Implementation Guides

```bash
# Generate types for custom IG
atomic-codegen typeschema create my.custom.ig@1.0.0 -o custom.ndjson
atomic-codegen generate typescript -i custom.ndjson -o ./custom-types
```

### 4. Multiple Package Integration

```bash
# Create TypeSchema from multiple packages
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o r4-core.ndjson
atomic-codegen typeschema create hl7.fhir.us.core@6.1.0 -o us-core.ndjson

# Merge TypeSchemas
atomic-codegen typeschema merge r4-core.ndjson us-core.ndjson -o merged.ndjson

# Generate combined types
atomic-codegen generate typescript -i merged.ndjson -o ./combined-types
```

## Understanding the Output

### Type Organization

Generated types are organized into logical groups:

- **Primitives** (`types/primitives.ts`): Basic FHIR data types (string, boolean, dateTime, etc.)
- **Complex Types** (`types/complex.ts`): Reusable complex structures (Address, HumanName, etc.)
- **Resources** (`resources/*.ts`): Individual FHIR resource types (Patient, Observation, etc.)

### Type Safety Features

The generated types provide:

- **Strict typing**: All fields are properly typed
- **Inheritance**: Resources extend base Resource type
- **References**: Proper typing for resource references
- **Value sets**: Enum-like types for coded values
- **Extensions**: Typed extension support

### Example Type Usage

```typescript
import { Patient, ResourceTypeMap, AnyResource } from './fhir-types';

// Type-safe resource creation
const patient: Patient = {
  resourceType: 'Patient', // Must match the interface
  // ... other required fields
};

// Type-safe resource processing
function processResource(resource: AnyResource) {
  switch (resource.resourceType) {
    case 'Patient':
      // TypeScript knows this is a Patient
      console.log(resource.name?.[0]?.family);
      break;
    case 'Observation':
      // TypeScript knows this is an Observation
      console.log(resource.code?.coding?.[0]?.display);
      break;
  }
}

// Runtime type checking
function isPatient(resource: AnyResource): resource is Patient {
  return resource.resourceType === 'Patient';
}
```

## Troubleshooting

### Common Issues

1. **Package not found**: Ensure the FHIR package name and version are correct
2. **Permission errors**: Check write permissions for output directory
3. **Memory issues**: Use `--max-old-space-size` for large packages
4. **Network issues**: Check internet connection for package downloads

### Getting Help

- Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)
- Review [Configuration Documentation](./CONFIGURATION.md)
- See [API Documentation](./FHIR_TYPE_GENERATION.md)
- Check existing [examples](../examples/)

## What's Next?

Now that you have generated types, explore:

- [Configuration options](./CONFIGURATION.md) for customizing generation
- [US Core profiles](./US_CORE_PROFILES.md) for US healthcare development
- [Generator registry](./generator-registry.md) for extending the system
- [Validation guide](./validation.md) for validating FHIR resources

Happy coding with strongly-typed FHIR resources! 🚀
