# Task 004: Implement Type-Safe Search Builder

## Priority: High
## Status: ✅ COMPLETED
## Estimated Effort: 4 hours
## Actual Effort: 3.5 hours

## Description
Create a fully type-safe search builder that provides autocomplete for search parameters specific to each resource type.

## Goals
- Generate type-safe search parameters for each resource
- Provide fluent API with full autocomplete
- Support all FHIR search modifiers and operators
- Enable chaining and includes with type safety
- Generate TypeScript types for search results

## Implementation

### 1. Search Parameter Extraction
Enhance `src/fhir/features/search/parameters.ts`:

```typescript
interface SearchParameterExtractor {
  extractFromResource(resource: TypeSchema): SearchParameter[];
  generateTypeScriptInterface(params: SearchParameter[]): string;
  generateSearchBuilder(resource: string, params: SearchParameter[]): string;
}

interface SearchParameter {
  name: string;
  type: 'string' | 'token' | 'reference' | 'date' | 'number' | 'quantity';
  documentation: string;
  expression: string; // FHIRPath expression
  modifiers: string[];
  comparators?: string[]; // For date/number types
}
```

### 2. Type-Safe Search Builder Template
```typescript
// Generated search builder for Patient
export class PatientSearchBuilder {
  private params: URLSearchParams = new URLSearchParams();
  private client: FHIRClient;

  constructor(client: FHIRClient) {
    this.client = client;
  }

  // String search parameters
  name(value: string, modifier?: 'exact' | 'contains'): this {
    const key = modifier ? `name:${modifier}` : 'name';
    this.params.append(key, value);
    return this;
  }

  given(value: string | string[]): this {
    const values = Array.isArray(value) ? value : [value];
    values.forEach(v => this.params.append('given', v));
    return this;
  }

  family(value: string, modifier?: 'exact'): this {
    const key = modifier ? `family:${modifier}` : 'family';
    this.params.append(key, value);
    return this;
  }

  // Date search parameters with comparators
  birthdate(
    value: string | Date,
    comparator?: 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le' | 'sa' | 'eb'
  ): this {
    const dateStr = typeof value === 'string' 
      ? value 
      : value.toISOString().split('T')[0];
    const key = comparator && comparator !== 'eq' 
      ? `birthdate=${comparator}${dateStr}`
      : `birthdate=${dateStr}`;
    this.params.append(key.split('=')[0], key.split('=')[1]);
    return this;
  }

  // Token search parameters
  identifier(system?: string, value?: string): this {
    if (system && value) {
      this.params.append('identifier', `${system}|${value}`);
    } else if (value) {
      this.params.append('identifier', value);
    }
    return this;
  }

  gender(value: 'male' | 'female' | 'other' | 'unknown'): this {
    this.params.append('gender', value);
    return this;
  }

  // Reference search parameters
  organization(reference: string | Organization): this {
    const ref = typeof reference === 'string' 
      ? reference 
      : `Organization/${reference.id}`;
    this.params.append('organization', ref);
    return this;
  }

  generalPractitioner(reference: string | Practitioner | Organization): this {
    const ref = typeof reference === 'string'
      ? reference
      : `${reference.resourceType}/${reference.id}`;
    this.params.append('general-practitioner', ref);
    return this;
  }

  // Chaining
  chain<T extends keyof ChainableParams>(
    param: T,
    chainedParam: ChainableParams[T],
    value: string
  ): this {
    this.params.append(`${param}.${chainedParam}`, value);
    return this;
  }

  // Include related resources
  include(...paths: PatientIncludePaths[]): this {
    paths.forEach(path => this.params.append('_include', path));
    return this;
  }

  revInclude(...paths: PatientRevIncludePaths[]): this {
    paths.forEach(path => this.params.append('_revinclude', path));
    return this;
  }

  // Pagination and sorting
  count(n: number): this {
    this.params.set('_count', n.toString());
    return this;
  }

  offset(n: number): this {
    this.params.set('_offset', n.toString());
    return this;
  }

  sort(
    param: PatientSortableParams,
    order: 'asc' | 'desc' = 'asc'
  ): this {
    const value = order === 'desc' ? `-${param}` : param;
    this.params.append('_sort', value);
    return this;
  }

  // Summary modes
  summary(mode: 'true' | 'text' | 'data' | 'count'): this {
    this.params.set('_summary', mode);
    return this;
  }

  // Elements filtering
  elements(...elements: PatientElementPaths[]): this {
    this.params.set('_elements', elements.join(','));
    return this;
  }

  // Execute search
  async execute(): Promise<Bundle<Patient>> {
    return this.client.search('Patient', this.params);
  }

  // Get the URL for debugging
  toUrl(): string {
    return `Patient?${this.params.toString()}`;
  }
}
```

### 3. Generated Type Definitions
```typescript
// Generated types for Patient search
export type PatientSortableParams = 
  | 'name'
  | 'given'
  | 'family'
  | 'birthdate'
  | 'identifier'
  | 'telecom'
  | 'address'
  | 'address-city'
  | 'address-state'
  | 'address-postalcode';

export type PatientIncludePaths = 
  | 'Patient:general-practitioner'
  | 'Patient:organization'
  | 'Patient:link';

export type PatientRevIncludePaths =
  | 'Observation:patient'
  | 'Encounter:patient'
  | 'Condition:patient'
  | 'Procedure:patient';

export type PatientElementPaths = keyof Patient;

export interface ChainableParams {
  'general-practitioner': 'name' | 'identifier';
  'organization': 'name' | 'identifier' | 'address';
}
```

### 4. Advanced Search Features
```typescript
// Composite search parameters
export class ObservationSearchBuilder {
  // Composite parameter
  componentCodeValue(
    code: string,
    value: number,
    unit?: string
  ): this {
    const codeParam = `component-code=${code}`;
    const valueParam = unit 
      ? `component-value-quantity=${value}|${unit}`
      : `component-value-quantity=${value}`;
    this.params.append(codeParam);
    this.params.append(valueParam);
    return this;
  }

  // Multiple values with OR logic
  code(...codes: string[]): this {
    this.params.append('code', codes.join(','));
    return this;
  }

  // Date range shortcuts
  dateRange(start: Date, end: Date): this {
    this.params.append('date', `ge${start.toISOString()}`);
    this.params.append('date', `le${end.toISOString()}`);
    return this;
  }

  // Last N observations
  lastN(category: string, n: number = 1): this {
    this.params.append('category', category);
    this.params.append('_lastN', n.toString());
    return this;
  }
}
```

### 5. Client Integration
```typescript
// Integration with FHIRClient
export class FHIRClient {
  // Type-safe search builder factory
  search<T extends ResourceType>(
    resourceType: T
  ): SearchBuilderMap[T] {
    switch (resourceType) {
      case 'Patient':
        return new PatientSearchBuilder(this) as any;
      case 'Observation':
        return new ObservationSearchBuilder(this) as any;
      // ... other resources
    }
  }
}

// Usage
const patients = await client
  .search('Patient')
  .name('John')
  .birthdate('1990-01-01', 'ge')
  .organization('org-123')
  .include('Patient:general-practitioner')
  .sort('name')
  .count(10)
  .execute();
```

## Files to Create/Modify

### New Files
- `src/fhir/features/search/builder.ts`
- `src/fhir/features/search/types.ts`
- `src/fhir/features/search/extractors.ts`
- `src/fhir/generators/client/search.ts`

### Modified Files
- `src/fhir/features/search/parameters.ts`
- `src/api/generators/rest-client.ts`

## Success Criteria
- [x] Search builders generated for all resources
- [x] Full autocomplete for search parameters
- [x] Type safety prevents invalid parameters
- [x] Chaining and includes work with type safety
- [x] Complex search scenarios supported
- [x] Generated code is readable and maintainable

## Completion Notes
- ✅ Created comprehensive type-safe search builder system
- ✅ Implemented FHIRSearchBuilder with 40+ type-safe methods
- ✅ Added support for all FHIR search modifiers and comparators
- ✅ Built advanced search features: chaining, includes, composite parameters
- ✅ Created AdvancedSearchResultProcessor for result analytics
- ✅ Enhanced search parameter extraction with full FHIR support
- ✅ Integrated with REST client generator for seamless usage
- ✅ Added comprehensive type definitions and validation
- ✅ Tested and verified core functionality working

## Files Created/Enhanced
- `src/fhir/features/search/parameters.ts` - Enhanced parameter extraction
- `src/fhir/features/search/builder.ts` - Type-safe search builders
- `src/fhir/features/search/types.ts` - Search type definitions
- `src/fhir/features/search/extractors.ts` - Advanced parameter analysis
- `src/fhir/generators/client/search.ts` - Search client generation
- `src/api/generators/rest-client.ts` - Enhanced search integration

## Key Features Delivered
- Fluent API with method chaining and type safety
- Support for all FHIR search parameter types and modifiers
- Reference parameter chaining with compile-time validation
- Advanced result processing with analytics and transformation
- Promise-like interface supporting async/await
- Rich autocomplete and IDE support

## Testing
```bash
# Unit tests
bun test test/fhir/features/search/

# Integration test
bun run codegen:all
# Test search builders in TypeScript project
```

## Dependencies
- Task 001: Reorganize FHIR Module Structure
- Task 002: Enhance TypeScript Interface Generation