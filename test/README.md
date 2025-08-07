# Testing Framework

This directory contains the comprehensive testing framework for the atomic-ehr codegen project.

## Overview

Our testing strategy covers multiple layers:

- **Unit Tests**: Individual component testing
- **Integration Tests**: Multi-component workflow testing  
- **E2E Tests**: Complete CLI workflow testing
- **Benchmarks**: Performance and scalability testing
- **Snapshots**: Generated code consistency testing

## Quick Start

```bash
# Run all tests
bun test

# Run with coverage
bun test:coverage

# Run specific test suites
bun test:unit          # Unit tests only
bun test:integration   # Integration tests only
bun test:e2e          # End-to-end tests only
bun test:benchmarks   # Performance benchmarks

# Watch mode for development
bun test:watch
```

## Directory Structure

```
test/
├── setup.ts              # Global test setup and configuration
├── utils.ts               # Test utilities and helpers
├── fixtures/              # Test data and schemas
│   ├── patient-schema.json
│   ├── observation-schema.json
│   └── primitive-schemas.json
├── snapshots/             # Expected output snapshots
│   ├── *.snap            # Snapshot files
│   └── README.md         # Snapshot documentation
├── unit/                  # Unit tests
│   ├── lib/
│   ├── fhir/
│   └── core/
├── integration/           # Integration tests
│   ├── full-workflow.test.ts
│   └── api-compatibility.test.ts
├── e2e/                  # End-to-end CLI tests
│   └── cli-commands.test.ts
└── benchmarks/           # Performance benchmarks
    └── performance.test.ts
```

## Test Configuration

### Bun Configuration (`bunfig.toml`)
- Preloads global test setup
- Configures test environment
- Sets up coverage collection

### Performance Thresholds
- TypeSchema generation: <1000ms for small schemas
- Code generation: <2000ms for moderate schemas  
- File operations: <500ms
- Memory usage: <100MB increase

## Writing Tests

### Unit Tests
```typescript
import { describe, it, expect } from 'bun:test';

describe('MyComponent', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

### Using Test Utilities
```typescript
// Create test schemas
const schema = testUtils.schema.createPatient();
const collection = testUtils.schema.createCollection();

// File system operations
const tempDir = testUtils.fs.createTempDir('test-name');
testUtils.fs.writeFile(path, content);

// Performance measurement
await testUtils.performance.measure('operation', async () => {
  // code to measure
});

// Snapshot testing
testUtils.snapshot.expectToMatchSnapshot('test-name', content);
```

### Integration Tests
Test complete workflows across multiple components:

```typescript
const builder = new APIBuilder();
const result = await builder
  .fromSchemas(schemas)
  .typescript()
  .build();
```

### E2E Tests  
Test CLI commands end-to-end:

```typescript
const result = await executeCLI(['generate', 'typescript', '--input', 'test.ndjson']);
expect(result.exitCode).toBe(0);
```

## Coverage Goals

- **Target**: >95% coverage across all metrics
- **Lines**: >95%
- **Functions**: >95%  
- **Branches**: >95%
- **Statements**: >95%

## Snapshot Testing

Snapshots capture expected generated code output:

- Run tests to create initial snapshots
- Update with `UPDATE_SNAPSHOTS=1 bun test` when output changes
- Review all snapshot updates before committing

## Performance Benchmarks

Benchmarks ensure scalability:

- **Small**: <5 schemas, <500ms
- **Medium**: <25 schemas, <2000ms  
- **Large**: <100 schemas, <10000ms
- **Memory**: <100MB increase per operation

## Continuous Integration

For CI environments:
```bash
bun test:ci  # Coverage + fail fast
```

## Test Data

### Fixtures
- `patient-schema.json`: Complete Patient resource schema
- `observation-schema.json`: Observation with choice types
- `primitive-schemas.json`: All FHIR primitive types

### Mock Data
Use test utilities to create consistent mock data:

```typescript
const packageInfo = testUtils.mock.createPackageInfo();
const console = testUtils.mock.createConsole();
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Performance**: Use performance assertions for critical operations
3. **Snapshots**: Review and commit all snapshot updates
4. **Error Cases**: Test both success and failure scenarios
5. **Memory**: Monitor memory usage in benchmarks
6. **Cleanup**: Always cleanup temporary resources

## Debugging

- Set `TEST_VERBOSE=1` to see detailed test output
- Use `testUtils.performance.measure` for timing analysis
- Check `test-temp/` directory for test artifacts during debugging
- Review generated snapshots in `test/snapshots/`

## Contributing

When adding new features:

1. Add unit tests for individual components
2. Add integration tests for workflows  
3. Update benchmarks for performance-critical code
4. Add E2E tests for new CLI commands
5. Update snapshots for output changes