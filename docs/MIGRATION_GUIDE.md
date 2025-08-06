# Migration Guide: From Old CLI to New Architecture

This guide helps you migrate from the previous CLI structure to the new modular architecture introduced in the latest version of Atomic EHR Codegen.

## Overview of Changes

The new architecture introduces several key improvements:

- **Modular Design**: Separate TypeSchema transformation and code generation stages
- **Unified CLI**: Single `atomic-codegen` command with subcommands
- **Configuration System**: Centralized configuration with multiple sources
- **Generator Registry**: Extensible generator system
- **Better Performance**: Optimized processing pipeline

## Command Migration

### Old CLI Commands → New CLI Commands

#### Type Generation

**Old:**
```bash
# Old CLI commands
bun run generate-types -o ./generated
bun run generate-types -p hl7.fhir.r4.core@4.0.1 -o ./generated
bun run cli -o types/r4.ndjson hl7.fhir.r4.core@4.0.1
```

**New:**
```bash
# New unified CLI
atomic-codegen generate typescript -o ./generated
atomic-codegen generate typescript -o ./generated --package hl7.fhir.r4.core@4.0.1
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o types/r4.ndjson
```

#### TypeSchema Operations

**Old:**
```bash
# Old separate scripts
bun run cli create-schema hl7.fhir.r4.core@4.0.1 -o schema.ndjson
bun run cli validate-schema schema.ndjson
```

**New:**
```bash
# New organized subcommands
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o schema.ndjson
atomic-codegen typeschema validate schema.ndjson
atomic-codegen typeschema merge schema1.ndjson schema2.ndjson -o merged.ndjson
```

### Command Line Options

| Old Option | New Option | Notes |
|------------|------------|-------|
| `-o, --output` | `-o, --output` | Same |
| `-p, --package` | `--package` | Now optional, uses default if not specified |
| `-v, --verbose` | `-v, --verbose` | Same |
| `--input` | `-i, --input` | Shortened form available |
| N/A | `--config` | New: specify config file |
| N/A | `--dry-run` | New: preview without writing |

## Project Structure Changes

### Old Structure
```
src/
├── cli/
│   ├── index.ts              # TypeSchema CLI
│   └── generate-types.ts     # Type generation CLI
├── generator/
│   └── typescript.ts         # TypeScript generator
└── utils/
    └── ...
```

### New Structure
```
src/
├── cli/
│   ├── index.ts              # Main CLI entry
│   └── commands/             # Command implementations
│       ├── generate/
│       ├── typeschema/
│       └── config/
├── generators/               # Generator system
│   ├── base.ts
│   ├── typescript/
│   └── registry.ts
├── lib/                      # Core libraries
│   ├── core/
│   ├── generators/
│   └── typeschema/
└── utils/
```

## Configuration Migration

### Old Configuration (Environment Variables Only)

**Old:**
```bash
# Environment variables only
export FHIR_PACKAGE="hl7.fhir.r4.core@4.0.1"
export OUTPUT_DIR="./generated"
export VERBOSE="true"
```

### New Configuration (Multiple Sources)

**New:**
```bash
# 1. Initialize configuration file
atomic-codegen config init --template typescript

# 2. Use configuration file (.atomic-codegen.json)
{
  "typeschema": {
    "packages": ["hl7.fhir.r4.core@4.0.1"]
  },
  "generator": {
    "target": "typescript",
    "outputDir": "./generated"
  }
}

# 3. Environment variables (with new prefix)
export ATOMIC_CODEGEN_VERBOSE=true
export ATOMIC_CODEGEN_OUTPUT_DIR=./generated

# 4. CLI arguments (highest priority)
atomic-codegen generate typescript -o ./generated -v
```

## API Migration

### Old Programmatic API

**Old:**
```typescript
// Old direct imports
import { TypeScriptGenerator } from './src/generator/typescript';
import { transformFHIRSchemas } from './src/typeschema';

// Manual setup required
const generator = new TypeScriptGenerator('./output');
const schemas = await transformFHIRSchemas(/* ... */);
await generator.generate(schemas);
```

### New Programmatic API

**New:**
```typescript
// New simplified API
import { generateTypes } from '@atomic-ehr/codegen/generators';

// Simple one-line generation
await generateTypes({
  outputDir: './output',
  packagePath: 'hl7.fhir.r4.core@4.0.1',
  verbose: true
});

// Or use the generator directly
import { TypeScriptGenerator } from '@atomic-ehr/codegen/generators';

const generator = new TypeScriptGenerator({
  outputDir: './output',
  verbose: true
});
await generator.generate();
```

## File Output Changes

### Generated File Structure

**Old:**
```
generated/
├── index.ts
├── primitives.ts
├── complex.ts
└── resources.ts              # All resources in one file
```

**New:**
```
generated/
├── index.ts                  # Enhanced with ResourceTypeMap
├── types/
│   ├── primitives.ts
│   ├── complex.ts
│   └── valuesets.ts          # New: value set types
└── resources/
    ├── Patient.ts            # Individual resource files
    ├── Observation.ts
    └── ...
```

### Import Changes

**Old:**
```typescript
// Old imports
import { Patient, Observation } from './generated/resources';
import * as primitives from './generated/primitives';
```

**New:**
```typescript
// New imports (more flexible)
import { Patient, Observation } from './generated';
import { Patient } from './generated/resources/Patient';
import * as primitives from './generated/types/primitives';
import { ResourceTypeMap, AnyResource } from './generated';
```

## Step-by-Step Migration

### Step 1: Update Dependencies

```bash
# Update to latest version
bun install @atomic-ehr/codegen@latest

# Or if using from source
git pull origin main
bun install
```

### Step 2: Update Scripts

Update your `package.json` scripts:

**Old:**
```json
{
  "scripts": {
    "generate-types": "bun run generate-types -o ./src/types",
    "create-schema": "bun run cli create-schema hl7.fhir.r4.core@4.0.1 -o schema.ndjson"
  }
}
```

**New:**
```json
{
  "scripts": {
    "generate-types": "atomic-codegen generate typescript -o ./src/types",
    "create-schema": "atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o schema.ndjson",
    "validate-config": "atomic-codegen config validate"
  }
}
```

### Step 3: Create Configuration File

```bash
# Initialize configuration
atomic-codegen config init --template typescript

# Customize as needed
# Edit .atomic-codegen.json
```

### Step 4: Update Code Imports

Update your TypeScript imports to use the new structure:

**Old:**
```typescript
import { Patient } from './generated/resources';
```

**New:**
```typescript
import { Patient } from './generated';
// or
import { Patient } from './generated/resources/Patient';
```

### Step 5: Test Migration

```bash
# Test the new commands
atomic-codegen generate typescript -o ./test-output

# Validate configuration
atomic-codegen config validate

# Compare output with old version
```

## Breaking Changes

### 1. CLI Command Structure

- **Breaking**: Old script names (`generate-types`, `cli`) no longer work
- **Migration**: Use new `atomic-codegen` command with subcommands

### 2. Environment Variables

- **Breaking**: Old environment variables without `ATOMIC_CODEGEN_` prefix ignored
- **Migration**: Add `ATOMIC_CODEGEN_` prefix to all environment variables

### 3. Generated File Structure

- **Breaking**: Resources are now in separate files instead of one `resources.ts`
- **Migration**: Update imports to use new structure or main index file

### 4. API Changes

- **Breaking**: Direct generator imports changed
- **Migration**: Use new simplified API or updated import paths

## New Features Available

### 1. Configuration Management

```bash
# Initialize, validate, and show configuration
atomic-codegen config init
atomic-codegen config validate
atomic-codegen config show
```

### 2. TypeSchema Operations

```bash
# Merge multiple schemas
atomic-codegen typeschema merge schema1.ndjson schema2.ndjson -o merged.ndjson

# Validate schemas
atomic-codegen typeschema validate schema.ndjson
```

### 3. Generator Registry

```bash
# List available generators
atomic-codegen generators list

# Get generator information
atomic-codegen generators info typescript
```

### 4. Enhanced Output

- Individual resource files for better IDE support
- Value set types for better type safety
- Enhanced ResourceTypeMap for runtime type checking

## Troubleshooting Migration

### Common Issues

1. **Command not found**: Ensure new CLI is properly installed
2. **Configuration errors**: Use `atomic-codegen config validate` to check
3. **Import errors**: Update imports to use new file structure
4. **Environment variables ignored**: Add `ATOMIC_CODEGEN_` prefix

### Getting Help

- Run `atomic-codegen --help` for command help
- Check [Configuration Guide](./CONFIGURATION.md)
- Review [Troubleshooting Guide](./TROUBLESHOOTING.md)
- See [Getting Started Guide](./GETTING_STARTED.md) for new user experience

## Migration Checklist

- [ ] Update dependencies to latest version
- [ ] Replace old CLI commands with new unified commands
- [ ] Update environment variables with `ATOMIC_CODEGEN_` prefix
- [ ] Create configuration file using `atomic-codegen config init`
- [ ] Update package.json scripts
- [ ] Update TypeScript imports to use new structure
- [ ] Test generation with new commands
- [ ] Validate configuration with `atomic-codegen config validate`
- [ ] Update CI/CD pipelines with new commands
- [ ] Update documentation and team knowledge

## Support

If you encounter issues during migration:

1. Check this migration guide
2. Review the [Troubleshooting Guide](./TROUBLESHOOTING.md)
3. Check existing [GitHub issues](https://github.com/atomic-ehr/codegen/issues)
4. Create a new issue with migration details

The new architecture provides better performance, more flexibility, and easier extensibility. While migration requires some changes, the improved developer experience and new features make it worthwhile.
