# Quick Start Guide

Get up and running with the Base Generator System in under 5 minutes.

## 📦 Installation

```bash
# Install the base generator system
bun add @atomic-ehr/codegen

# Or with npm
npm install @atomic-ehr/codegen
```

## 🎯 Your First Generator

Let's create a simple JSON Schema generator that converts TypeSchema documents to JSON Schema format.

### Step 1: Create the Type Mapper

```typescript
// src/JsonTypeMapper.ts
import { TypeMapper } from '@atomic-ehr/codegen/base';
import type { TypeSchemaIdentifier, LanguageType } from '@atomic-ehr/codegen/base';

export class JsonTypeMapper extends TypeMapper {
  mapPrimitive(fhirType: string): LanguageType {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'integer': 'number',
      'boolean': 'boolean',
      'dateTime': 'string',
      'decimal': 'number',
      'code': 'string'
    };

    return {
      name: typeMap[fhirType] || 'string',
      isPrimitive: true
    };
  }

  formatTypeName(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  formatFileName(name: string): string {
    return this.formatTypeName(name);
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

### Step 2: Create the Generator

```typescript
// src/JsonGenerator.ts
import { BaseGenerator } from '@atomic-ehr/codegen/base';
import type { TypeSchema, TemplateContext } from '@atomic-ehr/codegen/base';
import { JsonTypeMapper } from './JsonTypeMapper';

export class JsonGenerator extends BaseGenerator {
  protected getLanguageName(): string {
    return 'JSON Schema';
  }

  protected getFileExtension(): string {
    return '.json';
  }

  protected createTypeMapper(): JsonTypeMapper {
    return new JsonTypeMapper();
  }

  protected async generateSchemaContent(
    schema: TypeSchema,
    context: TemplateContext
  ): Promise<string> {
    const jsonSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: schema.identifier.name,
      description: schema.description,
      type: 'object',
      properties: this.buildProperties(schema),
      required: this.getRequiredFields(schema)
    };

    return JSON.stringify(jsonSchema, null, 2);
  }

  protected async validateContent(content: string): Promise<void> {
    try {
      JSON.parse(content);
    } catch (error) {
      throw new Error(`Generated JSON is invalid: ${error}`);
    }
  }

  protected filterAndSortSchemas(schemas: TypeSchema[]): TypeSchema[] {
    return schemas
      .filter(schema => schema.identifier.kind !== 'primitive-type')
      .sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
  }

  private buildProperties(schema: TypeSchema): Record<string, any> {
    const properties: Record<string, any> = {};

    if ('fields' in schema && schema.fields) {
      for (const [fieldName, field] of Object.entries(schema.fields)) {
        if ('type' in field && field.type) {
          const languageType = this.typeMapper.mapType(field.type);
          properties[fieldName] = {
            type: languageType.name.toLowerCase(),
            description: field.description || `${fieldName} field`
          };

          if (field.array) {
            properties[fieldName] = {
              type: 'array',
              items: properties[fieldName]
            };
          }
        }
      }
    }

    return properties;
  }

  private getRequiredFields(schema: TypeSchema): string[] {
    if (!('fields' in schema) || !schema.fields) return [];

    return Object.entries(schema.fields)
      .filter(([_, field]) => 'required' in field && field.required)
      .map(([fieldName, _]) => fieldName);
  }
}
```

### Step 3: Use the Generator

```typescript
// src/generate.ts
import { JsonGenerator } from './JsonGenerator';

async function main() {
  // Create sample schema (normally you'd load these from files)
  const patientSchema = {
    identifier: {
      name: 'Patient',
      kind: 'resource' as const,
      package: 'hl7.fhir.r4.core',
      version: '4.0.1',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient'
    },
    description: 'Demographics and other administrative information about an individual',
    fields: {
      id: {
        type: {
          name: 'string',
          kind: 'primitive-type' as const,
          package: 'hl7.fhir.r4.core',
          version: '4.0.1',
          url: 'http://hl7.org/fhir/StructureDefinition/string'
        },
        required: true,
        array: false
      },
      name: {
        type: {
          name: 'HumanName',
          kind: 'complex-type' as const,
          package: 'hl7.fhir.r4.core',
          version: '4.0.1',
          url: 'http://hl7.org/fhir/StructureDefinition/HumanName'
        },
        required: false,
        array: true
      },
      active: {
        type: {
          name: 'boolean',
          kind: 'primitive-type' as const,
          package: 'hl7.fhir.r4.core',
          version: '4.0.1',
          url: 'http://hl7.org/fhir/StructureDefinition/boolean'
        },
        required: false,
        array: false
      }
    }
  };

  // Create generator
  const generator = new JsonGenerator({
    outputDir: './json-schemas',
    verbose: true
  });

  // Generate files
  const results = await generator.generate([patientSchema]);

  console.log(`Generated ${results.length} JSON schema files:`);
  results.forEach(file => {
    console.log(`  - ${file.filename} (${file.size} bytes)`);
  });
}

main().catch(console.error);
```

### Step 4: Run the Generator

```bash
# Run the generator
bun run src/generate.ts

# Output:
# Generated 1 JSON schema files:
#   - Patient.json (324 bytes)
```

### Step 5: Check the Output

```json
// json-schemas/Patient.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Patient",
  "description": "Demographics and other administrative information about an individual",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "id field"
    },
    "name": {
      "type": "array",
      "items": {
        "type": "humanname",
        "description": "name field"
      }
    },
    "active": {
      "type": "boolean",
      "description": "active field"
    }
  },
  "required": ["id"]
}
```

## 🎉 Success!

You've created your first generator! The JSON schema file was created in the `json-schemas/` directory.

## 🚀 Next Steps

Now that you have a basic generator working, you can:

1. **[Add Fluent API Support](../guides/creating-generators.md#fluent-api)** - Use the chainable file builder API
2. **[Add Templates](../guides/creating-generators.md#templates)** - Use template engines for complex generation
3. **[Add Error Handling](../guides/creating-generators.md#error-handling)** - Provide helpful error messages
4. **[Add Tests](../guides/testing-guide.md)** - Test your generator thoroughly
5. **[Add Performance](../guides/performance-guide.md)** - Optimize for large schema sets

## 💡 Tips

- **Start Simple**: Begin with basic functionality, add features incrementally
- **Use Examples**: Check the [`examples/`](../examples/) directory for patterns
- **Test Early**: Add tests as you build features
- **Ask for Help**: Use GitHub Discussions if you get stuck

## 📚 What's Next?

- [🔧 Build Your First Real Generator](first-generator.md) - More advanced example
- [❓ Troubleshooting Guide](troubleshooting.md) - Solutions to common problems
- [📖 API Reference](../api-reference/) - Detailed API documentation

## 🔄 Using the Fluent API

The BaseGenerator provides a fluent API for more complex operations:

```typescript
// Create multiple files with fluent API
await generator
  .file('Patient')
  .withContent(patientInterface)
  .addImport('Resource', './Resource')
  .addExport('Patient')
  .save();

await generator
  .file('Observation')
  .withContent(observationInterface)
  .addImport('Resource', './Resource')
  .addExport('Observation')
  .save();

// Create an index file
await generator
  .index()
  .withExports(['Patient', 'Observation'])
  .withHeader('// Generated FHIR type exports')
  .save();
```

## 🧪 Testing Your Generator

Always test your generator:

```typescript
// test/JsonGenerator.test.ts
import { describe, test, expect } from 'bun:test';
import { JsonGenerator } from '../src/JsonGenerator';
import { createMockSchema } from '@atomic-ehr/codegen/test-helpers';

describe('JsonGenerator', () => {
  test('generates valid JSON schema', async () => {
    const generator = new JsonGenerator({ outputDir: './test-output' });
    const schema = createMockSchema();

    const results = await generator.build([schema]);

    expect(results).toHaveLength(1);
    expect(() => JSON.parse(results[0].content)).not.toThrow();
  });
});
```

Ready to dive deeper? Continue with [Your First Real Generator](first-generator.md)!
