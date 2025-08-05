# TypeSchema Format Specification

TypeSchema is an intermediate representation format that bridges FHIR's complex schema system and target programming languages. It simplifies FHIR's deeply nested and inheritance-heavy structure into a flatter, more generator-friendly format.

## Overview

TypeSchema transforms FHIR StructureDefinitions into a normalized format that:
- Flattens complex inheritance hierarchies
- Normalizes field definitions
- Explicitly tracks dependencies
- Simplifies binding representations
- Preserves all necessary type information

## Core Types

### TypeSchemaIdentifier

Uniquely identifies any schema entity in the system.

```typescript
interface TypeSchemaIdentifier {
  kind: 'primitive-type' | 'resource' | 'complex-type' | 'nested' | 'binding' | 'value-set' | 'constraint';
  package: string;    // e.g., "hl7.fhir.r4.core"
  version: string;    // e.g., "4.0.1"
  name: string;       // e.g., "Patient"
  url: string;        // e.g., "http://hl7.org/fhir/StructureDefinition/Patient"
}
```

Example identifiers:
```json
{
  "kind": "resource",
  "package": "hl7.fhir.r4.core",
  "version": "4.0.1",
  "name": "Patient",
  "url": "http://hl7.org/fhir/StructureDefinition/Patient"
}

{
  "kind": "complex-type",
  "package": "hl7.fhir.r4.core",
  "version": "4.0.1",
  "name": "HumanName",
  "url": "http://hl7.org/fhir/StructureDefinition/HumanName"
}

{
  "kind": "nested",
  "package": "hl7.fhir.r4.core",
  "version": "4.0.1",
  "name": "Patient.contact",
  "url": "http://hl7.org/fhir/StructureDefinition/Patient#Patient.contact"
}
```

### TypeSchemaField

Represents a field (element) in a type.

```typescript
interface TypeSchemaField {
  type?: TypeSchemaIdentifier;      // Field type
  array: boolean;                   // Is this an array field?
  required: boolean;                // Is this field required? (min >= 1)
  excluded: boolean;                // Is this field excluded? (max = 0)
  min?: number;                     // Minimum cardinality
  max?: number;                     // Maximum cardinality (-1 for unbounded)
  choices?: string[];               // For choice types (e.g., ["valueString", "valueInteger"])
  choiceOf?: string;                // Parent choice field name
  enum?: string[];                  // Allowed values for code types
  binding?: TypeSchemaIdentifier;   // Value set binding
  reference?: TypeSchemaIdentifier[]; // Allowed reference targets
}
```

Example fields:
```json
{
  "name": {
    "type": {
      "kind": "complex-type",
      "package": "hl7.fhir.r4.core",
      "version": "4.0.1",
      "name": "HumanName",
      "url": "http://hl7.org/fhir/StructureDefinition/HumanName"
    },
    "array": true,
    "required": false,
    "excluded": false,
    "min": 0,
    "max": -1
  },
  
  "gender": {
    "type": {
      "kind": "primitive-type",
      "package": "hl7.fhir.r4.core",
      "version": "4.0.1",
      "name": "code",
      "url": "http://hl7.org/fhir/StructureDefinition/code"
    },
    "array": false,
    "required": false,
    "excluded": false,
    "binding": {
      "kind": "binding",
      "package": "hl7.fhir.r4.core",
      "version": "4.0.1",
      "name": "AdministrativeGender",
      "url": "http://hl7.org/fhir/ValueSet/administrative-gender"
    }
  }
}
```

### TypeSchema

Main schema for resources, complex types, and primitives.

```typescript
interface TypeSchema {
  identifier: TypeSchemaIdentifier;
  base?: TypeSchemaIdentifier;           // Parent type
  description?: string;                  // Human-readable description
  fields?: Record<string, TypeSchemaField>; // Field definitions
  nested?: TypeSchemaNestedType[];       // Nested BackboneElements
  dependencies: TypeSchemaIdentifier[];   // All referenced types
}
```

Example Patient resource:
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
  "description": "Demographics and administrative information about a person...",
  "fields": {
    "identifier": { /* ... */ },
    "active": { /* ... */ },
    "name": { /* ... */ },
    "gender": { /* ... */ }
  },
  "nested": [{
    "identifier": {
      "kind": "nested",
      "package": "hl7.fhir.r4.core",
      "version": "4.0.1",
      "name": "Patient.contact",
      "url": "http://hl7.org/fhir/StructureDefinition/Patient#Patient.contact"
    }
  }],
  "dependencies": [
    { /* DomainResource */ },
    { /* Identifier */ },
    { /* HumanName */ },
    { /* ContactPoint */ }
  ]
}
```

### TypeSchemaBinding

Represents value set bindings for constrained fields.

```typescript
interface TypeSchemaBinding {
  identifier: TypeSchemaIdentifier;
  type?: TypeSchemaIdentifier;     // Base type (usually code or Coding)
  valueset: TypeSchemaIdentifier;  // The bound value set
  strength: string;                 // Binding strength (required, extensible, preferred, example)
  enum?: string[];                  // Enumerated values (for required bindings)
  dependencies: TypeSchemaIdentifier[];
}
```

Example binding:
```json
{
  "identifier": {
    "kind": "binding",
    "package": "hl7.fhir.r4.core",
    "version": "4.0.1",
    "name": "AdministrativeGender",
    "url": "http://hl7.org/fhir/ValueSet/administrative-gender"
  },
  "type": {
    "kind": "primitive-type",
    "package": "hl7.fhir.r4.core",
    "version": "4.0.1",
    "name": "code",
    "url": "http://hl7.org/fhir/StructureDefinition/code"
  },
  "valueset": {
    "kind": "value-set",
    "package": "hl7.fhir.r4.core",
    "version": "4.0.1",
    "name": "AdministrativeGender",
    "url": "http://hl7.org/fhir/ValueSet/administrative-gender"
  },
  "strength": "required",
  "enum": ["male", "female", "other", "unknown"],
  "dependencies": []
}
```

### TypeSchemaValueSet

Represents FHIR ValueSets.

```typescript
interface TypeSchemaValueSet {
  identifier: TypeSchemaIdentifier;
  description?: string;
  concept?: Array<{
    system: string;
    code: string;
    display?: string;
  }>;
  compose?: {
    include?: Array<{
      system?: string;
      concept?: Array<{
        code: string;
        display?: string;
      }>;
      filter?: Array<{
        property: string;
        op: string;
        value: string;
      }>;
      valueSet?: string[];
    }>;
    exclude?: Array</* same structure as include */>;
  };
  dependencies: TypeSchemaIdentifier[];
}
```

## Transformation Rules

### 1. Inheritance Flattening

FHIR uses deep inheritance hierarchies. TypeSchema flattens these by:

- Merging element definitions through the inheritance chain
- Preserving only the final "snapshot" of each field
- Maintaining explicit base type references

Example:
```
FHIR: Patient → DomainResource → Resource → Base
TypeSchema: Patient with base=DomainResource and all inherited fields merged
```

### 2. Choice Type Handling

FHIR choice types (e.g., `value[x]`) are transformed into:

```json
{
  "value": {
    "choices": ["valueString", "valueInteger", "valueBoolean"],
    "required": true,
    "array": false,
    "excluded": false
  }
}
```

### 3. Reference Resolution

References are normalized to list allowed target types:

```json
{
  "subject": {
    "reference": [
      {
        "kind": "resource",
        "package": "hl7.fhir.r4.core",
        "version": "4.0.1",
        "name": "Patient",
        "url": "http://hl7.org/fhir/StructureDefinition/Patient"
      },
      {
        "kind": "resource",
        "package": "hl7.fhir.r4.core",
        "version": "4.0.1",
        "name": "Group",
        "url": "http://hl7.org/fhir/StructureDefinition/Group"
      }
    ],
    "type": {
      "kind": "complex-type",
      "package": "hl7.fhir.r4.core",
      "version": "4.0.1",
      "name": "Reference",
      "url": "http://hl7.org/fhir/StructureDefinition/Reference"
    }
  }
}
```

### 4. BackboneElement Processing

BackboneElements become nested types:

```json
{
  "nested": [{
    "identifier": {
      "kind": "nested",
      "package": "hl7.fhir.r4.core",
      "version": "4.0.1",
      "name": "Patient.contact",
      "url": "http://hl7.org/fhir/StructureDefinition/Patient#Patient.contact"
    },
    "base": {
      "kind": "complex-type",
      "package": "hl7.fhir.r4.core",
      "version": "4.0.1",
      "name": "BackboneElement",
      "url": "http://hl7.org/fhir/StructureDefinition/BackboneElement"
    },
    "fields": {
      "relationship": { /* ... */ },
      "name": { /* ... */ },
      "telecom": { /* ... */ }
    }
  }]
}
```

### 5. Dependency Tracking

Dependencies are explicitly tracked and deduplicated:

1. Base type (if any)
2. Field types
3. Binding types
4. Reference targets
5. Nested type dependencies

Dependencies are:
- Deduplicated by URL
- Sorted alphabetically by name
- Exclude self-references

## File Output Format

### NDJSON Format

Default output format where each line is a complete JSON object:

```ndjson
{"identifier":{"kind":"resource","package":"hl7.fhir.r4.core",...},"fields":{...}}
{"identifier":{"kind":"complex-type","package":"hl7.fhir.r4.core",...},"fields":{...}}
{"identifier":{"kind":"binding","package":"hl7.fhir.r4.core",...},"enum":[...]}
```

### Separated Files Format

When using `--separated-files`, each schema is saved as:

```
<kind>-<name>.json
```

Examples:
- `resource-Patient.json`
- `complex-type-HumanName.json`
- `primitive-type-string.json`
- `binding-AdministrativeGender.json`
- `nested-Patient.contact.json`

## Design Rationale

### Why an Intermediate Format?

1. **Separation of Concerns**: Parsing/transformation logic is separate from code generation
2. **Language Independence**: TypeSchema can target any programming language
3. **Testability**: Each stage can be tested independently
4. **Caching**: TypeSchema can be cached between generations
5. **Tooling**: Other tools can consume TypeSchema for analysis, documentation, etc.

### Key Simplifications

1. **Flattened Inheritance**: Generators don't need to understand FHIR inheritance
2. **Normalized References**: All references use the same identifier structure
3. **Explicit Dependencies**: No need to analyze schemas to find dependencies
4. **Simplified Bindings**: Bindings are pre-processed with enum values extracted

### Extensibility

TypeSchema is designed to be extended:

1. New `kind` values can be added for custom types
2. Additional fields can be added to existing interfaces
3. Custom metadata can be included in identifiers
4. Transform plugins can modify schemas before/after transformation

## Validation

TypeSchema can be validated using these rules:

1. All identifiers must have valid URLs
2. Dependencies must not include self-references
3. Fields must have either `type` or `reference` (not both)
4. Array fields must have `array: true`
5. Required fields must have `min >= 1`
6. Excluded fields must have `max = 0`
7. Nested types must have unique names
8. Bindings must reference valid value sets

## Future Extensions

Planned extensions to the format:

1. **Constraints**: Support for invariants and FHIRPath expressions
2. **Documentation**: Structured documentation beyond descriptions
3. **Examples**: Embedded examples for each type
4. **Profiles**: Better support for profiled resources
5. **Operations**: Representation of FHIR operations
6. **Search Parameters**: Include search parameter definitions