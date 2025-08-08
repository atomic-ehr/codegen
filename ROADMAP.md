# Atomic FHIR Codegen Roadmap

This document outlines the development roadmap for Atomic FHIR Codegen, focusing on expanding code generation capabilities beyond TypeScript types to include REST clients, search builders, and operation generators.

## Current Status ✅

- [x] **Core TypeSchema Pipeline** - Three-stage architecture (Parse → Transform → Generate)
- [x] **TypeScript Generation** - Full FHIR R4 type generation with inheritance
- [x] **FHIR Package Support** - Support for hl7.fhir.r4.core package
- [x] **Fluent API** - High-level APIBuilder with chainable methods
- [x] **CLI Interface** - Command-line tools for generation
- [x] **Configuration System** - File-based and programmatic configuration
- [x] **Comprehensive Testing** - 72+ tests covering core functionality

## Partial Implementation 🚧

- [~] **Profile & Extension Handling** - Basic profile parsing (US Core profiles in active development)
- [~] **Multi-Package Support** - Core packages work, custom packages need refinement

## Phase 0: Complete Core Foundation 🏗️

**Target: Q1 2024 (Current Priority)**

### 0.1 Complete Profile & Extension Support

Finish implementation of FHIR profile and extension handling that was started but not completed.

```typescript
// Full profile support (target implementation)
await builder
  .fromPackage('hl7.fhir.us.core', '5.0.1')
  .withDependencies(['hl7.fhir.r4.core@4.0.1'])
  .typescript({
    outputDir: './generated/us-core',
    includeProfiles: true,
    includeExtensions: true
  })
  .generate();
```

**Current Issues:**
- Profile dependency resolution needs refinement
- Extension handling requires completion
- US Core package integration needs debugging
- Complex profile constraints not fully implemented

**Implementation Plan:**
1. Fix profile dependency resolution in transformer
2. Complete extension field generation
3. Add profile constraint validation
4. Test with US Core profiles thoroughly
5. Add comprehensive profile examples

### 0.2 Multi-Package Dependencies

Complete support for packages with complex dependencies.

**Features:**
- Proper dependency resolution between packages
- Version compatibility checking
- Circular dependency detection
- Incremental package loading

## Phase 1: REST Client Foundation 🚀

**Target: Q2 2024**

### 1.1 REST Client Generator

Generate type-safe FHIR REST clients based on fetch API with full TypeScript support.

```typescript
// Generated REST client usage
const client = new FHIRClient({
  baseUrl: 'https://hapi.fhir.org/baseR4',
  auth: { type: 'bearer', token: 'xxx' }
});

// Type-safe resource operations
const patient = await client.Patient.read('123');
const bundle = await client.Patient.search({ 
  name: 'Smith', 
  birthdate: 'gt2000-01-01' 
});
```

**Features:**
- Fetch-based HTTP client with configurable adapters
- Type-safe CRUD operations for all resources
- Automatic request/response serialization
- Built-in error handling and retry logic
- Support for Bundle operations (batch/transaction)
- Configurable base URLs and authentication

**Implementation Plan:**
1. Create REST client generator in `src/api/generators/rest-client.ts`
2. Add HTTP adapter system with fetch implementation
3. Generate resource-specific client classes
4. Add authentication strategies (OAuth2, Bearer, Basic)
5. Implement error handling and response parsing
6. Add comprehensive documentation and examples

### 1.2 APIBuilder Integration

```typescript
await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .typescript({
    outputDir: './generated/types'
  })
  .restClient({
    outputDir: './generated/client',
    clientName: 'MyFHIRClient',
    baseUrl: 'https://api.example.com/fhir',
    authType: 'oauth2',
    generateMocks: true
  })
  .generate();
```

## Phase 2: Smart Chained Search 🔍

**Target: Q3 2024**

### 2.1 Search Parameter Analysis

Analyze FHIR SearchParameters and generate intelligent search builders.

```typescript
// Generated smart search
const results = await client.Patient
  .search()
  .name().contains('Smith')
  .birthdate().greaterThan('2000-01-01')
  .address().city().equals('Boston')
  .include('Patient:organization')
  .sort('birthdate', 'desc')
  .count(50)
  .execute();
```

**Features:**
- Type-safe search parameter methods
- Intelligent parameter validation
- Chain-able search conditions
- Support for all FHIR search modifiers (`:exact`, `:contains`, etc.)
- Include/RevInclude support
- Sorting and pagination
- Complex search expressions

**Implementation Plan:**
1. Parse SearchParameter resources from FHIR packages
2. Generate search parameter type definitions
3. Create chained search builder classes
4. Implement search modifiers and operators
5. Add include/revinclude support
6. Generate search result typing

### 2.2 Advanced Search Features

```typescript
// Complex search with chaining
const observations = await client.Observation
  .search()
  .subject().reference('Patient/123')
  .code().in(['85354-9', '8480-6', '8462-4']) // Blood pressure codes
  .date().between('2023-01-01', '2023-12-31')
  .value()
    .quantity().greaterThan(120, 'mmHg')  // Systolic > 120
    .or()
    .quantity().greaterThan(80, 'mmHg')   // Diastolic > 80
  .include('Observation:subject')
  .execute();

// Composite search parameters
const results = await client.Observation
  .search()
  .component().code('8480-6').value().greaterThan(140, 'mmHg')
  .execute();
```

## Phase 3: Operation Generation 🔧

**Target: Q4 2024**

### 3.1 FHIR Operation Support

Generate type-safe methods for FHIR operations defined in OperationDefinition resources.

```typescript
// Generated operation methods
const result = await client.Patient
  .operation('$match')
  .withParameters({
    resource: patient,
    onlyCertainMatches: true
  })
  .execute();

// System-level operations
const capabilityStatement = await client.system
  .operation('$meta')
  .execute();

// Custom operations
const validated = await client.Questionnaire
  .instance('q123')
  .operation('$validate')
  .withParameters({
    mode: 'create',
    profile: 'http://example.org/profile'
  })
  .execute();
```

**Features:**
- Type-safe operation parameters
- Support for instance, type, and system-level operations
- Input/output parameter validation
- Async operation support
- Custom operation definitions
- Operation result typing

**Implementation Plan:**
1. Parse OperationDefinition resources
2. Generate operation parameter types
3. Create operation method generators
4. Implement parameter validation
5. Add async operation support
6. Generate comprehensive operation documentation

### 3.2 Workflow Operations

```typescript
// Workflow operations with type safety
const taskBundle = await client.Task
  .operation('$process-workflow')
  .withParameters({
    workflow: workflowDefinition,
    input: inputParameters
  })
  .execute();

// Bulk operations
const exportResult = await client.system
  .operation('$export')
  .withParameters({
    _type: ['Patient', 'Observation'],
    _since: '2024-01-01',
    _outputFormat: 'ndjson'
  })
  .execute();
```

## Phase 4: Enhanced Client Features 🚀

**Target: Q1 2025**

### 4.1 Advanced Client Capabilities

```typescript
const client = new FHIRClient({
  baseUrl: 'https://api.example.com/fhir',
  auth: { 
    type: 'oauth2',
    clientId: 'my-app',
    scope: 'patient/*.read'
  },
  interceptors: [
    new RetryInterceptor({ maxRetries: 3 }),
    new CacheInterceptor({ ttl: 300000 }),
    new LoggingInterceptor({ level: 'debug' })
  ]
});

// Batch operations with transactions
const batch = client.batch()
  .create(newPatient)
  .update(existingPatient)
  .delete('Patient', 'old-id')
  .conditional('Patient')
    .ifNoneExist({ identifier: 'MRN-123' })
    .create(conditionalPatient)
  .execute();

// Subscription support
const subscription = await client.Subscription
  .create({
    criteria: 'Patient?_lastUpdated=gt2024-01-01',
    channel: {
      type: 'websocket',
      endpoint: 'wss://my-app.com/fhir-notifications'
    }
  });
```

**Features:**
- HTTP interceptor system
- Caching strategies
- Retry logic with exponential backoff
- Batch/transaction support
- Subscription management
- Connection pooling
- Request/response logging
- Metrics collection

### 4.2 Testing & Mocking

```typescript
// Generated mock data
const mockClient = new MockFHIRClient({
  data: await generateMockData([
    { resourceType: 'Patient', count: 100 },
    { resourceType: 'Observation', count: 500 }
  ])
});

// Test helpers
const testSuite = new FHIRTestSuite(client);
await testSuite.validateConformance();
await testSuite.testCRUDOperations(['Patient', 'Observation']);
await testSuite.testSearchParameters('Patient');
```

## Phase 5: Multi-Language Support 🌍

**Target: Q2 2025**

### 5.1 Python REST Client

```python
from fhir_client import FHIRClient

client = FHIRClient(base_url='https://api.example.com/fhir')

# Type-safe operations with Python typing
patient: Patient = await client.Patient.read('123')
bundle: Bundle[Patient] = await client.Patient.search(name='Smith')

# Chained search
results = await (client.Observation
    .search()
    .subject().reference('Patient/123')
    .code().in_(['85354-9'])
    .date().greater_than('2023-01-01')
    .execute())
```

### 5.2 Rust Client Generation

```rust
use fhir_client::{FHIRClient, Patient, Observation};

let client = FHIRClient::new("https://api.example.com/fhir").await?;

// Type-safe with Rust's type system
let patient: Patient = client.Patient.read("123").await?;
let bundle: Bundle<Patient> = client.Patient
    .search()
    .name("Smith")
    .birthdate_gt("2000-01-01")
    .execute()
    .await?;
```

## Phase 6: Advanced Features 🎯

**Target: Q3 2025**

### 6.1 GraphQL Schema Generation

```typescript
// Generate GraphQL schemas from FHIR
await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .graphql({
    outputDir: './generated/graphql',
    includeSearch: true,
    includeOperations: true
  })
  .generate();
```

### 6.2 OpenAPI Specification

```typescript
// Generate OpenAPI specs
await builder
  .fromPackage('hl7.fhir.r4.core', '4.0.1')
  .openapi({
    outputDir: './generated/openapi',
    version: '3.0.3',
    includeExamples: true
  })
  .generate();
```

### 6.3 Validation & Guards

```typescript
// Runtime validation
import { validatePatient, isPatient } from './generated/validators';

const data = await response.json();
if (isPatient(data)) {
  // TypeScript knows data is Patient
  const validation = validatePatient(data);
  if (validation.isValid) {
    // Use validated patient
  }
}
```

## Implementation Details

### Architecture Enhancements

1. **Plugin System**: Extensible plugin architecture for custom generators
2. **Caching Layer**: Intelligent caching of parsed schemas and generated code
3. **Incremental Generation**: Only regenerate changed schemas
4. **Source Maps**: Generate source maps for debugging
5. **Documentation**: Auto-generated documentation from FHIR specifications

### Performance Optimizations

1. **Streaming Parsing**: Handle large FHIR packages efficiently
2. **Parallel Generation**: Concurrent code generation
3. **Tree Shaking**: Generate only needed code
4. **Bundle Splitting**: Split large generated files
5. **CDN Support**: Generate CDN-friendly packages

### Developer Experience

1. **VS Code Extension**: IntelliSense for FHIR resources
2. **CLI Enhancements**: Interactive configuration wizard
3. **Hot Reload**: Watch mode for development
4. **Debugging Tools**: Enhanced error reporting and debugging
5. **Migration Tools**: Upgrade helpers for API changes

## Breaking Changes & Migration

### Version 2.0.0 (Phase 2)
- REST client integration may require API changes
- New configuration options for client generation

### Version 3.0.0 (Phase 4)
- Enhanced client architecture
- Potential breaking changes in generated client APIs

### Version 4.0.0 (Phase 5)
- Multi-language support architecture
- Possible TypeScript generator API changes

## Success Metrics

1. **Performance**: Generation time < 10s for FHIR R4 core
2. **Bundle Size**: Generated client < 500kb gzipped
3. **Type Safety**: 100% type coverage for generated APIs
4. **Compatibility**: Support for 95% of FHIR R4 features
5. **Adoption**: 1000+ GitHub stars, 10k+ monthly downloads

## Community & Ecosystem

1. **Plugin Marketplace**: Community-contributed generators
2. **Template Library**: Reusable configuration templates
3. **Integration Examples**: Real-world implementation guides
4. **Training Materials**: Workshops and documentation
5. **Certification Program**: FHIR implementation validation

---

**Last Updated**: January 2024  
**Next Review**: March 2024

This roadmap is a living document and will be updated based on community feedback, technical discoveries, and changing requirements in the FHIR ecosystem.