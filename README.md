# @atomic-ehr/type-schema

TypeSchema generator and TypeScript type generator for FHIR resources.

## Features

- **TypeSchema Generation**: Convert FHIR StructureDefinitions to TypeSchema intermediate format
- **TypeScript Generation**: Generate TypeScript interfaces from FHIR schemas
- **Complete R4 Support**: Full support for FHIR R4 resources, data types, and primitives
- **Type Safety**: Strongly typed interfaces with proper inheritance and references
- **Modular Output**: Organized output with separate files for resources, types, and primitives

## Installation

```bash
bun install
```

## Usage

### Generate TypeScript Types

```bash
# Generate types to ./generated directory
bun run generate-types -o ./generated

# With verbose output
bun run generate-types -o ./generated -v

# From specific package
bun run generate-types -o ./generated -p hl7.fhir.r4.core@4.0.1
```

### Generate TypeSchema (Intermediate Format)

```bash
# Generate TypeSchema to stdout
bun run cli hl7.fhir.r4.core@4.0.1

# Save to file
bun run cli -o schemas.ndjson hl7.fhir.r4.core@4.0.1

# Save to separate files
bun run cli -o ./schemas --separated-files hl7.fhir.r4.core@4.0.1
```

### Programmatic API

```typescript
import { generateTypes } from '@atomic-ehr/type-schema/generator';

// Generate TypeScript types
await generateTypes({
  outputDir: './generated-types',
  verbose: true
});

// Use the generated types
import { Patient, Observation } from './generated-types';
import * as complex from './generated-types/types/complex';

const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  active: true,
  name: [{
    family: 'Smith',
    given: ['John']
  }]
};
```

## Generated File Structure

```
generated-types/
├── index.ts                 # Main exports and type maps
├── types/
│   ├── primitives.ts       # FHIR primitive types
│   └── complex.ts          # Complex data types
└── resources/
    ├── Patient.ts          # Resource type definitions
    ├── Observation.ts
    └── ...
```

## TypeSchema Format

TypeSchema is an intermediate representation that simplifies FHIR schema complexity while preserving all necessary type information:

```typescript
interface TypeSchema {
  identifier: TypeSchemaIdentifier;
  base?: TypeSchemaIdentifier;
  fields?: Record<string, TypeSchemaField>;
  nested?: TypeSchemaNestedType[];
  dependencies: TypeSchemaIdentifier[];
}
```

## Documentation

- [Type Generation Guide](./docs/FHIR_TYPE_GENERATION.md) - Detailed documentation on the type generation system
- [TypeSchema README](./README-type-schema.md) - Information about the TypeSchema format

## Development

```bash
# Run tests
bun test

# Run specific test file
bun test src/generator/typescript.test.ts

# Build the project
bun run build
```

## Task Management

This project uses a task-based workflow. Check the `tasks/` directory for:
- `todo/` - Upcoming tasks
- `in-progress/` - Current work
- `done/` - Completed tasks

## Technologies

- [Bun](https://bun.sh) - JavaScript runtime and package manager
- [@atomic-ehr/fhirschema](https://www.npmjs.com/package/@atomic-ehr/fhirschema) - FHIR schema utilities
- [@atomic-ehr/fhir-canonical-manager](https://www.npmjs.com/package/@atomic-ehr/fhir-canonical-manager) - FHIR package management

## License

[License information here]