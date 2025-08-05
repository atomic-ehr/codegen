# @atomic-ehr/type-schema Documentation

Welcome to the comprehensive documentation for @atomic-ehr/type-schema, a TypeScript code generation library for FHIR resources.

## Overview

@atomic-ehr/type-schema is a powerful tool that transforms FHIR StructureDefinitions into strongly-typed TypeScript interfaces through a two-stage pipeline:

1. **FHIR → TypeSchema**: Converts complex FHIR StructureDefinitions into a simplified intermediate format
2. **TypeSchema → TypeScript**: Generates clean, well-organized TypeScript code from TypeSchema

## Documentation Structure

### Getting Started
- [Quick Start Guide](./getting-started/quick-start.md) - Get up and running in minutes
- [Installation](./getting-started/installation.md) - Installation and setup instructions
- [Basic Usage](./getting-started/basic-usage.md) - Common usage patterns

### Architecture
- [System Architecture](./architecture/overview.md) - High-level system design
- [TypeSchema Format](./architecture/type-schema-format.md) - Understanding the intermediate format
- [Transformation Pipeline](./architecture/transformation-pipeline.md) - How FHIR becomes TypeScript
- [Code Generation](./architecture/code-generation.md) - TypeScript generation details

### API Reference
- [Core API](./api/core.md) - Main transformation functions
- [Generator API](./api/generator.md) - Code generation classes
- [CLI Reference](./api/cli.md) - Command-line interface
- [TypeSchema Types](./api/types.md) - TypeScript type definitions

### User Guide
- [Using Generated Types](./guide/using-generated-types.md) - Working with generated code
- [Customizing Generation](./guide/customization.md) - Advanced configuration
- [Best Practices](./guide/best-practices.md) - Recommended patterns
- [Troubleshooting](./guide/troubleshooting.md) - Common issues and solutions

### Developer Guide
- [Contributing](./developer/contributing.md) - How to contribute
- [Development Setup](./developer/setup.md) - Setting up the development environment
- [Testing](./developer/testing.md) - Running and writing tests
- [Architecture Decisions](./developer/architecture-decisions.md) - Key design choices

### Examples
- [Basic Examples](./examples/basic.md) - Simple usage examples
- [Advanced Examples](./examples/advanced.md) - Complex scenarios
- [Integration Examples](./examples/integration.md) - Integrating with other tools

## Key Features

- 🔄 **Two-Stage Processing**: Clean separation between parsing and generation
- 📦 **Complete FHIR R4 Support**: All resources, types, and value sets
- 🏗️ **Modular Architecture**: Extensible and maintainable design
- 🔍 **Type Safety**: Proper TypeScript types with full IntelliSense support
- ⚡ **Bun Runtime**: Fast execution with native TypeScript support
- 🧪 **Well Tested**: Comprehensive test coverage

## Quick Example

```typescript
// Generate types from FHIR package
import { generateTypes } from '@atomic-ehr/type-schema/generator';

await generateTypes({
  outputDir: './generated',
  packagePath: 'hl7.fhir.r4.core@4.0.1',
  verbose: true
});

// Use generated types
import { Patient, Observation } from './generated';

const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  active: true,
  name: [{
    family: 'Smith',
    given: ['John']
  }]
};
```

## License

This project is part of the Atomic EHR ecosystem. See LICENSE for details.