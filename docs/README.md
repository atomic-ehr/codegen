# @atomic-ehr/type-schema Documentation

This directory contains comprehensive documentation for the @atomic-ehr/type-schema library.

## Documentation Overview

### 📚 [Main Documentation](./index.md)
Start here for an overview of the library and its capabilities.

### 🚀 Getting Started
- [Quick Start Guide](./getting-started/quick-start.md) - Get running in minutes
- [Installation](./getting-started/installation.md) - Detailed setup instructions
- [Basic Usage](./getting-started/basic-usage.md) - Common usage patterns

### 🏗️ Architecture
- [System Architecture](./architecture/overview.md) - High-level design and components
- [TypeSchema Format](./architecture/type-schema-format.md) - Understanding the intermediate format
- [Transformation Pipeline](./architecture/transformation-pipeline.md) - How FHIR becomes TypeScript
- [Code Generation](./architecture/code-generation.md) - TypeScript generation process

### 📖 API Reference
- [Core API](./api/core.md) - Main transformation functions
- [Generator API](./api/generator.md) - Code generation classes and utilities
- [CLI Reference](./api/cli.md) - Command-line interface documentation
- [TypeSchema Types](./api/types.md) - Complete type definitions

### 📘 User Guide
- [Using Generated Types](./guide/using-generated-types.md) - Working with generated code
- [Customization](./guide/customization.md) - Advanced configuration options
- [Best Practices](./guide/best-practices.md) - Recommended patterns and tips
- [Troubleshooting](./guide/troubleshooting.md) - Common issues and solutions

### 👩‍💻 Developer Guide
- [Contributing](./developer/contributing.md) - How to contribute to the project
- [Development Setup](./developer/setup.md) - Setting up your development environment
- [Testing](./developer/testing.md) - Running and writing tests
- [Architecture Decisions](./developer/architecture-decisions.md) - Key design choices

### 💡 Examples
- [Basic Examples](./examples/basic.md) - Simple usage examples
- [Advanced Examples](./examples/advanced.md) - Complex scenarios and patterns
- [Integration Examples](./examples/integration.md) - Integrating with other tools

## Quick Links

- **GitHub Repository**: [atomic-ehr/codegen](https://github.com/atomic-ehr/codegen)
- **NPM Package**: [@atomic-ehr/type-schema](https://www.npmjs.com/package/@atomic-ehr/type-schema)
- **Issues**: [GitHub Issues](https://github.com/atomic-ehr/codegen/issues)
- **Discussions**: [GitHub Discussions](https://github.com/atomic-ehr/codegen/discussions)

## Documentation Conventions

### Code Examples

Code examples in this documentation follow these conventions:

- `✅` marks recommended patterns
- `❌` marks anti-patterns to avoid
- `// ...` indicates omitted code for brevity
- Comments explain important concepts

### Terminology

- **FHIR**: Fast Healthcare Interoperability Resources
- **TypeSchema**: Our intermediate format between FHIR and TypeScript
- **StructureDefinition**: FHIR's schema format
- **FHIRSchema**: Simplified format from @atomic-ehr/fhirschema
- **Generator**: Component that produces code from TypeSchema

## Contributing to Documentation

We welcome documentation improvements! Please:

1. Follow the existing structure and style
2. Include practical examples
3. Test all code examples
4. Update the index when adding new pages
5. Submit a pull request

## Version

This documentation is for @atomic-ehr/type-schema version 0.0.1.

Last updated: 2024