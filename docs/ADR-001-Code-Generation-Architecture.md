# ADR-001: Code Generation Architecture

## Status
Proposed

## Context
We need to implement a comprehensive code generation system for FHIR types that:
- Supports both core FHIR packages (R4) and profiles (US Core)
- Follows a library-first approach for reusability
- Has a clean CLI with logical subcommand groups
- Initially focuses on TypeScript as the target language
- Is simple and maintainable
- Can be extended to other languages later

### Current State Analysis
- Existing CLI mixes typeschema generation with direct usage
- Generator module exists but is not fully integrated
- No clear separation between library and CLI concerns
- Limited profile support
- Missing proper CLI command structure

## Decision
We will implement a new architecture with the following components:

### 1. Library-First Architecture

```
@atomic-ehr/type-schema (library)
├── src/lib/
│   ├── typeschema/           # TypeSchema generation from FHIR
│   ├── generators/           # Code generators (TS, future: Python, etc.)
│   └── core/                 # Shared utilities
└── src/cli/                  # CLI wrapper around library
    ├── typeschema/           # TypeSchema commands
    └── generate/             # Code generation commands
```

### 2. CLI Command Structure

#### Main Commands:
- `atomic-codegen typeschema <subcommand>` - TypeSchema operations
- `atomic-codegen generate <subcommand>` - Code generation operations

#### Subcommands:

**TypeSchema Commands:**
```bash
atomic-codegen typeschema create --package hl7.fhir.r4.core --output schemas/
atomic-codegen typeschema validate --input schemas/patient.ts.json
atomic-codegen typeschema merge --input schemas/ --output merged.ndjson
```

**Generator Commands:**
```bash
atomic-codegen generate typescript --input schemas/ --output types/
atomic-codegen generate typescript --package hl7.fhir.r4.core --output types/r4/
atomic-codegen generate typescript --profile hl7.fhir.us.core --output types/uscore/
```

### 3. Core Library Components

#### TypeSchema Module (`src/lib/typeschema/`)
- **Package Processor**: Handle FHIR packages (core + profiles)
- **Profile Processor**: Extended support for profiles and extensions
- **Schema Transformer**: Convert FHIR → TypeSchema
- **Schema Validator**: Validate TypeSchema integrity

#### Generator Module (`src/lib/generators/`)
- **Base Generator**: Abstract generator with common functionality
- **TypeScript Generator**: Full TypeScript type generation
- **Generator Registry**: Plugin system for future languages

#### Core Module (`src/lib/core/`)
- **Package Manager**: FHIR package loading and caching
- **Naming Utils**: Consistent naming conventions
- **File Utils**: File I/O operations
- **Config**: Configuration management

### 4. TypeScript Generator Features

#### Core Features:
- Interface generation for all FHIR resources
- Proper inheritance (Resource → DomainResource → Patient)
- Union types for choice elements (value[x])
- Generic Reference<T> types
- Namespace organization (primitives, complex, resources)

#### Profile Support:
- Profile-specific interfaces extending base types
- Extension handling in profiles
- Constraint validation (future)
- Profile-specific value sets

#### File Organization:
```
generated/
├── index.ts                 # Main exports
├── primitives/
│   └── index.ts            # FHIR primitive types
├── complex/
│   └── index.ts            # Complex types (Element, etc.)
├── resources/
│   ├── core/               # Core FHIR resources
│   │   ├── Patient.ts
│   │   └── Observation.ts
│   └── profiles/           # Profile-specific resources
│       └── uscore/
│           ├── USCorePatient.ts
│           └── USCoreObservation.ts
└── valuesets/
    ├── core/               # Core value sets
    └── profiles/           # Profile value sets
```

### 5. Configuration System

#### Library Configuration:
```typescript
interface TypeSchemaConfig {
  packages: string[];
  profiles?: string[];
  outputFormat: 'ndjson' | 'separate' | 'merged';
  validation: boolean;
  treeshaking?: string[];
}

interface GeneratorConfig {
  target: 'typescript' | 'python' | 'java';
  outputDir: string;
  includeComments: boolean;
  includeValidation: boolean;
  namespaceStyle: 'nested' | 'flat';
}
```

#### CLI Configuration:
- Support for config files (`.atomic-codegen.json`)
- Environment variable overrides (ATOMIC_CODEGEN_*)
- Command-line argument precedence

### 6. Extension Points

#### Generator Registry:
```typescript
interface Generator {
  name: string;
  generate(schemas: TypeSchema[], config: GeneratorConfig): Promise<void>;
}

class GeneratorRegistry {
  register(generator: Generator): void;
  get(name: string): Generator;
}
```

#### Plugin System:
- Custom generators
- Custom transformers
- Custom validators

## Consequences

### Positive:
- Clear separation of concerns (library vs CLI)
- Extensible architecture for multiple languages  
- Proper profile support from the start
- Consistent CLI interface
- Testable library components
- Configuration flexibility

### Negative:
- More complex initial setup
- Breaking changes to existing CLI
- Additional abstraction layers

### Risks:
- Over-engineering for current simple needs
- Learning curve for new command structure
- Migration effort for existing users

## Implementation Plan

### Phase 1: Core Library
1. Restructure existing code into library modules
2. Create core abstractions (Generator, TypeSchema interfaces)
3. Implement TypeScript generator with current features

### Phase 2: CLI Restructure
1. Implement new command structure
2. Add configuration system
3. Maintain backward compatibility where possible

### Phase 3: Profile Support
1. Extend TypeSchema processor for profiles
2. Add profile-aware TypeScript generation
3. Implement US Core example

### Phase 4: Enhancement
1. Add validation capabilities
2. Improve error handling and logging
3. Add comprehensive testing

### Phase 5: Future Languages
1. Implement generator registry
2. Add Python generator as example
3. Document extension guidelines

## Tools and Dependencies

### Development Tools:
- Bun for runtime and package management
- Biome for linting and formatting
- TypeScript for type safety
- Vitest for testing

### Key Dependencies:
- `@atomic-ehr/fhir-canonical-manager` - FHIR package management
- `@atomic-ehr/fhirschema` - FHIR schema transformation
- `yargs` - CLI argument parsing
- `zod` - Runtime validation (future)

### Testing Strategy:
- Unit tests for each library component
- Integration tests for end-to-end workflows
- Golden file testing for generated code
- CLI command testing

## Metrics and Success Criteria

### Library Metrics:
- All existing functionality maintained
- <100ms for small schema processing
- Memory usage under 256MB for R4 core
- 100% test coverage for core components

### CLI Metrics:
- Intuitive command discovery
- Helpful error messages
- Consistent behavior across commands
- Backward compatibility where feasible

### Code Quality:
- TypeScript strict mode compliance
- Biome linting with zero warnings
- Comprehensive documentation
- Clear error handling