# Atomic EHR Codegen

A powerful command-line tool for generating strongly-typed code from FHIR (Fast Healthcare Interoperability Resources) specifications. Transform FHIR resource definitions into TypeScript and Python types with complete validation and IntelliSense support.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![npm version](https://img.shields.io/npm/v/@atomic-ehr/codegen.svg)](https://www.npmjs.com/package/@atomic-ehr/codegen)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-black)](https://bun.sh)

## ✨ Features

- **🚀 Fast Generation**: Built with Bun for maximum performance
- **📋 Multiple Languages**: Generate TypeScript and Python types
- **🔍 FHIR Compliance**: Full support for FHIR R4 and US Core profiles
- **⚡ Type Safety**: Complete type safety with validation
- **🎯 Configurable**: Flexible configuration system
- **📦 Package Support**: Direct integration with FHIR package registry
- **🔧 CLI & Programmatic**: Use as CLI tool or integrate into your build process

## 📦 Installation

```bash
# Install globally
bun install -g @atomic-ehr/codegen

# Or use npx/bunx without installation
bunx @atomic-ehr/codegen --help
```

## 🚀 Quick Start

### 1. Generate TypeSchema from FHIR Package

```bash
# Generate TypeSchema from FHIR R4 Core package
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o fhir-r4.ndjson

# Include US Core profiles
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 hl7.fhir.us.core@6.1.0 -o fhir-with-uscore.ndjson
```

### 2. Generate TypeScript Types

```bash
# Generate TypeScript from TypeSchema
atomic-codegen generate typescript -i fhir-r4.ndjson -o ./types/fhir

# With validation and formatting
atomic-codegen generate typescript -i fhir-r4.ndjson -o ./types/fhir --include-validation --format
```

### 3. Generate Python Types

```bash
# Generate Python with Pydantic models
atomic-codegen generate python -i fhir-r4.ndjson -o ./python_types --namespace-style flat
```

## 🎛️ Configuration

Create a configuration file for consistent settings:

```bash
# Initialize configuration
atomic-codegen config init --template typescript

# Validate configuration
atomic-codegen config validate

# Show current configuration
atomic-codegen config show
```

### Configuration File Example

```json
{
  "$schema": "https://atomic-ehr.github.io/codegen/config-schema.json",
  "version": "1.0.0",
  "typeschema": {
    "packages": ["hl7.fhir.r4.core@4.0.1", "hl7.fhir.us.core@6.1.0"],
    "outputFormat": "ndjson",
    "validation": true
  },
  "generator": {
    "target": "typescript",
    "outputDir": "./src/types/fhir",
    "includeComments": true,
    "includeValidation": false,
    "namespaceStyle": "nested",
    "fileNaming": "PascalCase",
    "format": true,
    "generateProfiles": true
  },
  "languages": {
    "typescript": {
      "strict": true,
      "target": "ES2020",
      "module": "ES2020",
      "declaration": true,
      "useEnums": true,
      "preferInterfaces": true
    }
  }
}
```

## 📖 Commands

### TypeSchema Commands

| Command | Description |
|---------|-------------|
| `typeschema create <packages...>` | Create TypeSchema from FHIR packages |
| `typeschema validate <file>` | Validate TypeSchema files |
| `typeschema merge <files...>` | Merge multiple TypeSchema files |

### Generation Commands

| Command | Description |
|---------|-------------|
| `generate typescript` | Generate TypeScript types |
| `generate python` | Generate Python types |
| `generators list` | List available generators |

### Configuration Commands

| Command | Description |
|---------|-------------|
| `config init` | Initialize configuration file |
| `config validate` | Validate configuration |
| `config show` | Show current configuration |

### Validation Commands

| Command | Description |
|---------|-------------|
| `validate <files...>` | Validate generated code |

## 🎯 Use Cases

### Healthcare Applications

Generate type-safe FHIR resources for your healthcare applications:

```typescript
import { Patient, Observation } from './types/fhir';

const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{
    family: 'Doe',
    given: ['John']
  }],
  gender: 'male',
  birthDate: '1990-01-01'
};

const observation: Observation = {
  resourceType: 'Observation',
  id: 'obs-123',
  status: 'final',
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: '8302-2',
      display: 'Body height'
    }]
  },
  subject: {
    reference: `Patient/${patient.id}`
  },
  valueQuantity: {
    value: 180,
    unit: 'cm',
    system: 'http://unitsofmeasure.org',
    code: 'cm'
  }
};
```

### API Development

Perfect for building FHIR-compliant APIs with full type safety:

```python
from typing import Optional
from pydantic import BaseModel
from .fhir_types import Patient, Observation

class PatientService:
    def create_patient(self, patient_data: Patient) -> Patient:
        # Full type safety and validation
        return patient_data
    
    def get_patient(self, patient_id: str) -> Optional[Patient]:
        # Your implementation here
        pass
```

## 🔧 Advanced Usage

### Custom Templates

```bash
# Use custom configuration templates
atomic-codegen config init --template custom --output .atomic-codegen.js
```

### Programmatic Usage

```typescript
import { TypeScriptGenerator } from '@atomic-ehr/codegen';

const generator = new TypeScriptGenerator({
  outputDir: './types',
  includeComments: true,
  includeValidation: true
});

await generator.generate();
```

### CI/CD Integration

```yaml
name: Generate FHIR Types
on: [push]
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - name: Generate Types
        run: |
          bunx @atomic-ehr/codegen typeschema create hl7.fhir.r4.core@4.0.1 -o fhir.ndjson
          bunx @atomic-ehr/codegen generate typescript -i fhir.ndjson -o ./src/types
      - name: Commit generated types
        run: |
          git add src/types
          git commit -m "Update FHIR types" || exit 0
          git push
```

## 🛠️ Development

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- Node.js >= 18 (for TypeScript peer dependency)

### Setup

```bash
# Clone repository
git clone https://github.com/atomic-ehr/codegen.git
cd codegen

# Install dependencies
bun install

# Run development CLI
bun run cli

# Run tests
bun test

# Type checking
bun run typecheck

# Linting
bun run lint
```

### Project Structure

```
src/
├── cli/                    # CLI commands and interface
│   ├── commands/           # Individual CLI commands
│   └── index.ts           # CLI entry point
├── generators/            # Code generators for different languages
│   ├── typescript/        # TypeScript generator
│   └── python/           # Python generator
├── lib/                  # Core library code
│   ├── core/             # Core utilities and configuration
│   ├── generators/       # Generator framework
│   ├── typeschema/      # TypeSchema processing
│   └── validation/      # Code validation utilities
└── index.ts             # Library entry point
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Reporting Issues

Please use our [GitHub Issues](https://github.com/atomic-ehr/codegen/issues) to report bugs or request features.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FHIR Foundation](https://www.hl7.org/fhir/) for the FHIR specification
- [Bun](https://bun.sh/) for the amazing runtime
- The healthcare developer community

## 🔗 Related Projects

- [@atomic-ehr/fhirschema](https://github.com/atomic-ehr/fhirschema) - FHIR Schema utilities
- [@atomic-ehr/fhir-canonical-manager](https://github.com/atomic-ehr/fhir-canonical-manager) - FHIR package management

---

**Built with ❤️ by the Atomic EHR Team**