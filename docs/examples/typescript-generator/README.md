# TypeScript Generator Example

Complete working example of a TypeScript code generator built with the Base Generator System.

## 📖 Overview

This example demonstrates how to build a production-ready TypeScript generator that converts FHIR TypeSchema documents into TypeScript interfaces with:

- ✅ **Type-safe interfaces** with proper inheritance
- ✅ **Union types** for references and enums
- ✅ **Optional properties** based on cardinality
- ✅ **Comprehensive validation** with helpful error messages
- ✅ **Import management** with automatic dependency resolution
- ✅ **Index file generation** for clean exports

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Run the example
bun run generate.ts

# Check generated output
ls ./generated/
```

## 📁 File Structure

```
typescript-generator/
├── README.md              # This file
├── generate.ts            # Main execution script
├── src/
│   ├── TypeScriptGenerator.ts    # Main generator class
│   ├── TypeScriptTypeMapper.ts   # Type mapping logic
│   └── templates/
│       ├── interface.hbs         # Interface template
│       └── index.hbs            # Index file template
├── test/
│   ├── TypeScriptGenerator.test.ts
│   └── fixtures/
│       └── sample-schemas.json
└── generated/             # Output directory (created when run)
    ├── Patient.ts
    ├── Observation.ts
    └── index.ts
```

## 🔧 Implementation Details

### TypeScript Generator Class

The main generator extends `BaseGenerator` and implements all required methods:

```typescript
export class TypeScriptGenerator extends BaseGenerator<TypeScriptGeneratorOptions, GeneratedFile[]> {
  protected getLanguageName(): string {
    return 'TypeScript';
  }
  
  protected getFileExtension(): string {
    return '.ts';
  }
  
  protected createTypeMapper(): TypeScriptTypeMapper {
    return new TypeScriptTypeMapper(this.options);
  }
  
  protected async generateSchemaContent(
    schema: TypeSchema, 
    context: TemplateContext
  ): Promise<string> {
    // Generate TypeScript interface content
  }
  
  protected async validateContent(content: string): Promise<void> {
    // Validate TypeScript syntax
  }
  
  protected filterAndSortSchemas(schemas: TypeSchema[]): TypeSchema[] {
    // Filter and organize schemas
  }
}
```

### Type Mapping System

Converts FHIR types to TypeScript equivalents:

```typescript
export class TypeScriptTypeMapper extends TypeMapper {
  mapPrimitive(fhirType: string): LanguageType {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'integer': 'number',
      'boolean': 'boolean',
      'decimal': 'number',
      'dateTime': 'string', // ISO 8601 string
      'date': 'string',     // YYYY-MM-DD
      'code': 'string',
      'uri': 'string',
      'id': 'string'
    };
    
    return {
      name: typeMap[fhirType] || 'unknown',
      isPrimitive: true
    };
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

## 📊 Generated Output Examples

### Input Schema
```json
{
  "identifier": {
    "name": "Patient",
    "kind": "resource",
    "package": "hl7.fhir.r4.core",
    "version": "4.0.1",
    "url": "http://hl7.org/fhir/StructureDefinition/Patient"
  },
  "description": "Demographics and other administrative information about an individual",
  "fields": {
    "id": {
      "type": { "name": "string", "kind": "primitive-type" },
      "required": true,
      "array": false
    },
    "name": {
      "type": { "name": "HumanName", "kind": "complex-type" },
      "required": false,
      "array": true
    },
    "gender": {
      "type": { "name": "code", "kind": "primitive-type" },
      "required": false,
      "array": false,
      "enum": ["male", "female", "other", "unknown"]
    }
  }
}
```

### Generated TypeScript Output
```typescript
// generated/Patient.ts

import { HumanName } from './HumanName';

/**
 * Demographics and other administrative information about an individual
 * 
 * Generated from FHIR StructureDefinition: Patient
 * Package: hl7.fhir.r4.core@4.0.1
 */
export interface Patient {
  /** Logical id of this artifact */
  id: string;
  
  /** A name associated with the individual */
  name?: HumanName[];
  
  /** Administrative Gender */
  gender?: 'male' | 'female' | 'other' | 'unknown';
}

export type PatientGender = 'male' | 'female' | 'other' | 'unknown';
```

### Generated Index File
```typescript
// generated/index.ts

/**
 * FHIR R4 Core TypeScript Interfaces
 * Generated at: 2024-01-15T10:30:00Z
 */

export type { Patient, PatientGender } from './Patient';
export type { HumanName } from './HumanName';
export type { Observation } from './Observation';
// ... more exports
```

## 🧪 Testing

The example includes comprehensive tests:

```typescript
// test/TypeScriptGenerator.test.ts
import { describe, test, expect } from 'bun:test';
import { TypeScriptGenerator } from '../src/TypeScriptGenerator';
import { createMockSchema } from '@atomic-ehr/codegen/test-helpers';

describe('TypeScriptGenerator', () => {
  test('generates valid TypeScript interface', async () => {
    const generator = new TypeScriptGenerator({
      outputDir: './test-output',
      generateEnums: true
    });
    
    const schema = createMockSchema({
      identifier: { name: 'Patient', kind: 'resource' }
    });
    
    const results = await generator.build([schema]);
    
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('export interface Patient');
    expect(results[0].exports).toContain('Patient');
  });
  
  test('handles enum fields correctly', async () => {
    const schema = createMockSchema({
      fields: {
        status: {
          type: { name: 'code', kind: 'primitive-type' },
          enum: ['active', 'inactive', 'pending'],
          required: true
        }
      }
    });
    
    const results = await generator.build([schema]);
    const content = results[0].content;
    
    expect(content).toContain("status: 'active' | 'inactive' | 'pending'");
    expect(content).toContain('export type TestSchemaStatus = ');
  });
});
```

## ⚡ Performance Features

The generator includes several performance optimizations:

### 1. Import Deduplication
```typescript
// Automatically deduplicates and organizes imports
import { Address, HumanName } from './common';
import { Observation } from './Observation';
```

### 2. Lazy Type Resolution
```typescript
// Only generates types when needed
private typeCache = new Map<string, LanguageType>();

mapType(identifier: TypeSchemaIdentifier): LanguageType {
  const key = this.getCacheKey(identifier);
  if (!this.typeCache.has(key)) {
    this.typeCache.set(key, this.resolveType(identifier));
  }
  return this.typeCache.get(key)!;
}
```

### 3. Batch File Operations
```typescript
// Writes multiple files efficiently
await generator
  .directory('./types')
  .withFiles(generatedFiles)
  .save(); // Single batch write operation
```

## 🎛️ Configuration Options

```typescript
export interface TypeScriptGeneratorOptions extends BaseGeneratorOptions {
  // Type generation options
  generateEnums?: boolean;          // Generate enum types
  useOptionalProperties?: boolean;  // Use ? for optional props
  generateUnions?: boolean;         // Generate union types
  
  // Import/export options
  useRelativeImports?: boolean;     // Relative vs absolute imports
  generateIndexFiles?: boolean;     // Auto-generate index.ts
  exportStyle?: 'named' | 'default' | 'both';
  
  // Code style options
  indentSize?: number;              // Spaces per indent level
  useTrailingSemicolons?: boolean;  // Add trailing semicolons
  useSingleQuotes?: boolean;        // Single vs double quotes
  
  // Documentation options
  generateJSDoc?: boolean;          // Add JSDoc comments
  includeFHIRMetadata?: boolean;    // Add FHIR-specific metadata
}
```

### Usage Example
```typescript
const generator = new TypeScriptGenerator({
  outputDir: './generated/types',
  generateEnums: true,
  useOptionalProperties: true,
  generateUnions: true,
  generateIndexFiles: true,
  exportStyle: 'named',
  generateJSDoc: true,
  includeFHIRMetadata: true,
  verbose: true
});

// Generate with custom options
const results = await generator.generate(schemas);
console.log(`Generated ${results.length} TypeScript files`);
```

## 🔄 Usage with Fluent API

```typescript
// Single file generation
await generator
  .file('CustomPatient.ts')
  .withContent('export interface CustomPatient extends Patient {}')
  .addImport('Patient', './Patient')
  .addExport('CustomPatient')
  .save();

// Batch generation with custom organization
await generator
  .directory('./models/resources')
  .withFiles(resourceFiles)
  .withHeader('/* FHIR Resources */')
  .save();

await generator
  .directory('./models/datatypes')  
  .withFiles(dataTypeFiles)
  .withHeader('/* FHIR Data Types */')
  .save();

// Create organized index
await generator
  .index()
  .withExports([
    ...resourceExports.map(name => ({ name, path: `./resources/${name}` })),
    ...dataTypeExports.map(name => ({ name, path: `./datatypes/${name}` }))
  ])
  .withHeader('// Complete FHIR R4 TypeScript Definitions')
  .save();
```

## 📈 Advanced Features

### 1. Inheritance Support
```typescript
// Base resource interface
export interface Resource {
  id: string;
  meta?: Meta;
}

// Derived interfaces extend base
export interface Patient extends Resource {
  name?: HumanName[];
  gender?: PatientGender;
}
```

### 2. Generic Type Support
```typescript
// Support for generic FHIR types
export interface Bundle<T = Resource> {
  entry?: BundleEntry<T>[];
  total?: number;
}

export interface BundleEntry<T = Resource> {
  resource?: T;
  fullUrl?: string;
}
```

### 3. Validation Integration
```typescript
// Optional: Generate runtime validators
import { z } from 'zod';

export const PatientSchema = z.object({
  id: z.string(),
  name: z.array(HumanNameSchema).optional(),
  gender: z.enum(['male', 'female', 'other', 'unknown']).optional()
});

export type Patient = z.infer<typeof PatientSchema>;
```

## 🚀 Running the Example

```bash
# Clone or copy the example
cd docs/examples/typescript-generator

# Install dependencies
bun install

# Run with sample data
bun run generate.ts

# Run with custom schemas
bun run generate.ts --input ./my-schemas.json --output ./my-types

# Run tests
bun test

# Run with validation
bun run generate.ts --validate
```

## 📚 What You'll Learn

This example demonstrates:

1. **Generator Architecture** - How to structure a real generator
2. **Type Mapping** - Converting between type systems
3. **Content Generation** - Building code programmatically  
4. **Validation** - Ensuring output quality
5. **Testing** - Comprehensive test strategies
6. **Performance** - Optimization techniques
7. **Configuration** - Flexible options system
8. **Error Handling** - Helpful error messages

## 🔗 Related Examples

- [JSON Schema Generator](../json-generator/) - Simpler example
- [Python Generator](../python-generator/) - Different target language
- [Custom Templates](../custom-templates/) - Advanced template usage
- [Integration Tests](../integration-tests/) - Testing strategies

## 💡 Next Steps

After understanding this example:

1. **Customize the generator** for your specific needs
2. **Add new features** like JSDoc generation or validation
3. **Create your own generator** for a different language
4. **Integrate with your build process** using the CLI
5. **Contribute improvements** back to the project

Happy coding with TypeScript! 🎉