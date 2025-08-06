# CLI Reference

Complete reference for all Atomic EHR Codegen command-line options.

## Global Options

These options are available for all commands:

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Configuration file path | Auto-detected |
| `--verbose` | `-v` | Enable verbose logging | `false` |
| `--debug` | | Enable debug logging | `false` |
| `--log-level <level>` | | Set log level (error, warn, info, debug) | `info` |
| `--log-format <format>` | | Set log format (json, text, compact) | `text` |
| `--log-file <path>` | | Write logs to file | Console only |
| `--help` | `-h` | Show help | |
| `--version` | | Show version | |

## TypeSchema Commands

### `typeschema create`

Create TypeSchema files from FHIR packages.

```bash
atomic-codegen typeschema create <packages...> [options]
```

#### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `packages...` | FHIR packages (e.g., hl7.fhir.r4.core@4.0.1) | Yes |

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output <path>` | `-o` | Output file path | `schemas.ndjson` |
| `--output-format <format>` | | Output format (ndjson, separate, merged) | `ndjson` |
| `--working-dir <path>` | `-w` | Working directory for packages | `tmp/packages` |
| `--treeshaking <types...>` | `-t` | Include only specified types | All types |
| `--validation` | | Enable schema validation | `true` |
| `--no-validation` | | Disable schema validation | |
| `--drop-cache` | | Drop package cache | `false` |
| `--verbose` | `-v` | Enable verbose output | `false` |

#### Examples

```bash
# Basic usage
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1

# Multiple packages
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 hl7.fhir.us.core@6.1.0

# With options
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 \
  --output fhir-types.ndjson \
  --treeshaking Patient Observation \
  --verbose

# Separate files for each type
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 \
  --output-format separate \
  --output ./schemas/
```

### `typeschema validate`

Validate TypeSchema files.

```bash
atomic-codegen typeschema validate <files...> [options]
```

#### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `files...` | TypeSchema files to validate | Yes |

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--strict` | | Enable strict validation | `false` |
| `--output-format <format>` | | Output format (text, json) | `text` |
| `--verbose` | `-v` | Show detailed validation info | `false` |

#### Examples

```bash
# Validate single file
atomic-codegen typeschema validate schemas.ndjson

# Validate multiple files
atomic-codegen typeschema validate schemas/*.ndjson

# Strict validation with JSON output
atomic-codegen typeschema validate schemas.ndjson --strict --output-format json
```

### `typeschema merge`

Merge multiple TypeSchema files.

```bash
atomic-codegen typeschema merge <files...> [options]
```

#### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `files...` | TypeSchema files to merge | Yes |

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output <path>` | `-o` | Output file path | `merged.ndjson` |
| `--filter-kinds <kinds...>` | | Include only specified kinds | All kinds |
| `--dedupe` | | Remove duplicate schemas | `true` |
| `--verbose` | `-v` | Enable verbose output | `false` |

#### Examples

```bash
# Merge files
atomic-codegen typeschema merge core.ndjson profiles.ndjson -o combined.ndjson

# Filter by resource types
atomic-codegen typeschema merge *.ndjson \
  --filter-kinds resource complex-type \
  --output filtered.ndjson
```

## Generation Commands

### `generate typescript`

Generate TypeScript types from TypeSchema.

```bash
atomic-codegen generate typescript [options]
```

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--input <path>` | `-i` | Input TypeSchema file | From config |
| `--output <path>` | `-o` | Output directory | From config |
| `--include-comments` | | Include JSDoc comments | `true` |
| `--no-include-comments` | | Exclude JSDoc comments | |
| `--include-validation` | | Include validation code | `false` |
| `--namespace-style <style>` | | Namespace style (nested, flat) | `nested` |
| `--file-naming <style>` | | File naming (camelCase, kebab-case, snake_case, PascalCase) | `PascalCase` |
| `--format` | | Format generated code | `true` |
| `--no-format` | | Skip code formatting | |
| `--file-header <text>` | | Custom file header | |
| `--overwrite` | | Overwrite existing files | `true` |
| `--verbose` | `-v` | Enable verbose output | `false` |

#### Examples

```bash
# Basic generation
atomic-codegen generate typescript -i schemas.ndjson -o ./types

# With validation and comments
atomic-codegen generate typescript \
  -i schemas.ndjson \
  -o ./src/types/fhir \
  --include-validation \
  --include-comments \
  --format

# Flat namespace structure
atomic-codegen generate typescript \
  -i schemas.ndjson \
  -o ./types \
  --namespace-style flat \
  --file-naming kebab-case
```

### `generate python`

Generate Python types from TypeSchema.

```bash
atomic-codegen generate python [options]
```

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--input <path>` | `-i` | Input TypeSchema file | From config |
| `--output <path>` | `-o` | Output directory | From config |
| `--include-comments` | | Include docstrings | `true` |
| `--no-include-comments` | | Exclude docstrings | |
| `--include-validation` | | Include validation code | `false` |
| `--namespace-style <style>` | | Namespace style (nested, flat) | `nested` |
| `--file-naming <style>` | | File naming (snake_case, kebab-case) | `snake_case` |
| `--format` | | Format generated code | `true` |
| `--no-format` | | Skip code formatting | |
| `--file-header <text>` | | Custom file header | |
| `--overwrite` | | Overwrite existing files | `true` |
| `--verbose` | `-v` | Enable verbose output | `false` |

#### Examples

```bash
# Basic generation
atomic-codegen generate python -i schemas.ndjson -o ./python_types

# With Pydantic models
atomic-codegen generate python \
  -i schemas.ndjson \
  -o ./src/fhir_models \
  --include-validation \
  --format

# Flat structure
atomic-codegen generate python \
  -i schemas.ndjson \
  -o ./models \
  --namespace-style flat
```

## Generator Commands

### `generators list`

List available code generators.

```bash
atomic-codegen generators list [options]
```

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output-format <format>` | | Output format (table, json) | `table` |
| `--verbose` | `-v` | Show detailed information | `false` |

#### Examples

```bash
# List generators
atomic-codegen generators list

# Detailed information
atomic-codegen generators list --verbose

# JSON output
atomic-codegen generators list --output-format json
```

## Configuration Commands

### `config init`

Initialize configuration file.

```bash
atomic-codegen config init [options]
```

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output <path>` | `-o` | Output file path | `.atomic-codegen.json` |
| `--working-dir <path>` | `-w` | Working directory | Current directory |
| `--template <name>` | `-t` | Template (minimal, full, typescript, multi-lang) | `minimal` |
| `--force` | `-f` | Overwrite existing file | `false` |
| `--format <format>` | | File format (json, js) | `json` |

#### Examples

```bash
# Basic initialization
atomic-codegen config init

# Use template
atomic-codegen config init --template typescript

# Custom output
atomic-codegen config init --output my-config.json --force

# JavaScript format
atomic-codegen config init --format js
```

### `config validate`

Validate configuration file.

```bash
atomic-codegen config validate [options]
```

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Configuration file path | Auto-detected |
| `--verbose` | `-v` | Show validation details | `false` |

#### Examples

```bash
# Validate current config
atomic-codegen config validate

# Validate specific file
atomic-codegen config validate --config my-config.json

# Verbose output
atomic-codegen config validate --verbose
```

### `config show`

Show current configuration.

```bash
atomic-codegen config show [options]
```

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Configuration file path | Auto-detected |
| `--show-sources` | | Show configuration sources | `false` |
| `--output-format <format>` | | Output format (yaml, json) | `yaml` |

#### Examples

```bash
# Show current config
atomic-codegen config show

# Show with sources
atomic-codegen config show --show-sources

# JSON output
atomic-codegen config show --output-format json
```

## Validation Commands

### `validate`

Validate generated code files.

```bash
atomic-codegen validate <files...> [options]
```

#### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `files...` | Generated code files to validate | Yes |

#### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--language <lang>` | `-l` | Target language (typescript, python) | Auto-detect |
| `--strict` | | Enable strict validation | `false` |
| `--output-format <format>` | | Output format (text, json) | `text` |
| `--fix` | | Attempt to fix validation errors | `false` |
| `--verbose` | `-v` | Show detailed validation info | `false` |

#### Examples

```bash
# Validate TypeScript files
atomic-codegen validate ./types/*.ts

# Validate with auto-fix
atomic-codegen validate ./types/*.ts --fix

# Strict validation
atomic-codegen validate ./types/*.ts --strict --verbose
```

## Exit Codes

The CLI uses these exit codes:

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | General error |
| `2` | Configuration error |
| `3` | Validation error |
| `4` | Generation error |
| `5` | File system error |

## Environment Variables

Set these environment variables to override configuration:

```bash
# Global settings
export ATOMIC_CODEGEN_VERBOSE=true
export ATOMIC_CODEGEN_OUTPUT_DIR=./types
export ATOMIC_CODEGEN_LOG_LEVEL=debug
export ATOMIC_CODEGEN_LOG_FORMAT=json
export ATOMIC_CODEGEN_LOG_FILE=./logs/atomic-codegen.log

# TypeSchema settings
export ATOMIC_CODEGEN_TYPESCHEMA_FORMAT=ndjson
export ATOMIC_CODEGEN_TYPESCHEMA_VALIDATION=true
export ATOMIC_CODEGEN_DROP_CACHE=false

# Generator settings
export ATOMIC_CODEGEN_GENERATOR_TARGET=typescript
export ATOMIC_CODEGEN_INCLUDE_COMMENTS=true
export ATOMIC_CODEGEN_INCLUDE_VALIDATION=false
export ATOMIC_CODEGEN_NAMESPACE_STYLE=nested
export ATOMIC_CODEGEN_FILE_NAMING=PascalCase

# TypeScript settings
export ATOMIC_CODEGEN_TS_STRICT=true
export ATOMIC_CODEGEN_TS_TARGET=ES2020
export ATOMIC_CODEGEN_TS_MODULE=ES2020
export ATOMIC_CODEGEN_TS_DECLARATION=true
export ATOMIC_CODEGEN_TS_USE_ENUMS=true
export ATOMIC_CODEGEN_TS_PREFER_INTERFACES=true
```

## Configuration File Integration

All CLI options can be configured in a configuration file. CLI arguments override configuration file values:

```json
{
  "typeschema": {
    "packages": ["hl7.fhir.r4.core@4.0.1"],
    "outputFormat": "ndjson",
    "validation": true
  },
  "generator": {
    "target": "typescript",
    "outputDir": "./src/types",
    "includeComments": true,
    "format": true
  }
}
```

Then run commands without specifying options:

```bash
# Uses packages from config
atomic-codegen typeschema create

# Uses generator settings from config
atomic-codegen generate typescript
```

## Shell Completion

Enable shell completion for better CLI experience:

```bash
# Bash
atomic-codegen --completion bash >> ~/.bashrc

# Zsh
atomic-codegen --completion zsh >> ~/.zshrc

# Fish
atomic-codegen --completion fish >> ~/.config/fish/completions/atomic-codegen.fish
```

## Debugging

Enable debug output for troubleshooting:

```bash
# Debug mode
atomic-codegen --debug typeschema create hl7.fhir.r4.core@4.0.1

# Verbose with log file
atomic-codegen --verbose --log-file debug.log typeschema create hl7.fhir.r4.core@4.0.1

# JSON logging for analysis
atomic-codegen --log-format json --log-file debug.json typeschema create hl7.fhir.r4.core@4.0.1
```