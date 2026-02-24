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
- **Generators** (`writer-generator/`): Language-specific code generators
  - `introspection.ts`: Generates introspection data like TypeSchema
  - `typescript.ts`: Generates TypeScript interfaces and types
  - `python.ts`: Generates Python/Pydantic models
  - `csharp.ts`: Generates C# classes

### 3. CLI Interface (`src/cli/`)
- **Commands** (`commands/`):
  - `typeschema`: Generate and validate TypeSchema from FHIR packages
  - `generate`: Generate code from TypeSchema (TypeScript, Python, C#)
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

### Coding Style
- Use arrow function syntax for new functions: `const foo = (): ReturnType => { ... }`
- Avoid `function foo() { ... }` declarations in new code
- Avoid re-exports inside project
- Avoid `interface Foo { ... }` declarations in new code, prefer type syntax if it is possible

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
- Supports FHIR R4 packages (R5 in progress)
- Handles profiles and extensions (US Core in development)
- Caches parsed schemas for performance
- Multi-package dependency resolution via Canonical Manager

### TypeSchema Format
- Intermediate representation between FHIR and target languages
- Enables multi-language code generation
- Supports field validation and constraints
- Handles nested types and references
- Flattens FHIR's hierarchical structure for easier generation

### Code Generation
- Modular generator system via APIBuilder
- Language-specific writers in `src/api/writer-generator/`
- TypeScript generator creates interfaces with proper inheritance
- Extensible architecture for new languages
- Supports custom naming conventions and output formats

## APIBuilder Flow

The `APIBuilder` class (`src/api/builder.ts`) provides the fluent API for the three-stage pipeline:

```typescript
// Input stage - Choose one or combine:
.fromPackage("hl7.fhir.r4.core", "4.0.1")           // NPM registry
.fromPackageRef("https://example.com/package.tgz")  // Remote TGZ
.localStructureDefinitions({...})                   // Local files
.fromSchemas(array)                                 // TypeSchema objects

// Processing & introspection stage - Optional:
.typeSchema({                                         // IR transformations
    treeShake: {...},                                 // Filter types
    promoteLogical: {...},                            // Promote logical models
})
.introspection({                                      // Debug output (optional)
    typeSchemas: "./schemas",                         // Type Schemas path/.ndjson
    typeTree: "./tree.json"                           // Type Tree
})

// Output stage - Choose one:
.typescript({...})                                    // TypeScript
.python({...})                                        // Python
.csharp("Namespace", "./path")                        // C#

// Finalize:
.outputTo("./output")                                 // Output directory
.cleanOutput(true)                                    // Clean before generation
.generate()                                           // Execute
```

## Core Concepts

### TypeSchema
- Universal intermediate format for FHIR data
- Defined in `src/typeschema/types.ts`
- Contains: identifier, description, fields, dependencies, base type
- Fields include type, required flag, array flag, binding info
- Supports enums for constrained value sets

### Transformers
Located in `src/typeschema/core/`:
- `transformer.ts`: Main conversion logic from FHIR to TypeSchema
- Handles different FHIR element types
- Processes inheritance and choice types
- Manages field flattening and snapshot generation

### Writers
Located in `src/api/writer-generator/`:
- Base `Writer` class: Handles I/O, indentation, formatting
- Language writers: TypeScript, Python, C#, Mustache
- Each writer traverses TypeSchema index and generates code
- Maintains language-specific idioms and conventions

## Common Development Patterns

### Adding a New Generator Feature
1. Extend the transformer in `src/typeschema/core/transformer.ts` to produce TypeSchema data
2. Add logic to the language writer in `src/api/writer-generator/[language].ts`
3. Add tests in `test/unit/typeschema/` and `test/unit/api/`
4. Document in design docs if it's a major feature

### Debugging TypeSchema Generation
1. Use `builder.introspection({ typeSchemas: "./debug-schemas" })` to inspect intermediate output
2. Check `src/typeschema/types.ts` for TypeSchema structure
3. Review `src/typeschema/core/transformer.ts` for transformation logic
4. Enable verbose logging with `builder.setLogLevel("DEBUG")`

### Testing Generated Code
1. Use `builder.build()` instead of `generate()` to avoid file I/O
2. Tests are organized by component in `test/unit/`
3. Run `bun test:coverage` to see coverage metrics
4. Use `bun test --watch` for development

### Working with Tree Shaking
- Configured via `builder.typeSchema({ treeShake: {...} })`
- Specify which resources and fields to include
- Automatically resolves dependencies
- Reference format: `"hl7.fhir.r4.core#4.0.1"`

## Key File Locations

### Core Logic
- `src/index.ts` - Main entry point and exports
- `src/config.ts` - Configuration type definitions
- `src/api/builder.ts` - APIBuilder implementation
- `src/typeschema/types.ts` - TypeSchema type definitions
- `src/typeschema/generator.ts` - TypeSchema generation orchestration

### Generators
- `src/api/writer-generator/introspection.ts` - TypeSchema introspection generation
- `src/api/writer-generator/typescript.ts` - TypeScript code generation
- `src/api/writer-generator/python.ts` - Python/Pydantic generation
- `src/api/writer-generator/csharp.ts` - C# generation
- `src/api/writer-generator/base.ts` - Common writer utilities

### FHIR Processing
- `src/typeschema/register.ts` - Package registration and canonical resolution
- `src/typeschema/core/transformer.ts` - FHIR → TypeSchema conversion
- `src/typeschema/core/field-builder.ts` - Field extraction logic
- `src/typeschema/core/binding.ts` - Value set and binding handling

### Testing
- `test/unit/typeschema/` - TypeSchema processor tests
- `test/unit/api/` - Generator and builder tests
- `test/assets/` - Test fixtures and sample data

## Known Limitations & Gotchas

1. **R5 Support**: Limited, still in development
2. **Profile Extensions**: Basic parsing only, US Core in progress
3. **Choice Types**: Supported but representation differs by language
4. **Circular References**: Handled but may affect tree shaking
5. **Large Packages**: May require increased Node.js memory (`--max-old-space-size`)

## Performance Optimization Tips

1. Use tree shaking to reduce schema count
2. Enable caching in APIBuilder
3. Process large packages in batches
4. Use `build()` instead of `generate()` for testing
5. Run `bun run quality` before committing (combines typecheck, lint, test:unit)

## Roadmap Context

This toolkit focuses on type generation and code generation:
- **Current**: TypeScript, Python, C# interface/class generation from FHIR R4
- **In Progress**: R5 support, profile/extension enhancements
- **Planned**: Rust, GraphQL, OpenAPI, validation functions, mock data generation

## Useful External Resources

- [FHIR Specification](https://www.hl7.org/fhir/)
- [Canonical Manager](https://github.com/atomic-ehr/canonical-manager)
- [FHIR Schema](https://github.com/fhir-schema/fhir-schema)
- [TypeSchema Spec](https://www.health-samurai.io/articles/type-schema-a-pragmatic-approach-to-build-fhir-sdk)
