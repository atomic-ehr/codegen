# High-Level API

The high-level API provides a fluent, chainable interface for common FHIR code generation use cases. It simplifies the process of generating TypeScript types and REST API clients from FHIR packages or TypeSchema documents.

## Quick Start

```typescript
import { createAPI } from '@atomic-codegen/api';

// Generate TypeScript types from a FHIR package
const result = await createAPI()
  .fromPackage('hl7.fhir.r4.core')
  .typescript()
  .generate();

console.log(`Generated ${result.filesGenerated.length} files`);
```

## Core Concepts

### API Builder

The `APIBuilder` class provides the main fluent interface for configuring and executing code generation:

```typescript
import { APIBuilder, createAPI } from '@atomic-codegen/api';

// Create builder instance
const api = new APIBuilder({
  outputDir: './generated',
  verbose: true,
  validate: true
});

// Or use factory function
const api = createAPI({
  outputDir: './generated'
});
```

### Data Sources

Load TypeSchema data from various sources:

```typescript
// From FHIR package
api.fromPackage('hl7.fhir.r4.core', '4.0.1')

// From files
api.fromFiles('./schemas/*.ndjson', './types.json')

// From TypeSchema objects
api.fromSchemas(schemaArray)

// From NDJSON string
api.fromString(ndjsonContent, 'ndjson')
```

### Generators

Configure different output generators:

```typescript
// TypeScript interfaces
api.typescript({
  moduleFormat: 'esm',
  generateIndex: true,
  namingConvention: 'PascalCase'
})

// REST API client
api.restClient({
  language: 'typescript',
  httpClient: 'fetch',
  authentication: 'bearer',
  baseUrl: 'https://api.example.com/fhir/R4'
})
```

### Execution

Execute the generation process:

```typescript
// Generate files to disk
const result = await api.generate();

// Build in-memory (no files written)
const results = await api.build();

// Reset configuration
api.reset();
```

## Examples

### Generate TypeScript Types

```typescript
import { createAPI } from '@atomic-codegen/api';

const result = await createAPI({
  outputDir: './src/types/fhir'
})
  .fromPackage('hl7.fhir.r4.core')
  .typescript({
    moduleFormat: 'esm',
    generateIndex: true,
    includeDocuments: true
  })
  .verbose(true)
  .generate();

if (result.success) {
  console.log(`✅ Generated ${result.filesGenerated.length} TypeScript files`);
} else {
  console.error(`❌ Generation failed:`, result.errors);
}
```

### Generate REST API Client

```typescript
import { createAPI } from '@atomic-codegen/api';

const result = await createAPI({
  outputDir: './src/clients/fhir'
})
  .fromPackage('hl7.fhir.r4.core')
  .restClient({
    language: 'typescript',
    httpClient: 'fetch',
    authentication: 'bearer',
    baseUrl: 'https://fhir.example.com/R4',
    generateTypes: true
  })
  .generate();

// Use the generated client
import { FHIRClient } from './src/clients/fhir/fhir-client';

const client = new FHIRClient({
  baseUrl: 'https://fhir.example.com/R4',
  auth: { token: 'your-token' }
});

// CRUD operations
const patient = await client.patient.create({ 
  resourceType: 'Patient',
  name: [{ family: 'Doe', given: ['John'] }]
});

const patientById = await client.patient.read(patient.data.id);
const searchResults = await client.patient.search({ name: 'John' });
```

### Generate Both Types and Client

```typescript
import { createAPI } from '@atomic-codegen/api';

const result = await createAPI({
  outputDir: './src/generated'
})
  .fromFiles('./schemas/patient.ndjson', './schemas/observation.ndjson')
  .typescript({
    moduleFormat: 'esm',
    generateIndex: true
  })
  .restClient({
    language: 'typescript',
    httpClient: 'axios'
  })
  .verbose(true)
  .generate();

console.log('TypeScript files:', result.filesGenerated.filter(f => f.endsWith('.ts')));
```

### Build Without Writing Files

```typescript
import { createAPI } from '@atomic-codegen/api';

const results = await createAPI()
  .fromPackage('hl7.fhir.r4.core')
  .typescript()
  .restClient()
  .build();

// Process TypeScript files
for (const file of results.typescript || []) {
  console.log(`TypeScript: ${file.filename}`);
  console.log(file.content.substring(0, 200) + '...');
}

// Process REST client files
for (const file of results.restclient || []) {
  console.log(`REST Client: ${file.filename}`);
  console.log(file.content.substring(0, 200) + '...');
}
```

### Progress Tracking

```typescript
import { createAPI } from '@atomic-codegen/api';

const api = createAPI()
  .fromPackage('hl7.fhir.r4.core')
  .typescript()
  .restClient()
  .onProgress((phase, current, total, message) => {
    const progress = Math.round((current / total) * 100);
    console.log(`[${phase}] ${progress}% - ${message}`);
  });

const result = await api.generate();
```

### Custom Configuration

```typescript
import { createAPI } from '@atomic-codegen/api';

const api = createAPI({
  outputDir: './output',
  verbose: true,
  validate: true,
  cache: true
})
  .fromPackage('hl7.fhir.us.core', '3.1.1')
  .typescript({
    moduleFormat: 'cjs',
    generateIndex: false,
    namingConvention: 'camelCase'
  })
  .restClient({
    language: 'javascript',
    httpClient: 'node-fetch',
    authentication: 'basic',
    includeValidation: true
  })
  .outputTo('./custom-output')  // Override output directory
  .verbose(false);              // Disable verbose logging

const result = await api.generate();
```

## Configuration Options

### APIBuilderOptions

```typescript
interface APIBuilderOptions {
  outputDir?: string;      // Output directory (default: './generated')
  verbose?: boolean;       // Enable verbose logging (default: false)
  overwrite?: boolean;     // Overwrite existing files (default: true)
  validate?: boolean;      // Validate TypeSchema documents (default: true)
  cache?: boolean;         // Enable caching (default: true)
}
```

### TypeScript Generator Options

```typescript
interface TypeScriptAPIOptions {
  outputDir: string;                           // Output directory
  moduleFormat?: 'esm' | 'cjs';               // Module format (default: 'esm')
  generateIndex?: boolean;                     // Generate index.ts (default: true)
  includeDocuments?: boolean;                  // Include documentation (default: true)
  namingConvention?: 'PascalCase' | 'camelCase'; // Naming convention (default: 'PascalCase')
}
```

### REST Client Generator Options

```typescript
interface RESTClientAPIOptions {
  outputDir: string;                           // Output directory
  language?: 'typescript' | 'javascript';     // Target language (default: 'typescript')
  httpClient?: 'fetch' | 'axios' | 'node-fetch'; // HTTP client library (default: 'fetch')
  generateTypes?: boolean;                     // Generate type definitions (default: true)
  includeValidation?: boolean;                 // Include validation (default: false)
  baseUrl?: string;                           // Default base URL
  apiVersion?: string;                        // API version (default: 'R4')
  authentication?: 'bearer' | 'basic' | 'none'; // Authentication method (default: 'none')
}
```

## Error Handling

```typescript
import { createAPI } from '@atomic-codegen/api';

try {
  const result = await createAPI()
    .fromPackage('non-existent-package')
    .typescript()
    .generate();
    
  if (!result.success) {
    console.error('Generation failed:');
    result.errors.forEach(error => console.error(`  - ${error}`));
    
    if (result.warnings.length > 0) {
      console.warn('Warnings:');
      result.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }
  }
} catch (error) {
  console.error('Unexpected error:', error.message);
}
```

## Advanced Usage

### Using Individual Generators

```typescript
import { TypeScriptAPIGenerator, RESTClientAPIGenerator } from '@atomic-codegen/api';

// Direct generator usage
const tsGenerator = new TypeScriptAPIGenerator({
  outputDir: './types',
  moduleFormat: 'esm'
});

const restGenerator = new RESTClientAPIGenerator({
  outputDir: './clients',
  language: 'typescript',
  httpClient: 'axios'
});

// Generate from schemas
const schemas = /* load your schemas */;
const tsFiles = await tsGenerator.generate(schemas);
const restFiles = await restGenerator.generate(schemas);
```

### Custom Schema Processing

```typescript
import { createAPI, TypeSchemaParser } from '@atomic-codegen/api';

// Load and process schemas manually
const parser = new TypeSchemaParser({ format: 'auto' });
const schemas = await parser.parseFromFiles(['./custom-schemas/*.json']);

// Filter or transform schemas as needed
const resourceSchemas = schemas.filter(s => s.identifier.kind === 'resource');

// Generate with processed schemas
const result = await createAPI()
  .fromSchemas(resourceSchemas)
  .typescript()
  .generate();
```

## Best Practices

1. **Use validation**: Enable validation to catch schema issues early
2. **Handle errors**: Always check the `success` flag and handle errors appropriately
3. **Progress tracking**: Use progress callbacks for long-running operations
4. **Caching**: Enable caching for better performance when processing large packages
5. **Output organization**: Use descriptive output directories to organize generated code
6. **Version control**: Consider excluding generated files from version control
7. **Documentation**: Include generated documentation when available

## Integration Examples

### With Build Tools

```json
{
  "scripts": {
    "generate:types": "node scripts/generate-types.js",
    "generate:client": "node scripts/generate-client.js",
    "generate:all": "npm run generate:types && npm run generate:client",
    "prebuild": "npm run generate:all"
  }
}
```

```javascript
// scripts/generate-types.js
const { createAPI } = require('@atomic-codegen/api');

async function generateTypes() {
  const result = await createAPI({
    outputDir: './src/types/fhir',
    verbose: true
  })
    .fromPackage('hl7.fhir.r4.core')
    .typescript()
    .generate();
    
  if (!result.success) {
    console.error('Type generation failed:', result.errors);
    process.exit(1);
  }
  
  console.log(`Generated ${result.filesGenerated.length} type files`);
}

generateTypes().catch(console.error);
```

### With Testing

```typescript
import { createAPI } from '@atomic-codegen/api';

describe('Generated Types', () => {
  let generatedTypes: any;
  
  beforeAll(async () => {
    const results = await createAPI()
      .fromPackage('hl7.fhir.r4.core')
      .typescript()
      .build();
      
    // Process generated types for testing
    generatedTypes = processGeneratedTypes(results.typescript);
  });
  
  it('should generate Patient interface', () => {
    expect(generatedTypes).toHaveProperty('Patient');
    expect(generatedTypes.Patient).toHaveProperty('resourceType');
  });
});
```