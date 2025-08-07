# Task 001: Reorganize FHIR Module Structure

## Priority: High
## Status: ✅ COMPLETED
## Estimated Effort: 2 hours
## Actual Effort: 2 hours

## Description
Reorganize the `src/fhir/` directory to create a more maintainable and feature-rich structure that better integrates with the core API.

## Current Structure
```
src/fhir/
├── codesystems.ts
├── extensions.ts
├── guards/
├── index.ts
├── operations.ts
├── profiles.ts
├── resources.ts
├── search-builder.ts
├── search-parameters.ts
├── types.ts
└── valuesets.ts
```

## Target Structure
```
src/fhir/
├── core/
│   ├── types.ts         # Core FHIR type definitions and utilities
│   ├── resources.ts     # Resource type handling
│   ├── primitives.ts    # Primitive type utilities
│   └── complex-types.ts # Complex type utilities
├── generators/
│   ├── typescript/
│   │   ├── interfaces.ts
│   │   ├── validators.ts
│   │   ├── guards.ts
│   │   └── builders.ts
│   └── client/
│       ├── rest.ts
│       ├── graphql.ts
│       └── search.ts
├── features/
│   ├── search/
│   │   ├── parameters.ts
│   │   ├── builder.ts
│   │   └── types.ts
│   ├── operations/
│   │   └── index.ts
│   ├── profiles/
│   │   └── index.ts
│   ├── extensions/
│   │   └── index.ts
│   ├── valuesets/
│   │   └── index.ts
│   └── codesystems/
│       └── index.ts
└── index.ts
```

## Steps

### 1. Create New Directory Structure
```bash
mkdir -p src/fhir/core
mkdir -p src/fhir/generators/typescript
mkdir -p src/fhir/generators/client
mkdir -p src/fhir/features/search
mkdir -p src/fhir/features/operations
mkdir -p src/fhir/features/profiles
mkdir -p src/fhir/features/extensions
mkdir -p src/fhir/features/valuesets
mkdir -p src/fhir/features/codesystems
```

### 2. Move and Refactor Core Types
- Extract core type utilities from `types.ts` to `core/types.ts`
- Create `core/primitives.ts` for FHIR primitive handling
- Create `core/complex-types.ts` for complex type handling
- Move resource-specific logic to `core/resources.ts`

### 3. Reorganize Features
- Move `codesystems.ts` → `features/codesystems/index.ts`
- Move `extensions.ts` → `features/extensions/index.ts`
- Move `operations.ts` → `features/operations/index.ts`
- Move `profiles.ts` → `features/profiles/index.ts`
- Move `valuesets.ts` → `features/valuesets/index.ts`

### 4. Consolidate Search Functionality
- Move `search-builder.ts` → `features/search/builder.ts`
- Move `search-parameters.ts` → `features/search/parameters.ts`
- Create `features/search/types.ts` for search-specific types

### 5. Move Guard Generators
- Move `guards/` content to `generators/typescript/guards.ts`

### 6. Update Imports
- Update all import statements across the codebase
- Ensure backward compatibility with existing API

### 7. Update Public API
- Update `src/fhir/index.ts` to export from new locations
- Maintain existing public API surface

## Success Criteria
- [x] All existing tests pass
- [x] No breaking changes to public API
- [x] Clean separation between core, generators, and features
- [x] Improved code organization and discoverability

## Completion Notes
- ✅ Successfully reorganized entire FHIR module structure
- ✅ Created comprehensive core, generators, and features directories
- ✅ Moved all files to appropriate new locations
- ✅ Updated imports across the codebase
- ✅ Maintained backward compatibility with public API
- ✅ Added extensive new generator capabilities (TypeScript, client, etc.)

## Dependencies
- None (first task in sequence)

## Testing
```bash
bun test test/fhir/
bun test test/integration/
bun run typecheck
```