# Basic Usage Examples

Simple examples demonstrating how to use the @atomic-ehr/codegen high-level API for common use cases.

## Overview

This directory contains practical examples showing:

- **Basic FHIR type generation** from packages
- **Custom schema processing** with TypeSchema
- **Multiple output formats** (TypeScript, REST clients)
- **Configuration-driven generation** using config files
- **CLI usage patterns** for different scenarios

## Examples

### 1. Basic FHIR Types (`basic-fhir-types.ts`)

Generate TypeScript types from FHIR R4 core package:

```bash
bun run basic-fhir-types.ts
```

**What it does:**
- Loads FHIR R4 core package
- Generates TypeScript interfaces
- Creates type guards and validators
- Outputs to `./generated/basic-fhir/`

### 2. US Core Types (`us-core-types.ts`)

Generate US Core compliant types with profiles:

```bash
bun run us-core-types.ts
```

**What it does:**
- Loads FHIR R4 core + US Core packages
- Includes US Core profiles
- Generates validation functions
- Outputs to `./generated/us-core/`

### 3. Custom Schemas (`custom-schemas.ts`)

Process custom JSON schemas alongside FHIR:

```bash
bun run custom-schemas.ts
```

**What it does:**
- Loads custom JSON schemas
- Combines with FHIR types
- Generates unified TypeScript types
- Outputs to `./generated/custom/`

### 4. Multiple Outputs (`multiple-outputs.ts`)

Generate both TypeScript types and REST client:

```bash
bun run multiple-outputs.ts
```

**What it does:**
- Generates TypeScript types
- Generates REST API client
- Creates mock data
- Outputs to separate directories

### 5. Configuration File (`config-driven.ts`)

Use configuration file for complex setups:

```bash
bun run config-driven.ts
```

**What it does:**
- Loads configuration from `codegen.config.ts`
- Processes multiple packages
- Generates multiple output formats
- Demonstrates advanced configuration

### 6. CLI Examples (`cli-examples.sh`)

Command-line usage patterns:

```bash
bash cli-examples.sh
```

**What it does:**
- Shows various CLI commands
- Demonstrates different options
- Includes error handling examples
- Shows progress reporting

## Getting Started

1. **Install Dependencies**
   ```bash
   bun install
   ```

2. **Run Basic Example**
   ```bash
   bun run basic-fhir-types.ts
   ```

3. **Check Generated Output**
   ```bash
   ls -la generated/basic-fhir/types/
   ```

4. **Try Other Examples**
   ```bash
   bun run us-core-types.ts
   bun run custom-schemas.ts
   ```

## Generated Output Structure

Each example generates a similar structure:

```
generated/
├── basic-fhir/
│   └── types/
│       ├── Patient.ts       # Patient interface
│       ├── Observation.ts   # Observation interface
│       ├── guards/          # Type guard functions
│       ├── validators/      # Validation functions
│       └── index.ts         # Main exports
├── us-core/
│   └── types/
│       ├── USCorePatient.ts # US Core Patient profile
│       ├── USCoreObservation.ts
│       └── ...
└── custom/
    └── types/
        ├── CustomType.ts    # Custom schema types
        └── ...
```

## Using Generated Types

After running the examples, you can use the generated types:

```typescript
import { Patient, Observation } from './generated/basic-fhir/types';
import { isPatient, validatePatient } from './generated/basic-fhir/types/guards';

// Type-safe FHIR resource
const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ family: 'Doe', given: ['John'] }],
  gender: 'male'
};

// Runtime validation
if (isPatient(someData)) {
  // TypeScript knows this is a Patient
  console.log('Valid patient:', someData.name?.[0]?.family);
}

// Detailed validation
const validation = validatePatient(patient);
if (validation.valid) {
  console.log('✅ Patient is valid');
} else {
  console.error('❌ Validation errors:', validation.errors);
}
```

## Common Patterns

### Progress Reporting

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

const api = new APIBuilder()
  .onProgress((phase, current, total, message) => {
    const percentage = Math.round((current / total) * 100);
    console.log(`[${phase}] ${percentage}% - ${message}`);
  });
```

### Error Handling

```typescript
try {
  const result = await api.generate();
  
  if (result.success) {
    console.log(`✅ Generated ${result.filesGenerated.length} files`);
  } else {
    console.error('❌ Generation failed:', result.errors);
  }
} catch (error) {
  console.error('💥 Unexpected error:', error.message);
}
```

### Conditional Generation

```typescript
const api = new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1');

// Generate TypeScript types
await api.typescript().generate();

// Reset and generate REST client
await api.reset().restClient({
  baseUrl: 'https://api.example.com/fhir'
}).generate();
```

## Next Steps

1. **Modify Examples**: Adapt the examples for your specific use case
2. **Explore Options**: Try different generator options and configurations
3. **Integration**: Integrate generated types into your application
4. **Advanced Usage**: Check the [healthcare-api](../healthcare-api/) and [frontend-app](../frontend-app/) examples for real-world usage

## Troubleshooting

### Common Issues

**Package not found:**
```
Error: Package 'hl7.fhir.r4.core@4.0.1' not found
```
- Check package name and version
- Ensure internet connection for package download

**Output directory exists:**
```
Error: Output directory already exists
```
- Use `overwrite: true` option or delete existing directory

**Memory issues with large packages:**
```
Error: JavaScript heap out of memory
```
- Use `cache: true` option
- Process packages separately
- Increase Node.js memory limit: `--max-old-space-size=4096`

### Getting Help

- Check the [main README](../../README.md) for general usage
- Review the [API documentation](../../docs/api/) for detailed reference
- Look at [real-world examples](../) for complex scenarios
- Open an issue on [GitHub](https://github.com/atomic-ehr/codegen/issues) for bugs
