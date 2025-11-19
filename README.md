# Atomic FHIR Codegen

[![npm canary](https://img.shields.io/npm/v/@atomic-ehr/codegen/canary.svg?label=canary)](https://www.npmjs.com/package/@atomic-ehr/codegen/v/canary)
[![npm version](https://badge.fury.io/js/%40atomic-ehr%2Fcodegen.svg)](https://badge.fury.io/js/%40atomic-ehr%2Fcodegen)
[![CI](https://github.com/atomic-ehr/codegen/actions/workflows/ci.yml/badge.svg)](https://github.com/atomic-ehr/codegen/actions/workflows/ci.yml)
[![SDK Tests](https://github.com/atomic-ehr/codegen/actions/workflows/sdk-tests.yml/badge.svg)](https://github.com/atomic-ehr/codegen/actions/workflows/sdk-tests.yml)

A powerful, extensible code generation toolkit for FHIR (Fast Healthcare Interoperability Resources) that transforms FHIR specifications into strongly-typed code for multiple programming languages.

## Features

- 🚀 **High-Performance** - Built with Bun runtime for blazing-fast generation
- 🔧 **Extensible Architecture** - Three-stage pipeline (Resolve Canonicals → Transform to Type Schema → Generate)
- 📦 **Multi-Package Support** - Generate from a list of FHIR packages (profiles in development)
- 🎯 **Type-Safe** - Generates fully typed interfaces with proper inheritance
- 🔄 **Intermediate Format** - TypeSchema format enables multi-language support
- 🛠️ **Developer Friendly** - Fluent API, CLI, and configuration file support

## Installation

```bash
# Using npm
npm install @atomic-ehr/codegen

# Using bun
bun add @atomic-ehr/codegen

# Using yarn
yarn add @atomic-ehr/codegen
```

## Quick Start

### 1. Using the Fluent API (Primary)

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

const builder = new APIBuilder()
    .fromPackage("hl7.fhir.r4.core", "4.0.1")
    .typescript({})
    .outputTo("./examples/typescript-r4/fhir-types");

const report = await builder.generate();
console.log(report);
```

Run the script by:

- `npm exec tsx scripts/generate-types.ts`
- `pnpm exec tsx scripts/generate-types.ts`
- `bun run scripts/generate-types.ts`

### 2. Using the CLI (Draft)

```bash
# Generate using configuration file
bunx atomic-codegen generate

# Generate with verbose output
bunx atomic-codegen generate --verbose

# Generate TypeSchemas from FHIR package
bunx atomic-codegen typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson
```

### 3. Using Configuration File (Draft)

Create `atomic-codegen.config.ts`:

```typescript
import { defineConfig } from "@atomic-ehr/codegen";

export default defineConfig({
  outputDir: "./generated",
  overwrite: true,
  validate: true,
  cache: true,
  packages: ["hl7.fhir.r4.core@4.0.1"],
  typescript: {
    includeDocuments: true,
    namingConvention: "PascalCase",
    includeProfiles: false,
    includeExtensions: false,
    generateIndex: true,
    strictMode: true,
    generateValueSets: true,
    includeValueSetHelpers: true,
    valueSetStrengths: ["required", "preferred"],
    valueSetMode: "custom"
  }
});
```

Then run:

```bash
bunx atomic-codegen generate
```

## Architecture

The toolkit uses a three-stage architecture (details: [link](https://www.health-samurai.io/articles/type-schema-a-pragmatic-approach-to-build-fhir-sdk)):

```
Resolve Canonicals → Transform to Type Schema → Generate
```

1. **Input Layer** - Parses FHIR packages and profiles, resolves canonicals and transforms them into TypeSchema format
2. **Intermediate Format** - TypeSchema provides a universal representation for FHIR data entities
3. **Output Generators** - Generate code for TypeScript, Python, and other languages

## Usage Examples

Actual examples of type generation and usage can be found here: [examples/typescript-r4](examples/typescript-r4):

- `demo.ts` - a simple script which creates resources and demonstrates how to work with profiles.
- `generate.ts` - script to generate types.

### Generate Types for a Custom Profile (Draft)

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

const builder = new APIBuilder();

// Load custom profile
await builder
  .fromProfile('./profiles/my-patient-profile.json')
  .withBaseProfile('http://hl7.org/fhir/StructureDefinition/Patient')
  .typescript({
    outputDir: './generated/profiles',
    includeValidators: true,
  })
  .generate();
```

### Generate with Custom Templates (Draft)

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

const builder = new APIBuilder();

await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .withTemplate('./templates/custom-interface.hbs')
  .typescript({
    outputDir: './generated',
    customHelpers: {
      upperCase: (str) => str.toUpperCase()
    }
  })
  .generate();
```

### Generate Multiple Output Formats (Draft)

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

const builder = new APIBuilder();

// Parse once, generate multiple formats
const schemas = await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .parse();

// Generate TypeScript
await builder
  .fromSchemas(schemas)
  .typescript({ outputDir: './ts-types' })
  .generate();

// Generate Python (coming soon)
await builder
  .fromSchemas(schemas)
  .python({ outputDir: './py-types' })
  .generate();
```

## CLI Commands (Draft)

```bash
# Generate code using configuration file
atomic-codegen generate                    # Uses atomic-codegen.config.ts
atomic-codegen generate --verbose          # With detailed output
atomic-codegen generate --config custom.ts # Custom config file

# TypeSchema operations
atomic-codegen typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson
atomic-codegen typeschema validate schemas.ndjson

# Help and debugging
atomic-codegen --help                      # Show help
atomic-codegen --debug generate            # Debug mode
```

## Configuration Options (Draft)

### Global Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | `./generated` | Base output directory for all generated files |
| `overwrite` | `boolean` | `false` | Overwrite existing files without prompting |
| `validate` | `boolean` | `true` | Validate generated TypeSchema before processing |
| `cache` | `boolean` | `true` | Enable caching for improved performance |
| `packages` | `string[]` | `[]` | FHIR packages to process (e.g., `"hl7.fhir.r4.core@4.0.1"`) |

### TypeScript Generator Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | `./generated` | Output directory for generated files |
| `moduleFormat` | `'esm' \| 'cjs'` | `'esm'` | Module format |
| `generateIndex` | `boolean` | `true` | Generate index file with exports |
| `includeDocuments` | `boolean` | `true` | Include JSDoc documentation |
| `namingConvention` | `'PascalCase' \| 'camelCase'` | `'PascalCase'` | Type naming convention |
| `includeExtensions` | `boolean` | `false` | Include FHIR extensions |
| `includeProfiles` | `boolean` | `false` | Include FHIR profiles |
| `generateValueSets` | `boolean` | `false` | Generate strongly-typed value sets from FHIR bindings |
| `valueSetStrengths` | `string[]` | `['required']` | Which binding strengths to generate |
| `includeValueSetHelpers` | `boolean` | `false` | Include validation helper functions |
| `valueSetDirectory` | `string` | `'valuesets'` | Output directory for value set files |

## Value Set Generation

Generate strongly-typed TypeScript enums from FHIR value sets for enhanced type safety:

```typescript
// Configuration
export default defineConfig({
  generators: {
    typescript: {
      generateValueSets: true,
      valueSetStrengths: ['required', 'preferred'],
      includeValueSetHelpers: true,
    },
  },
});
```

### Value Set Configuration Options

- **generateValueSets**: Enable value set generation
- **valueSetStrengths**: Control which binding strengths generate types (`'required'`, `'preferred'`, `'extensible'`, `'example'`)
- **includeValueSetHelpers**: Include runtime validation functions
- **valueSetDirectory**: Customize output directory name

For comprehensive usage examples and migration guides, see [Value Set Documentation](docs/features/value-set-generation.md).

## Development

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- Node.js 18+ (for compatibility)

### Setup

```bash
# Clone repository
git clone https://github.com/your-org/atomic-codegen
cd atomic-codegen

# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © Atomic Healthcare

## Support

- 📖 [Documentation](https://docs.atomic-ehr.com/codegen)
- 🐛 [Issue Tracker](https://github.com/atomic-ehr/codegen/issues)

## Next Steps: REST Client & Advanced Features

We're expanding beyond type generation to create a complete FHIR development toolkit:

### 🔄 REST Client Generation (Q2 2024)
```typescript
// Generate type-safe FHIR clients
await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .restClient({
    clientName: 'MyFHIRClient',
    baseUrl: 'https://api.example.com/fhir',
    authType: 'oauth2'
  })
  .generate();

// Use generated client
const client = new MyFHIRClient();
const patient = await client.Patient.read('123');
const bundle = await client.Patient.search({ name: 'Smith' });
```

### 🔍 Smart Chained Search (Q3 2024)
```typescript
// Intelligent search builders
const results = await client.Patient
  .search()
  .name().contains('Smith')
  .birthdate().greaterThan('2000-01-01')
  .address().city().equals('Boston')
  .include('Patient:organization')
  .sort('birthdate', 'desc')
  .execute();
```

### ⚡ Operation Generation (Q4 2024)
```typescript
// Type-safe FHIR operations
const result = await client.Patient
  .operation('$match')
  .withParameters({
    resource: patient,
    onlyCertainMatches: true
  })
  .execute();
```

See our detailed [**ROADMAP.md**](ROADMAP.md) for the complete development plan.

## Current Roadmap

- [x] TypeScript generation
- [x] FHIR R4 core package support
- [x] Configuration file support
- [x] Comprehensive test suite (72+ tests)
- [x] **Value Set Generation** - Strongly-typed enums from FHIR bindings
- [~] **Profile & Extension Support** - Basic parsing (US Core in development)
- [ ] **Complete Multi-Package Support** - Custom packages and dependencies
- [ ] **REST Client Generation** - Fetch-based FHIR clients
- [ ] **Smart Chained Search** - Intelligent search builders
- [ ] **Operation Generation** - Type-safe FHIR operations
- [ ] **Python generation**
- [ ] **Rust generation**
- [ ] **GraphQL schema generation**
- [ ] **OpenAPI specification generation**
- [ ] **Validation functions**
- [ ] **Mock data generation**
- [ ] **FHIR R5 support**

---

Built with ❤️ by the Atomic Healthcare team
