# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Use Bun exclusively** - This project uses Bun instead of Node.js, npm, pnpm, or Vite. Always use `bun` commands:

- `bun test` - Run all tests
- `bun test --watch` - Run tests in watch mode  
- `bun test --coverage` - Run tests with coverage
- `bun test test/unit/` - Run unit tests only
- `bun test test/integration/` - Run integration tests only
- `bun test test/e2e/` - Run end-to-end tests
- `bun test test/benchmarks/` - Run performance benchmarks
- `bun test --coverage --bail` - CI test run (stops on first failure)
- `bun run typecheck` - Type checking with TypeScript
- `bun run lint` - Lint and auto-fix code with Biome
- `bun run build` - Build the project
- `bun run cli` - Run the development CLI
- `bun run codegen:all` - Generate TypeScript types from default packages

**Documentation:**
- `bun run docs` - Generate TypeDoc documentation
- `bun run docs:serve` - Serve docs locally on port 8080
- `bun run docs:watch` - Generate docs in watch mode

**CLI Development:**
- `bun run src/cli/index.ts` - Direct CLI execution for development
- `bunx tsc --noEmit` - TypeScript compilation check

## Architecture Overview

This is a FHIR code generation toolkit built with a three-stage architecture:

### Core Architecture

1. **Input Layer** (`src/typeschema/`): Processes FHIR packages, profiles, and schemas into TypeSchema format
   - `parser.ts` - Parses FHIR packages and profiles
   - `transformer.ts` - Converts FHIR to TypeSchema intermediate format
   - `generator.ts` - Main TypeSchema generation orchestrator

2. **High-Level API** (`src/api/`): Fluent builder API for common workflows
   - `builder.ts` - Main APIBuilder class with chainable methods
   - `generators/` - Language-specific generators (TypeScript, REST client)

3. **Output Generators** (`src/fhir/`): Generate code from TypeSchema
   - `generator.ts` - Main FHIR type generation
   - `guards/` - Type guards and validation functions
   - `search-builder.ts` - FHIR search parameter builders

### Key Components

- **CLI** (`src/cli/`): Simplified command interface with `typeschema`, `generate`, `dev` commands
- **Core** (`src/core/`): Shared utilities, plugin system, validation
- **Config** (`src/config.ts`): Configuration system supporting multiple file formats
- **Types** (`src/types/`): Shared type definitions

### TypeSchema Flow

```
FHIR Package → TypeSchema Parser → TypeSchema Format → Code Generators → Output (TS/Python/etc.)
```

The project uses TypeSchema as a universal intermediate format, enabling generation for multiple target languages from a single source.

## Configuration

The project supports multiple configuration formats:
- `atomic-codegen.config.ts` (TypeScript - preferred)
- `atomic-codegen.config.js` (JavaScript)  
- `atomic-codegen.config.json` (JSON)
- Various other formats (see `CONFIG_FILE_NAMES` in `src/config.ts`)

Configuration includes TypeScript generation options, REST client settings, FHIR packages, and output preferences.

## Development Notes

- Built with **Bun runtime** for performance
- Uses **Biome** for linting/formatting instead of ESLint/Prettier  
- **TypeScript** in strict mode with ES2020 target
- Modular ESM architecture with `src/index.ts` as main entry
- CLI binary at `dist/cli/index.ts` after build
- Comprehensive test suite with unit, integration, e2e, and benchmark tests

## Important Files

- `src/api/builder.ts` - High-level fluent API for common workflows
- `src/config.ts` - Configuration schema and loader
- `src/cli/commands/index.ts` - CLI command definitions  
- `src/typeschema/generator.ts` - TypeSchema generation logic
- `src/fhir/generator.ts` - FHIR type generation
- `atomic-codegen.config.ts` - Project configuration example

Always prefer using the high-level API (`APIBuilder`) for new features rather than low-level components directly.