# Testing Framework Guide

This document provides comprehensive guidance for working with the testing framework in the Atomic EHR Codegen project.

## 📁 Test Structure

```
test/
├── unit/                    # Fast, isolated tests
│   ├── api/
│   │   └── generators/
│   │       └── base/
│   │           ├── BaseGenerator.test.ts
│   │           ├── error-handling.test.ts
│   │           └── builders/
│   │               └── FileBuilder.test.ts
│   └── typeschema/
├── integration/            # Full workflow tests
│   ├── typescript-generation.test.ts
│   ├── file-operations.test.ts
│   └── template-rendering.test.ts
├── performance/            # Performance benchmarks
│   ├── generation-speed.test.ts
│   ├── memory-usage.test.ts
│   └── large-schema.test.ts
├── helpers/               # Test utilities
│   ├── schema-helpers.ts
│   ├── file-helpers.ts
│   ├── mock-generators.ts
│   └── assertions.ts
└── fixtures/              # Test data
    ├── schemas/
    ├── templates/
    └── expected-outputs/
```

## 🚀 Quick Start

### Running Tests

```bash
# Run all tests
bun test

# Run specific test types
bun run test:unit           # Unit tests only
bun run test:integration    # Integration tests only
bun run test:performance    # Performance benchmarks
bun run test:helpers        # Test helper validation

# Development workflows
bun run test:watch          # Watch mode for development
bun run test:coverage       # Generate coverage report
bun run test:quick          # Fast unit tests only (5s timeout)
bun run test:verbose        # Detailed test output

# Quality assurance
bun run quality             # Typecheck + lint + unit tests
```

### Writing Your First Test

```typescript
import { describe, test, expect } from 'bun:test';
import { createMockSchema } from '../helpers/schema-helpers';
import { assertValidTypeScript } from '../helpers/assertions';

describe('My Feature', () => {
  test('generates valid TypeScript', () => {
    const schema = createMockSchema();
    const result = myFeature(schema);
    
    expect(result).toBeTruthy();
    assertValidTypeScript(result.content);
  });
});
```

## 🛠️ Test Utilities

### Schema Helpers

Create test schemas quickly and consistently:

```typescript
import { 
  createMockSchema, 
  createMockSchemas,
  createComplexNestedSchema,
  generateEdgeCaseSchemas 
} from '../helpers/schema-helpers';

// Single schema
const patient = createMockSchema({
  identifier: { name: 'Patient', kind: 'resource' }
});

// Multiple schemas
const resources = createMockSchemas(['Patient', 'Observation']);

// Complex nested structure
const complex = createComplexNestedSchema('DiagnosticReport');

// Edge cases for testing
const edgeCases = generateEdgeCaseSchemas();
```

### File System Testing

Use `TestFileSystem` for safe, isolated file operations:

```typescript
import { TestFileSystem } from '../helpers/file-helpers';

describe('File Operations', () => {
  let testFs: TestFileSystem;

  beforeEach(async () => {
    testFs = await TestFileSystem.createTempTestDir();
  });

  afterEach(async () => {
    await testFs.cleanup();
  });

  test('writes files correctly', async () => {
    await testFs.writeTestFile('Patient.ts', 'interface Patient {}');
    
    const exists = await testFs.fileExists('Patient.ts');
    expect(exists).toBe(true);
  });
});
```

### Custom Assertions

Domain-specific validations for better test quality:

```typescript
import { 
  assertValidTypeScript,
  assertGenerationQuality,
  assertPerformanceBenchmark,
  assertNamingConventions 
} from '../helpers/assertions';

// Validate TypeScript syntax
assertValidTypeScript(generatedContent, 'Patient.ts');

// Check generation quality standards
assertGenerationQuality(generatedFiles);

// Performance benchmarking
assertPerformanceBenchmark(actualTime, baselineTime, tolerance);

// Code style validation
assertNamingConventions(generatedContent);
```

### Mock Objects

Use mock implementations for testing without dependencies:

```typescript
import { MockLogger, TestGenerator } from '../helpers/mock-generators';

const logger = new MockLogger();
const generator = new TestGenerator({
  outputDir: '/tmp/test',
  logger: logger as any
});
```

## 📊 Test Categories

### Unit Tests
**Purpose**: Test individual components in isolation  
**Speed**: Very fast (< 100ms per test)  
**When to use**: Testing single functions, classes, or small modules

```typescript
describe('TypeMapper', () => {
  test('formats type names correctly', () => {
    const mapper = new TypeMapper();
    expect(mapper.formatTypeName('patient')).toBe('Patient');
  });
});
```

### Integration Tests
**Purpose**: Test component interactions and workflows  
**Speed**: Medium (100ms - 2s per test)  
**When to use**: Testing complete features end-to-end

```typescript
describe('Generation Workflow', () => {
  test('generates complete TypeScript project', async () => {
    const schemas = loadRealSchemas();
    const generator = new TypeScriptGenerator(options);
    
    const results = await generator.generate(schemas);
    
    assertGenerationQuality(results);
    // Test file system integration
    // Test template processing
    // Test error handling
  });
});
```

### Performance Tests
**Purpose**: Ensure code meets performance requirements  
**Speed**: Slow (2s+ per test)  
**When to use**: Validating scalability and resource usage

```typescript
describe('Performance', () => {
  test('generates 100 schemas under 4 seconds', async () => {
    const schemas = createMockSchemas(100);
    
    const startTime = performance.now();
    await generator.build(schemas);
    const duration = performance.now() - startTime;
    
    assertPerformanceBenchmark(duration, 4000, 0.1);
  });
});
```

## 🎯 Testing Best Practices

### 1. Test Naming
Use descriptive, specific test names:

```typescript
// ❌ Bad
test('handles errors');

// ✅ Good
test('throws SchemaValidationError when identifier is missing');
```

### 2. Arrange-Act-Assert Pattern

```typescript
test('formats file names correctly', () => {
  // Arrange
  const mapper = new TypeMapper();
  const inputName = 'patient-resource';
  
  // Act
  const result = mapper.formatFileName(inputName);
  
  // Assert
  expect(result).toBe('PatientResource');
});
```

### 3. Test One Thing at a Time

```typescript
// ❌ Bad - tests multiple concepts
test('generator works correctly', async () => {
  const result = await generator.generate(schemas);
  expect(result.length).toBe(5);
  expect(result[0].content).toContain('interface');
  expect(result[0].exports).toContain('Patient');
  // ... many more assertions
});

// ✅ Good - focused tests
test('generates correct number of files', async () => {
  const result = await generator.generate(schemas);
  expect(result).toHaveLength(5);
});

test('generates valid TypeScript interfaces', async () => {
  const result = await generator.generate(schemas);
  result.forEach(file => assertValidTypeScript(file.content));
});
```

### 4. Use Helpers for Common Operations

```typescript
// ❌ Repetitive setup
test('test 1', async () => {
  const testFs = await TestFileSystem.createTempTestDir();
  const logger = new MockLogger();
  const generator = new TestGenerator({ outputDir: testFs.getPath() });
  // ... test code
  await testFs.cleanup();
});

// ✅ Use beforeEach/afterEach
describe('Generator Tests', () => {
  let testFs: TestFileSystem;
  let generator: TestGenerator;

  beforeEach(async () => {
    testFs = await TestFileSystem.createTempTestDir();
    generator = new TestGenerator({ outputDir: testFs.getPath() });
  });

  afterEach(async () => {
    await testFs.cleanup();
  });

  test('test 1', async () => {
    // Clean test code focused on the actual test
  });
});
```

## 🐛 Debugging Tests

### Common Issues

1. **File System Conflicts**
   ```typescript
   // Always clean up test files
   afterEach(async () => {
     await testFs.cleanup();
   });
   ```

2. **Memory Leaks in Performance Tests**
   ```typescript
   // Force garbage collection in performance tests
   if (global.gc) {
     global.gc();
   }
   ```

3. **Timing Issues**
   ```typescript
   // Use proper async/await
   test('async operation', async () => {
     await generator.generate(schemas); // Don't forget await!
   });
   ```

### Debugging Commands

```bash
# Run single test file
bun test test/unit/specific-file.test.ts

# Run with verbose output
bun test --verbose test/integration/

# Run with timeout for debugging
bun test --timeout 60000 test/performance/

# Debug specific test pattern
bun test --grep "schema validation"
```

## 📈 Coverage and Quality

### Coverage Goals
- **Unit Tests**: > 95% line coverage
- **Integration Tests**: > 80% branch coverage
- **Overall**: > 90% combined coverage

### Quality Metrics
```bash
# Check all quality metrics
bun run quality

# Individual checks
bun run typecheck       # TypeScript errors
bun run lint           # Code style and issues
bun run test:coverage  # Test coverage
```

### CI/CD Integration
```bash
# Run in CI environment
bun run test:ci
```

## 🔧 Extending the Framework

### Adding New Test Helpers

1. Create helper in `test/helpers/`
2. Export from the helper module
3. Add tests for the helper itself
4. Document usage in this README

### Adding New Assertions

```typescript
// test/helpers/assertions.ts
export function assertMyCustomThing(value: unknown): void {
  // Custom validation logic
  expect(value).toSatisfy(myCustomCondition);
}
```

### Performance Benchmarks

```typescript
// Set baseline performance targets
const PERFORMANCE_TARGETS = {
  singleSchema: 50,    // ms
  tenSchemas: 200,     // ms
  hundredSchemas: 2000 // ms
};
```

## 📚 Additional Resources

- [Bun Test Runner Documentation](https://bun.sh/docs/cli/test)
- [Testing TypeScript](https://typescript-eslint.io/docs/development/testing/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

---

Remember: Good tests are your safety net. Invest in them early and maintain them well! 🛡️