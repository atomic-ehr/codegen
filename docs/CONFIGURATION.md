# Configuration System

Atomic Codegen provides a comprehensive configuration system that supports multiple sources and formats.

## Configuration Sources

Configuration is loaded in the following order of precedence (highest to lowest):

1. **CLI Arguments** - Command-line flags and options
2. **Environment Variables** - `ATOMIC_CODEGEN_*` prefixed variables
3. **Configuration Files** - `.atomic-codegen.json` or similar
4. **Default Values** - Built-in defaults

## Configuration Files

### File Locations

Atomic Codegen searches for configuration files in the following order:

1. `.atomic-codegen.json`
2. `.atomic-codegen.js`
3. `atomic-codegen.config.json`
4. `atomic-codegen.config.js`

The search starts in the current working directory and moves up the directory tree until a file is found.

### File Formats

#### JSON Configuration (`.atomic-codegen.json`)

```json
{
  "$schema": "https://atomic-ehr.github.io/codegen/config-schema.json",
  "version": "1.0.0",
  "project": {
    "name": "my-fhir-project",
    "description": "FHIR TypeScript types"
  },
  "typeschema": {
    "packages": ["hl7.fhir.r4.core@4.0.1"],
    "outputFormat": "ndjson",
    "validation": true
  },
  "generator": {
    "target": "typescript",
    "outputDir": "./src/types",
    "includeComments": true,
    "namespaceStyle": "nested"
  },
  "languages": {
    "typescript": {
      "strict": true,
      "target": "ES2020",
      "module": "ES2020"
    }
  }
}
```

#### JavaScript Configuration (`.atomic-codegen.js`)

```javascript
/**
 * @type {import('@atomic-ehr/codegen').ConfigFileSchema}
 */
module.exports = {
  project: {
    name: "my-fhir-project"
  },
  typeschema: {
    packages: ["hl7.fhir.r4.core@4.0.1"],
    outputFormat: "ndjson"
  },
  generator: {
    target: "typescript",
    outputDir: "./src/types"
  }
};
```

## Environment Variables

All configuration options can be overridden using environment variables with the `ATOMIC_CODEGEN_` prefix:

### Global Variables

- `ATOMIC_CODEGEN_VERBOSE` - Enable verbose output (true/false)
- `ATOMIC_CODEGEN_OUTPUT_DIR` - Default output directory
- `ATOMIC_CODEGEN_WORKING_DIR` - Working directory
- `ATOMIC_CODEGEN_LOG_LEVEL` - Log level (error/warn/info/debug)

### TypeSchema Variables

- `ATOMIC_CODEGEN_TYPESCHEMA_FORMAT` - Output format (ndjson/separate/merged)
- `ATOMIC_CODEGEN_TYPESCHEMA_VALIDATION` - Enable validation (true/false)
- `ATOMIC_CODEGEN_DROP_CACHE` - Drop caches (true/false)

### Generator Variables

- `ATOMIC_CODEGEN_GENERATOR_TARGET` - Target language (typescript/python/java/rust)
- `ATOMIC_CODEGEN_INCLUDE_COMMENTS` - Include comments (true/false)
- `ATOMIC_CODEGEN_INCLUDE_VALIDATION` - Include validation (true/false)
- `ATOMIC_CODEGEN_NAMESPACE_STYLE` - Namespace style (nested/flat)
- `ATOMIC_CODEGEN_FILE_NAMING` - File naming (camelCase/kebab-case/snake_case/PascalCase)

### TypeScript Variables

- `ATOMIC_CODEGEN_TS_STRICT` - TypeScript strict mode (true/false)
- `ATOMIC_CODEGEN_TS_TARGET` - TypeScript target (ES5/ES6/ES2020/etc.)
- `ATOMIC_CODEGEN_TS_MODULE` - Module system (CommonJS/ES6/ES2020/ESNext)
- `ATOMIC_CODEGEN_TS_DECLARATION` - Generate declarations (true/false)
- `ATOMIC_CODEGEN_TS_USE_ENUMS` - Use enums (true/false)
- `ATOMIC_CODEGEN_TS_PREFER_INTERFACES` - Prefer interfaces (true/false)

## Configuration Schema

### Project Configuration

```typescript
interface ProjectConfig {
  name?: string;           // Project name
  version?: string;        // Project version
  description?: string;    // Project description
  rootDir?: string;        // Root directory for relative paths
  workingDir?: string;     // Working directory for temporary files
}
```

### TypeSchema Configuration

```typescript
interface TypeSchemaConfig {
  packages: string[];                    // FHIR packages to process (includes core packages and profiles)
  outputFormat: "ndjson" | "separate" | "merged";
  validation: boolean;                   // Enable validation
  treeshaking?: string[];               // Types to include
  workingDir?: string;                  // Working directory
  dropCache?: boolean;                  // Drop caches
  verbose?: boolean;                    // Verbose output
}
```

### Generator Configuration

```typescript
interface GeneratorConfig {
  target: "typescript" | "python" | "java" | "rust";
  outputDir: string;                    // Output directory
  includeComments: boolean;             // Include JSDoc comments
  includeValidation: boolean;           // Include validation code
  namespaceStyle: "nested" | "flat";   // Namespace organization
  fileNaming?: "camelCase" | "kebab-case" | "snake_case" | "PascalCase";
  format?: boolean;                     // Format generated code
  fileHeader?: string;                  // Custom file header
  overwrite?: boolean;                  // Overwrite existing files
  verbose?: boolean;                    // Verbose output
}
```

### TypeScript Configuration

```typescript
interface TypeScriptConfig {
  strict?: boolean;                     // Use strict mode
  target?: "ES5" | "ES6" | "ES2020" | "ES2021" | "ES2022";
  module?: "CommonJS" | "ES6" | "ES2020" | "ESNext";
  declaration?: boolean;                // Generate .d.ts files
  baseTypesModule?: string;            // Base types import path
  useEnums?: boolean;                  // Use enums for value sets
  preferInterfaces?: boolean;          // Prefer interfaces over types
}
```

## CLI Commands

### Initialize Configuration

Create a new configuration file:

```bash
# Minimal configuration
atomic-codegen config init

# TypeScript-focused configuration
atomic-codegen config init --template typescript

# Full configuration with all options
atomic-codegen config init --template full

# Multi-language configuration
atomic-codegen config init --template multi-lang

# JavaScript format
atomic-codegen config init --format js
```

### Validate Configuration

Validate your configuration:

```bash
# Validate current configuration
atomic-codegen config validate

# Validate specific config file
atomic-codegen config validate --config ./my-config.json

# JSON output for programmatic use
atomic-codegen config validate --output-format json

# Verbose validation
atomic-codegen config validate --verbose
```

### Show Configuration

Display current configuration:

```bash
# Show current configuration
atomic-codegen config show

# Show with sources
atomic-codegen config show --show-sources

# JSON format
atomic-codegen config show --format json

# Show defaults
atomic-codegen config show --show-defaults
```

## Examples

### Basic TypeScript Setup

```json
{
  "typeschema": {
    "packages": ["hl7.fhir.r4.core@4.0.1"],
    "outputFormat": "ndjson"
  },
  "generator": {
    "target": "typescript",
    "outputDir": "./src/types/fhir"
  }
}
```

### US Core Profile Setup

```json
{
  "typeschema": {
    "packages": [
      "hl7.fhir.r4.core@4.0.1",
      "hl7.fhir.us.core@6.1.0"
    ],
    "outputFormat": "separate",
    "treeshaking": ["Patient", "Observation", "Encounter"]
  },
  "generator": {
    "target": "typescript",
    "outputDir": "./src/types",
    "includeValidation": true
  }
}
```

### Multi-Language Setup

```json
{
  "typeschema": {
    "packages": ["hl7.fhir.r4.core@4.0.1"],
    "outputFormat": "ndjson"
  },
  "generator": {
    "target": "typescript",
    "outputDir": "./generated"
  },
  "languages": {
    "typescript": {
      "strict": true,
      "target": "ES2020"
    },
    "python": {
      "version": "3.11",
      "usePydantic": true
    },
    "java": {
      "version": "17",
      "packageName": "com.example.fhir"
    }
  }
}
```

## Integration with CLI

All CLI commands respect the configuration system:

```bash
# Use configuration file settings
atomic-codegen typeschema create

# Override specific options
atomic-codegen typeschema create --verbose --drop-cache

# Use environment variables
ATOMIC_CODEGEN_VERBOSE=true atomic-codegen generate typescript

# Specify custom config file
atomic-codegen --config ./custom-config.json typeschema create
```

## Best Practices

1. **Use configuration files** for project-specific settings
2. **Use environment variables** for CI/CD and deployment-specific overrides
3. **Use CLI arguments** for one-off operations and testing
4. **Validate configuration** before running long operations
5. **Version your configuration** files with your project
6. **Document custom configurations** for team members

## Troubleshooting

### Configuration Not Found

If configuration isn't being loaded:

1. Check file names and locations
2. Validate JSON syntax
3. Use `atomic-codegen config show --show-sources` to see what's loaded

### Validation Errors

If configuration validation fails:

1. Use `atomic-codegen config validate --verbose` for detailed errors
2. Check the configuration schema documentation
3. Use `atomic-codegen config init` to generate a valid template

### Environment Variables Not Working

If environment variables aren't being applied:

1. Check variable names and prefixes
2. Ensure boolean values are "true" or "false"
3. Use `atomic-codegen config show --show-sources` to verify loading
