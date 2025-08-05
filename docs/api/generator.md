# Generator API Reference

The generator API provides classes and functions for generating TypeScript code from TypeSchema.

## Classes

### BaseGenerator

Abstract base class for all code generators.

```typescript
abstract class BaseGenerator {
  constructor(options: GeneratorOptions);
  abstract generate(): Promise<void>;
  
  // File management
  protected file(path: string): void;
  protected writeFiles(): Promise<void>;
  
  // Code generation helpers
  protected line(content: string): void;
  protected blank(): void;
  protected indent(): void;
  protected dedent(): void;
  protected comment(text: string): void;
  protected multiLineComment(text: string): void;
  protected block(header: string, body: () => void): void;
  protected curlyBlock(header: string, body: () => void): void;
  
  // Logging
  protected log(message: string): void;
}
```

#### Constructor Options

```typescript
interface GeneratorOptions {
  outputDir: string;    // Output directory for generated files
  verbose?: boolean;    // Enable verbose logging
}
```

#### Example: Custom Generator

```typescript
import { BaseGenerator } from '@atomic-ehr/type-schema/generator';

class MyCustomGenerator extends BaseGenerator {
  async generate(): Promise<void> {
    this.file('output.txt');
    this.line('// Generated code');
    this.blank();
    
    this.curlyBlock('class Example', () => {
      this.line('property: string;');
    });
    
    await this.writeFiles();
  }
}
```

### TypeScriptGenerator

Concrete implementation for generating TypeScript code.

```typescript
class TypeScriptGenerator extends BaseGenerator {
  constructor(options: TypeScriptGeneratorOptions);
  async generate(): Promise<void>;
}
```

#### Constructor Options

```typescript
interface TypeScriptGeneratorOptions extends GeneratorOptions {
  packagePath?: string;      // FHIR package to load (default: hl7.fhir.r4.core@4.0.1)
  baseTypesModule?: string;  // Module path for base types
}
```

#### Example Usage

```typescript
import { TypeScriptGenerator } from '@atomic-ehr/type-schema/generator';

const generator = new TypeScriptGenerator({
  outputDir: './generated',
  packagePath: 'hl7.fhir.r4.core@4.0.1',
  verbose: true
});

await generator.generate();
```

### SchemaLoader

Loads and categorizes TypeSchema for generation.

```typescript
class SchemaLoader {
  constructor(options: SchemaLoaderOptions);
  async load(): Promise<LoadedSchemas>;
  async cleanup(): Promise<void>;
}
```

#### Options and Return Type

```typescript
interface SchemaLoaderOptions {
  packagePath?: string;
  verbose?: boolean;
}

interface LoadedSchemas {
  all: AnyTypeSchema[];
  resources: TypeSchema[];
  complexTypes: TypeSchema[];
  primitiveTypes: TypeSchema[];
  bindings: TypeSchemaBinding[];
  valueSets: TypeSchemaValueSet[];
}
```

## Functions

### generateTypes

High-level function to generate TypeScript types from FHIR.

```typescript
async function generateTypes(options: {
  outputDir: string;
  packagePath?: string;
  verbose?: boolean;
}): Promise<void>
```

#### Example

```typescript
import { generateTypes } from '@atomic-ehr/type-schema/generator';

await generateTypes({
  outputDir: './src/fhir-types',
  packagePath: 'hl7.fhir.r4.core@4.0.1',
  verbose: true
});
```

## Code Generation Utilities

### File Structure Helpers

```typescript
// Start writing to a new file
generator.file('types/MyType.ts');

// Write a line of code
generator.line('export interface MyType {');

// Add a blank line
generator.blank();

// Manage indentation
generator.indent();
generator.line('property: string;');
generator.dedent();

// Close the interface
generator.line('}');
```

### Block Helpers

```typescript
// Generate a block with braces
generator.curlyBlock('export interface Patient', () => {
  generator.line('resourceType: "Patient";');
  generator.line('id?: string;');
});

// Generate a generic block
generator.block('namespace MyNamespace', () => {
  generator.line('export type MyType = string;');
});
```

### Comment Helpers

```typescript
// Single line comment
generator.comment('This is a comment');
// Output: // This is a comment

// Multi-line comment
generator.multiLineComment('This is a\nmulti-line\ncomment');
// Output:
// /**
//  * This is a
//  * multi-line
//  * comment
//  */
```

## Generated Code Structure

The TypeScriptGenerator produces the following file structure:

```
outputDir/
├── index.ts              # Main entry point
├── types/
│   ├── primitives.ts    # FHIR primitive type definitions
│   └── complex.ts       # Complex type definitions
└── resources/
    ├── Patient.ts       # Individual resource files
    ├── Observation.ts
    └── ...
```

### Index File

The generated index.ts includes:

```typescript
// Re-exports
export * as primitives from './types/primitives';
export * as complex from './types/complex';

// Resource exports
export { Patient } from './resources/Patient';
export { Observation } from './resources/Observation';
// ... all other resources

// Utility types
export const ResourceTypeMap = {
  'Patient': true,
  'Observation': true,
  // ... all resource types
} as const;

export type ResourceType = keyof typeof ResourceTypeMap;
export type AnyResource = Patient | Observation | /* ... all resources */;
```

### Type Mappings

The generator uses the following primitive type mappings:

```typescript
const typeMapping = new Map([
  ['boolean', 'boolean'],
  ['integer', 'number'],
  ['string', 'string'],
  ['decimal', 'number'],
  ['uri', 'string'],
  ['url', 'string'],
  ['canonical', 'string'],
  ['uuid', 'string'],
  ['id', 'string'],
  ['oid', 'string'],
  ['unsignedInt', 'number'],
  ['positiveInt', 'number'],
  ['markdown', 'string'],
  ['time', 'string'],
  ['date', 'string'],
  ['dateTime', 'string'],
  ['instant', 'string'],
  ['base64Binary', 'string'],
  ['code', 'string'],
  ['xhtml', 'string']
]);
```

## Advanced Usage

### Custom Type Mappings

Extend the TypeScriptGenerator to customize type mappings:

```typescript
class CustomTSGenerator extends TypeScriptGenerator {
  constructor(options: TypeScriptGeneratorOptions) {
    super(options);
    // Add custom mappings
    this.typeMapping.set('decimal', 'BigDecimal');
    this.typeMapping.set('instant', 'Date');
  }
}
```

### Selective Generation

Generate only specific resource types:

```typescript
class SelectiveGenerator extends TypeScriptGenerator {
  private includeResources = new Set(['Patient', 'Observation', 'Encounter']);
  
  protected generateResourceFile(resource: TypeSchema): void {
    if (this.includeResources.has(resource.identifier.name)) {
      super.generateResourceFile(resource);
    }
  }
}
```

### Post-Processing

Add post-processing steps:

```typescript
class PostProcessingGenerator extends TypeScriptGenerator {
  async generate(): Promise<void> {
    await super.generate();
    
    // Run prettier
    await this.formatFiles();
    
    // Generate additional files
    await this.generateHelpers();
  }
  
  private async formatFiles(): Promise<void> {
    // Implementation
  }
  
  private async generateHelpers(): Promise<void> {
    this.file('helpers.ts');
    this.line('// Helper functions');
    // ...
  }
}
```

## Error Handling

The generator provides detailed error messages:

```typescript
try {
  await generator.generate();
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Output directory does not exist');
  } else if (error.message.includes('package')) {
    console.error('Failed to load FHIR package');
  } else {
    console.error('Generation failed:', error);
  }
}
```

## Performance Tips

1. **Use verbose mode during development** to track progress
2. **Cache generated schemas** to avoid re-transformation
3. **Generate incrementally** when possible
4. **Use parallel processing** for large packages

```typescript
// Enable caching
const generator = new TypeScriptGenerator({
  outputDir: './generated',
  verbose: true,
  // Future: caching options
});
```