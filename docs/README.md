# Base Generator System

A powerful, extensible code generation framework designed for FHIR and beyond.

## ✨ Features

- 🔄 **Fluent API**: Chainable, declarative file operations
- 🌍 **Multi-Language**: Support TypeScript, Python, Rust, and more  
- 🛡️ **Type Safe**: Full TypeScript support with rich error messages
- ⚡ **High Performance**: Efficient batching and streaming operations
- 🧪 **Test Friendly**: Built-in testing utilities and mocks
- 📚 **Well Documented**: Comprehensive guides for all skill levels

## 🚀 Quick Start

```typescript
// Create a new generator
import { BaseGenerator } from '@atomic-ehr/codegen/base';

class MyGenerator extends BaseGenerator {
  protected getLanguageName() { return 'MyLanguage'; }
  protected getFileExtension() { return '.my'; }
  
  protected async generateSchemaContent(schema, context) {
    return `// Generated code for ${schema.identifier.name}`;
  }
  
  protected createTypeMapper() {
    return new MyTypeMapper();
  }
  
  protected async validateContent(content) {
    // Add validation logic
  }
  
  protected filterAndSortSchemas(schemas) {
    return schemas.sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
  }
}

// Use the fluent API
const generator = new MyGenerator({ outputDir: './output' });

await generator
  .file('Example.my')
  .withContent('const example = "Hello World";')
  .addImport('util', './util')
  .onError(err => console.error('Generation failed:', err))
  .save();
```

## 📖 Documentation

### For Beginners
- [🎯 Quick Start Guide](getting-started/quick-start.md) - Get up and running in 5 minutes
- [🔧 Your First Generator](getting-started/first-generator.md) - Build a simple generator
- [❓ Troubleshooting](getting-started/troubleshooting.md) - Common issues and solutions

### For Intermediate Users  
- [🏗️ Creating Generators](guides/creating-generators.md) - Complete generator development guide
- [🔄 Migration Guide](guides/migration-guide.md) - Migrating from the old system
- [🧪 Testing Guide](guides/testing-guide.md) - How to test your generators
- [⚡ Performance Guide](guides/performance-guide.md) - Optimization techniques

### For Advanced Users
- [🏛️ Architecture Deep Dive](api-reference/base-generator.md) - Internal architecture details
- [📚 API Reference](api-reference/) - Complete API documentation
- [🤝 Contributing](contributing/development-setup.md) - How to contribute

## 📊 Examples

Browse working examples in the [`examples/`](examples/) directory:

- **[TypeScript Generator](examples/typescript-generator/)** - Complete TypeScript code generator
- **[JSON Schema Generator](examples/json-generator/)** - JSON schema generator  
- **[Custom Templates](examples/custom-templates/)** - Advanced template usage
- **[Integration Tests](examples/integration-tests/)** - Testing patterns

## 🆘 Getting Help

- **Documentation Issues**: [Create an issue](https://github.com/atomic-ehr/codegen/issues/new?template=documentation.md)
- **Bug Reports**: [Report a bug](https://github.com/atomic-ehr/codegen/issues/new?template=bug.md)
- **Feature Requests**: [Request a feature](https://github.com/atomic-ehr/codegen/issues/new?template=feature.md)
- **Discussion**: [GitHub Discussions](https://github.com/atomic-ehr/codegen/discussions)

## 📈 Performance

The base generator system is designed for performance:

- **Memory Efficient**: Streams large files, batches operations
- **Fast**: Optimized for large schema sets
- **Scalable**: Handles thousands of schemas efficiently

See [Performance Benchmarks](guides/performance-guide.md#benchmarks) for detailed metrics.

## 🏗️ Architecture

The base generator system follows a modular, extensible architecture:

```
BaseGenerator
├── TypeMapper          # Language-specific type mapping
├── TemplateEngine      # Template processing system
├── FileManager         # File operations and I/O
├── ErrorHandler        # Comprehensive error handling
└── Builders/           # Fluent API builders
    ├── FileBuilder     # Individual file operations
    ├── DirectoryBuilder# Batch directory operations
    └── IndexBuilder    # Index file generation
```

## 🧪 Testing Framework

Comprehensive testing utilities included:

```typescript
import {
  // Test helpers
  createMockSchema,
  createMockSchemas, 
  TestFileSystem,
  MockLogger,
  TestGenerator,
  
  // Custom assertions
  assertValidTypeScript,
  assertGenerationQuality,
  assertPerformanceBenchmark
} from '@atomic-ehr/codegen/test-helpers';
```

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](contributing/development-setup.md) for details.

### Quick Contribution Steps

1. **Fork & Clone**: Fork the repository and clone locally
2. **Install**: Run `bun install` to install dependencies
3. **Test**: Run `bun test` to ensure everything works
4. **Develop**: Make your changes and add tests
5. **Submit**: Open a pull request with a clear description

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.

---

**Ready to build your first generator?** Start with our [Quick Start Guide](getting-started/quick-start.md)! 🚀