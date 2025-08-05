# Task: Backport type-schema from Clojure to TypeScript

## Priority
High

## Description
Implement a TypeScript version of the type-schema library that transforms FHIRSchema into TypeSchema format. This is a critical component for SDK generation pipeline, providing a normalized intermediate representation that simplifies code generation for multiple target languages.

The implementation should maintain compatibility with the existing Clojure type-schema output format while leveraging TypeScript's type system and the existing @atomic-ehr/fhirschema package.

## Acceptance Criteria

### Phase 1: Core Infrastructure
- [ ] Define TypeSchema type definitions in `src/types.ts` matching the Clojure output format
- [ ] Import and use FHIRSchema types from @atomic-ehr/fhirschema (not custom definitions)
- [ ] Set up project structure with proper module organization
- [ ] Use @atomic-ehr/fhir-canonical-manager for package loading and resource resolution
- [ ] Create identifier building utilities for all schema kinds

### Phase 2: Core Transformation
- [ ] Implement main FHIRSchema → TypeSchema transformer
- [ ] Handle schema hierarchy and inheritance (base types)
- [ ] Build field transformation logic with proper type references
- [ ] Support element snapshot merging from inheritance chain

### Phase 3: Complex Features
- [ ] Handle choice types (choices/choiceOf fields)
- [ ] Implement nested type (BackboneElement) extraction
- [ ] Process bindings and generate binding TypeSchemas
- [ ] Support value set expansion for enum generation

### Phase 4: CLI Tool
- [ ] Create CLI using Bun with same interface as Clojure version
- [ ] Support NDJSON and separated file outputs
- [ ] Implement treeshaking functionality
- [ ] Add verbose logging and progress reporting
- [ ] Handle package loading and caching

### Phase 5: Testing & Validation
- [ ] Copy all golden test files from `./type-schema/test/golden/` to TypeScript project
- [ ] Port Clojure test cases from `./type-schema/test/type_schema/` to TypeScript:
  - `core_test.clj` → core transformation tests
  - `binding_test.clj` → binding and enum tests
  - `value_set_test.clj` → value set expansion tests
  - `sanity_test.clj` → validation and sanity checks
- [ ] Ensure output matches existing *.ts.json format exactly
- [ ] Test with real FHIR packages (hl7.fhir.r4.core)
- [ ] Validate all schema kinds: primitive, resource, complex, nested, binding, value-set
- [ ] Implement golden test runner that compares actual output with expected *.ts.json files

## Notes

### Technical Architecture
- Leverage @atomic-ehr/fhirschema for FHIRSchema types and SD→FHIRSchema conversion
- Use @atomic-ehr/fhir-canonical-manager for package management and resource resolution:
  - Handles FHIR package installation and caching
  - Provides canonical URL resolution
  - Manages resource loading from packages
- Implement functional approach with immutable data transformations
- Follow existing file naming conventions (*.ts.json for TypeSchema files)

### Key Implementation Mappings

**Clojure → TypeScript mappings:**
- `atom` → Singleton class or module-level Map
- `defn` → exported functions
- Threading macros (`->`, `->>`) → method chaining or pipe functions
- `merge` → Object spread or lodash merge
- `keep` → filter + map
- `concat` → array spread

**Core modules to implement:**
1. `src/types.ts` - All TypeSchema type definitions (single file for all types)
2. `core/transformer.ts` - Main transformation logic
3. `core/identifier.ts` - Identifier builders
4. `core/binding.ts` - Binding handling
5. `core/field-builder.ts` - Field transformation
6. `core/nested-types.ts` - Backbone element handling
7. `value-set/processor.ts` - Value set expansion
8. `cli/index.ts` - CLI entry point

**Package Registry Integration:**
- Replace Clojure's package-index with @atomic-ehr/fhir-canonical-manager
- Use `CanonicalManager` for loading StructureDefinitions and ValueSets
- Example usage:
```typescript
const manager = CanonicalManager({
  packages: ["hl7.fhir.r4.core"],
  workingDir: "tmp/fhir"
});
await manager.init();

// Load StructureDefinition
const sd = await manager.resolve('http://hl7.org/fhir/StructureDefinition/Patient');

// Convert to FHIRSchema
const fhirSchema = translate(sd);

// Transform to TypeSchema
const typeSchema = transformFHIRSchema(fhirSchema);
```

**Important:** Always import FHIRSchema types from @atomic-ehr/fhirschema:
```typescript
import { FHIRSchema, FHIRSchemaElement } from '@atomic-ehr/fhirschema';
```

### Dependencies
- @atomic-ehr/fhirschema (already installed) - for FHIRSchema types and SD→FHIRSchema conversion
- @atomic-ehr/fhir-canonical-manager (already installed) - for package loading and resource resolution
- Bun runtime (for CLI and file operations)
- Consider: lodash/fp or ramda for functional utilities

### Critical Logic to Port
1. Element hierarchy resolution (`element-hierarchy`, `element-snapshot`)
2. Required/excluded field detection across inheritance chain
3. Dependency extraction and deduplication
4. Binding schema generation for each bound element
5. Nested element collection and transformation

### Output Format Example
```json
{
  "identifier": {
    "kind": "resource",
    "package": "hl7.fhir.r4.core",
    "version": "4.0.1",
    "name": "Patient",
    "url": "http://hl7.org/fhir/StructureDefinition/Patient"
  },
  "base": {
    "kind": "resource",
    "package": "hl7.fhir.r4.core",
    "version": "4.0.1",
    "name": "DomainResource",
    "url": "http://hl7.org/fhir/StructureDefinition/DomainResource"
  },
  "fields": {
    "gender": {
      "type": { "kind": "primitive-type", "name": "code", ... },
      "array": false,
      "required": false,
      "binding": { "kind": "binding", "name": "AdministrativeGender", ... }
    }
  },
  "nested": [...],
  "dependencies": [...]
}
```

### References
- Original Clojure implementation: ./type-schema/src/type_schema/
- Test fixtures: ./type-schema/test/golden/
- Example outputs: ./type-schema/docs/examples/

### Test Data to Copy
Golden test directories from `./type-schema/test/golden/`:
- `backbone-element/` - BackboneElement tests
- `bundle/` - Bundle resource with multiple bindings
- `capability-statement/` - Complex resource with many bindings
- `custom/` - Custom resources (TutorNotification)
- `element/` - Basic Element type
- `patient/` - Patient resource with all features
- `questionnaire/` - Questionnaire with nested items

Each directory contains:
- `*.fs.json` - FHIR Schema input
- `*.ts.json` - Expected TypeSchema output
- `binding-*.ts.json` - Expected binding TypeSchemas