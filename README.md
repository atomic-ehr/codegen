# @atomic-ehr/type-schema

[![npm version](https://badge.fury.io/js/@atomic-ehr%2Fcodegen.svg)](https://www.npmjs.com/package/@atomic-ehr/codegen)

TypeSchema transformer and TypeScript code generator for FHIR resources. This library provides a two-stage pipeline for generating strongly-typed TypeScript interfaces from FHIR StructureDefinitions.

## Overview

This project consists of two main components:

1. **TypeSchema Transformer** - Converts FHIR StructureDefinitions into a simplified intermediate format (TypeSchema)
2. **TypeScript Generator** - Generates TypeScript interfaces from TypeSchema

## Features

- 🔄 **Two-Stage Processing**: FHIR → TypeSchema → TypeScript
- 📦 **Complete FHIR R4 Support**: Resources, complex types, primitives, and value sets
- 🏗️ **Modular Architecture**: Separate transformation and generation stages
- 🔍 **Type Safety**: Proper inheritance, references, and nested types
- 📁 **Organized Output**: Separate files for primitives, complex types, and resources
- ⚡ **Bun Runtime**: Fast execution with built-in TypeScript support
- 🧪 **Well Tested**: Comprehensive unit tests for all components

## Installation

```bash
bun install
```

## Project Structure

```
src/
├── typeschema/           # FHIR to TypeSchema transformation
│   ├── core/            # Core transformation logic
│   ├── value-set/       # Value set processing
│   └── types.ts         # TypeSchema type definitions
├── generator/           # Code generation from TypeSchema
│   ├── base.ts         # Abstract base generator
│   ├── loader.ts       # Schema loading utilities
│   ├── typescript.ts   # TypeScript code generator
│   └── index.ts        # Generator exports
├── utils/              # Utility functions
│   ├── naming.ts       # Naming conventions
│   └── code.ts         # Code generation helpers
└── cli/                # Command-line interfaces
    ├── index.ts        # TypeSchema CLI
    └── generate-types.ts # TypeScript generation CLI
```

## Usage

### Command Line Interface

#### Generate TypeScript Types

```bash
# Generate types to ./generated directory using default FHIR R4 package
bun run generate-types -o ./generated

# With verbose output
bun run generate-types -o ./generated -v

# From specific FHIR package
bun run generate-types -o ./generated -p hl7.fhir.r4.core@4.0.1

# Help
bun run generate-types -h
```

#### Generate TypeSchema (Intermediate Format)

```bash
# Output to stdout
bun run cli hl7.fhir.r4.core@4.0.1

# Save to NDJSON file
bun run cli -o schemas.ndjson hl7.fhir.r4.core@4.0.1

# Save to separate files
bun run cli -o ./schemas --separated-files hl7.fhir.r4.core@4.0.1

# With verbose output
bun run cli -v hl7.fhir.r4.core@4.0.1
```

### Programmatic API

#### TypeScript Generation

```typescript
import { generateTypes, TypeScriptGenerator } from '@atomic-ehr/type-schema/generator';

// Simple API
await generateTypes({
  outputDir: './generated',
  packagePath: 'hl7.fhir.r4.core@4.0.1', // optional
  verbose: true
});

// Advanced usage with custom generator
const generator = new TypeScriptGenerator({
  outputDir: './custom-output',
  verbose: true
});
await generator.generate();
```

#### TypeSchema Transformation

```typescript
import { transformFHIRSchemas, CanonicalManager } from '@atomic-ehr/type-schema';

// Create canonical manager
const manager = CanonicalManager({
  packages: ['hl7.fhir.r4.core@4.0.1'],
  workingDir: 'tmp/fhir'
});
await manager.init();

// Get FHIR schemas
const structureDefinitions = await manager.search({ type: 'StructureDefinition' });

// Transform to TypeSchema
const typeSchemas = await transformFHIRSchemas(structureDefinitions, {
  packageInfo: {
    name: 'hl7.fhir.r4.core',
    version: '4.0.1'
  },
  verbose: true
});
```

#### Using Generated Types

```typescript
// Import generated types
import { Patient, Observation, Encounter } from './generated';
import * as primitives from './generated/types/primitives';
import * as complex from './generated/types/complex';
import { ResourceTypeMap, AnyResource } from './generated';

// Create strongly-typed FHIR resources
const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  active: true,
  name: [{
    use: 'official',
    family: 'Smith',
    given: ['John', 'Jacob']
  }],
  birthDate: '1970-01-01',
  gender: 'male',
  address: [{
    use: 'home',
    line: ['123 Main St'],
    city: 'Boston',
    state: 'MA',
    postalCode: '02101'
  }]
};

// Type-safe resource type checking
function processResource(resource: AnyResource) {
  if (resource.resourceType === 'Patient') {
    // TypeScript knows this is a Patient
    console.log(resource.name?.[0]?.family);
  }
}

// Runtime type checking
function isValidResourceType(type: string): type is keyof typeof ResourceTypeMap {
  return type in ResourceTypeMap;
}
```

## Generated Output Structure

```
generated/
├── index.ts                    # Main entry point
│   ├── Re-exports all types
│   ├── ResourceTypeMap constant
│   └── AnyResource union type
├── types/
│   ├── primitives.ts          # FHIR primitive types
│   │   └── string, boolean, integer, decimal, etc.
│   └── complex.ts             # Complex data types
│       └── Element, Extension, CodeableConcept, etc.
└── resources/
    ├── Patient.ts             # Individual resource files
    ├── Observation.ts
    ├── Encounter.ts
    └── ... (all FHIR resources)
```

## TypeSchema Format

TypeSchema is an intermediate representation that simplifies FHIR's complex schema format:

```typescript
interface TypeSchema {
  identifier: {
    kind: 'resource' | 'complex-type' | 'primitive-type' | 'nested';
    package: string;
    version: string;
    name: string;
    url: string;
  };
  base?: TypeSchemaIdentifier;      // Parent type
  description?: string;
  fields?: Record<string, {
    type?: TypeSchemaIdentifier;
    array: boolean;
    required: boolean;
    excluded: boolean;
    min?: number;
    max?: number;
    choices?: string[];
    reference?: TypeSchemaIdentifier[];
    binding?: TypeSchemaIdentifier;
  }>;
  nested?: TypeSchemaNestedType[];  // BackboneElements
  dependencies: TypeSchemaIdentifier[];
}
```

## Development

### Running Tests

```bash
# Run all tests
bun test

# Run specific test suite
bun test src/generator/
bun test src/utils/
bun test src/typeschema/

# Run with coverage
bun test --coverage
```

### Building

```bash
# Build the project
bun run build
```

### Project Scripts

- `bun run test` - Run all tests
- `bun run build` - Build the project
- `bun run typecheck` - Run TypeScript type checking
- `bun run cli` - Run TypeSchema CLI
- `bun run generate-types` - Run type generation CLI
- `bun run release [patch|minor|major]` - Create and publish a release

## Architecture

### Generator System

The generator system follows an extensible architecture:

1. **BaseGenerator** - Abstract base class providing:
   - File and directory management
   - Code formatting utilities (indentation, blocks)
   - Multi-file output support

2. **SchemaLoader** - Loads and categorizes FHIR schemas:
   - Uses `@atomic-ehr/fhir-canonical-manager` for package management
   - Transforms FHIR schemas to TypeSchema format
   - Categorizes by type (resources, complex types, primitives)

3. **TypeScriptGenerator** - Generates TypeScript code:
   - Type mappings for FHIR primitives
   - Proper inheritance chains
   - Reference type handling
   - Nested type (BackboneElement) support

### Utilities

- **Naming utilities** - Consistent naming conventions for TypeScript
- **Code utilities** - Code generation helpers (JSDoc, enums, type aliases)

## Publishing & Release Management

This project uses automated publishing workflows with both stable releases and canary builds.

### Release Process

#### Stable Releases

1. **Create a release using the script:**
   ```bash
   # For patch releases (bug fixes)
   bun run release patch
   
   # For minor releases (new features)
   bun run release minor
   
   # For major releases (breaking changes)
   bun run release major
   ```

2. The release script will:
   - Verify you're on the main branch
   - Check for uncommitted changes
   - Run tests and type checking
   - Bump the version in package.json
   - Create a git commit and tag
   - Build the package
   - Publish to npm
   - Push changes and tags to GitHub

3. **GitHub Actions will also publish:**
   - The publish workflow triggers on version tags (v*)
   - Creates a GitHub Release with changelog
   - Publishes to npm registry

#### Canary Releases

Canary releases are automatically created on every push to the main branch:

- **Installation:** `npm install @atomic-ehr/codegen@canary`
- **Versioning:** `0.0.1-canary.abc1234.20240805123456`
- **Automatic:** No manual action required

### CI/CD Workflows

#### Continuous Integration (CI)
- **Triggers:** Push/PR to main or develop branches
- **Actions:** Tests, type checking, multi-platform testing
- **Platforms:** Ubuntu, macOS (Windows commented out)

#### Canary Release
- **Triggers:** Push to main branch (excluding version tags)
- **Actions:** Build, test, publish canary version
- **Skip conditions:** `[skip ci]` in commit message or version bump commits

#### Publish
- **Triggers:** Version tags (v*)
- **Actions:** Full test suite, build, npm publish, GitHub release
- **Requirements:** All tests must pass

#### Playground Trigger
- **Triggers:** After successful canary release
- **Actions:** Triggers rebuild of related playground/demo applications
- **Status:** Currently disabled (can be enabled by setting `if: false` to a condition)

### Package Configuration

The package is configured for npm publishing with:
- **Registry:** npm public registry
- **Scope:** `@atomic-ehr`
- **Access:** Public
- **Files included:** `dist/`, `src/`
- **Main entry:** `./dist/index.js`
- **Types:** `./dist/index.d.ts`
- **CLI binary:** `type-schema` → `./dist/cli/index.js`

### Requirements

To publish, you need:
- **NPM_TOKEN** secret in GitHub repository settings
- **Write access** to the @atomic-ehr npm organization
- **Push access** to the main branch

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## Task Management

This project uses a task-based workflow. Check the `tasks/` directory:
- `todo/` - Planned tasks
- `in-progress/` - Active development
- `done/` - Completed tasks

## Dependencies

- [Bun](https://bun.sh) - JavaScript runtime and toolkit
- [@atomic-ehr/fhirschema](https://www.npmjs.com/package/@atomic-ehr/fhirschema) - FHIR schema translation
- [@atomic-ehr/fhir-canonical-manager](https://www.npmjs.com/package/@atomic-ehr/fhir-canonical-manager) - FHIR package management

## License

[License information here]

## Related Documentation

- [Type Generation Architecture](./docs/FHIR_TYPE_GENERATION.md)
- [TypeSchema Specification](./README-type-schema.md)
- [Task Templates](./tasks/README.md)