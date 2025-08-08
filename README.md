# Atomic FHIR Codegen

A powerful, extensible code generation toolkit for FHIR (Fast Healthcare Interoperability Resources) that transforms FHIR specifications into strongly-typed code for multiple programming languages.

## Features

- 🚀 **High-Performance** - Built with Bun runtime for blazing-fast generation
- 🔧 **Extensible Architecture** - Three-stage pipeline (Parse → Transform → Generate)
- 📦 **Multi-Package Support** - Generate from FHIR R4 core packages (profiles in development)
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

### 1. Using the CLI

```bash
# Initialize configuration
bunx atomic-codegen config init

# Generate TypeScript types from FHIR R4
bunx atomic-codegen generate typescript

# Generate from specific package
bunx atomic-codegen typeschema generate --package hl7.fhir.r4.core
```

### 2. Using the Fluent API

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

// Create builder instance
const builder = new APIBuilder();

// Generate FHIR R4 TypeScript types
await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .typescript({
    outputDir: './generated/types',
    generateIndex: true,
    includeExtensions: false,
  })
  .generate();

// Generate with additional configuration
await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .typescript({
    outputDir: './generated/fhir',
    generateIndex: true,
    includeDocuments: true,
    namingConvention: 'PascalCase'
  })
  .generate();
```

### 3. Using Configuration File

Create `atomic-codegen.config.ts`:

```typescript
import { defineConfig } from '@atomic-ehr/codegen';

export default defineConfig({
  packages: [
    {
      name: 'hl7.fhir.r4.core',
      version: '4.0.1'
    }
  ],
  generators: {
    typescript: {
      outputDir: './src/types/fhir',
      generateIndex: true,
      namingConvention: 'PascalCase',
      includeExtensions: false,
      includeProfiles: true
    }
  }
});
```

Then run:

```bash
bunx atomic-codegen generate typescript
```

## Architecture

The toolkit uses a three-stage architecture:

```
FHIR Package → TypeSchema Parser → TypeSchema Format → Code Generators → Output
```

1. **Input Layer** - Parses FHIR packages and profiles into TypeSchema format
2. **Intermediate Format** - TypeSchema provides a universal representation
3. **Output Generators** - Generate code for TypeScript, Python, and other languages

## Usage Examples

### Generate Types for a Custom Profile

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

### Generate with Custom Templates

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

### Generate Multiple Output Formats

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

### Working with Generated Types

```typescript
// Import generated types
import { Patient, Observation, Bundle } from './generated/types';

// Use with type safety
const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  name: [{
    given: ['John'],
    family: 'Doe'
  }],
  birthDate: '1990-01-01'
};

// Type-safe resource references
const observation: Observation = {
  resourceType: 'Observation',
  status: 'final',
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: '85354-9',
      display: 'Blood pressure'
    }]
  },
  subject: {
    reference: 'Patient/123',
    type: 'Patient' // Type-checked!
  }
};

// Work with bundles
const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    { resource: patient },
    { resource: observation }
  ]
};
```

## CLI Commands

```bash
# Configuration
atomic-codegen config init        # Initialize configuration
atomic-codegen config validate    # Validate configuration

# Generation
atomic-codegen generate typescript  # Generate TypeScript types
atomic-codegen generate python     # Generate Python types (coming soon)

# TypeSchema operations
atomic-codegen typeschema generate  # Generate TypeSchema from FHIR
atomic-codegen typeschema validate  # Validate TypeSchema documents

# Development
atomic-codegen dev               # Start development mode with watch
```

## Configuration Options

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

## Advanced Features

### Custom Type Mappings

```typescript
const builder = new APIBuilder();

await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .withTypeMappings({
    'date': 'Date',           // Map FHIR date to JS Date
    'instant': 'Date',        // Map FHIR instant to JS Date
    'decimal': 'BigNumber'    // Use BigNumber for decimals
  })
  .typescript({ outputDir: './generated' })
  .generate();
```

### Selective Generation

```typescript
const builder = new APIBuilder();

// Generate only specific resources
await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .filter({
    resources: ['Patient', 'Observation', 'Encounter'],
    excludeExtensions: true,
    excludeProfiles: true
  })
  .typescript({ outputDir: './generated' })
  .generate();
```

### Plugin System

```typescript
import { APIBuilder, Plugin } from '@atomic-ehr/codegen';

// Create custom plugin
const validatorPlugin: Plugin = {
  name: 'validator-plugin',
  transform: (schema) => {
    // Add validation metadata
    return {
      ...schema,
      validation: generateValidationRules(schema)
    };
  },
  generate: (schema, options) => {
    // Generate validator functions
    return generateValidators(schema, options);
  }
};

// Use plugin
const builder = new APIBuilder();

await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .use(validatorPlugin)
  .typescript({ outputDir: './generated' })
  .generate();
```

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

### Project Structure

```
atomic-codegen/
├── src/
│   ├── api/              # High-level API
│   ├── cli/              # CLI implementation
│   ├── typeschema/       # TypeSchema parser/transformer
│   ├── generators/       # Code generators
│   └── config.ts         # Configuration system
├── test/                 # Test suites
├── examples/             # Usage examples
└── docs/                 # Documentation
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
