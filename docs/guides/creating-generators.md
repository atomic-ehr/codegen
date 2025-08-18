# Creating Custom Generators

Complete guide to building custom code generators using the Base Generator System.

## 🎯 Overview

This guide teaches you how to create powerful, maintainable code generators for any target language or format. We'll cover everything from basic generators to advanced features like templates, error handling, and performance optimization.

## 📚 Prerequisites

- Completed [Quick Start Guide](../getting-started/quick-start.md)
- Basic understanding of TypeScript/JavaScript
- Familiarity with your target language
- Understanding of FHIR schema structure (optional)

## 🏗️ Generator Architecture

### Core Components

Every generator consists of these essential parts:

```
MyGenerator (extends BaseGenerator)
├── TypeMapper          # Maps FHIR types → target language types
├── Content Generation  # Creates code from schemas
├── Validation         # Ensures generated code is valid
├── File Management    # Handles output organization
└── Error Handling     # Provides helpful error messages
```

## 🚀 Building Your First Generator

### Step 1: Define Your Generator Class

```typescript
// src/PythonGenerator.ts
import { BaseGenerator } from '@atomic-ehr/codegen/base';
import type { TypeSchema, TemplateContext, BaseGeneratorOptions } from '@atomic-ehr/codegen/base';

export interface PythonGeneratorOptions extends BaseGeneratorOptions {
  useDataclasses?: boolean;
  generateValidators?: boolean;
  pythonVersion?: '3.8' | '3.9' | '3.10' | '3.11';
}

export class PythonGenerator extends BaseGenerator<PythonGeneratorOptions, GeneratedFile[]> {
  protected getLanguageName(): string {
    return 'Python';
  }
  
  protected getFileExtension(): string {
    return '.py';
  }
  
  protected createTypeMapper(): PythonTypeMapper {
    return new PythonTypeMapper({
      useDataclasses: this.options.useDataclasses ?? true,
      pythonVersion: this.options.pythonVersion ?? '3.10'
    });
  }
  
  protected async generateSchemaContent(
    schema: TypeSchema, 
    context: TemplateContext
  ): Promise<string> {
    // Implementation coming next...
  }
  
  protected async validateContent(content: string): Promise<void> {
    // Validation logic...
  }
  
  protected filterAndSortSchemas(schemas: TypeSchema[]): TypeSchema[] {
    return schemas
      .filter(schema => schema.identifier.kind !== 'primitive-type')
      .sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
  }
}
```

### Step 2: Create Your Type Mapper

```typescript
// src/PythonTypeMapper.ts
import { TypeMapper } from '@atomic-ehr/codegen/base';
import type { TypeSchemaIdentifier, LanguageType } from '@atomic-ehr/codegen/base';

export interface PythonTypeMapperOptions {
  useDataclasses: boolean;
  pythonVersion: string;
}

export class PythonTypeMapper extends TypeMapper {
  constructor(private options: PythonTypeMapperOptions) {
    super();
  }
  
  mapPrimitive(fhirType: string): LanguageType {
    const typeMap: Record<string, string> = {
      'string': 'str',
      'integer': 'int',
      'boolean': 'bool',
      'decimal': 'float',
      'dateTime': 'datetime',
      'date': 'date',
      'code': 'str',
      'uri': 'str',
      'id': 'str'
    };
    
    const pythonType = typeMap[fhirType] || 'str';
    return {
      name: pythonType,
      isPrimitive: true
    };
  }
  
  formatTypeName(name: string): string {
    // Convert PascalCase to PascalCase (Python classes)
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  formatFileName(name: string): string {
    // Convert PascalCase to snake_case (Python files)
    return name
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }
  
  mapType(identifier: TypeSchemaIdentifier): LanguageType {
    if (identifier.kind === 'primitive-type') {
      return this.mapPrimitive(identifier.name);
    }
    
    return {
      name: this.formatTypeName(identifier.name),
      isPrimitive: false
    };
  }
}
```

### Step 3: Implement Content Generation

```typescript
// Back in PythonGenerator.ts
protected async generateSchemaContent(
  schema: TypeSchema, 
  context: TemplateContext
): Promise<string> {
  const className = this.typeMapper.formatTypeName(schema.identifier.name);
  const imports = new Set<string>();
  
  // Add necessary imports
  if (this.options.useDataclasses) {
    imports.add('from dataclasses import dataclass');
  }
  if (this.hasDateTimeFields(schema)) {
    imports.add('from datetime import datetime, date');
  }
  if (this.hasOptionalFields(schema)) {
    imports.add('from typing import Optional');
  }
  
  // Build the class
  let content = Array.from(imports).join('\n');
  if (imports.size > 0) content += '\n\n';
  
  if (this.options.useDataclasses) {
    content += '@dataclass\n';
  }
  
  content += `class ${className}:\n`;
  
  if (schema.description) {
    content += `    """${schema.description}"""\n\n`;
  }
  
  // Generate fields
  if ('fields' in schema && schema.fields) {
    const fieldLines: string[] = [];
    
    for (const [fieldName, field] of Object.entries(schema.fields)) {
      if ('type' in field && field.type) {
        const languageType = this.typeMapper.mapType(field.type);
        const optional = field.required ? '' : 'Optional[';
        const optionalClose = field.required ? '' : ']';
        const arrayType = field.array ? `list[${languageType.name}]` : languageType.name;
        const fullType = `${optional}${arrayType}${optionalClose}`;
        
        if (this.options.useDataclasses) {
          fieldLines.push(`    ${fieldName}: ${fullType}`);
        } else {
          fieldLines.push(`    def __init__(self, ${fieldName}: ${fullType}):`);
          fieldLines.push(`        self.${fieldName} = ${fieldName}`);
        }
      }
    }
    
    content += fieldLines.join('\n');
  }
  
  if (!('fields' in schema) || Object.keys(schema.fields || {}).length === 0) {
    content += '    pass';
  }
  
  // Update context
  context.exports.add(className);
  
  return content;
}

private hasDateTimeFields(schema: TypeSchema): boolean {
  if (!('fields' in schema) || !schema.fields) return false;
  
  return Object.values(schema.fields).some(field => 
    'type' in field && 
    field.type && 
    ['dateTime', 'date'].includes(field.type.name)
  );
}

private hasOptionalFields(schema: TypeSchema): boolean {
  if (!('fields' in schema) || !schema.fields) return false;
  
  return Object.values(schema.fields).some(field => 
    'required' in field && !field.required
  );
}
```

### Step 4: Add Validation

```typescript
protected async validateContent(content: string): Promise<void> {
  // Basic syntax validation
  if (!content.includes('class ')) {
    throw new Error('Generated Python code must contain at least one class');
  }
  
  // Check for balanced indentation (simplified)
  const lines = content.split('\n');
  let indentLevel = 0;
  
  for (const line of lines) {
    if (line.trim() === '') continue;
    
    const currentIndent = (line.match(/^[ ]*/)?.[0] || '').length;
    
    if (line.trim().endsWith(':')) {
      // This should increase indent
      indentLevel = currentIndent + 4;
    } else if (currentIndent < indentLevel && line.trim()) {
      // This is a dedent
      indentLevel = currentIndent;
    }
    
    // Validate proper indentation
    if (line.trim() && currentIndent % 4 !== 0) {
      throw new Error(`Invalid Python indentation at line: ${line}`);
    }
  }
  
  // Optional: Integration with external Python validator
  if (this.options.validate !== false) {
    await this.validatePythonSyntax(content);
  }
}

private async validatePythonSyntax(content: string): Promise<void> {
  // This would integrate with a Python syntax checker
  // For example, using a subprocess to call `python -m py_compile`
  // or integrating with a Python AST parser in Node.js
}
```

## 🔄 Using the Fluent API

### Single File Operations

```typescript
// Create individual files with fluent API
await generator
  .file('patient.py')
  .withContent(patientClass)
  .addImport('from typing import Optional')
  .addImport('from datetime import datetime')
  .addExport('Patient')
  .onError(error => console.error('Failed to generate Patient:', error))
  .save();
```

### Batch Directory Operations

```typescript
// Create multiple files at once
await generator
  .directory('./models')
  .withFiles([
    { name: 'patient.py', content: patientContent },
    { name: 'observation.py', content: observationContent },
    { name: 'practitioner.py', content: practitionerContent }
  ])
  .withHeader('# Generated FHIR models for Python')
  .withFooter('# End of generated code')
  .save();
```

### Index File Generation

```typescript
// Create __init__.py file
await generator
  .index()
  .withExports(['Patient', 'Observation', 'Practitioner'])
  .withHeader('"""FHIR R4 Core Models for Python"""')
  .save();

// This generates:
// """FHIR R4 Core Models for Python"""
// from .patient import Patient
// from .observation import Observation  
// from .practitioner import Practitioner
//
// __all__ = ['Patient', 'Observation', 'Practitioner']
```

## 🎨 Advanced Features

### Template System Integration

```typescript
import { TemplateEngine } from '@atomic-ehr/codegen/base';

export class AdvancedPythonGenerator extends PythonGenerator {
  private templateEngine: TemplateEngine;
  
  constructor(options: PythonGeneratorOptions) {
    super(options);
    this.templateEngine = new TemplateEngine('./templates/python');
  }
  
  protected async generateSchemaContent(
    schema: TypeSchema,
    context: TemplateContext
  ): Promise<string> {
    // Use templates for complex generation
    return await this.templateEngine.render('dataclass.py.hbs', {
      className: this.typeMapper.formatTypeName(schema.identifier.name),
      description: schema.description,
      fields: this.buildFieldsContext(schema),
      imports: this.buildImportsContext(schema),
      options: this.options
    });
  }
  
  private buildFieldsContext(schema: TypeSchema): any[] {
    if (!('fields' in schema) || !schema.fields) return [];
    
    return Object.entries(schema.fields).map(([name, field]) => ({
      name,
      type: this.getFieldTypeString(field),
      required: 'required' in field ? field.required : false,
      description: 'description' in field ? field.description : null
    }));
  }
}
```

### Custom Error Handling

```typescript
import { EnhancedGeneratorError } from '@atomic-ehr/codegen/base';

export class PythonValidationError extends EnhancedGeneratorError {
  constructor(message: string, public pythonCode: string, public lineNumber?: number) {
    super(message);
    this.name = 'PythonValidationError';
  }
  
  getSuggestions(): string[] {
    const suggestions: string[] = [];
    
    if (this.pythonCode.includes('  def ')) {
      suggestions.push('Check Python indentation - use 4 spaces per level');
    }
    
    if (this.lineNumber) {
      suggestions.push(`Check syntax around line ${this.lineNumber}`);
    }
    
    if (this.pythonCode.includes('Optional[') && !this.pythonCode.includes('from typing')) {
      suggestions.push('Add "from typing import Optional" import');
    }
    
    return suggestions;
  }
}

// Use in validation
protected async validateContent(content: string): Promise<void> {
  try {
    await super.validateContent(content);
  } catch (error) {
    throw new PythonValidationError(
      `Python validation failed: ${error.message}`,
      content
    );
  }
}
```

### Performance Optimization

```typescript
export class OptimizedPythonGenerator extends PythonGenerator {
  private contentCache = new Map<string, string>();
  
  protected async generateSchemaContent(
    schema: TypeSchema,
    context: TemplateContext
  ): Promise<string> {
    // Cache generated content for identical schemas
    const cacheKey = this.getCacheKey(schema);
    
    if (this.contentCache.has(cacheKey)) {
      this.logger.debug(`Using cached content for ${schema.identifier.name}`);
      return this.contentCache.get(cacheKey)!;
    }
    
    const content = await super.generateSchemaContent(schema, context);
    this.contentCache.set(cacheKey, content);
    
    return content;
  }
  
  private getCacheKey(schema: TypeSchema): string {
    // Create cache key from schema structure
    return JSON.stringify({
      name: schema.identifier.name,
      kind: schema.identifier.kind,
      fields: 'fields' in schema ? Object.keys(schema.fields || {}).sort() : [],
      version: schema.identifier.version
    });
  }
  
  // Clear cache when needed
  public clearCache(): void {
    this.contentCache.clear();
  }
}
```

## 🧪 Testing Your Generator

### Unit Testing

```typescript
// test/PythonGenerator.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PythonGenerator } from '../src/PythonGenerator';
import { createMockSchema, TestFileSystem } from '@atomic-ehr/codegen/test-helpers';

describe('PythonGenerator', () => {
  let generator: PythonGenerator;
  let fileSystem: TestFileSystem;
  
  beforeEach(async () => {
    fileSystem = new TestFileSystem('./test-output');
    await fileSystem.setup();
    
    generator = new PythonGenerator({
      outputDir: fileSystem.getPath(),
      useDataclasses: true,
      pythonVersion: '3.10'
    });
  });
  
  afterEach(async () => {
    await fileSystem.cleanup();
  });
  
  test('generates valid Python dataclass', async () => {
    const schema = createMockSchema({
      identifier: { name: 'Patient', kind: 'resource' }
    });
    
    const results = await generator.build([schema]);
    
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('@dataclass');
    expect(results[0].content).toContain('class Patient:');
    expect(results[0].exports).toContain('Patient');
  });
  
  test('handles optional fields correctly', async () => {
    const schema = createMockSchema({
      fields: {
        id: { type: { name: 'string', kind: 'primitive-type' }, required: true },
        name: { type: { name: 'string', kind: 'primitive-type' }, required: false }
      }
    });
    
    const results = await generator.build([schema]);
    const content = results[0].content;
    
    expect(content).toContain('from typing import Optional');
    expect(content).toContain('id: str');
    expect(content).toContain('name: Optional[str]');
  });
  
  test('validates Python syntax', async () => {
    const malformedSchema = createMockSchema();
    
    // Mock generateSchemaContent to return invalid Python
    const originalMethod = generator['generateSchemaContent'];
    generator['generateSchemaContent'] = async () => 'invalid python syntax {{{';
    
    await expect(generator.build([malformedSchema]))
      .rejects.toThrow('Python validation failed');
    
    // Restore original method
    generator['generateSchemaContent'] = originalMethod;
  });
});
```

### Integration Testing

```typescript
// test/integration/python-generation.test.ts
import { test, expect } from 'bun:test';
import { PythonGenerator } from '../../src/PythonGenerator';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

test('generated Python code can be imported', async () => {
  const generator = new PythonGenerator({
    outputDir: './test-python-output',
    useDataclasses: true
  });
  
  const schemas = [
    createMockSchema({ identifier: { name: 'Patient', kind: 'resource' } }),
    createMockSchema({ identifier: { name: 'Observation', kind: 'resource' } })
  ];
  
  await generator.generate(schemas);
  
  // Test that Python can import the generated code
  const pythonCode = `
import sys
sys.path.append('./test-python-output')
from patient import Patient
from observation import Observation

# Create instances to verify the classes work
p = Patient(id="123")
o = Observation(id="456")

print("Success: Python code is valid")
  `;
  
  await fs.writeFile('./test-import.py', pythonCode);
  
  const { stdout, stderr } = await execAsync('python3 ./test-import.py');
  
  expect(stderr).toBe('');
  expect(stdout).toContain('Success: Python code is valid');
  
  // Cleanup
  await fs.unlink('./test-import.py');
});
```

## 🔧 Configuration and Options

### Advanced Configuration

```typescript
export interface AdvancedPythonOptions extends PythonGeneratorOptions {
  // Code style options
  useBlackFormatting?: boolean;
  maxLineLength?: number;
  
  // Type checking options
  useMypy?: boolean;
  strictOptional?: boolean;
  
  // Documentation options  
  generateDocstrings?: boolean;
  docstringStyle?: 'google' | 'numpy' | 'sphinx';
  
  // Validation options
  generatePydantic?: boolean;
  generateValidators?: boolean;
  
  // Output organization
  separateByNamespace?: boolean;
  createInitFiles?: boolean;
}

// Usage
const generator = new AdvancedPythonGenerator({
  outputDir: './generated-python',
  useDataclasses: true,
  pythonVersion: '3.10',
  useBlackFormatting: true,
  maxLineLength: 88,
  generateDocstrings: true,
  docstringStyle: 'google',
  generatePydantic: true,
  createInitFiles: true
});
```

### Environment-Based Configuration

```typescript
// Load configuration from environment
export function createGeneratorFromEnv(): PythonGenerator {
  return new PythonGenerator({
    outputDir: process.env.PYTHON_OUTPUT_DIR || './generated',
    useDataclasses: process.env.USE_DATACLASSES !== 'false',
    pythonVersion: (process.env.PYTHON_VERSION as any) || '3.10',
    verbose: process.env.VERBOSE === 'true',
    validate: process.env.VALIDATE !== 'false'
  });
}
```

## 🚀 Publishing Your Generator

### Package Structure

```
my-fhir-python-generator/
├── src/
│   ├── PythonGenerator.ts
│   ├── PythonTypeMapper.ts
│   └── index.ts
├── templates/
│   ├── dataclass.py.hbs
│   └── pydantic.py.hbs
├── test/
│   ├── unit/
│   └── integration/
├── examples/
│   └── basic-usage.ts
├── package.json
├── tsconfig.json
└── README.md
```

### package.json

```json
{
  "name": "@myorg/fhir-python-generator",
  "version": "1.0.0",
  "description": "Python code generator for FHIR resources",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "@atomic-ehr/codegen": "^1.0.0"
  },
  "keywords": ["fhir", "python", "codegen", "healthcare"]
}
```

## 📖 Best Practices

### 1. **Separation of Concerns**
```typescript
// Good: Separate type mapping from content generation
class PythonGenerator extends BaseGenerator {
  protected async generateSchemaContent(schema: TypeSchema): Promise<string> {
    const fields = this.buildFieldDefinitions(schema);
    const imports = this.buildImportStatements(schema);
    const classDefinition = this.buildClassDefinition(schema, fields);
    
    return this.combineCodeSections([imports, classDefinition]);
  }
}

// Avoid: Doing everything in one method
```

### 2. **Comprehensive Error Messages**
```typescript
protected async validateContent(content: string): Promise<void> {
  try {
    // Validation logic
  } catch (error) {
    throw new PythonValidationError(
      `Generated Python code failed validation: ${error.message}`,
      content,
      this.findProblemLine(content, error)
    );
  }
}
```

### 3. **Extensible Design**
```typescript
// Allow customization through inheritance
export class PythonGenerator extends BaseGenerator {
  protected buildFieldDefinition(fieldName: string, field: Field): string {
    // Base implementation
  }
  
  // Override in subclasses for customization
  protected buildCustomFieldDefinition?(fieldName: string, field: Field): string;
}
```

### 4. **Performance-Conscious**
```typescript
// Cache expensive operations
private typeCache = new Map<string, LanguageType>();

mapType(identifier: TypeSchemaIdentifier): LanguageType {
  const key = `${identifier.name}:${identifier.kind}`;
  
  if (!this.typeCache.has(key)) {
    this.typeCache.set(key, this.computeType(identifier));
  }
  
  return this.typeCache.get(key)!;
}
```

## 📚 Next Steps

1. **[Error Handling Guide](./error-handling.md)** - Add robust error handling
2. **[Performance Guide](./performance-guide.md)** - Optimize for large schemas
3. **[Testing Guide](./testing-guide.md)** - Comprehensive testing strategies
4. **[Template Guide](./template-guide.md)** - Advanced template usage

## 🎯 Summary

You now have the knowledge to create sophisticated code generators that are:

- ✅ **Maintainable** - Well-structured with clear separation of concerns
- ✅ **Testable** - Comprehensive test coverage with good abstractions
- ✅ **Performant** - Optimized for large-scale generation
- ✅ **User-Friendly** - Clear error messages and helpful diagnostics
- ✅ **Extensible** - Easy to customize and extend

Happy generating! 🚀