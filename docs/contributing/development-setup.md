# Contributing to Base Generator System

Welcome! We're excited to have you contribute to the Base Generator System. This guide will help you get set up and contributing effectively.

## 🎯 Quick Start for Contributors

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/atomic-ehr-codegen.git
cd atomic-ehr-codegen

# 2. Install dependencies
bun install

# 3. Run tests to verify setup
bun test

# 4. Start developing!
bun run typecheck  # Type checking
bun run lint       # Code formatting
```

## 📋 Development Requirements

### System Requirements
- **Bun**: v1.0.0 or later (primary runtime)
- **Node.js**: v18+ (for compatibility testing)
- **Git**: Latest version
- **VS Code**: Recommended editor with TypeScript support

### Recommended VS Code Extensions
```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "biomejs.biome",
    "ms-vscode.test-adapter-converter",
    "github.copilot"
  ]
}
```

## 🏗️ Project Structure

```
atomic-ehr-codegen/
├── src/                           # Source code
│   ├── api/                       # High-level API
│   │   └── generators/
│   │       └── base/              # Base generator system
│   │           ├── BaseGenerator.ts
│   │           ├── FileBuilder.ts
│   │           ├── TypeMapper.ts
│   │           └── enhanced-errors.ts
│   ├── typeschema/                # TypeSchema processing
│   └── cli/                       # CLI interface
├── test/                          # Test files
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   ├── performance/               # Performance tests
│   └── helpers/                   # Test utilities
├── docs/                          # Documentation
├── tasks/                         # Development tasks
└── generated/                     # Generated output (gitignored)
```

## 🔧 Development Workflow

### 1. Setting Up Your Environment

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/atomic-ehr-codegen.git
cd atomic-ehr-codegen

# Add upstream remote
git remote add upstream https://github.com/atomic-ehr/codegen.git

# Install dependencies
bun install

# Verify setup
bun test
bun run typecheck
bun run lint
```

### 2. Creating a Feature Branch

```bash
# Update main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/issue-number-description
```

### 3. Development Process

```bash
# Make your changes
# ...

# Run tests frequently during development
bun test --watch

# Type check your changes
bun run typecheck

# Format code
bun run lint

# Run full test suite before committing
bun test --coverage
```

### 4. Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Feature additions
git commit -m "feat: add support for Python generators"

# Bug fixes
git commit -m "fix: resolve TypeScript validation errors"

# Documentation
git commit -m "docs: update API reference for BaseGenerator"

# Tests
git commit -m "test: add unit tests for FileBuilder"

# Refactoring
git commit -m "refactor: simplify type mapping logic"

# Performance improvements
git commit -m "perf: optimize schema processing for large datasets"
```

## 🧪 Testing Guidelines

### Running Tests

```bash
# Run all tests
bun test

# Run specific test suites
bun test test/unit/                    # Unit tests only
bun test test/integration/             # Integration tests only
bun test test/performance/             # Performance tests only

# Run tests with coverage
bun test --coverage

# Run tests in watch mode during development
bun test --watch
```

### Writing Tests

#### Unit Tests
```typescript
// test/unit/api/generators/base/MyFeature.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { MyFeature } from '../../../../../src/api/generators/base/MyFeature';

describe('MyFeature', () => {
  let feature: MyFeature;
  
  beforeEach(() => {
    feature = new MyFeature();
  });
  
  test('should handle basic functionality', () => {
    const result = feature.process('input');
    expect(result).toBe('expected-output');
  });
  
  test('should throw error for invalid input', () => {
    expect(() => feature.process('')).toThrow('Input cannot be empty');
  });
});
```

#### Integration Tests
```typescript
// test/integration/feature-workflow.test.ts
import { describe, test, expect } from 'bun:test';
import { BaseGenerator } from '../../src/api/generators/base/BaseGenerator';
import { TestGenerator, TestFileSystem } from '../helpers';

describe('Feature Workflow Integration', () => {
  test('should complete full generation workflow', async () => {
    const fileSystem = new TestFileSystem('./test-output');
    await fileSystem.setup();
    
    const generator = new TestGenerator({
      outputDir: fileSystem.getPath()
    });
    
    const schemas = createTestSchemas();
    const results = await generator.generate(schemas);
    
    expect(results.length).toBeGreaterThan(0);
    expect(await fileSystem.fileExists('TestSchema.test')).toBe(true);
    
    await fileSystem.cleanup();
  });
});
```

### Test Coverage Requirements

- **Minimum Coverage**: 95% for new code
- **Unit Tests**: All public methods and error conditions
- **Integration Tests**: End-to-end workflows
- **Performance Tests**: Critical performance paths

## 🎨 Code Style Guidelines

### TypeScript Standards

```typescript
// ✅ Good: Use explicit types
interface GeneratorOptions {
  outputDir: string;
  verbose?: boolean;
}

// ❌ Avoid: Implicit any types
function process(options) {
  // TypeScript can't help here
}

// ✅ Good: Use async/await
async function generateFiles(): Promise<GeneratedFile[]> {
  const results = await processor.process();
  return results.map(transform);
}

// ❌ Avoid: Promise chains when async/await is clearer
function generateFiles(): Promise<GeneratedFile[]> {
  return processor.process()
    .then(results => results.map(transform));
}
```

### Naming Conventions

```typescript
// Classes: PascalCase
export class TypeScriptGenerator extends BaseGenerator {}

// Interfaces: PascalCase with descriptive names
export interface GeneratorOptions {}
export interface TemplateContext {}

// Functions: camelCase with verb + noun
function generateSchemaContent(): string {}
function validateTypeScript(): void {}

// Constants: SCREAMING_SNAKE_CASE
const DEFAULT_OUTPUT_DIR = './generated';
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Files: kebab-case for multi-word names
// enhanced-errors.ts
// type-mapper.ts
// base-generator.ts
```

### Error Handling

```typescript
// ✅ Good: Use specific error types
if (!schema.identifier) {
  throw new EnhancedSchemaValidationError(
    'Schema missing required identifier',
    schema,
    {
      suggestions: [
        'Add identifier.name property',
        'Add identifier.kind property'
      ]
    }
  );
}

// ❌ Avoid: Generic errors without context
if (!schema.identifier) {
  throw new Error('Invalid schema');
}
```

### Documentation

```typescript
/**
 * Generates TypeScript interfaces from FHIR schemas
 * 
 * @param schemas - Array of TypeSchema documents to process
 * @param options - Generation configuration options
 * @returns Promise resolving to generated file information
 * 
 * @example
 * ```typescript
 * const generator = new TypeScriptGenerator({ outputDir: './types' });
 * const results = await generator.generate(schemas);
 * console.log(`Generated ${results.length} files`);
 * ```
 * 
 * @throws {EnhancedSchemaValidationError} When schema validation fails
 * @throws {EnhancedFileOperationError} When file operations fail
 */
async generate(schemas: TypeSchema[], options?: GenerateOptions): Promise<GeneratedFile[]> {
  // Implementation
}
```

## 📚 Documentation Standards

### When to Update Documentation

- **New Features**: Always update relevant docs
- **API Changes**: Update API reference immediately
- **Bug Fixes**: Update troubleshooting if applicable
- **Performance Changes**: Update performance guides

### Documentation Types

1. **API Reference** (`docs/api-reference/`): Technical specifications
2. **Guides** (`docs/guides/`): How-to documentation
3. **Examples** (`docs/examples/`): Working code samples
4. **Getting Started** (`docs/getting-started/`): Beginner-friendly content

### Writing Style

```markdown
<!-- ✅ Good: Clear, action-oriented headings -->
## Creating Your First Generator
## Handling Validation Errors
## Testing Performance

<!-- ❌ Avoid: Vague headings -->
## About Generators
## Some Information
## Details

<!-- ✅ Good: Code examples with explanations -->
The following example shows how to handle schema validation:

```typescript
try {
  await generator.generate(schemas);
} catch (error) {
  if (error instanceof EnhancedSchemaValidationError) {
    console.error('Validation failed:', error.getFormattedMessage());
  }
}
```

This approach provides specific error handling for schema validation failures.
```

## 🔍 Code Review Process

### Before Submitting

- [ ] All tests pass (`bun test`)
- [ ] Code is properly typed (`bun run typecheck`)
- [ ] Code is formatted (`bun run lint`)
- [ ] Documentation is updated
- [ ] Examples work as described
- [ ] Performance impact is considered

### Pull Request Template

```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All existing tests pass
- [ ] Manual testing completed

## Documentation
- [ ] API documentation updated
- [ ] User guides updated
- [ ] Examples updated
- [ ] CHANGELOG.md updated

## Performance Impact
- [ ] No performance impact
- [ ] Performance improvement
- [ ] Potential performance regression (explain)

## Breaking Changes
List any breaking changes and migration steps.

## Additional Context
Any additional context or screenshots.
```

### Review Criteria

Reviewers will check:

1. **Functionality**: Does it work as intended?
2. **Tests**: Are there adequate tests?
3. **Documentation**: Is it properly documented?
4. **Performance**: Any performance implications?
5. **Breaking Changes**: Are they necessary and documented?
6. **Code Quality**: Is it maintainable and readable?

## 🐛 Bug Report Guidelines

### Before Reporting

1. **Search existing issues** for duplicates
2. **Try the latest version** to see if it's already fixed
3. **Reproduce with minimal example** 
4. **Check troubleshooting guide** for known solutions

### Bug Report Template

```markdown
**Bug Description**
Clear description of what the bug is.

**Environment**
- Bun version: 
- Node.js version: 
- OS: 
- Package version: 

**To Reproduce**
Steps to reproduce the behavior:
1. Create generator with options '...'
2. Run generation with schemas '...'
3. See error

**Expected Behavior**
What should happen instead.

**Actual Behavior**
What actually happens.

**Code Sample**
```typescript
// Minimal code that reproduces the issue
const generator = new MyGenerator({ outputDir: './test' });
await generator.generate(schemas); // Fails here
```

**Error Output**
```
Full error message and stack trace
```

**Additional Context**
Screenshots, logs, or other helpful context.
```

## 🚀 Feature Request Guidelines

### Feature Request Template

```markdown
**Feature Summary**
One-sentence description of the feature.

**Problem Statement**
What problem does this solve? Why is it needed?

**Proposed Solution**
Detailed description of how it should work.

**Alternative Solutions**
Other approaches you've considered.

**Usage Example**
```typescript
// How the feature would be used
const generator = new Generator({
  newFeature: true
});
```

**Breaking Changes**
Would this introduce breaking changes?

**Implementation Notes**
Any technical considerations or constraints.
```

## 📈 Performance Guidelines

### Performance Testing

```typescript
// Add performance tests for new features
import { performance } from 'perf_hooks';

test('generation completes within time limit', async () => {
  const schemas = createLargeSchemaSet(1000);
  const generator = new MyGenerator({ outputDir: './test' });
  
  const startTime = performance.now();
  await generator.build(schemas); // Use build() for testing (no I/O)
  const duration = performance.now() - startTime;
  
  // Should complete within 10 seconds for 1000 schemas
  expect(duration).toBeLessThan(10000);
});
```

### Memory Guidelines

```typescript
// Monitor memory usage for large operations
test('memory usage stays reasonable', async () => {
  const initialMemory = process.memoryUsage().heapUsed;
  
  const schemas = createLargeSchemaSet(1000);
  await generator.build(schemas);
  
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
  
  // Should not use more than 100MB for 1000 schemas
  expect(memoryIncrease).toBeLessThan(100);
});
```

## 🎯 Getting Started with Your First Contribution

### Good First Issues

Look for issues labeled:
- `good first issue` - Perfect for newcomers
- `documentation` - Help improve docs
- `tests` - Add missing test coverage
- `help wanted` - Community input needed

### Suggested First Contributions

1. **Add a new TypeMapper method**
2. **Improve error messages**
3. **Add test cases for edge conditions**
4. **Update documentation examples**
5. **Fix TypeScript warnings**

### Development Environment Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/atomic-ehr-codegen.git
cd atomic-ehr-codegen

# 3. Set up development environment
bun install
code .  # Open in VS Code

# 4. Run initial checks
bun test              # Verify tests pass
bun run typecheck     # Check TypeScript
bun run lint          # Check formatting

# 5. Create your first branch
git checkout -b my-first-contribution

# 6. Make a small change (like fixing a typo in docs)
# 7. Commit and push
git add .
git commit -m "docs: fix typo in contributing guide"
git push origin my-first-contribution

# 8. Create pull request on GitHub
```

## 🤝 Community Guidelines

### Code of Conduct

- **Be respectful** and inclusive
- **Help others** learn and contribute
- **Assume good intentions**
- **Focus on constructive feedback**
- **Celebrate others' contributions**

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community chat
- **Pull Requests**: Code review and collaboration

### Getting Help

- **Check documentation first**: Often answers are already available
- **Search existing issues**: Your question might be answered
- **Ask in discussions**: Community is helpful and welcoming
- **Tag maintainers**: Use @mentions sparingly for urgent issues

## 📄 Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backwards compatible
- **PATCH** (0.0.1): Bug fixes, backwards compatible

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version number bumped
- [ ] Git tag created
- [ ] NPM package published
- [ ] GitHub release created

## 🎉 Recognition

Contributors are recognized in:

- **CONTRIBUTORS.md**: All contributors listed
- **Release notes**: Major contributions highlighted
- **Documentation**: Example authors credited
- **GitHub**: Contributor graphs and statistics

Thank you for contributing to the Base Generator System! Your help makes this project better for everyone. 🚀

## 📚 Additional Resources

- [Project Roadmap](../PROJECT_ROADMAP.md)
- [Architecture Guide](../guides/architecture.md)
- [API Documentation](../api-reference/)
- [Examples](../examples/)
- [Troubleshooting](../getting-started/troubleshooting.md)