# ADR-001: FHIR Module Refactoring for Enhanced TypeScript Generation

## Status
Proposed

## Context
The current FHIR code generation implementation needs refactoring to support:
- Better TypeScript generation with rich autocomplete features
- Closer integration between FHIR module and core API
- More maintainable and extensible architecture
- Improved type safety and developer experience

### Current Architecture Issues
1. **Separation of Concerns**: FHIR-specific logic is scattered across multiple modules
2. **Type Generation**: Limited support for advanced TypeScript features and autocomplete
3. **API Integration**: Loose coupling between FHIR module and high-level API builder
4. **Search Parameters**: Basic search functionality without full type safety
5. **Resource Relationships**: No strong typing for resource references and relationships

## Decision

### 1. Consolidate FHIR Module Architecture
Reorganize `src/fhir/` to be a first-class citizen alongside the API layer:

```
src/
├── fhir/
│   ├── core/                 # Core FHIR functionality
│   │   ├── types.ts          # FHIR type system and utilities
│   │   ├── resources.ts      # Resource generation and management
│   │   ├── primitives.ts     # Primitive type handling
│   │   └── complex-types.ts  # Complex type handling
│   ├── generators/           # FHIR-specific generators
│   │   ├── typescript/       # TypeScript generation
│   │   │   ├── interfaces.ts # Interface generation
│   │   │   ├── validators.ts # Validator generation
│   │   │   ├── guards.ts     # Type guard generation
│   │   │   └── builders.ts   # Builder pattern generation
│   │   └── client/           # Client generation
│   │       ├── rest.ts       # REST client generation
│   │       ├── graphql.ts    # GraphQL client generation
│   │       └── search.ts     # Search builder generation
│   ├── features/             # FHIR feature modules
│   │   ├── search/           # Search functionality
│   │   │   ├── parameters.ts # Search parameter extraction
│   │   │   ├── builder.ts    # Type-safe search builder
│   │   │   └── types.ts      # Search types
│   │   ├── operations/       # FHIR operations
│   │   ├── profiles/         # Profile handling
│   │   ├── extensions/       # Extension handling
│   │   ├── valuesets/        # ValueSet handling
│   │   └── codesystems/      # CodeSystem handling
│   └── index.ts              # Public API
```

### 2. Enhanced TypeScript Generation

#### 2.1 Rich Interface Generation
```typescript
interface PatientGenerationOptions {
  // Base interface
  generateInterface: boolean;
  
  // Advanced features
  generateBuilders: boolean;      // Fluent builders for resource creation
  generateValidators: boolean;    // Runtime validators
  generateGuards: boolean;        // Type guards
  generateFactories: boolean;     // Factory functions
  generateMocks: boolean;         // Mock data generators
  
  // Autocomplete enhancements
  generateEnums: boolean;         // Enums for coded values
  generateConstants: boolean;     // Constants for fixed values
  generateHelpers: boolean;       // Helper functions
  generateDocumentation: boolean; // JSDoc with examples
}
```

#### 2.2 Type-Safe Resource References
```typescript
// Generated code example
interface Patient extends Resource {
  resourceType: 'Patient';
  managingOrganization?: Reference<Organization>; // Type-safe reference
  generalPractitioner?: Reference<Practitioner | Organization>[]; // Union types
}

// With autocomplete for reference resolution
const patient: Patient = {
  resourceType: 'Patient',
  managingOrganization: {
    reference: 'Organization/', // Autocomplete suggests Organization IDs
    type: 'Organization',
    display: 'Main Hospital'
  }
};
```

#### 2.3 Builder Pattern for Resources
```typescript
// Generated builder example
const patient = new PatientBuilder()
  .withName('John', 'Doe')
  .withBirthDate('1990-01-01')
  .withAddress({
    line: ['123 Main St'],
    city: 'Boston',
    state: 'MA',
    postalCode: '02134'
  })
  .withIdentifier('MRN', '12345')
  .build();
```

### 3. Integrated Search Parameter System

#### 3.1 Type-Safe Search Builder
```typescript
// Generated search builder with full type safety
const results = await client
  .search('Patient')
  .where('name', 'John')           // Autocomplete for Patient search params
  .where('birthdate', 'ge2000')    // Date search with operators
  .where('address-city', 'Boston')  // Nested parameter support
  .include('Patient:managingOrganization') // Type-safe includes
  .revInclude('Observation:subject') // Type-safe reverse includes
  .sort('name', 'asc')
  .count(10)
  .execute();
```

#### 3.2 Search Parameter Extraction
```typescript
interface SearchParameterExtractor {
  extractFromStructureDefinition(sd: StructureDefinition): SearchParameter[];
  generateTypeScriptTypes(params: SearchParameter[]): string;
  generateRuntimeValidators(params: SearchParameter[]): string;
}
```

### 4. Core API Integration

#### 4.1 Unified Generator Pipeline
```typescript
class FHIRGenerator {
  constructor(private config: FHIRGeneratorConfig) {}
  
  // Single entry point for all FHIR generation
  async generate(): Promise<GenerationResult> {
    const pipeline = new GenerationPipeline()
      .add(new TypeSchemaTransformer())
      .add(new FHIRTypeGenerator())
      .add(new SearchParameterExtractor())
      .add(new ClientGenerator())
      .add(new DocumentationGenerator());
    
    return pipeline.execute(this.config);
  }
}
```

#### 4.2 Plugin Architecture
```typescript
interface FHIRPlugin {
  name: string;
  version: string;
  
  // Hooks into generation pipeline
  beforeGenerate?(context: GenerationContext): Promise<void>;
  transformSchema?(schema: TypeSchema): TypeSchema;
  afterGenerate?(result: GenerationResult): Promise<void>;
  
  // Custom generators
  generators?: Generator[];
}
```

### 5. Advanced Features

#### 5.1 Validation and Guards
```typescript
// Generated validation
const isValidPatient = createPatientValidator({
  strict: true,
  checkReferences: true,
  validateBindings: true
});

if (isValidPatient(data)) {
  // data is typed as Patient
}
```

#### 5.2 Mock Data Generation
```typescript
// Generated mock factories
const mockPatient = generateMockPatient({
  includeOptional: true,
  seed: 12345 // Deterministic generation
});
```

#### 5.3 GraphQL Support
```typescript
// Generated GraphQL types and resolvers
type PatientQL = {
  id: ID!
  name: [HumanNameQL!]
  birthDate: Date
  managingOrganization: OrganizationQL
}
```

## Consequences

### Positive
- **Better Developer Experience**: Rich autocomplete and type safety
- **Maintainability**: Clear separation of concerns and modular architecture
- **Extensibility**: Plugin system allows custom generators
- **Performance**: Optimized generation pipeline with caching
- **Quality**: Built-in validation and testing utilities

### Negative
- **Migration Effort**: Existing code needs refactoring
- **Complexity**: More sophisticated architecture requires documentation
- **Bundle Size**: Generated code may be larger with all features

### Neutral
- **Learning Curve**: Developers need to understand new patterns
- **Configuration**: More options require careful defaults

## Implementation Plan

See micro-tasks in `tasks/` directory for detailed implementation steps.

## References
- FHIR R4 Specification: https://hl7.org/fhir/R4/
- TypeScript Handbook: https://www.typescriptlang.org/docs/
- FHIR TypeScript Definitions: https://github.com/microsoft/fhir-codegen