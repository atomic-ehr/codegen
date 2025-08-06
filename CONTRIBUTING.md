# Contributing to Atomic EHR Codegen

We welcome contributions to Atomic EHR Codegen! This guide will help you get started with contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Code Style](#code-style)
- [Documentation](#documentation)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Node.js](https://nodejs.org/) >= 18 (for TypeScript peer dependency)
- [Git](https://git-scm.com/)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/codegen.git
   cd codegen
   ```

3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/atomic-ehr/codegen.git
   ```

## Development Setup

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Build the project**:
   ```bash
   bun run build
   ```

3. **Run the CLI locally**:
   ```bash
   bun run cli --help
   ```

4. **Run tests**:
   ```bash
   bun test
   ```

5. **Type checking**:
   ```bash
   bun run typecheck
   ```

6. **Linting**:
   ```bash
   bun run lint
   ```

## Project Structure

```
src/
├── cli/                    # CLI commands and interface
│   ├── commands/           # Individual CLI commands
│   │   ├── config/        # Configuration commands
│   │   ├── generate/      # Generation commands
│   │   └── typeschema/    # TypeSchema commands
│   └── index.ts           # CLI entry point
├── generators/            # Code generators for different languages
│   ├── typescript/        # TypeScript generator
│   └── python/           # Python generator
├── lib/                  # Core library code
│   ├── core/             # Core utilities and configuration
│   ├── generators/       # Generator framework
│   ├── typeschema/      # TypeSchema processing
│   └── validation/      # Code validation utilities
└── index.ts             # Library entry point

test/                     # Test files
docs/                     # Documentation
```

## Making Changes

### Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Add tests** for new functionality

4. **Run the test suite**:
   ```bash
   bun test
   bun run typecheck
   bun run lint
   ```

5. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add new feature`
- `fix: fix a bug`
- `docs: update documentation`
- `style: code formatting`
- `refactor: refactor code`
- `test: add or update tests`
- `chore: maintenance tasks`

### Types of Contributions

#### Bug Fixes

1. Check if an issue already exists
2. Create a new issue if needed
3. Reference the issue in your pull request

#### New Features

1. Discuss the feature in an issue first
2. Ensure it aligns with project goals
3. Include comprehensive tests and documentation

#### Documentation

1. Fix typos and improve clarity
2. Add examples and use cases
3. Update API documentation for changes

#### Code Generators

Adding a new language generator:

1. Create a new directory in `src/generators/`
2. Implement the generator interface
3. Add comprehensive tests
4. Update documentation

Example structure:
```
src/generators/rust/
├── generator.ts          # Main generator implementation
├── templates/            # Code templates
├── types.ts             # Type definitions
└── index.ts             # Exports
```

## Testing

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test test/lib/core/config.test.ts

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage
```

### Writing Tests

We use Bun's built-in test runner:

```typescript
import { test, expect } from "bun:test";
import { TypeScriptGenerator } from "../src/generators/typescript/generator";

test("TypeScript generator creates valid interfaces", async () => {
  const generator = new TypeScriptGenerator({
    outputDir: "/tmp/test-output",
    includeComments: true
  });

  // Test implementation
  const result = await generator.generateInterface({
    name: "Patient",
    fields: [
      { name: "id", type: "string", optional: true },
      { name: "name", type: "HumanName[]", optional: true }
    ]
  });

  expect(result).toContain("interface Patient");
  expect(result).toContain("id?: string");
});
```

### Test Categories

1. **Unit Tests**: Test individual functions and classes
2. **Integration Tests**: Test CLI commands end-to-end
3. **Generator Tests**: Test code generation output
4. **Validation Tests**: Test schema validation

## Submitting Changes

### Pull Request Process

1. **Ensure your branch is up to date**:
   ```bash
   git checkout main
   git pull upstream main
   git checkout feature/your-feature-name
   git rebase main
   ```

2. **Run the full test suite**:
   ```bash
   bun test
   bun run typecheck
   bun run lint
   ```

3. **Create a pull request** on GitHub with:
   - Clear title and description
   - Reference related issues
   - Screenshots/examples if applicable

4. **Respond to feedback** from reviewers

### Pull Request Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No breaking changes (or clearly documented)
```

## Code Style

### TypeScript Guidelines

1. **Use TypeScript strict mode**
2. **Prefer interfaces over types** for object shapes
3. **Use meaningful names** for variables and functions
4. **Add JSDoc comments** for public APIs
5. **Follow existing patterns** in the codebase

### Formatting

We use Biome for code formatting:

```bash
# Format code
bun run lint --write

# Check formatting
bun run lint
```

### Example Code Style

```typescript
/**
 * Generates TypeScript interfaces from FHIR schemas
 */
export interface TypeScriptGeneratorOptions {
  /** Output directory for generated files */
  outputDir: string;
  /** Include JSDoc comments in output */
  includeComments?: boolean;
  /** Use strict TypeScript settings */
  strict?: boolean;
}

/**
 * TypeScript code generator for FHIR resources
 */
export class TypeScriptGenerator implements Generator {
  private readonly options: TypeScriptGeneratorOptions;
  
  constructor(options: TypeScriptGeneratorOptions) {
    this.options = {
      includeComments: true,
      strict: true,
      ...options
    };
  }

  /**
   * Generate TypeScript interface from schema
   */
  public async generateInterface(schema: TypeSchema): Promise<string> {
    // Implementation
  }
}
```

## Documentation

### Types of Documentation

1. **API Documentation**: JSDoc comments in code
2. **User Guides**: Markdown files in `docs/`
3. **Examples**: Code examples in `docs/examples/`
4. **README**: Project overview and quick start

### Documentation Standards

1. **Use clear, concise language**
2. **Include code examples**
3. **Keep examples up to date**
4. **Cross-reference related topics**

### Updating Documentation

When making changes:

1. Update relevant documentation files
2. Add examples for new features
3. Update CLI help text if needed
4. Consider adding troubleshooting entries

## Release Process

### Version Bumping

We follow [Semantic Versioning](https://semver.org/):

- **Patch** (1.0.1): Bug fixes
- **Minor** (1.1.0): New features (backward compatible)
- **Major** (2.0.0): Breaking changes

### Release Checklist

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Run full test suite
4. Create git tag
5. Publish to npm registry

## Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and discussions
- **Discord**: Real-time chat with maintainers and community

### Asking Questions

When asking for help:

1. Search existing issues first
2. Provide minimal reproduction case
3. Include version information
4. Describe expected vs actual behavior

## Recognition

Contributors are recognized in:

- GitHub contributors list
- Release notes for significant contributions
- Special thanks in documentation

We appreciate all contributions, from bug reports to major features!

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

---

Thank you for contributing to Atomic EHR Codegen! 🎉