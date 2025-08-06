# Changelog

All notable changes to Atomic EHR Codegen will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Complete rewrite of documentation and README
- Comprehensive CLI reference documentation
- Healthcare application examples
- Troubleshooting guide
- Contributing guidelines
- Configuration management system

### Changed
- Improved TypeScript error handling and logger interface compatibility
- Updated project structure and build system

### Fixed
- TypeScript compilation errors in source code
- Logger method signature mismatches
- Configuration type validation issues

### Removed
- Outdated test files that were no longer compatible
- Legacy documentation files

## [0.0.1] - 2024-08-06

### Added
- Initial release of Atomic EHR Codegen
- TypeSchema generation from FHIR packages
- TypeScript code generation
- Python code generation with Pydantic support
- CLI interface with subcommands
- Configuration system with JSON and JavaScript support
- Validation tools for TypeSchema and generated code
- Support for FHIR R4 and US Core profiles
- Generator registry system for extensibility
- Comprehensive logging system
- Package caching for improved performance

### Features
- **TypeSchema Creation**: Extract type information from FHIR packages
- **Multi-language Support**: Generate TypeScript and Python types
- **FHIR Compliance**: Full support for FHIR R4 and profile extensions
- **Configurable Output**: Flexible namespace organization and file naming
- **Validation**: Built-in validation for schemas and generated code
- **Performance**: Efficient package caching and treeshaking support

### Commands
- `typeschema create` - Generate TypeSchema from FHIR packages
- `typeschema validate` - Validate TypeSchema files
- `typeschema merge` - Merge multiple TypeSchema files
- `generate typescript` - Generate TypeScript types
- `generate python` - Generate Python types with Pydantic
- `config init` - Initialize configuration files
- `config validate` - Validate configuration
- `config show` - Display current configuration
- `generators list` - List available generators
- `validate` - Validate generated code files

### Configuration Templates
- Minimal configuration for simple projects
- TypeScript-focused setup for frontend applications
- Python-focused setup for backend services
- Multi-language setup for full-stack projects
- Comprehensive configuration with all options

---

## Release Notes

### Version 0.0.1 - Initial Release

This is the first public release of Atomic EHR Codegen, providing a robust foundation for generating type-safe FHIR resource definitions.

**Key Highlights:**

🚀 **Fast and Efficient**: Built with Bun for maximum performance
📋 **Multi-language**: Supports TypeScript and Python code generation
🔍 **FHIR Compliant**: Full support for FHIR R4 and US Core profiles
⚡ **Type Safe**: Complete type safety with validation
🎯 **Configurable**: Flexible configuration system with multiple templates
📦 **Package Integration**: Direct integration with FHIR package registry
🔧 **CLI and Programmatic**: Use as CLI tool or integrate into build processes

**Getting Started:**

```bash
# Install globally
bun install -g @atomic-ehr/codegen

# Generate TypeSchema
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o fhir.ndjson

# Generate TypeScript types
atomic-codegen generate typescript -i fhir.ndjson -o ./types/fhir

# Or use configuration files
atomic-codegen config init --template typescript
atomic-codegen typeschema create
atomic-codegen generate typescript
```

**What's Next:**

- Additional language generators (Java, Rust, C#)
- Enhanced profile constraint handling  
- Custom validation rule support
- IDE integrations and extensions
- More comprehensive FHIR package support

We're excited to see what the community builds with Atomic EHR Codegen!

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to get started.

## Support

- 📖 [Documentation](https://github.com/atomic-ehr/codegen/tree/main/docs)
- 🐛 [Report Issues](https://github.com/atomic-ehr/codegen/issues)
- 💬 [Discussions](https://github.com/atomic-ehr/codegen/discussions)
- 🎮 [Discord Community](https://discord.gg/atomic-ehr)