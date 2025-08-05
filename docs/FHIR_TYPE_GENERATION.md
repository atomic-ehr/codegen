# FHIR Type Generation

This module provides TypeScript type generation from FHIR schemas using the TypeSchema intermediate format.

## Overview

The type generation system follows a two-step process:

1. **Schema Loading**: Load FHIR StructureDefinitions and transform them to TypeSchema format
2. **Code Generation**: Generate TypeScript interfaces from TypeSchema

## Architecture

```
┌─────────────────────┐     ┌──────────────┐     ┌──────────────────┐
│ FHIR Structure      │────▶│  TypeSchema  │────▶│ TypeScript       │
│ Definitions         │     │              │     │ Interfaces       │
└─────────────────────┘     └──────────────┘     └──────────────────┘
        │                           │                      │
        │                           │                      │
   @atomic-ehr/           src/typeschema/*        src/generator/*
   fhirschema
```

## Key Components

### 1. Base Generator (`src/generator/base.ts`)

Abstract base class providing core code generation utilities:

- File and directory management
- Code formatting (indentation, blocks)
- Multi-file output support

```typescript
export abstract class BaseGenerator {
  protected file(relativePath: string): void
  protected line(content: string): void
  protected curlyBlock(header: string, fn: () => void): void
  protected indent(): void
  protected dedent(): void
}
```

### 2. Schema Loader (`src/generator/loader.ts`)

Loads and categorizes FHIR schemas:

- Uses `@atomic-ehr/fhir-canonical-manager` for package management
- Transforms FHIR schemas to TypeSchema using existing transformers
- Categorizes schemas by type (resources, complex types, primitives)

```typescript
const loader = new SchemaLoader({ 
  packagePath: 'hl7.fhir.r4.core@4.0.1',
  verbose: true 
});
const schemas = await loader.load();
```

### 3. TypeScript Generator (`src/generator/typescript.ts`)

Generates TypeScript interfaces from TypeSchema:

- Type mappings for FHIR primitives
- Proper inheritance handling
- Reference type generation
- Namespace organization (primitives, complex, resources)

## Usage

### CLI Usage

```bash
# Generate types to a directory
bun run generate-types -o ./generated

# Generate from a specific package
bun run generate-types -o ./generated -p hl7.fhir.r4.core@4.0.1

# Verbose output
bun run generate-types -o ./generated -v
```

### Programmatic Usage

```typescript
import { generateTypes } from '@atomic-ehr/type-schema/generator';

await generateTypes({
  outputDir: './generated-types',
  packagePath: 'hl7.fhir.r4.core@4.0.1',
  verbose: true
});
```

### Using Generated Types

```typescript
// Import specific resources
import { Patient, Observation } from './generated-types';

// Import all primitives
import * as primitives from './generated-types/types/primitives';

// Import complex types
import * as complex from './generated-types/types/complex';

// Use the types
const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  active: true,
  name: [{
    family: 'Smith',
    given: ['John']
  }]
};

// Type checking with ResourceTypeMap
import { ResourceTypeMap } from './generated-types';

function isValidResourceType(type: string): type is keyof typeof ResourceTypeMap {
  return type in ResourceTypeMap;
}
```

## Generated File Structure

```
generated-types/
├── index.ts                 # Main entry point with exports
├── types/
│   ├── primitives.ts       # FHIR primitive type definitions
│   └── complex.ts          # Complex types (Element, CodeableConcept, etc.)
└── resources/
    ├── Patient.ts          # Individual resource files
    ├── Observation.ts
    └── ...
```

## Type Mappings

The generator maps FHIR primitive types to TypeScript types:

| FHIR Type | TypeScript Type |
|-----------|----------------|
| boolean   | boolean        |
| integer   | number         |
| decimal   | number         |
| string    | string         |
| uri/url   | string         |
| dateTime  | string         |
| instant   | string         |
| code      | string         |
| id        | string         |

## Features

### Inheritance Support

```typescript
export interface BackboneElement extends Element {
  modifierExtension?: Extension[];
}

export interface Patient extends DomainResource {
  // Patient-specific fields
}
```

### Reference Types

```typescript
// Generic reference
subject?: Reference;

// Typed reference
subject?: Reference<Patient | Group>;

// Multiple references
performer?: Reference<Practitioner | PractitionerRole | Organization>[];
```

### Array Handling

```typescript
// Optional array
identifier?: Identifier[];

// Required single value
resourceType: 'Patient';

// Required array
name: HumanName[];
```

### Nested Types (BackboneElements)

```typescript
export interface PatientContact extends BackboneElement {
  relationship?: CodeableConcept[];
  name?: HumanName;
  telecom?: ContactPoint[];
}
```

## Extending the Generator

To add support for new languages:

1. Create a new generator class extending `BaseGenerator`
2. Implement the `generate()` method
3. Add language-specific type mappings
4. Handle language-specific syntax

Example:

```typescript
export class PythonGenerator extends BaseGenerator {
  async generate(): Promise<void> {
    // Python-specific generation logic
  }
}
```

## Configuration

The generator supports various options:

```typescript
interface TypeScriptGeneratorOptions {
  outputDir: string;        // Output directory for generated files
  packagePath?: string;     // FHIR package path (default: R4 core)
  verbose?: boolean;        // Enable verbose logging
  baseTypesModule?: string; // Custom base types module
}
```

## Limitations

- Currently supports TypeScript only
- No constraint/profile generation
- No support for extensions in type definitions
- Choice types are simplified to `any`

## Future Enhancements

- [ ] Support for other languages (Python, Java, etc.)
- [ ] Profile and constraint generation
- [ ] Better choice type handling
- [ ] Extension support
- [ ] Validation code generation
- [ ] JSON Schema generation