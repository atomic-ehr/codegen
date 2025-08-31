# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

```bash
# Development
bun install                    # Install dependencies
bun test                      # Run all tests 
bun test --watch              # Run tests in watch mode
bun test --coverage           # Run tests with coverage
bun run typecheck             # Type check the codebase
bun run lint                  # Lint and format code with Biome

# Building
bun run build                 # Build the project (creates dist/)
bun run cli                   # Run CLI in development mode

# CLI Usage
bun run cli typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson
bun run cli generate typescript -i schemas.ndjson -o ./types
```

## Architecture Overview

This is a FHIR code generation toolkit with a **three-stage pipeline**:

### 1. Input Layer (`src/typeschema/`)
- **Parser** (`parser.ts`): Reads TypeSchema documents from files
- **Generator** (`generator.ts`): Converts FHIR packages to TypeSchema format
- **Core processors** (`core/`): Handle FHIR schema transformation
  - `transformer.ts`: Main FHIR-to-TypeSchema conversion
  - `field-builder.ts`: Builds TypeSchema fields from FHIR elements
  - `binding.ts`: Processes FHIR value bindings and enums
  - `nested-types.ts`: Handles nested type dependencies

### 2. High-Level API (`src/api/`)
- **APIBuilder** (`builder.ts`): Fluent interface for chaining operations
- **Generators** (`generators/`): Language-specific code generators
  - `typescript.ts`: Generates TypeScript interfaces and types

### 3. CLI Interface (`src/cli/`)
- **Commands** (`commands/`):
  - `typeschema`: Generate and validate TypeSchema from FHIR packages
  - `generate`: Generate code from TypeSchema (TypeScript)
- **Main entry** (`index.ts`): CLI setup with yargs

### Key Data Flow
```
FHIR Package → TypeSchema Generator → TypeSchema Format → Code Generators → Output Files
```

## Configuration

- **Main config**: `atomic-codegen.config.ts` (TypeScript configuration file)
- **Package config**: Uses `Config` type from `src/config.ts`
- **Default packages**: `hl7.fhir.r4.core@4.0.1`
- **Output dir**: `./generated` by default
- **Cache**: `.typeschema-cache/` for performance optimization

## Project Structure Patterns

- **TypeSchema types**: Defined in `src/typeschema/types.ts`
- **Tests**: Located in `test/unit/` with mirrors to `src/` structure
- **Generated code**: Output goes to `generated/` directory
- **Utilities**: Common functions in `src/utils.ts` and `src/typeschema/utils.ts`

## Development Guidelines

### TypeScript Configuration
- Uses strict TypeScript with latest ESNext features
- Module format: ESM with `"type": "module"` in package.json
- Build target: Node.js with Bun bundler
- Biome for linting/formatting (tabs, double quotes)

### Testing Strategy
- Uses Bun's built-in test runner
- Unit tests for core functionality (transformers, builders)
- Tests mirror source structure in `test/unit/`
- API tests for high-level generators

### Key Dependencies
- `@atomic-ehr/fhir-canonical-manager`: FHIR package management
- `@atomic-ehr/fhirschema`: FHIR schema definitions
- `yargs`: CLI argument parsing
- `ajv`: JSON schema validation

## Important Implementation Details

### FHIR Package Processing
- Supports FHIR R4 packages (R5 planned)
- Handles profiles and extensions (US Core in development)
- Caches parsed schemas for performance
- Multi-package dependency resolution

### TypeSchema Format
- Intermediate representation between FHIR and target languages
- Enables multi-language code generation
- Supports field validation and constraints
- Handles nested types and references

### Code Generation
- Modular generator system
- TypeScript generator creates interfaces with proper inheritance
- Extensible for future languages (Python, Rust planned)
- Supports custom naming conventions and output formats

## Roadmap Context

This toolkit is expanding beyond type generation:
- **Phase 1 (Future)**: REST client generation (removed from current scope)
- **Phase 2 (Q3 2024)**: Smart chained search builders
- **Phase 3 (Q4 2024)**: FHIR operation generation
- Future: Multi-language support, GraphQL schemas, validation functions

The current focus is completing profile/extension support and expanding the TypeScript generator capabilities.