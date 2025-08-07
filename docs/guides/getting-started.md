# Getting Started with @atomic-ehr/codegen

Welcome to atomic-codegen! This guide will walk you through your first steps with the library, from installation to generating your first FHIR types.

## What is atomic-codegen?

atomic-codegen is a comprehensive code generation toolkit for FHIR healthcare standards. It uses TypeSchema as an intermediate format to generate type-safe code for multiple target languages, with a focus on TypeScript and healthcare interoperability.

### Key Benefits

- **🔥 FHIR Compliance**: Full support for FHIR R4/R5 and US Core profiles
- **🎯 Type Safety**: Generate TypeScript interfaces with runtime validation
- **⚡ Performance**: Built with Bun for maximum speed
- **🏗️ Extensible**: Plugin architecture for custom generators
- **📋 Universal**: TypeSchema as intermediate format supports multiple outputs

## Prerequisites

Before you begin, ensure you have:

- **[Bun](https://bun.sh/)** 1.0+ (recommended) or Node.js 18+
- **TypeScript** 5.0+ (for TypeScript projects)
- Basic knowledge of FHIR concepts (helpful but not required)

## Installation

### Using Bun (Recommended)

```bash
bun add @atomic-ehr/codegen
```

### Using npm

```bash
npm install @atomic-ehr/codegen
```

### Using yarn

```bash
yarn add @atomic-ehr/codegen
```

## Your First Generation

Let's start with a simple example: generating TypeScript types from the FHIR R4 core specification.

### Method 1: High-Level API (Recommended)

Create a new file `generate-types.ts`:

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

async function generateFHIRTypes() {
  console.log('🔥 Generating FHIR types...');

  const result = await new APIBuilder()
    .fromPackage('hl7.fhir.r4.core@4.0.1')
    .typescript({
      moduleFormat: 'esm',
      generateIndex: true,
      includeDocuments: true
    })
    .outputTo('./generated/fhir')
    .generate();

  if (result.success) {
    console.log('✅ Generation completed!');
    console.log(`📁 Output: ${result.outputDir}`);
    console.log(`📄 Files: ${result.filesGenerated.length}`);
  } else {
    console.error('❌ Generation failed:', result.errors);
  }
}

generateFHIRTypes();
```

Run the script:

```bash
bun run generate-types.ts
```

### Method 2: CLI

You can also use the command-line interface:

```bash
# Generate TypeScript types
bun atomic-codegen generate typescript \
  --from-package hl7.fhir.r4.core@4.0.1 \
  --output ./generated/fhir \
  --verbose

# Or with shorter syntax
bunx @atomic-ehr/codegen generate typescript \
  --from-package hl7.fhir.r4.core@4.0.1 \
  --output ./generated/fhir
```

## Understanding the Output

After generation, you'll find a structure like this:

```
generated/fhir/
├── types/
│   ├── Patient.ts          # Patient resource interface
│   ├── Observation.ts      # Observation resource interface
│   ├── Bundle.ts           # Bundle resource interface
│   ├── ...                 # Other FHIR resources
│   └── index.ts           # Re-exports all types
├── guards/
│   ├── Patient.ts          # isPatient() type guard
│   ├── Observation.ts      # isObservation() type guard
│   └── index.ts           # Re-exports all guards
└── index.ts               # Main entry point
```

## Using Generated Types

Now you can use the generated types in your application:

```typescript
import { Patient, Observation, Bundle } from './generated/fhir';
import { isPatient, isObservation } from './generated/fhir/guards';

// Type-safe FHIR resource creation
const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  active: true,
  name: [{
    use: 'official',
    family: 'Doe',
    given: ['John']
  }],
  gender: 'male',
  birthDate: '1990-01-01'
};

// Runtime type checking
function processResource(resource: unknown) {
  if (isPatient(resource)) {
    // TypeScript knows this is a Patient
    console.log(`Patient: ${resource.name?.[0]?.given?.[0]} ${resource.name?.[0]?.family}`);
  } else if (isObservation(resource)) {
    // TypeScript knows this is an Observation
    console.log(`Observation: ${resource.code?.text}`);
  }
}

// Bundle handling
const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    { resource: patient }
  ]
};
```

## Next Steps

### 1. Add US Core Profiles

For US healthcare compliance, add US Core profiles:

```typescript
const result = await new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .fromPackage('hl7.fhir.us.core@6.1.0')  // Add US Core
  .typescript({
    includeProfiles: true,    // Include US Core profiles
    includeExtensions: true   // Include US Core extensions
  })
  .outputTo('./generated/us-core')
  .generate();
```

This generates US Core specific types like `USCorePatient`, `USCoreObservation`, etc.

### 2. Generate REST API Client

Generate a type-safe REST client:

```typescript
const result = await new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .restClient({
    baseUrl: 'https://your-fhir-server.com/fhir',
    authType: 'bearer',
    includeTypes: true
  })
  .outputTo('./generated/api')
  .generate();
```

### 3. Use Configuration Files

For complex scenarios, use a configuration file:

```typescript
// atomic-codegen.config.ts
import { defineConfig } from '@atomic-ehr/codegen';

export default defineConfig({
  input: {
    packages: [
      'hl7.fhir.r4.core@4.0.1',
      'hl7.fhir.us.core@6.1.0'
    ]
  },
  output: {
    typescript: {
      outputDir: './src/types/fhir',
      includeProfiles: true
    },
    restClient: {
      outputDir: './src/api/fhir',
      baseUrl: process.env.FHIR_BASE_URL
    }
  }
});
```

Then run:

```bash
bun atomic-codegen generate --config atomic-codegen.config.ts
```

## Common Patterns

### Healthcare Frontend App

```typescript
// Patient registration form
import { USCorePatient } from './types/fhir';
import { validateUSCorePatient } from './types/fhir/validators';

const patient: USCorePatient = {
  resourceType: 'Patient',
  identifier: [{ value: formData.mrn }],
  name: [{ family: formData.lastName, given: [formData.firstName] }],
  gender: formData.gender,
  extension: [{
    url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    extension: [{ url: 'text', valueString: formData.race }]
  }]
};

// Validate before submission
const validation = validateUSCorePatient(patient);
if (validation.valid) {
  await submitPatient(patient);
}
```

### Healthcare API Backend

```typescript
// Express.js controller
import { Patient } from './types/fhir';
import { isPatient } from './types/fhir/guards';

app.post('/fhir/Patient', async (req, res) => {
  if (!isPatient(req.body)) {
    return res.status(400).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'invalid',
        details: { text: 'Invalid Patient resource' }
      }]
    });
  }

  const patient: Patient = req.body;
  // TypeScript knows this is a valid Patient
  const created = await patientService.create(patient);
  res.status(201).json(created);
});
```

## Troubleshooting

### Common Issues

1. **Package Not Found**
   ```
   Error: Package 'hl7.fhir.r4.core@4.0.1' not found
   ```
   - Ensure you have internet connectivity
   - Try without version: `hl7.fhir.r4.core`
   - Check package name spelling

2. **Generation Fails**
   ```
   Error: Failed to generate types
   ```
   - Enable verbose mode: `verbose: true`
   - Check output directory permissions
   - Ensure TypeScript is installed

3. **Import Errors**
   ```
   Cannot find module './generated/fhir'
   ```
   - Ensure generation completed successfully
   - Check output directory path
   - Verify TypeScript configuration

### Getting Help

- **[GitHub Issues](https://github.com/atomic-ehr/codegen/issues)** - Bug reports and feature requests
- **[GitHub Discussions](https://github.com/atomic-ehr/codegen/discussions)** - Community support
- **[Examples](../../examples/)** - Real-world usage examples
- **[API Documentation](../api/)** - Complete API reference

## What's Next?

Now that you have the basics, explore these guides:

- **[FHIR Usage Guide](./fhir-usage.md)** - Deep dive into FHIR-specific features
- **[Frontend Development](./frontend-development.md)** - Building healthcare UIs
- **[API Development](./api-development.md)** - Creating FHIR-compliant APIs
- **[Advanced Configuration](./advanced-configuration.md)** - Complex generation scenarios

## Examples Repository

Check out complete working examples:

- **[Basic Usage](../../examples/basic-usage/)** - Simple generation examples
- **[Frontend App](../../examples/frontend-app/)** - React healthcare application
- **[Healthcare API](../../examples/healthcare-api/)** - FHIR REST API server

Happy coding! 🚀
