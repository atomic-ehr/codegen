# BaseGenerator API Reference

Complete API documentation for the BaseGenerator class - the core component of the code generation system.

## 📖 Overview

The `BaseGenerator` is an abstract base class that provides a comprehensive framework for creating code generators. It handles common operations like file management, type mapping, template processing, and error handling, while allowing derived classes to customize language-specific behavior.

## 🏗️ Class Definition

```typescript
abstract class BaseGenerator<TOptions extends BaseGeneratorOptions, TResult extends GeneratedFile[]> {
  // Core lifecycle methods
  abstract protected getLanguageName(): string;
  abstract protected getFileExtension(): string;
  abstract protected createTypeMapper(): TypeMapper;
  abstract protected generateSchemaContent(schema: TypeSchema, context: TemplateContext): Promise<string>;
  abstract protected validateContent(content: string, context: TemplateContext): Promise<void>;
  abstract protected filterAndSortSchemas(schemas: TypeSchema[]): TypeSchema[];

  // Public API methods
  public async generate(schemas: TypeSchema[]): Promise<TResult>;
  public async build(schemas: TypeSchema[]): Promise<TResult>;
  public file(filename: string): FileBuilder;
  public directory(path: string): DirectoryBuilder;
  public index(): IndexBuilder;
}
```

## 🎯 Constructor

```typescript
constructor(options: TOptions)
```

Creates a new generator instance with the specified configuration.

**Parameters:**
- `options: TOptions` - Generator configuration options

**Example:**
```typescript
const generator = new MyGenerator({
  outputDir: './generated',
  verbose: true,
  validate: true,
  overwrite: false
});
```

## 🔧 Abstract Methods

### getLanguageName()

```typescript
protected abstract getLanguageName(): string
```

Returns the human-readable name of the target language.

**Returns:** `string` - Language name for logging and error messages

**Example:**
```typescript
protected getLanguageName(): string {
  return 'TypeScript';
}
```

### getFileExtension()

```typescript
protected abstract getFileExtension(): string
```

Returns the file extension for generated files.

**Returns:** `string` - File extension including the dot (e.g., '.ts', '.py')

**Example:**
```typescript
protected getFileExtension(): string {
  return '.ts';
}
```

### createTypeMapper()

```typescript
protected abstract createTypeMapper(): TypeMapper
```

Creates the type mapper for converting FHIR types to target language types.

**Returns:** `TypeMapper` - Type mapping implementation

**Example:**
```typescript
protected createTypeMapper(): TypeScriptTypeMapper {
  return new TypeScriptTypeMapper({
    useOptionalProperties: true,
    generateUnions: true
  });
}
```

### generateSchemaContent()

```typescript
protected abstract generateSchemaContent(
  schema: TypeSchema, 
  context: TemplateContext
): Promise<string>
```

Generates the content for a single schema.

**Parameters:**
- `schema: TypeSchema` - The schema to generate code for
- `context: TemplateContext` - Template context with type mappings and metadata

**Returns:** `Promise<string>` - Generated content

**Example:**
```typescript
protected async generateSchemaContent(
  schema: TypeSchema, 
  context: TemplateContext
): Promise<string> {
  const interfaceName = this.typeMapper.formatTypeName(schema.identifier.name);
  
  let content = `export interface ${interfaceName} {\n`;
  
  if ('fields' in schema && schema.fields) {
    for (const [fieldName, field] of Object.entries(schema.fields)) {
      if ('type' in field && field.type) {
        const languageType = this.typeMapper.mapType(field.type);
        const optional = field.required ? '' : '?';
        const arrayType = field.array ? '[]' : '';
        
        content += `  ${fieldName}${optional}: ${languageType.name}${arrayType};\n`;
      }
    }
  }
  
  content += '}';
  
  return content;
}
```

### validateContent()

```typescript
protected abstract validateContent(
  content: string, 
  context: TemplateContext
): Promise<void>
```

Validates generated content before writing to file.

**Parameters:**
- `content: string` - Generated content to validate
- `context: TemplateContext` - Template context for additional validation data

**Throws:** `GeneratorError` - If validation fails

**Example:**
```typescript
protected async validateContent(
  content: string, 
  context: TemplateContext
): Promise<void> {
  // Check TypeScript syntax
  if (!content.includes('export')) {
    throw new GeneratorError('Generated content must have exports');
  }
  
  // Validate balanced braces
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  
  if (openBraces !== closeBraces) {
    throw new GeneratorError('Generated content has unbalanced braces');
  }
}
```

### filterAndSortSchemas()

```typescript
protected abstract filterAndSortSchemas(schemas: TypeSchema[]): TypeSchema[]
```

Filters and sorts schemas before generation.

**Parameters:**
- `schemas: TypeSchema[]` - Input schemas

**Returns:** `TypeSchema[]` - Filtered and sorted schemas

**Example:**
```typescript
protected filterAndSortSchemas(schemas: TypeSchema[]): TypeSchema[] {
  return schemas
    .filter(schema => schema.identifier.kind !== 'primitive-type')
    .sort((a, b) => {
      // Sort by kind first, then name
      if (a.identifier.kind !== b.identifier.kind) {
        return a.identifier.kind.localeCompare(b.identifier.kind);
      }
      return a.identifier.name.localeCompare(b.identifier.name);
    });
}
```

## 🚀 Public API Methods

### generate()

```typescript
public async generate(schemas: TypeSchema[]): Promise<TResult>
```

Main generation method that creates and writes files to disk.

**Parameters:**
- `schemas: TypeSchema[]` - Schemas to generate code for

**Returns:** `Promise<TResult>` - Array of generated files with metadata

**Example:**
```typescript
const schemas = [patientSchema, observationSchema];
const results = await generator.generate(schemas);

console.log(`Generated ${results.length} files:`);
results.forEach(file => {
  console.log(`  - ${file.filename} (${file.size} bytes)`);
});
```

### build()

```typescript
public async build(schemas: TypeSchema[]): Promise<TResult>
```

Builds file content without writing to disk. Useful for testing and validation.

**Parameters:**
- `schemas: TypeSchema[]` - Schemas to generate code for

**Returns:** `Promise<TResult>` - Array of generated files (in-memory only)

**Example:**
```typescript
// For testing - no file I/O
const results = await generator.build(schemas);

// Validate content
results.forEach(file => {
  expect(file.content).toContain('export interface');
  expect(file.exports.length).toBeGreaterThan(0);
});
```

## 🔨 Fluent API Methods

### file()

```typescript
public file(filename: string): FileBuilder
```

Creates a fluent file builder for single file operations.

**Parameters:**
- `filename: string` - Name of the file to create

**Returns:** `FileBuilder` - Chainable file builder

**Example:**
```typescript
await generator
  .file('Patient.ts')
  .withContent('export interface Patient { id: string; }')
  .addImport('Resource', './Resource')
  .addExport('Patient')
  .save();
```

### directory()

```typescript
public directory(path: string): DirectoryBuilder
```

Creates a fluent directory builder for batch operations.

**Parameters:**
- `path: string` - Directory path

**Returns:** `DirectoryBuilder` - Chainable directory builder

**Example:**
```typescript
await generator
  .directory('./types')
  .withFiles([
    { name: 'Patient.ts', content: patientContent },
    { name: 'Observation.ts', content: observationContent }
  ])
  .withHeader('// Generated FHIR types')
  .save();
```

### index()

```typescript
public index(): IndexBuilder
```

Creates a fluent index builder for creating index files.

**Returns:** `IndexBuilder` - Chainable index builder

**Example:**
```typescript
await generator
  .index()
  .withExports(['Patient', 'Observation', 'Practitioner'])
  .withHeader('// FHIR R4 Core Types')
  .save();
```

## ⚙️ Configuration Options

### BaseGeneratorOptions

```typescript
interface BaseGeneratorOptions {
  // Required
  outputDir: string;
  
  // Optional
  verbose?: boolean;          // Enable detailed logging
  validate?: boolean;         // Validate generated content
  overwrite?: boolean;        // Overwrite existing files
  createDirectories?: boolean; // Auto-create output directories
  logger?: CodegenLogger;     // Custom logger implementation
}
```

## 🔍 Properties

### Protected Properties

```typescript
protected readonly options: TOptions;        // Generator configuration
protected readonly typeMapper: TypeMapper;   // Type mapping instance
protected readonly logger: CodegenLogger;    // Logger instance
protected readonly errorHandler: ErrorHandler; // Error handling system
protected readonly errorBoundary: GeneratorErrorBoundary; // Error boundaries
```

**Usage in derived classes:**
```typescript
protected async generateSchemaContent(schema: TypeSchema): Promise<string> {
  this.logger.debug(`Generating content for ${schema.identifier.name}`);
  
  try {
    const languageType = this.typeMapper.formatTypeName(schema.identifier.name);
    // ... generation logic
  } catch (error) {
    this.errorHandler.handleError(error, { 
      schema: schema.identifier.name,
      operation: 'content-generation'
    });
    throw error;
  }
}
```

## 🎯 Template Context

### TemplateContext Interface

```typescript
interface TemplateContext {
  schema: TypeSchema;
  typeMapper: TypeMapper;
  imports: Set<string>;
  exports: Set<string>;
  metadata: {
    generatedAt: Date;
    schemaCount: number;
    generatorName: string;
    generatorVersion: string;
  };
}
```

**Usage:**
```typescript
protected async generateSchemaContent(
  schema: TypeSchema,
  context: TemplateContext
): Promise<string> {
  // Use context for consistent generation
  const typeName = context.typeMapper.formatTypeName(schema.identifier.name);
  context.exports.add(typeName);
  
  return `export interface ${typeName} {
    // Generated at ${context.metadata.generatedAt.toISOString()}
    id: string;
  }`;
}
```

## 🛡️ Error Handling

### Enhanced Error System

The BaseGenerator integrates with enhanced error handling:

```typescript
import { 
  EnhancedSchemaValidationError,
  EnhancedFileOperationError,
  EnhancedTemplateError 
} from './enhanced-errors';

// Automatic error enhancement
try {
  await generator.generate(schemas);
} catch (error) {
  if (error instanceof EnhancedSchemaValidationError) {
    console.error('Schema validation failed:');
    console.error(error.getFormattedMessage());
    console.log('Suggestions:');
    error.getSuggestions().forEach(suggestion => {
      console.log(`  - ${suggestion}`);
    });
  }
}
```

## 📊 Performance Considerations

### Memory Management

```typescript
// Process schemas in batches for large datasets
const batchSize = 50;
const results: GeneratedFile[] = [];

for (let i = 0; i < schemas.length; i += batchSize) {
  const batch = schemas.slice(i, i + batchSize);
  const batchResults = await generator.generate(batch);
  results.push(...batchResults);
  
  // Optional: Force garbage collection between batches
  if (global.gc && (i + batchSize) % 100 === 0) {
    global.gc();
  }
}
```

### Async Optimization

```typescript
// Parallel processing for independent operations
const results = await Promise.all(
  schemaGroups.map(group => generator.build(group))
);

// Combine results
const allFiles = results.flat();
```

## 🧪 Testing Support

### Test-Friendly Methods

```typescript
// Use build() for testing - no file I/O
const results = await generator.build(testSchemas);

// Validate specific aspects
expect(results).toHaveLength(testSchemas.length);
expect(results.every(f => f.exports.length > 0)).toBe(true);

// Test error conditions
await expect(generator.build([malformedSchema]))
  .rejects.toThrow(EnhancedSchemaValidationError);
```

### Mocking Support

```typescript
import { TestGenerator, MockLogger } from '@atomic-ehr/codegen/test-helpers';

const logger = new MockLogger();
const generator = new TestGenerator({ 
  outputDir: './test-output', 
  logger 
});

// Test logging behavior
await generator.generate(schemas);
expect(logger.hasLevel('info')).toBe(true);
expect(logger.getMessages('error')).toHaveLength(0);
```

## 🔧 Extension Points

### Custom Type Mappers

```typescript
class CustomTypeMapper extends TypeMapper {
  mapPrimitive(fhirType: string): LanguageType {
    const customMappings = {
      'instant': { name: 'Date', isPrimitive: true },
      'decimal': { name: 'Decimal', isPrimitive: true }
    };
    
    return customMappings[fhirType] || super.mapPrimitive(fhirType);
  }
}

protected createTypeMapper(): CustomTypeMapper {
  return new CustomTypeMapper();
}
```

### Custom Validation

```typescript
protected async validateContent(content: string): Promise<void> {
  await super.validateContent(content);
  
  // Custom validation rules
  if (content.includes('any')) {
    throw new GeneratorError('Generated code should not use "any" type');
  }
  
  // Integration with external validators
  await this.lintContent(content);
}
```

## 📚 Migration from Legacy Generators

### Compatibility Layer

```typescript
// Legacy method
class LegacyGenerator extends BaseGenerator {
  // Override legacy behavior
  protected async generateSchemaContent(schema: TypeSchema): Promise<string> {
    // Convert legacy format to new format
    return this.convertLegacyFormat(await super.generateSchemaContent(schema));
  }
  
  private convertLegacyFormat(content: string): string {
    // Migration logic
    return content.replace(/OldPattern/g, 'NewPattern');
  }
}
```

## 🚀 Best Practices

### 1. Error Handling
```typescript
protected async generateSchemaContent(schema: TypeSchema): Promise<string> {
  return await this.errorBoundary.withErrorBoundary(async () => {
    // Generation logic here
    return generatedContent;
  }, { schema: schema.identifier.name });
}
```

### 2. Logging
```typescript
protected async generate(schemas: TypeSchema[]): Promise<TResult> {
  this.logger.info(`Starting ${this.getLanguageName()} generation`);
  this.logger.debug(`Processing ${schemas.length} schemas`);
  
  const startTime = performance.now();
  const results = await super.generate(schemas);
  const duration = performance.now() - startTime;
  
  this.logger.info(`Generated ${results.length} files in ${duration.toFixed(2)}ms`);
  return results;
}
```

### 3. Validation
```typescript
protected async validateContent(content: string): Promise<void> {
  // Always validate basic structure
  if (!content.trim()) {
    throw new GeneratorError('Generated content is empty');
  }
  
  // Language-specific validation
  await this.validateLanguageSpecificSyntax(content);
  
  // Performance check
  if (content.length > 1000000) { // 1MB
    this.logger.warn('Generated file is very large, consider splitting');
  }
}
```

## 📖 Related Documentation

- [Creating Custom Generators](../guides/creating-generators.md)
- [Type Mapping Guide](../guides/type-mapping.md)
- [Error Handling Guide](../guides/error-handling.md)
- [Testing Generators](../guides/testing-guide.md)
- [Performance Optimization](../guides/performance-guide.md)

## 🔗 See Also

- [FileBuilder API](./file-builder.md)
- [TypeMapper API](./type-mapper.md)
- [Template System](./template-system.md)
- [Error Classes](./error-classes.md)