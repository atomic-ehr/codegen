# Validation System

The atomic-codegen validation system provides comprehensive validation capabilities for TypeSchema files, configuration, and generated code.

## Overview

The validation system includes:

- **Configuration Validation**: Validates atomic-codegen configuration files and settings
- **TypeSchema Validation**: Validates TypeSchema files for correctness and consistency
- **Generated Code Validation**: Validates generated TypeScript code for syntax errors and compilation issues
- **Comprehensive Validation**: Runs all validation types together with unified reporting

## CLI Commands

### Comprehensive Validation

Run all validation types together:

```bash
# Validate everything (config, typeschema, generated code)
atomic-codegen validate -i types.ndjson -o ./generated

# Validate with verbose output
atomic-codegen validate -i types.ndjson -o ./generated --verbose

# Strict mode (treat warnings as errors)
atomic-codegen validate -i types.ndjson -o ./generated --strict

# JSON output format
atomic-codegen validate -i types.ndjson -o ./generated --output-format json
```

### Selective Validation

Run specific validation types:

```bash
# Only validate configuration
atomic-codegen validate --config-only

# Only validate TypeSchema files
atomic-codegen validate --typeschema-only -i types.ndjson

# Only validate generated code
atomic-codegen validate --generated-code-only -o ./generated

# Skip specific validations
atomic-codegen validate -i types.ndjson -o ./generated --skip-config
```

### Individual Validation Commands

```bash
# Configuration validation
atomic-codegen config validate

# TypeSchema validation
atomic-codegen typeschema validate types.ndjson

# Generated code validation (via comprehensive validate command)
atomic-codegen validate --generated-code-only -o ./generated
```

## Configuration Validation

Validates atomic-codegen configuration files including:

- **Schema Validation**: Ensures configuration follows the correct schema
- **File Existence**: Checks that referenced files and directories exist
- **Value Validation**: Validates configuration values are within acceptable ranges
- **Dependency Validation**: Ensures required dependencies are available

### Features

- Multiple output formats (text, JSON)
- Detailed error messages with suggestions
- Configuration source tracking
- Verbose mode for detailed information

## TypeSchema Validation

Validates TypeSchema files for correctness and consistency:

### Validation Rules

- **Identifier Validation**: Ensures all schemas have valid identifiers
- **Required Fields**: Checks for required fields (kind, name, package)
- **Field Structure**: Validates field definitions and types
- **Dependency Validation**: Checks that referenced dependencies exist
- **Type-Specific Validation**: Different rules for different schema types

### Schema Types Supported

- **Primitive Types**: Basic data types
- **Complex Types**: Object and composite types
- **Resources**: FHIR resources and similar structures
- **Bindings**: Value set bindings
- **Value Sets**: Code system value sets

### Features

- Dependency checking across multiple files
- Severity levels (critical, major, minor)
- Detailed statistics reporting
- Strict mode for enhanced validation

## Generated Code Validation

Validates generated TypeScript code for quality and correctness:

### Validation Categories

#### Syntax Validation
- **Brace Matching**: Ensures balanced braces and brackets
- **Identifier Validation**: Checks for valid TypeScript identifiers
- **String Termination**: Detects unterminated strings
- **Semicolon Usage**: Warns about missing semicolons

#### Code Quality
- **Empty Interfaces**: Detects empty interface definitions
- **Duplicate Definitions**: Finds duplicate type definitions
- **Line Length**: Warns about lines exceeding 120 characters
- **Import/Export Structure**: Ensures proper module structure

#### Compilation Validation
- **TypeScript Compilation**: Runs `tsc --noEmit` to check for compilation errors
- **Type Checking**: Validates TypeScript type correctness
- **Error Parsing**: Parses and reports TypeScript compiler errors

### Features

- Recursive directory scanning
- Skips common directories (node_modules, .git, etc.)
- Detailed error reporting with file locations
- Statistics on validation results

## Error Reporting

The validation system provides comprehensive error reporting:

### Error Levels

- **Critical**: Severe errors that prevent operation
- **Major**: Important errors that should be fixed
- **Minor**: Less critical issues that may be acceptable

### Output Formats

#### Text Format (Default)
```
🔍 Comprehensive Validation Summary:
   Total validations: 3
   Passed: 2
   Failed: 1
   Errors: 2
   Warnings: 1

❌ Errors:
   CONFIG:
     MAJOR: Invalid output directory path
   TYPESCHEMA:
     CRITICAL: Missing required field 'name'

⚠️  Warnings:
   GENERATED-CODE:
     Line exceeds 120 characters (types.ts:45)
```

#### JSON Format
```json
{
  "valid": false,
  "results": {
    "config": { "valid": true, "errors": [], "warnings": [] },
    "typeschema": { "valid": false, "errors": ["..."], "warnings": [] },
    "generatedCode": { "valid": true, "errors": [], "warnings": ["..."] }
  },
  "errors": ["..."],
  "warnings": ["..."],
  "stats": {
    "totalValidations": 3,
    "passedValidations": 2,
    "failedValidations": 1,
    "totalErrors": 2,
    "totalWarnings": 1
  }
}
```

## Integration

### Build Process Integration

The validation system can be integrated into build processes:

```bash
# Validate before generation
atomic-codegen validate -i input/ && atomic-codegen generate typescript -i input/ -o output/

# Validate after generation
atomic-codegen generate typescript -i input/ -o output/ && atomic-codegen validate -o output/ --generated-code-only
```

### CI/CD Integration

Use validation in continuous integration:

```yaml
# GitHub Actions example
- name: Validate TypeSchema and Generated Code
  run: |
    bun run atomic-codegen validate -i schemas/ -o generated/ --strict
```

## Configuration Options

### Global Options

- `--verbose`: Enable detailed output
- `--strict`: Treat warnings as errors
- `--output-format`: Choose output format (text, json)
- `--config`: Specify configuration file path

### Validation-Specific Options

- `--config-only`: Only run configuration validation
- `--typeschema-only`: Only run TypeSchema validation
- `--generated-code-only`: Only run generated code validation
- `--skip-config`: Skip configuration validation
- `--skip-typeschema`: Skip TypeSchema validation
- `--skip-generated-code`: Skip generated code validation

## Best Practices

1. **Run Validation Early**: Validate TypeSchema files before generation
2. **Use Strict Mode**: Enable strict mode in CI/CD pipelines
3. **Regular Validation**: Run comprehensive validation regularly during development
4. **Fix Warnings**: Address warnings to maintain code quality
5. **Automate Validation**: Integrate validation into build and deployment processes

## Troubleshooting

### Common Issues

1. **TypeScript Compiler Not Found**: Install TypeScript globally or locally
2. **Permission Errors**: Ensure proper file permissions for validation
3. **Memory Issues**: Use selective validation for large codebases
4. **Path Resolution**: Use absolute paths when possible

### Debug Mode

Enable debug output with environment variables:

```bash
DEBUG=1 atomic-codegen validate -i input/ -o output/ --verbose
```

## Future Enhancements

Planned improvements include:

- Runtime validation framework integration (zod)
- Custom validation rules
- Plugin system for extensible validation
- Performance optimizations for large codebases
- Integration with popular IDEs and editors
