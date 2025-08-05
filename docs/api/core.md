# Core API Reference

The core API provides the main transformation functions for converting FHIR schemas to TypeSchema format.

## Main Functions

### transformFHIRSchema

Transforms a single FHIRSchema to TypeSchema format, including any associated binding schemas.

```typescript
async function transformFHIRSchema(
  fhirSchema: FHIRSchema,
  manager: CanonicalManager,
  packageInfo?: PackageInfo
): Promise<AnyTypeSchema[]>
```

#### Parameters

- `fhirSchema`: The FHIR schema to transform
- `manager`: Canonical manager for resolving references
- `packageInfo`: Optional package metadata

#### Returns

Array of TypeSchema objects including:
- Main resource/type schema
- Binding schemas for constrained value sets
- Nested type schemas for BackboneElements

#### Example

```typescript
import { transformFHIRSchema, CanonicalManager } from '@atomic-ehr/type-schema';
import { translate } from '@atomic-ehr/fhirschema';

const manager = CanonicalManager({
  packages: ['hl7.fhir.r4.core@4.0.1']
});
await manager.init();

const patientSD = await manager.resolve('http://hl7.org/fhir/StructureDefinition/Patient');
const fhirSchema = translate(patientSD);

const schemas = await transformFHIRSchema(fhirSchema, manager);
```

### transformFHIRSchemas

Transforms multiple FHIRSchemas in batch.

```typescript
async function transformFHIRSchemas(
  fhirSchemas: FHIRSchema[],
  manager: CanonicalManager,
  packageInfo?: PackageInfo
): Promise<AnyTypeSchema[]>
```

#### Parameters

- `fhirSchemas`: Array of FHIR schemas to transform
- `manager`: Canonical manager for resolving references
- `packageInfo`: Optional package metadata

#### Returns

Flattened array of all TypeSchema objects.

## Identifier Functions

### buildSchemaIdentifier

Creates a TypeSchemaIdentifier from a FHIRSchema.

```typescript
function buildSchemaIdentifier(
  fhirSchema: FHIRSchema,
  packageInfo?: PackageInfo
): TypeSchemaIdentifier
```

#### Example

```typescript
const identifier = buildSchemaIdentifier(fhirSchema, {
  name: 'hl7.fhir.r4.core',
  version: '4.0.1'
});
// Result: {
//   kind: 'resource',
//   package: 'hl7.fhir.r4.core',
//   version: '4.0.1',
//   name: 'Patient',
//   url: 'http://hl7.org/fhir/StructureDefinition/Patient'
// }
```

### buildNestedIdentifier

Creates an identifier for a nested type (BackboneElement).

```typescript
function buildNestedIdentifier(
  parentSchema: FHIRSchema,
  path: string[],
  packageInfo?: PackageInfo
): TypeSchemaIdentifier
```

### buildValueSetIdentifier

Creates an identifier for a value set.

```typescript
function buildValueSetIdentifier(
  valueSet: any,
  packageInfo?: PackageInfo
): TypeSchemaIdentifier
```

### buildBindingIdentifier

Creates an identifier for a binding schema.

```typescript
function buildBindingIdentifier(
  fhirSchema: FHIRSchema,
  path: string[],
  packageInfo?: PackageInfo
): TypeSchemaIdentifier
```

## Field Building Functions

### buildField

Builds a TypeSchemaField from a FHIRSchemaElement.

```typescript
async function buildField(
  fhirSchema: FHIRSchema,
  path: string[],
  element: FHIRSchemaElement,
  manager: CanonicalManager,
  packageInfo?: PackageInfo
): Promise<TypeSchemaField>
```

#### Returns

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

### isRequired

Determines if a field is required based on cardinality.

```typescript
function isRequired(element: FHIRSchemaElement): boolean
```

### isExcluded

Determines if a field should be excluded (max = 0).

```typescript
function isExcluded(element: FHIRSchemaElement): boolean
```

### getElementHierarchy

Retrieves the inheritance hierarchy for an element.

```typescript
function getElementHierarchy(
  fhirSchema: FHIRSchema,
  path: string[],
  manager: CanonicalManager
): FHIRSchemaElement[]
```

### mergeElementHierarchy

Merges element definitions through the inheritance chain.

```typescript
function mergeElementHierarchy(
  hierarchy: FHIRSchemaElement[]
): FHIRSchemaElement
```

## Binding Functions

### extractValueSetConcepts

Extracts concepts from a value set for enum generation.

```typescript
function extractValueSetConcepts(
  valueSet: any
): Array<{ code: string; display?: string }>
```

### buildEnum

Creates an enum array from value set concepts.

```typescript
function buildEnum(concepts: Array<{ code: string }>): string[]
```

### generateBindingSchema

Generates a TypeSchemaBinding for a bound element.

```typescript
async function generateBindingSchema(
  fhirSchema: FHIRSchema,
  path: string[],
  element: FHIRSchemaElement,
  manager: CanonicalManager,
  packageInfo?: PackageInfo
): Promise<TypeSchemaBinding | null>
```

### collectBindingSchemas

Collects all binding schemas from a FHIRSchema.

```typescript
async function collectBindingSchemas(
  fhirSchema: FHIRSchema,
  manager: CanonicalManager,
  packageInfo?: PackageInfo
): Promise<TypeSchemaBinding[]>
```

## Nested Type Functions

### collectNestedElements

Finds all BackboneElements in a schema.

```typescript
function collectNestedElements(
  fhirSchema: FHIRSchema,
  parentPath: string[] = [],
  elements?: Record<string, FHIRSchemaElement>
): Array<{ path: string[]; element: FHIRSchemaElement }>
```

### buildNestedTypes

Builds TypeSchemaNestedType objects for all BackboneElements.

```typescript
async function buildNestedTypes(
  fhirSchema: FHIRSchema,
  manager: CanonicalManager,
  packageInfo?: PackageInfo
): Promise<TypeSchemaNestedType[]>
```

### extractNestedDependencies

Extracts dependencies from nested types.

```typescript
function extractNestedDependencies(
  nestedTypes: TypeSchemaNestedType[]
): TypeSchemaIdentifier[]
```

## Value Set Processing

### transformValueSet

Transforms a FHIR ValueSet to TypeSchemaValueSet.

```typescript
function transformValueSet(
  valueSet: any,
  packageInfo?: PackageInfo
): TypeSchemaValueSet
```

## Utility Functions

### dropVersionFromUrl

Removes version suffix from canonical URLs.

```typescript
function dropVersionFromUrl(url: string): string
// "http://hl7.org/fhir/ValueSet/example|1.0" → "http://hl7.org/fhir/ValueSet/example"
```

## Type Guards

### isTypeSchema

Type guard for TypeSchema.

```typescript
function isTypeSchema(schema: AnyTypeSchema): schema is TypeSchema
```

### isTypeSchemaBinding

Type guard for TypeSchemaBinding.

```typescript
function isTypeSchemaBinding(schema: AnyTypeSchema): schema is TypeSchemaBinding
```

### isTypeSchemaValueSet

Type guard for TypeSchemaValueSet.

```typescript
function isTypeSchemaValueSet(schema: AnyTypeSchema): schema is TypeSchemaValueSet
```

## Error Handling

All functions may throw errors for:

- Invalid FHIR schemas
- Missing dependencies
- Network errors (when resolving references)
- Invalid package information

Always wrap calls in try-catch blocks:

```typescript
try {
  const schemas = await transformFHIRSchema(fhirSchema, manager);
} catch (error) {
  console.error('Transformation failed:', error);
}
```