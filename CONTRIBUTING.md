# Contributing to Atomic FHIR Codegen

Thank you for your interest in contributing to Atomic FHIR Codegen! This guide will help you get started with contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Code Style](#code-style)
- [Architecture Guidelines](#architecture-guidelines)
- [Adding New Features](#adding-new-features)
- [Documentation](#documentation)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and considerate in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a feature branch** for your changes
4. **Make your changes** following our guidelines
5. **Test thoroughly** with our test suite
6. **Submit a pull request** with a clear description

## Development Setup

### Prerequisites

- **Bun** runtime v1.0+ (primary development runtime)
- **Node.js** 18+ (for compatibility testing)
- **Git** for version control

### Installation

```bash
# Clone your fork
git clone git@github.com:<YOUR_USERNAME>/codegen.git
cd codegen

# Install dependencies using Bun
bun install

# Verify setup
bun test
bun run typecheck
bun run lint
```

### IDE Setup

We recommend using VS Code with the following extensions:
- Biome (for linting/formatting)
- TypeScript and JavaScript Language Features
- Bun for Visual Studio Code

## Development Workflow

### 1. Create a Feature Branch

```bash
# Update main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
```

### 2. Make Changes

Follow the project structure:

```
src/
├── api/              # High-level API (APIBuilder)
├── cli/              # CLI commands
├── typeschema/       # TypeSchema core logic
│   ├── core/         # Core transformers
│   ├── parser.ts     # FHIR package parser
│   └── generator.ts  # TypeSchema generator
└── config.ts         # Configuration system
```

### 3. Run Development Commands

```bash
# Run in development mode
bun run dev

# Run specific CLI command
bun run cli typeschema generate

# Type checking
bun run typecheck

# Linting and formatting
bun run lint

# Run tests
bun test
bun test --watch
bun test --coverage
```

## Testing

### Test Structure

Tests are organized by functionality and should follow the structure of the `src/` directory.

### Writing Tests

```typescript
import { describe, expect, it } from "bun:test";

describe("YourFeature", () => {
  it("should do something specific", async () => {
    // Arrange
    const input = createTestInput();

    // Act
    const result = await yourFunction(input);

    // Assert
    expect(result).toBeDefined();
    expect(result.property).toBe(expectedValue);
  });
});
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test test/unit/typeschema/transformer.test.ts

# Run with coverage
bun test --coverage

# Run in watch mode
bun test --watch
```

### Writing Tests for Code Generators

Tests for language-specific code generators validate that the writers produce correct output. These tests use the `APIBuilder` with `inMemoryOnly` mode to avoid file I/O.

#### Test File Organization

Generator tests are located in `test/api/write-generator/`:

- `typescript.test.ts` - TypeScript interface generation
- `python.test.ts` - Python/Pydantic model generation
- `csharp.test.ts` - C# class generation
- etc.

#### Basic Generator Test Pattern

```typescript
import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("TypeScript Writer Generator", async () => {
    const result = await new APIBuilder({ manager: r4Manager })
        .setLogLevel("SILENT")
        .typescript({
            inMemoryOnly: true,
        })
        .generate();

    // Validate generated file count
    expect(Object.keys(result.filesGenerated).length).toEqual(236);

    it("generates Patient resource with snapshot", async () => {
        // Validate generated file content: <https://bun.com/docs/guides/test/snapshot>
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Patient.ts"])
            .toMatchSnapshot();
    });
});
```

#### Snapshot Testing Workflow

Snapshots are stored in `test/api/write-generator/__snapshots__/` and capture the exact generated output.

Update snapshots after intentional changes:
```bash
bun test -- --update-snapshots
```

Use snapshots to:
- Validate complete generated file structure
- Detect unintended code generation changes
- Review formatting consistency
- Ensure compatibility across updates

**Important:** Review snapshot diffs carefully before committing to ensure changes are intentional.

#### Generator Test Best Practices

1. **Isolate per language:** Each language generator should have independent tests
2. **Combine assertions:** Use file count checks plus content validation
3. **Test edge cases:** Include inheritance, choice types, nested structures
4. **Verify paths:** Confirm generated file paths follow language conventions
5. **Review diffs:** Always review snapshot changes in PRs
6. **Document intent:** Add comments for non-obvious test scenarios
7. **Use inMemoryOnly:** Always use in-memory mode to avoid file I/O in tests

## Submitting Changes

### 1. Commit Guidelines

We follow conventional commits:

```bash
# Format: <type>(<scope>): <subject>

# Examples:
git commit -m "feat(typeschema): add support for FHIR R5"
git commit -m "fix(cli): handle missing config file"
git commit -m "docs: update API examples"
git commit -m "test(transformer): add edge case tests"
git commit -m "refactor(api): simplify builder pattern"
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Tests
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

### 2. Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Ensure all tests pass**: `bun test`
4. **Check types**: `bun run typecheck`
5. **Fix linting**: `bun run lint`
6. **Update CHANGELOG.md** if applicable
7. **Submit PR** with clear description

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] CHANGELOG.md updated
```

## Code Style

### TypeScript Guidelines

- Use **TypeScript strict mode**
- Prefer **interfaces** over type aliases for objects
- Use **explicit return types** for public functions
- Avoid **any** type; use **unknown** if needed
- Use **const assertions** for literal types

### Naming Conventions

```typescript
// Files: kebab-case
field-builder.ts
type-schema.ts

// Interfaces/Types: PascalCase
interface TypeSchema { }
type FieldType = string;

// Functions/Variables: camelCase
function transformSchema() { }
const fieldName = "value";

// Constants: UPPER_SNAKE_CASE
const MAX_DEPTH = 10;

// Private members: underscore prefix
private _cache: Map<string, any>;
```

### File Organization

```typescript
// 1. Imports (grouped and sorted)
import { describe, expect, it } from "bun:test";
import type { TypeSchema } from "../types";

// 2. Constants
const DEFAULT_TIMEOUT = 5000;

// 3. Types/Interfaces
interface Config {
  timeout: number;
}

// 4. Main implementation
export function mainFunction() {
  // Implementation
}

// 5. Helper functions
function helperFunction() {
  // Implementation
}

// 6. Exports at end (if not inline)
export { helperFunction };
```

## Architecture Guidelines

### Three-Stage Pipeline

1. **Input Layer** (`src/typeschema/`)
   - Parse FHIR packages
   - Transform to TypeSchema format
   - Handle profiles and extensions

2. **High-Level API** (`src/api/`)
   - Fluent builder pattern
   - Chain operations
   - Simplify common workflows

3. **Output Generators** (`src/generators/`)
   - Generate language-specific code
   - Use TypeSchema as input
   - Support multiple languages

### Design Principles

- **Separation of Concerns**: Keep parsing, transformation, and generation separate
- **Immutability**: Prefer immutable data structures
- **Type Safety**: Leverage TypeScript's type system
- **Performance**: Use Bun's performance features
- **Extensibility**: Design for plugin support

## Adding New Features

### Adding a New FHIR Package

1. Update package resolver
2. Add package-specific transformations
3. Update documentation
4. Add integration tests

## Documentation

### Code Documentation

````typescript
/**
 * Transforms a FHIR schema to TypeSchema format.
 *
 * @param fhirSchema - The input FHIR schema
 * @param options - Transformation options
 * @returns The transformed TypeSchema
 *
 * @example
 * ```typescript
 * const typeSchema = await transformFHIRSchema(fhirSchema, {
 *   includeExtensions: true
 * });
 * ```
 */
export async function transformFHIRSchema(
  fhirSchema: FHIRSchema,
  options?: TransformOptions
): Promise<TypeSchema> {
  // Implementation
}
````

### Updating Documentation

- **README.md**: Update for user-facing changes
- **API docs**: Update TypeDoc comments
- **Examples**: Add/update examples in `examples/`
- **CHANGELOG.md**: Document all changes

## Performance Considerations

- Use **Bun's built-in optimizations**
- Prefer **streaming** for large files
- Implement **caching** where appropriate
- Use **async/await** for I/O operations
- **Batch operations** when possible

## Getting Help

- **Discord**: Join our [Discord server](https://discord.com/channels/1390650823855439903/1435981804925489172)
- **Issues**: Check [existing issues](https://github.com/atomic-ehr/codegen/issues)
- **Discussions**: Start a [discussion](https://github.com/atomic-ehr/codegen/discussions)

## Release Process

Maintainers follow this process:

1. Update version in `package.json`
2. Create git tag: `git tag v1.2.3`
3. Push tag: `git push --tags`
4. GitHub Actions handles the release: create [NPM package](https://www.npmjs.com/package/@atomic-ehr/codegen?activeTab=versions), create [GitHub Release Draft](https://github.com/atomic-ehr/codegen/releases).
5. Review GitHub Release draft and publish it.

## Recognition

Contributors are recognized in:
- The README.md contributors section
- Release notes
- The project's AUTHORS file

### Roadmap Discussion

- Comment on [roadmap issues](https://github.com/atomic-ehr/codegen/labels/roadmap)
- Suggest new features via [GitHub Discussions](https://github.com/atomic-ehr/codegen/discussions)

### Maintainers team

- [Aleksandr Penskoi @ryukzak](https://github.com/ryukzak)
- [Gena Razmakhnin @GenaRazmakhnin](https://github.com/GenaRazmakhnin)

Thank you for contributing to Atomic FHIR Codegen! 🎉
