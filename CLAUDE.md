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

## Verification

After any code change, run at minimum:
```bash
bun run typecheck && bun run lint && bun test
```

For full verification including example generation and cross-project type checking:
```bash
make all
```
This runs: tests, lint with auto-fix, and all example generation pipelines (TypeScript R4, CCDA, SQL-on-FHIR, C#, Python, Mustache).

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

## General Principles

- Bias toward action: start making changes directly. Do not write plan files, explore the entire codebase, or use Task sub-agents unless explicitly asked.
- Keep changes minimal and focused. Do not over-engineer (no extra abstractions, generics, or variants beyond what was requested). When in doubt, do the simplest thing that works.
- Only modify files and directories that were explicitly mentioned or are directly required by the change. Do not refactor surrounding code.
- When asked to review or explain code, explain first before proposing fixes. Do not jump to making changes unless explicitly asked to fix something.

## Commit Guidelines

- Split commits logically by concern. Always separate example/generated file updates from source code changes.
- Typical commit order: source changes → test changes → regenerated examples. Example updates should be the last commit in the branch.
- When making follow-up changes (fixes, refactors) to code already committed on the branch, create a new commit on top of the original commit with a prefix: `fix: ...`, `ref: ...`, etc. Do NOT amend or squash into the original commit — the user reviews changes step by step and will squash when finished.
- Never rewrite branch history (rebase, squash, amend) unless the user explicitly asks.

## Pull Request Style

- PR title must start with a module prefix: `TS:`, `PY:`, `C#:`, `TypeSchema:`, `CLI:`, `API:`, etc. to indicate which part of the codebase is affected. Use multiple prefixes (e.g. `TypeSchema/TS:`) when a change spans modules.
- PR body should be a bullet list summarizing changes — no test plan section.
  - Use two-level nesting to group related items when the list is long; keep it flat when short.
  - Use `##` section headers to group changes by concern when the PR spans multiple topics (e.g. renames, new features, config changes).
- Keep bullets concise and focused on what changed, not why.
- When a PR changes generated code or user-facing API, include before/after code examples.
  - Add a short motivation line before each example explaining why the change was made.
- When a PR changes user-facing config (generation scripts, tree shake rules, APIBuilder options), show the config diff as a before/after code block.

## Development Guidelines

### TypeScript Configuration
- Uses strict TypeScript with latest ESNext features
- Module format: ESM with `"type": "module"` in package.json
- Build target: Node.js with Bun bundler
- Biome for linting/formatting (spaces, double quotes)

### Coding Style
- Use arrow function syntax for new functions: `const foo = (): ReturnType => { ... }`
- Avoid `function foo() { ... }` declarations in new code
- Avoid re-exports inside project
- Avoid `interface Foo { ... }` declarations in new code, prefer type syntax if it is possible
- In code generators (writer-generator): use `curlyBlock` and `squareBlock` helpers for writing structured output instead of manual indent/deindent or string concatenation
- Use `Record` instead of `Map` unless there is a significant reason for `Map` (e.g. non-string keys, iteration order guarantees, frequent deletion)
- Prefer single-line guard clauses without braces: `if (!x) throw new Error("...");` instead of wrapping in `{ }`
- Do not check `kind` of `Identifier`/`TypeIdentifier`/`TypeSchema` by manually comparing the `kind` field. Use dedicated predicates (`isPrimitiveIdentifier`, `isSpecializationTypeSchema`, etc.)

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
    resolveCollisions: {...},                         // Resolve schema collisions
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

## Static Assets for Generators

Static files that are copied verbatim into generated output live in `assets/api/writer-generator/<language>/`. Each language writer has a resolver function (e.g., `resolveTsAssets`, `resolvePyAssets`) that handles path resolution for both dev (`src/`) and dist (`dist/`) builds.

**Pattern:**
```
assets/api/writer-generator/
├── typescript/profile-helpers.ts   # Runtime helpers for TS profile classes
└── python/
    ├── requirements.txt
    ├── fhirpy_base_model.py
    └── resource_family_validator.py
```

**How it works:**
1. Asset files are authored/maintained directly in `assets/` (included in biome linting)
2. Writers copy them to output via `this.cp("filename", "filename")` — uses `Writer.cp()` which resolves via `resolveAssets`
3. Each language writer sets `resolveAssets` in its constructor (e.g., TypeScript writer defaults to `resolveTsAssets`)

**When to use assets vs programmatic generation:**
- Use assets for static runtime code shared across all generated profiles (helpers, validators, base models)
- Use programmatic generation (`w.lineSM()`, `w.curlyBlock()`) for code that varies per schema/profile

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
4. Enable verbose logging by passing `mkCodegenLogger({ level: "DEBUG" })` to the builder

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
- `src/api/writer-generator/typescript/writer.ts` - TypeScript type generation
- `src/api/writer-generator/typescript/profile.ts` - TypeScript profile class generation
- `src/api/writer-generator/python.ts` - Python/Pydantic generation
- `src/api/writer-generator/csharp/csharp.ts` - C# generation
- `src/api/writer-generator/writer.ts` - Base Writer class (I/O, indentation, `cp()` for assets)

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

## Useful External Resources

- [FHIR Specification](https://www.hl7.org/fhir/)
- [Canonical Manager](https://github.com/atomic-ehr/canonical-manager)
- [FHIR Schema](https://github.com/fhir-schema/fhir-schema)
- [TypeSchema Spec](https://www.health-samurai.io/articles/type-schema-a-pragmatic-approach-to-build-fhir-sdk)
