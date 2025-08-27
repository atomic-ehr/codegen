# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [unreleased] - 2024-08-27

### Added
- **Value Set Generation**: Generate strongly-typed TypeScript files from FHIR value sets
  - New `generateValueSets` option for TypeScript generator
  - Support for different binding strengths (`required`, `preferred`, `extensible`, `example`)
  - Optional helper validation functions with `includeValueSetHelpers`
  - Configurable output directory with `valueSetDirectory`
  - Three generation modes: `'required-only'`, `'custom'`, and `'all'`
  - Runtime type guards for safe string-to-enum conversions
  - Const assertion arrays for all valid enum values
  - Comprehensive documentation with examples and migration guide

### Breaking Changes
- When `generateValueSets` is enabled, interface fields with FHIR bindings now use specific union types instead of `string`
- Import statements required for value set types in consuming code
- Type annotations may need updates from `string` to specific value set types

### Documentation
- Added comprehensive value set generation documentation
- Created migration guide with step-by-step instructions
- Added usage examples for React, Express, GraphQL integrations
- Updated configuration documentation with new options

### Migration
See [Value Set Migration Guide](docs/migration/value-set-migration.md) for detailed upgrade instructions.

## [1.x.x] - Previous versions

Previous changelog entries would go here for existing releases.
