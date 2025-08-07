# @atomic-ehr/codegen

> 🔥 **High-performance FHIR code generation toolkit** with TypeSchema as the universal intermediate format

[![npm version](https://badge.fury.io/js/@atomic-ehr%2Fcodegen.svg)](https://www.npmjs.com/package/@atomic-ehr/codegen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-orange.svg)](https://bun.sh/)

**atomic-codegen** is a comprehensive code generation toolkit for FHIR healthcare standards, designed with TypeSchema as the intermediate format for maximum flexibility and type safety.

## ✨ Features

- **🔥 FHIR R4/R5 Support**: Complete FHIR resource and profile generation
- **🇺🇸 US Core Profiles**: Built-in support for US healthcare implementation guides
- **📋 TypeSchema Integration**: Uses TypeSchema as universal intermediate format
- **🎯 Type Safety**: Full TypeScript support with runtime validation
- **⚡ Performance**: Built with Bun for maximum speed
- **🏗️ Extensible**: Plugin architecture for custom generators
- **🧪 Testing Ready**: Generates type guards and validation functions
- **📖 Documentation**: Auto-generated API docs and examples

## 🚀 Quick Start

### Installation

```bash
# Using Bun (recommended)
bun add @atomic-ehr/codegen

# Using npm
npm install @atomic-ehr/codegen
```

### Basic Usage

#### 1. High-Level API (Recommended)

The easiest way to generate FHIR types:

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

// Generate FHIR types from packages
const api = new APIBuilder();

await api
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .fromPackage('hl7.fhir.us.core@6.1.0')
  .typescript({
    moduleFormat: 'esm',
    generateIndex: true,
    includeProfiles: true
  })
  .outputTo('./src/types/fhir')
  .generate();

console.log('✅ FHIR types generated successfully!');
```

#### 2. CLI Usage

```bash
# Generate TypeScript types from FHIR packages
bun atomic-codegen generate typescript \
  --from-package hl7.fhir.r4.core@4.0.1 \
  --from-package hl7.fhir.us.core@6.1.0 \
  --output ./src/types/fhir \
  --include-profiles

# Generate from local files
bun atomic-codegen generate typescript \
  --from-files ./schemas/*.json \
  --output ./generated/types
```

#### 3. Using Generated Types

```typescript
import { USCorePatient, USCoreObservation } from './types/fhir';
import { isUSCorePatient, validateFHIRResource } from './types/fhir/guards';

// Type-safe FHIR resource creation
const patient: USCorePatient = {
  resourceType: 'Patient',
  identifier: [{ value: 'MRN-123' }],
  name: [{ family: 'Johnson', given: ['Maria'] }],
  gender: 'female',
  extension: [{
    url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    extension: [{ url: 'text', valueString: 'Hispanic or Latino' }]
  }]
};

// Runtime validation
if (isUSCorePatient(someData)) {
  // TypeScript knows this is a USCorePatient
  const validation = await validateFHIRResource(someData);
  if (validation.valid) {
    console.log('✅ Valid US Core Patient!');
  }
}
```

## 📚 Documentation

### Core Concepts

#### TypeSchema as Intermediate Format

atomic-codegen uses TypeSchema as a universal intermediate representation, enabling:

- **Multi-target generation**: Generate code for TypeScript, Python, Go, and more
- **Consistent validation**: Same validation logic across all targets
- **Extensibility**: Easy to add new output formats
- **Optimization**: Single source of truth for type definitions

#### Three-Stage Architecture

```
Input Sources → TypeSchema → Output Targets
     ↓              ↓            ↓
FHIR Packages → Universal IR → TypeScript
JSON Schema                  → Python
Custom Schema                → Go
                            → REST Client
```

### API Reference

#### APIBuilder Class

The main high-level API for code generation:

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

const api = new APIBuilder({
  outputDir: './generated',
  verbose: true,
  validate: true,
  cache: true
});
```

##### Input Methods

```typescript
// From FHIR packages
api.fromPackage('hl7.fhir.r4.core@4.0.1', '4.0.1')

// From local files
api.fromFiles('./schemas/patient.json', './schemas/observation.json')

// From TypeSchema objects
api.fromSchemas([patientSchema, observationSchema])

// From string content
api.fromString(ndjsonContent, 'ndjson')
```

##### Generator Configuration

```typescript
// TypeScript generation
api.typescript({
  moduleFormat: 'esm' | 'cjs',
  generateIndex: boolean,
  includeDocuments: boolean,
  namingConvention: 'PascalCase' | 'camelCase',
  includeExtensions: boolean,
  includeProfiles: boolean
})

// REST client generation
api.restClient({
  baseUrl: string,
  authType: 'bearer' | 'basic' | 'oauth',
  includeTypes: boolean,
  generateMocks: boolean
})
```

##### Execution Methods

```typescript
// Set output directory
api.outputTo('./src/types')

// Enable progress reporting
api.onProgress((phase, current, total, message) => {
  console.log(`${phase}: ${current}/${total} - ${message}`);
})

// Generate files
const result = await api.generate();

// Get intermediate schemas (for debugging)
const schemas = api.getSchemas();
```

### Usage Examples

#### Example 1: Basic FHIR Types

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

// Generate basic FHIR R4 types
await new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .typescript()
  .outputTo('./types/fhir')
  .generate();
```

#### Example 2: US Core with Validation

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

// Generate US Core types with validation
await new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .fromPackage('hl7.fhir.us.core@6.1.0')
  .typescript({
    includeProfiles: true,
    generateIndex: true
  })
  .validate(true)
  .outputTo('./types/fhir')
  .onProgress((phase, current, total, message) => {
    console.log(`[${phase}] ${current}/${total}: ${message}`);
  })
  .generate();
```

#### Example 3: Multiple Output Formats

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

const api = new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .outputTo('./generated');

// Generate TypeScript types
await api
  .typescript({ moduleFormat: 'esm' })
  .generate();

// Generate REST client
await api
  .reset() // Clear previous generators
  .restClient({
    baseUrl: 'https://api.example.com/fhir',
    authType: 'bearer'
  })
  .generate();
```

#### Example 4: Custom Schema Processing

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

// Process custom JSON schemas
const customSchemas = [
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      customField: { type: 'string' }
    }
  }
];

await new APIBuilder()
  .fromSchemas(customSchemas)
  .typescript({
    namingConvention: 'camelCase'
  })
  .outputTo('./types/custom')
  .generate();
```

#### Example 5: Configuration File

Create `atomic-codegen.config.ts`:

```typescript
import { defineConfig } from '@atomic-ehr/codegen';

export default defineConfig({
  input: {
    packages: [
      'hl7.fhir.r4.core@4.0.1',
      'hl7.fhir.us.core@6.1.0'
    ]
  },
  output: {
    typescript: {
      outputDir: './src/types/fhir',
      moduleFormat: 'esm',
      includeProfiles: true,
      generateIndex: true
    },
    restClient: {
      outputDir: './src/api/fhir',
      baseUrl: process.env.FHIR_BASE_URL,
      authType: 'bearer'
    }
  },
  options: {
    verbose: true,
    validate: true,
    cache: true
  }
});
```

Then run:

```bash
bun atomic-codegen generate --config atomic-codegen.config.ts
```

## 🏥 Real-World Examples

### Healthcare Frontend App

Complete React application with FHIR types:

```typescript
// Patient registration form with type safety
import { USCorePatient } from '../types/fhir';
import { validateUSCorePatient } from '../types/fhir/guards';

const PatientForm = () => {
  const onSubmit = async (data: FormData) => {
    const patient: USCorePatient = {
      resourceType: 'Patient',
      identifier: [{ value: data.mrn }],
      name: [{ family: data.lastName, given: [data.firstName] }],
      gender: data.gender,
      birthDate: data.birthDate
    };

    // Validate before submission
    const validation = validateUSCorePatient(patient);
    if (!validation.valid) {
      showErrors(validation.errors);
      return;
    }

    await patientService.create(patient);
  };
};
```

### Healthcare API Backend

FHIR-compliant REST API with automatic validation:

```typescript
// Express controller with type safety
import { USCorePatient } from '../types/fhir';
import { isUSCorePatient } from '../types/fhir/guards';

app.post('/fhir/Patient', async (req, res) => {
  // Automatic validation
  if (!isUSCorePatient(req.body)) {
    return res.status(400).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'invalid',
        details: { text: 'Invalid Patient resource' }
      }]
    });
  }

  const patient: USCorePatient = req.body;
  // TypeScript knows this is a valid USCorePatient
  const created = await patientService.create(patient);
  res.status(201).json(created);
});
```

See the [examples](./examples/) directory for complete working applications.

## 🛠️ Development

### Prerequisites

- [Bun](https://bun.sh/) 1.0+
- Node.js 18+ (if not using Bun)
- TypeScript 5.0+

### Setup

```bash
# Clone the repository
git clone https://github.com/atomic-ehr/codegen.git
cd codegen

# Install dependencies
bun install

# Build the project
bun run build

# Run tests
bun test

# Start development mode
bun run dev
```

### Project Structure

```
atomic-codegen/
├── src/
│   ├── api/              # High-level API (APIBuilder)
│   ├── cli/              # Command-line interface
│   ├── core/             # Core utilities and types
│   ├── config/           # Configuration system
│   └── typeschema/       # TypeSchema processing
├── examples/             # Real-world examples
│   ├── frontend-app/     # React healthcare app
│   └── healthcare-api/   # FHIR REST API
├── docs/                 # Documentation
├── test/                 # Test suite
└── generated/            # Generated output (gitignored)
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Quick Contribution Steps

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Make** your changes
4. **Add** tests for new functionality
5. **Run** tests: `bun test`
6. **Commit** your changes: `git commit -m 'Add amazing feature'`
7. **Push** to the branch: `git push origin feature/amazing-feature`
8. **Open** a Pull Request

## 📖 Resources

- **[API Documentation](./docs/api/)** - Complete API reference
- **[Examples](./examples/)** - Real-world usage examples
- **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute
- **[Changelog](./CHANGELOG.md)** - Release history
- **[TypeSchema Spec](https://typeschema.org/)** - TypeSchema specification

## 🆘 Support

- **[GitHub Issues](https://github.com/atomic-ehr/codegen/issues)** - Bug reports and feature requests
- **[Discussions](https://github.com/atomic-ehr/codegen/discussions)** - Community support
- **[Documentation](./docs/)** - Comprehensive guides and tutorials

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- **[HL7 FHIR](https://hl7.org/fhir/)** - Healthcare interoperability standard
- **[TypeSchema](https://typeschema.org/)** - Universal type definition format
- **[Bun](https://bun.sh/)** - Fast JavaScript runtime and toolkit
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript

---

<div align="center">

**[⭐ Star us on GitHub](https://github.com/atomic-ehr/codegen)** • **[📖 Read the Docs](./docs/)** • **[🚀 Try Examples](./examples/)**

Made with ❤️ by the Atomic EHR Team

</div>
