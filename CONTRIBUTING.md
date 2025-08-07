# Contributing to @atomic-ehr/codegen

Thank you for your interest in contributing to atomic-codegen! This guide will help you get started with development and understand our contribution process.

## 🚀 Quick Start

### Prerequisites

- **[Bun](https://bun.sh/)** 1.0+ (recommended) or Node.js 18+
- **TypeScript** 5.0+
- **Git** for version control

### Development Setup

1. **Fork and Clone**
   ```bash
   # Fork the repository on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/codegen.git
   cd codegen
   ```

2. **Install Dependencies**
   ```bash
   # Using Bun (recommended)
   bun install
   
   # Or using npm
   npm install
   ```

3. **Build the Project**
   ```bash
   bun run build
   ```

4. **Run Tests**
   ```bash
   # Run all tests
   bun test
   
   # Run tests in watch mode
   bun test --watch
   
   # Run specific test file
   bun test test/api/builder.test.ts
   ```

5. **Start Development Mode**
   ```bash
   # Watch mode with automatic rebuilding
   bun run dev
   ```

## 📁 Project Structure

Understanding the codebase structure will help you navigate and contribute effectively:

```
atomic-codegen/
├── src/                          # Source code
│   ├── api/                      # High-level API
│   │   ├── builder.ts           # Main APIBuilder class
│   │   ├── generators/          # Code generators
│   │   │   ├── typescript.ts    # TypeScript generator
│   │   │   └── rest-client.ts   # REST client generator
│   │   └── index.ts             # API exports
│   ├── cli/                      # Command-line interface
│   │   ├── commands/            # CLI commands
│   │   │   ├── generate.ts      # Generate command
│   │   │   └── index.ts         # Command exports
│   │   └── index.ts             # CLI entry point
│   ├── config/                   # Configuration system
│   │   ├── loader.ts            # Config file loading
│   │   ├── schema.ts            # Config validation
│   │   └── types.ts             # Config types
│   ├── core/                     # Core utilities
│   │   ├── utils/               # Utility functions
│   │   ├── types/               # Core type definitions
│   │   └── errors/              # Error classes
│   ├── typeschema/              # TypeSchema processing
│   │   ├── parser.ts            # Schema parsing
│   │   ├── transformer.ts       # Schema transformation
│   │   ├── validator.ts         # Schema validation
│   │   ├── cache.ts             # Caching system
│   │   └── types.ts             # TypeSchema types
│   └── index.ts                 # Main entry point
├── test/                         # Test suite
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   ├── fixtures/                # Test data
│   └── helpers/                 # Test utilities
├── examples/                     # Real-world examples
│   ├── frontend-app/            # React healthcare app
│   └── healthcare-api/          # FHIR REST API
├── docs/                        # Documentation
├── scripts/                     # Build and utility scripts
└── generated/                   # Generated output (gitignored)
```

### Key Components

#### 1. APIBuilder (`src/api/builder.ts`)
The main high-level API class that provides a fluent interface for code generation:
- **Input methods**: `fromPackage()`, `fromFiles()`, `fromSchemas()`
- **Generator configuration**: `typescript()`, `restClient()`
- **Execution**: `generate()`, `build()`

#### 2. Generators (`src/api/generators/`)
Code generators that transform TypeSchema to target languages:
- **TypeScript Generator**: Generates TypeScript interfaces and type guards
- **REST Client Generator**: Generates API client code

#### 3. TypeSchema Processing (`src/typeschema/`)
Core TypeSchema handling:
- **Parser**: Converts input formats to TypeSchema
- **Transformer**: Applies transformations and optimizations
- **Validator**: Validates TypeSchema documents
- **Cache**: Caches processed schemas for performance

#### 4. CLI (`src/cli/`)
Command-line interface built with yargs:
- **Commands**: Individual CLI commands
- **Argument parsing**: Type-safe argument handling
- **Progress reporting**: User feedback during generation

## 🛠️ Development Workflow

### Making Changes

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Follow the existing code style and patterns
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   # Run all tests
   bun test
   
   # Run linting
   bun run lint
   
   # Run type checking
   bun run type-check
   
   # Test the CLI
   bun run cli generate --help
   ```

4. **Build and Verify**
   ```bash
   # Build the project
   bun run build
   
   # Test the built version
   bun run test:built
   ```

### Testing Guidelines

#### Unit Tests
- Test individual functions and classes in isolation
- Use mocks for external dependencies
- Focus on edge cases and error conditions

```typescript
// test/unit/api/builder.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { APIBuilder } from '../../../src/api/builder';

describe('APIBuilder', () => {
  let builder: APIBuilder;

  beforeEach(() => {
    builder = new APIBuilder();
  });

  it('should create instance with default options', () => {
    expect(builder).toBeInstanceOf(APIBuilder);
  });

  it('should configure TypeScript generator', () => {
    const result = builder.typescript({
      moduleFormat: 'esm',
      generateIndex: true
    });
    
    expect(result).toBe(builder); // Fluent interface
    expect(builder.getGenerators().has('typescript')).toBe(true);
  });
});
```

#### Integration Tests
- Test complete workflows end-to-end
- Use real FHIR packages and schemas
- Verify generated output

```typescript
// test/integration/fhir-generation.test.ts
import { describe, it, expect } from 'bun:test';
import { APIBuilder } from '../../src/api/builder';
import { readdir } from 'fs/promises';

describe('FHIR Generation Integration', () => {
  it('should generate TypeScript types from FHIR package', async () => {
    const outputDir = './test/tmp/fhir-types';
    
    await new APIBuilder()
      .fromPackage('hl7.fhir.r4.core@4.0.1')
      .typescript()
      .outputTo(outputDir)
      .generate();
    
    // Verify files were generated
    const files = await readdir(`${outputDir}/types`);
    expect(files).toContain('Patient.ts');
    expect(files).toContain('Observation.ts');
    expect(files).toContain('index.ts');
  });
});
```

### Code Style

We use **Biome** for code formatting and linting:

```bash
# Format code
bun run format

# Check formatting
bun run format:check

# Lint code
bun run lint

# Fix linting issues
bun run lint:fix
```

#### TypeScript Guidelines

- **Use strict TypeScript**: Enable all strict mode options
- **Prefer interfaces over types**: For object shapes
- **Use meaningful names**: Clear, descriptive variable and function names
- **Document public APIs**: Use JSDoc comments for public methods
- **Handle errors gracefully**: Use proper error types and handling

```typescript
/**
 * Generates TypeScript types from FHIR packages
 * 
 * @param packages - Array of FHIR package identifiers
 * @param options - Generation options
 * @returns Promise resolving to generation result
 * @throws {ValidationError} When package validation fails
 */
export async function generateFromPackages(
  packages: string[],
  options: GenerationOptions
): Promise<GenerationResult> {
  // Implementation
}
```

### Documentation

#### Code Documentation
- **JSDoc comments** for all public APIs
- **Inline comments** for complex logic
- **README updates** for new features
- **Example updates** when APIs change

#### Adding Examples
When adding new features, include practical examples:

1. **Update existing examples** in the `examples/` directory
2. **Add new example projects** for significant features
3. **Include usage examples** in documentation
4. **Test examples** to ensure they work

### Performance Considerations

- **Use caching** for expensive operations (TypeSchema parsing, file I/O)
- **Stream large datasets** instead of loading into memory
- **Optimize TypeScript generation** for large schemas
- **Profile performance** for critical paths

```typescript
// Good: Use caching for repeated operations
const cache = new Map<string, TypeSchema>();

function parseSchema(content: string): TypeSchema {
  const cacheKey = hashContent(content);
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }
  
  const schema = expensiveParseOperation(content);
  cache.set(cacheKey, schema);
  return schema;
}
```

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Clear description** of the issue
2. **Steps to reproduce** the problem
3. **Expected vs actual behavior**
4. **Environment details** (OS, Bun/Node version, etc.)
5. **Minimal reproduction case** if possible

### Bug Report Template

```markdown
## Bug Description
Brief description of the issue

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g., macOS 14.0]
- Bun version: [e.g., 1.0.15]
- Package version: [e.g., 0.1.0]

## Additional Context
Any other relevant information
```

## ✨ Feature Requests

We welcome feature requests! Please:

1. **Check existing issues** to avoid duplicates
2. **Describe the use case** and problem you're solving
3. **Propose a solution** if you have ideas
4. **Consider implementation complexity** and breaking changes

### Feature Request Template

```markdown
## Feature Description
Clear description of the proposed feature

## Use Case
Why is this feature needed? What problem does it solve?

## Proposed Solution
How should this feature work?

## Alternatives Considered
Other approaches you've considered

## Additional Context
Any other relevant information
```

## 🔄 Pull Request Process

### Before Submitting

1. **Ensure tests pass**: `bun test`
2. **Check code style**: `bun run lint`
3. **Update documentation**: If you changed APIs
4. **Add tests**: For new functionality
5. **Update changelog**: Add entry to `CHANGELOG.md`

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Added tests for new functionality
- [ ] Updated existing tests if needed

## Documentation
- [ ] Updated README if needed
- [ ] Updated API documentation
- [ ] Added/updated examples

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Changes are well-documented
- [ ] No breaking changes (or clearly documented)
```

### Review Process

1. **Automated checks** must pass (tests, linting, type checking)
2. **Code review** by maintainers
3. **Documentation review** for user-facing changes
4. **Testing** of new functionality
5. **Merge** after approval

## 🏷️ Release Process

We follow semantic versioning (SemVer):

- **Patch** (0.0.x): Bug fixes, documentation updates
- **Minor** (0.x.0): New features, non-breaking changes
- **Major** (x.0.0): Breaking changes

### Changelog

We maintain a changelog following [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [Unreleased]

### Added
- New feature descriptions

### Changed
- Changes to existing functionality

### Deprecated
- Features that will be removed

### Removed
- Features that were removed

### Fixed
- Bug fixes

### Security
- Security improvements
```

## 🤝 Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- **Be respectful** and considerate
- **Be collaborative** and helpful
- **Be patient** with newcomers
- **Focus on constructive feedback**
- **Respect different viewpoints**

### Getting Help

- **GitHub Discussions**: For questions and community support
- **GitHub Issues**: For bug reports and feature requests
- **Documentation**: Check docs first for common questions
- **Examples**: Look at example projects for usage patterns

## 📚 Resources

### Learning Resources

- **[TypeSchema Specification](https://typeschema.org/)**: Understanding the intermediate format
- **[FHIR Documentation](https://hl7.org/fhir/)**: Healthcare interoperability standard
- **[Bun Documentation](https://bun.sh/docs)**: JavaScript runtime and toolkit
- **[TypeScript Handbook](https://www.typescriptlang.org/docs/)**: TypeScript language guide

### Development Tools

- **[Biome](https://biomejs.dev/)**: Code formatting and linting
- **[TypeScript](https://www.typescriptlang.org/)**: Type checking and compilation
- **[Bun](https://bun.sh/)**: Runtime, package manager, and test runner

## 🙏 Recognition

Contributors are recognized in:

- **README.md**: Contributors section
- **CHANGELOG.md**: Release notes
- **GitHub**: Contributor graphs and statistics

Thank you for contributing to atomic-codegen! Your efforts help make healthcare interoperability more accessible and type-safe for developers worldwide.

---

**Questions?** Feel free to ask in [GitHub Discussions](https://github.com/atomic-ehr/codegen/discussions) or open an issue.
