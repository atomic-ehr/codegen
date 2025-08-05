# TypeSchema Type Definitions

Complete reference for all TypeScript types used in the TypeSchema system.

## Core Types

### TypeSchemaIdentifier

Uniquely identifies any schema entity.

```typescript
interface TypeSchemaIdentifier {
  kind: 'primitive-type' | 'resource' | 'complex-type' | 'nested' | 
        'binding' | 'value-set' | 'constraint';
  package: string;
  version: string;
  name: string;
  url: string;
}
```

#### Properties

- `kind`: The type category
  - `'primitive-type'`: FHIR primitives (string, boolean, etc.)
  - `'resource'`: FHIR resources (Patient, Observation, etc.)
  - `'complex-type'`: Complex data types (HumanName, Address, etc.)
  - `'nested'`: BackboneElements within resources
  - `'binding'`: Value set bindings
  - `'value-set'`: Value set definitions
  - `'constraint'`: Future use for profiles/constraints

- `package`: NPM package name (e.g., "hl7.fhir.r4.core")
- `version`: Package version (e.g., "4.0.1")
- `name`: Type name (e.g., "Patient", "HumanName")
- `url`: Canonical URL

### TypeSchemaField

Represents a field in a schema.

```typescript
interface TypeSchemaField {
  type?: TypeSchemaIdentifier;
  array: boolean;
  required: boolean;
  excluded: boolean;
  min?: number;
  max?: number;
  choices?: string[];
  choiceOf?: string;
  enum?: string[];
  binding?: TypeSchemaIdentifier;
  reference?: TypeSchemaIdentifier[];
}
```

#### Properties

- `type`: The field's data type
- `array`: Whether this is an array field
- `required`: Whether the field is required (min >= 1)
- `excluded`: Whether the field is excluded (max = 0)
- `min`: Minimum cardinality
- `max`: Maximum cardinality (-1 for unbounded)
- `choices`: For choice types, lists possible field names
- `choiceOf`: For choice variants, references the parent choice
- `enum`: Allowed values for code types
- `binding`: Value set binding identifier
- `reference`: For Reference fields, allowed target types

### TypeSchemaNestedType

Represents a BackboneElement.

```typescript
interface TypeSchemaNestedType {
  identifier: TypeSchemaIdentifier;
  base?: TypeSchemaIdentifier;
  fields: Record<string, TypeSchemaField>;
}
```

#### Properties

- `identifier`: Unique identifier for the nested type
- `base`: Parent type (usually BackboneElement)
- `fields`: Field definitions

### TypeSchema

Main schema for resources, complex types, and primitives.

```typescript
interface TypeSchema {
  identifier: TypeSchemaIdentifier;
  base?: TypeSchemaIdentifier;
  description?: string;
  fields?: Record<string, TypeSchemaField>;
  nested?: TypeSchemaNestedType[];
  dependencies: TypeSchemaIdentifier[];
}
```

#### Properties

- `identifier`: Unique identifier
- `base`: Parent type for inheritance
- `description`: Human-readable description
- `fields`: Field definitions (absent for primitives)
- `nested`: Nested BackboneElement definitions
- `dependencies`: All referenced types

### TypeSchemaBinding

Value set binding schema.

```typescript
interface TypeSchemaBinding {
  identifier: TypeSchemaIdentifier;
  type?: TypeSchemaIdentifier;
  valueset: TypeSchemaIdentifier;
  strength: string;
  enum?: string[];
  dependencies: TypeSchemaIdentifier[];
}
```

#### Properties

- `identifier`: Binding identifier
- `type`: Base type (usually code or Coding)
- `valueset`: The bound value set
- `strength`: Binding strength
- `enum`: Enumerated values for required bindings
- `dependencies`: Type dependencies

### TypeSchemaValueSet

FHIR ValueSet representation.

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
    include?: Array<ValueSetCompose>;
    exclude?: Array<ValueSetCompose>;
  };
  dependencies: TypeSchemaIdentifier[];
}

interface ValueSetCompose {
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
}
```

### AnyTypeSchema

Union type for all schema variants.

```typescript
type AnyTypeSchema = TypeSchema | TypeSchemaBinding | TypeSchemaValueSet;
```

## Context Types

### PackageInfo

Package metadata from canonical manager.

```typescript
interface PackageInfo {
  name: string;
  version: string;
  canonical?: string;
  fhirVersions?: string[];
}
```

### TransformContext

Context for transformation operations.

```typescript
interface TransformContext {
  packageInfo?: PackageInfo;
  verbose?: boolean;
}
```

## External Types

### FHIRSchema

From `@atomic-ehr/fhirschema` package.

```typescript
interface FHIRSchema {
  url: string;
  name: string;
  type: string;
  kind: 'primitive-type' | 'resource' | 'complex-type';
  base?: string;
  abstract?: boolean;
  derivation?: 'specialization' | 'constraint';
  required?: string[];
  excluded?: string[];
  description?: string;
  elements?: Record<string, FHIRSchemaElement>;
  package_name?: string;
  package_version?: string;
  package_id?: string;
}
```

### FHIRSchemaElement

Element definition in FHIRSchema.

```typescript
interface FHIRSchemaElement {
  type?: string;
  types?: string[];
  array?: boolean;
  binding?: {
    valueSet: string;
    strength: string;
  };
  isRequired?: boolean;
  isExcluded?: boolean;
  min?: number;
  max?: number | '*';
  choice?: boolean;
  choices?: string[];
  elements?: Record<string, FHIRSchemaElement>;
  reference?: string[];
}
```

## Type Guards

### isTypeSchema

```typescript
function isTypeSchema(schema: AnyTypeSchema): schema is TypeSchema
```

Checks if a schema is a TypeSchema (not binding or value set).

### isTypeSchemaBinding

```typescript
function isTypeSchemaBinding(schema: AnyTypeSchema): schema is TypeSchemaBinding
```

Checks if a schema is a binding schema.

### isTypeSchemaValueSet

```typescript
function isTypeSchemaValueSet(schema: AnyTypeSchema): schema is TypeSchemaValueSet
```

Checks if a schema is a value set schema.

## Usage Examples

### Creating Identifiers

```typescript
const patientId: TypeSchemaIdentifier = {
  kind: 'resource',
  package: 'hl7.fhir.r4.core',
  version: '4.0.1',
  name: 'Patient',
  url: 'http://hl7.org/fhir/StructureDefinition/Patient'
};

const humanNameId: TypeSchemaIdentifier = {
  kind: 'complex-type',
  package: 'hl7.fhir.r4.core',
  version: '4.0.1',
  name: 'HumanName',
  url: 'http://hl7.org/fhir/StructureDefinition/HumanName'
};
```

### Working with Fields

```typescript
const nameField: TypeSchemaField = {
  type: humanNameId,
  array: true,
  required: false,
  excluded: false,
  min: 0,
  max: -1  // Unbounded
};

const genderField: TypeSchemaField = {
  type: codeId,
  array: false,
  required: false,
  excluded: false,
  binding: genderBindingId,
  enum: ['male', 'female', 'other', 'unknown']
};
```

### Creating Schemas

```typescript
const patientSchema: TypeSchema = {
  identifier: patientId,
  base: domainResourceId,
  description: 'Demographics and other administrative information...',
  fields: {
    name: nameField,
    gender: genderField,
    birthDate: dateField
  },
  nested: [{
    identifier: patientContactId,
    base: backboneElementId,
    fields: {
      relationship: relationshipField,
      name: humanNameField
    }
  }],
  dependencies: [
    domainResourceId,
    humanNameId,
    codeId,
    dateId
  ]
};
```

### Type Checking

```typescript
function processSchema(schema: AnyTypeSchema) {
  if (isTypeSchema(schema)) {
    console.log(`Processing ${schema.identifier.kind}: ${schema.identifier.name}`);
    if (schema.fields) {
      Object.entries(schema.fields).forEach(([name, field]) => {
        console.log(`  Field: ${name}, Type: ${field.type?.name}`);
      });
    }
  } else if (isTypeSchemaBinding(schema)) {
    console.log(`Binding: ${schema.identifier.name}`);
    console.log(`  Values: ${schema.enum?.join(', ')}`);
  } else if (isTypeSchemaValueSet(schema)) {
    console.log(`ValueSet: ${schema.identifier.name}`);
    console.log(`  Concepts: ${schema.concept?.length || 0}`);
  }
}
```

## Conventions

### Naming Conventions

- Resource names: PascalCase (e.g., "Patient", "Observation")
- Complex type names: PascalCase (e.g., "HumanName", "CodeableConcept")
- Primitive type names: camelCase (e.g., "string", "boolean", "dateTime")
- Nested type names: Parent.path (e.g., "Patient.contact", "Observation.component")
- Binding names: ValueSetName or ResourceName#field (e.g., "AdministrativeGender", "Patient#gender")

### URL Conventions

- Resources: `http://hl7.org/fhir/StructureDefinition/{Name}`
- Complex types: `http://hl7.org/fhir/StructureDefinition/{Name}`
- Primitives: `http://hl7.org/fhir/StructureDefinition/{name}`
- Nested types: `http://hl7.org/fhir/StructureDefinition/{Parent}#{path}`
- Value sets: `http://hl7.org/fhir/ValueSet/{name}`

### Package Conventions

- Standard FHIR R4: `hl7.fhir.r4.core@4.0.1`
- US Core: `hl7.fhir.us.core@{version}`
- Custom packages: Follow NPM naming conventions