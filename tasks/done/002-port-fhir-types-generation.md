# Task: Port FHIR Types Generation from fhir-schema-codegen

## Status
✅ COMPLETED

## Priority
High

## Description
Port the types generation functionality from the fhir-schema-codegen library to generate TypeScript interfaces using the existing `src/typeschema` module as input.

## Acceptance Criteria
- [x] Use existing TypeSchema types from `src/typeschema/types.ts` as input
- [x] Port base Generator class with core generation logic
- [x] Port SchemaLoader adapted to work with our TypeSchema format
- [x] Port TypeScript generator implementation
- [x] Successfully generate TypeScript interfaces from TypeSchema
- [x] Handle all FHIR R4 core resource types
- [x] Proper type inheritance and reference handling
- [x] Generated code passes TypeScript compilation

## Architecture Overview

The implementation will follow this workflow:
1. **Use existing TypeSchema**: The project already has `src/typeschema` that transforms FHIR schemas to TypeSchema format
2. **Template-Based Generation**: Port generators from fhir-schema-codegen to transform our TypeSchema into TypeScript interfaces

### Key Components to Port

1. **TypeSchema Integration**
   - Use existing types from `src/typeschema/types.ts` (TypeSchema, TypeSchemaField, etc.)
   - Adapt fhir-schema-codegen's generator to work with our TypeSchema format

2. **SchemaLoader** 
   - Use existing `@atomic-ehr/fhirschema` and `@atomic-ehr/fhir-canonical-manager` libraries
   - Load FHIR schemas and transform them using existing `src/typeschema` module
   - Categorize schemas (resources, complex types, logical models)

3. **Base Generator** (`src/generators/generator.ts`)
   - File/directory management utilities
   - Code generation helpers (indentation, blocks)
   - Abstract base for language-specific generators

4. **TypeScript Generator** (`src/generators/typescript/index.ts`)
   - TypeScript-specific type generation
   - Type mappings for FHIR primitives
   - Import management and index file generation

## Implementation Plan

### Phase 1: Schema Loading
- Implement SchemaLoader using `@atomic-ehr/fhirschema` and `@atomic-ehr/fhir-canonical-manager`
- Use existing `transformFHIRSchemas` from `src/typeschema` to convert FHIR schemas to TypeSchema
- Create adapter if needed to handle any format differences

### Phase 2: Generator Framework
- Port base Generator class with essential methods
- Implement file/directory management
- Add code generation utilities

### Phase 3: TypeScript Generation
- Port TypeScript generator implementation
- Include type mappings for FHIR primitives
- Generate proper TypeScript interfaces
- Handle nested types and dependencies

### Phase 4: Integration
- Create simple API interface for type generation
- Add configuration options
- Test with sample FHIR schemas

## Key Features

1. **Type Generation**
   - Interface generation for FHIR resources
   - Nested type support (BackboneElements)
   - Proper extends clauses for inheritance
   - Reference type with generics

2. **Type Mappings**
   ```typescript
   boolean → boolean
   instant → string
   dateTime → string
   decimal → number
   integer → number
   code → string
   ```

3. **Import Management**
   - Automatic dependency detection
   - Import statement generation
   - Circular dependency handling

4. **Index File Generation**
   - ResourceTypeMap for runtime type checking
   - Resource list constants

## Proposed File Structure

```
codegen/
├── src/
│   ├── typeschema/             # EXISTING - TypeSchema transformation
│   │   └── ...
│   ├── generator/
│   │   ├── base.ts             # Base generator class
│   │   ├── typescript.ts       # TypeScript generator
│   │   ├── loader.ts           # Schema loader for TypeSchema
│   │   └── index.ts
│   ├── utils/
│   │   ├── code.ts             # Code generation helpers
│   │   └── naming.ts           # Naming convention utilities
│   └── index.ts                # Main entry point
```

## Simplifications from Original

1. Remove multi-language support (TypeScript only)
2. Simplify CLI interface
3. Remove package downloading capabilities
4. Focus on NDJSON input format
5. Remove constraint/profile generation (base types only)

## Completion Notes

### What Was Implemented

1. **Base Generator Class** (`src/generator/base.ts`)
   - Core code generation utilities
   - File management and indentation handling
   - Abstract base for language-specific generators

2. **Schema Loader** (`src/generator/loader.ts`)
   - Uses `@atomic-ehr/fhir-canonical-manager` for package management
   - Transforms FHIR schemas to TypeSchema using existing transformers
   - Categorizes schemas by type

3. **TypeScript Generator** (`src/generator/typescript.ts`)
   - Generates TypeScript interfaces from TypeSchema
   - Handles inheritance, arrays, and references
   - Organizes output into primitives, complex types, and resources

4. **Utility Functions**
   - Naming conventions (`src/utils/naming.ts`)
   - Code generation helpers (`src/utils/code.ts`)

5. **CLI Interface** (`src/cli/generate-types.ts`)
   - Simple command-line interface for type generation
   - Supports output directory, package path, and verbose options

6. **Tests and Examples**
   - Unit tests for TypeScript generator
   - Example usage script

7. **Documentation**
   - Comprehensive type generation guide
   - Updated main README with usage instructions

### Key Decisions

- Used existing TypeSchema types instead of porting them
- Leveraged existing dependencies for schema loading
- Focused on TypeScript generation only (removed multi-language support)
- Simplified CLI interface compared to original

### Original Notes

- Source library: https://github.com/fhir-schema/fhir-schema-codegen
- Uses Bun as runtime (per CLAUDE.md)
- Generated types should be compatible with existing FHIR TypeScript usage
- Integration with existing `src/typeschema` module is critical
- Leverage existing dependencies: `@atomic-ehr/fhirschema` and `@atomic-ehr/fhir-canonical-manager`
- The existing TypeSchema format may differ slightly from fhir-schema-codegen's format, requiring adaptation