# CLI Reference

@atomic-ehr/type-schema provides two command-line interfaces for different use cases.

## generate-types

Generates TypeScript type definitions from FHIR packages.

### Usage

```bash
bunx type-schema generate-types [options]
```

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--output` | `-o` | Output directory for generated types | Required |
| `--package` | `-p` | FHIR package to generate from | `hl7.fhir.r4.core@4.0.1` |
| `--verbose` | `-v` | Enable verbose output | `false` |
| `--help` | `-h` | Show help message | - |

### Examples

#### Basic Usage

Generate types to a directory:

```bash
bunx type-schema generate-types -o ./generated
```

#### Custom Package

Generate from a specific FHIR package:

```bash
bunx type-schema generate-types -o ./generated -p hl7.fhir.r4.core@4.0.1
```

#### Verbose Output

See detailed progress:

```bash
bunx type-schema generate-types -o ./generated -v
```

Output:
```
Loading FHIR schemas...
Initializing canonical manager...
Loading package hl7.fhir.r4.core@4.0.1...
Transforming schemas to TypeSchema format...
Categorizing schemas...
  Resources: 147
  Complex types: 152
  Primitive types: 21
Generating primitive types...
Generating complex types...
Generating resources...
  Patient
  Observation
  ...
Generating index file...
Type generation complete!
Output directory: ./generated
```

### Exit Codes

- `0`: Success
- `1`: General error
- `2`: Invalid arguments
- `3`: File system error

## cli (TypeSchema CLI)

Generates TypeSchema intermediate format (primarily for debugging and development).

### Usage

```bash
bunx type-schema cli [options] <package>
```

### Arguments

- `<package>`: FHIR package name (e.g., `hl7.fhir.r4.core@4.0.1`)

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--output` | `-o` | Output file or directory | stdout |
| `--separated-files` | `-s` | Output each schema to separate files | `false` |
| `--verbose` | `-v` | Enable verbose output | `false` |
| `--help` | `-h` | Show help message | - |

### Examples

#### Output to Console

```bash
bunx type-schema cli hl7.fhir.r4.core@4.0.1
```

#### Save to NDJSON File

```bash
bunx type-schema cli -o schemas.ndjson hl7.fhir.r4.core@4.0.1
```

#### Separate Files

```bash
bunx type-schema cli -o ./schemas --separated-files hl7.fhir.r4.core@4.0.1
```

Creates:
```
schemas/
├── resource-Patient.json
├── resource-Observation.json
├── complex-type-HumanName.json
├── primitive-type-string.json
└── ...
```

### Output Format

#### NDJSON Format (Default)

Each line is a complete JSON object:

```json
{"identifier":{"kind":"resource","package":"hl7.fhir.r4.core","version":"4.0.1","name":"Patient","url":"http://hl7.org/fhir/StructureDefinition/Patient"},"base":{"kind":"resource","package":"hl7.fhir.r4.core","version":"4.0.1","name":"DomainResource","url":"http://hl7.org/fhir/StructureDefinition/DomainResource"},"fields":{...},"dependencies":[...]}
{"identifier":{"kind":"complex-type","package":"hl7.fhir.r4.core","version":"4.0.1","name":"HumanName","url":"http://hl7.org/fhir/StructureDefinition/HumanName"},"fields":{...},"dependencies":[...]}
```

#### Pretty JSON Format (with --separated-files)

Each file contains formatted JSON:

```json
{
  "identifier": {
    "kind": "resource",
    "package": "hl7.fhir.r4.core",
    "version": "4.0.1",
    "name": "Patient",
    "url": "http://hl7.org/fhir/StructureDefinition/Patient"
  },
  "base": {
    "kind": "resource",
    "package": "hl7.fhir.r4.core",
    "version": "4.0.1",
    "name": "DomainResource",
    "url": "http://hl7.org/fhir/StructureDefinition/DomainResource"
  },
  "fields": {
    "identifier": {
      "type": {
        "kind": "complex-type",
        "package": "hl7.fhir.r4.core",
        "version": "4.0.1",
        "name": "Identifier",
        "url": "http://hl7.org/fhir/StructureDefinition/Identifier"
      },
      "array": true,
      "required": false,
      "excluded": false
    }
  },
  "dependencies": [...]
}
```

## Environment Variables

Both CLIs support these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `FHIR_CACHE_DIR` | Directory for caching FHIR packages | `./tmp/fhir` |
| `NO_COLOR` | Disable colored output | - |
| `DEBUG` | Enable debug logging | - |

Example:

```bash
FHIR_CACHE_DIR=/tmp/fhir-cache bunx type-schema generate-types -o ./generated
```

## Using with npm Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "generate-types": "bunx type-schema generate-types -o ./src/fhir-types",
    "generate-types:verbose": "bunx type-schema generate-types -o ./src/fhir-types -v",
    "generate-schemas": "bunx type-schema cli -o ./schemas.ndjson hl7.fhir.r4.core@4.0.1"
  }
}
```

Then run:

```bash
bun run generate-types
```

## Global Installation

For frequent use, install globally:

```bash
bun install -g @atomic-ehr/type-schema
```

Then use directly:

```bash
type-schema generate-types -o ./generated
```

## Shell Completion

### Bash

Add to `~/.bashrc`:

```bash
_type_schema_complete() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local cmd="${COMP_WORDS[1]}"
  
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=($(compgen -W "generate-types cli" -- ${cur}))
  elif [[ ${cmd} == "generate-types" ]]; then
    COMPREPLY=($(compgen -W "-o --output -p --package -v --verbose -h --help" -- ${cur}))
  elif [[ ${cmd} == "cli" ]]; then
    COMPREPLY=($(compgen -W "-o --output -s --separated-files -v --verbose -h --help" -- ${cur}))
  fi
}

complete -F _type_schema_complete type-schema
```

### Zsh

Add to `~/.zshrc`:

```zsh
#compdef type-schema

_type_schema() {
  local -a commands
  commands=(
    'generate-types:Generate TypeScript types from FHIR'
    'cli:Generate TypeSchema intermediate format'
  )
  
  if (( CURRENT == 2 )); then
    _describe 'command' commands
  elif (( CURRENT == 3 )); then
    case "${words[2]}" in
      generate-types)
        _arguments \
          '-o[Output directory]:directory:_files -/' \
          '--output[Output directory]:directory:_files -/' \
          '-p[FHIR package]:package:' \
          '--package[FHIR package]:package:' \
          '-v[Verbose output]' \
          '--verbose[Verbose output]' \
          '-h[Show help]' \
          '--help[Show help]'
        ;;
      cli)
        _arguments \
          '-o[Output file]:file:_files' \
          '--output[Output file]:file:_files' \
          '-s[Separated files]' \
          '--separated-files[Separated files]' \
          '-v[Verbose output]' \
          '--verbose[Verbose output]' \
          '-h[Show help]' \
          '--help[Show help]'
        ;;
    esac
  fi
}

compdef _type_schema type-schema
```

## Troubleshooting

### Common Issues

#### Permission Denied

```bash
# If you get permission errors, ensure the output directory is writable
mkdir -p ./generated
chmod 755 ./generated
bunx type-schema generate-types -o ./generated
```

#### Network Errors

```bash
# If package download fails, check your network
# Use verbose mode to see detailed errors
bunx type-schema generate-types -o ./generated -v

# Or set a proxy if needed
export HTTP_PROXY=http://proxy.example.com:8080
bunx type-schema generate-types -o ./generated
```

#### Out of Memory

```bash
# For large packages, increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" bunx type-schema generate-types -o ./generated
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
DEBUG=* bunx type-schema generate-types -o ./generated -v
```

This will show:
- Package resolution steps
- Schema transformation details
- File write operations
- Error stack traces