# Troubleshooting Guide

Common issues and solutions when working with the Base Generator System.

## 🚨 Common Issues

### Schema Validation Errors

#### Error: "Schema missing identifier"
```
SchemaValidationError: Schema validation failed for 'unknown'
- Schema missing identifier
```

**Cause**: Your TypeSchema is missing the required `identifier` field.

**Solution**: Ensure all schemas have a complete identifier:
```typescript
const schema = {
  identifier: {
    name: 'Patient',
    kind: 'resource',
    package: 'hl7.fhir.r4.core',
    version: '4.0.1',
    url: 'http://hl7.org/fhir/StructureDefinition/Patient'
  },
  // ... rest of schema
};
```

#### Error: "Schema identifier.kind must be one of..."
```
SchemaValidationError: Schema identifier.kind must be one of: resource, complex-type, profile, primitive-type, logical
```

**Cause**: Invalid `kind` value in the schema identifier.

**Solution**: Use valid kind values:
```typescript
// Valid kinds:
const validKinds = [
  'resource',      // FHIR resources (Patient, Observation)
  'complex-type',  // Complex data types (HumanName, Address)
  'profile',       // FHIR profiles (US Core Patient)
  'primitive-type',// Primitive types (string, integer)
  'logical'        // Logical models
];
```

### File Operation Errors

#### Error: "EACCES: permission denied"
```
EnhancedFileOperationError: Permission denied when writing file
```

**Cause**: Insufficient permissions to write to the output directory.

**Solutions**:
1. **Check Directory Permissions**:
   ```bash
   ls -la ./output-directory
   chmod 755 ./output-directory
   ```

2. **Use Different Output Directory**:
   ```typescript
   const generator = new MyGenerator({
     outputDir: './tmp/generated' // Use writable directory
   });
   ```

3. **Run with Elevated Permissions** (if needed):
   ```bash
   sudo bun run generate.ts
   ```

#### Error: "ENOENT: no such file or directory"
```
Error: ENOENT: no such file or directory, open './output/Patient.ts'
```

**Cause**: Parent directory doesn't exist.

**Solution**: Enable automatic directory creation or create manually:
```typescript
import { mkdir } from 'fs/promises';

// Create directory first
await mkdir('./output', { recursive: true });

// Or use the generator's built-in directory creation
const generator = new MyGenerator({
  outputDir: './output', // Will be created automatically
  createDirectories: true
});
```

### Type Mapping Issues

#### Error: "Unknown primitive type"
```
Error: Cannot map unknown primitive type: 'unknownType'
```

**Cause**: TypeMapper doesn't handle a specific FHIR type.

**Solution**: Extend your TypeMapper to handle more types:
```typescript
class MyTypeMapper extends TypeMapper {
  mapPrimitive(fhirType: string): LanguageType {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'integer': 'number',
      'boolean': 'boolean',
      'dateTime': 'string',
      'decimal': 'number',
      'code': 'string',
      'id': 'string',
      'uri': 'string',
      'canonical': 'string',
      // Add more types as needed
      'unknownType': 'string' // Fallback mapping
    };
    
    const mappedType = typeMap[fhirType];
    if (!mappedType) {
      console.warn(`Unknown FHIR type: ${fhirType}, defaulting to string`);
      return { name: 'string', isPrimitive: true };
    }
    
    return { name: mappedType, isPrimitive: true };
  }
}
```

### Template Errors

#### Error: "Template 'interface' not found"
```
EnhancedTemplateError: Template not found
```

**Cause**: Template file is missing or path is incorrect.

**Solution**: Check template locations and availability:
```typescript
// Check if template directory exists
import { existsSync } from 'fs';

const templateDir = './templates/typescript';
if (!existsSync(templateDir)) {
  console.error('Template directory not found:', templateDir);
}

// List available templates
import { readdir } from 'fs/promises';
const templates = await readdir(templateDir);
console.log('Available templates:', templates);
```

### Memory and Performance Issues

#### Issue: "Generator runs out of memory"
```
JavaScript heap out of memory
```

**Cause**: Processing too many schemas at once.

**Solutions**:
1. **Process in Batches**:
   ```typescript
   const batchSize = 50; // Adjust based on available memory
   for (let i = 0; i < schemas.length; i += batchSize) {
     const batch = schemas.slice(i, i + batchSize);
     await generator.generate(batch);
   }
   ```

2. **Increase Node.js Memory**:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   bun run generate.ts
   ```

3. **Use Build Instead of Generate** for testing:
   ```typescript
   // Uses less memory (no file I/O)
   const results = await generator.build(schemas);
   ```

#### Issue: "Generation is very slow"
```
Generation taking > 30 seconds for small schema sets
```

**Cause**: Inefficient processing or validation overhead.

**Solutions**:
1. **Disable Validation for Performance**:
   ```typescript
   const generator = new MyGenerator({
     outputDir: './output',
     validate: false // Disable for production runs
   });
   ```

2. **Use Performance Mode**:
   ```typescript
   const generator = new MyGenerator({
     outputDir: './output',
     verbose: false,    // Reduce logging
     validate: false,   // Skip validation
     overwrite: true    // Skip file existence checks
   });
   ```

## 🔧 Development Issues

### TypeScript Compilation Errors

#### Error: "Cannot find module '@atomic-ehr/codegen/base'"
```
TS2307: Cannot find module '@atomic-ehr/codegen/base'
```

**Cause**: Import path incorrect or package not installed.

**Solutions**:
1. **Check Installation**:
   ```bash
   bun list @atomic-ehr/codegen
   ```

2. **Fix Import Path**:
   ```typescript
   // Correct imports
   import { BaseGenerator } from '@atomic-ehr/codegen';
   import type { TypeSchema } from '@atomic-ehr/codegen';
   ```

3. **Check TypeScript Configuration**:
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "moduleResolution": "node",
       "esModuleInterop": true,
       "allowSyntheticDefaultImports": true
     }
   }
   ```

### Testing Issues

#### Error: "Test timeouts"
```
Test timeout after 30000ms
```

**Cause**: Tests taking too long or hanging.

**Solutions**:
1. **Use Mocks in Tests**:
   ```typescript
   import { MockLogger, TestFileSystem } from '@atomic-ehr/codegen/test-helpers';
   
   const logger = new MockLogger();
   const fileSystem = new TestFileSystem();
   ```

2. **Increase Test Timeout**:
   ```typescript
   // In test file
   describe('My Generator', { timeout: 60000 }, () => {
     // tests
   });
   ```

3. **Use build() Instead of generate() in Tests**:
   ```typescript
   // Faster - no file I/O
   const results = await generator.build(schemas);
   ```

## 🐛 Debugging Tips

### Enable Verbose Logging

```typescript
const generator = new MyGenerator({
  outputDir: './output',
  verbose: true, // Enable detailed logging
  logger: new ConsoleLogger({ level: 'debug' })
});
```

### Use Debug Mode

```typescript
// Add debug information to your generator
protected async generateSchemaContent(schema: TypeSchema): Promise<string> {
  console.log(`Generating content for: ${schema.identifier.name}`);
  console.log(`Schema kind: ${schema.identifier.kind}`);
  console.log(`Field count: ${Object.keys(schema.fields || {}).length}`);
  
  const content = await super.generateSchemaContent(schema);
  console.log(`Generated ${content.length} characters`);
  
  return content;
}
```

### Inspect Generated Content

```typescript
const results = await generator.build(schemas);

// Inspect results before writing files
results.forEach(file => {
  console.log(`\n--- ${file.filename} ---`);
  console.log(file.content);
  console.log(`Exports: ${file.exports.join(', ')}`);
});
```

## 🔍 Diagnostic Commands

### Check System Requirements
```bash
# Check Node.js/Bun version
bun --version
node --version

# Check available memory
node -e "console.log(process.memoryUsage())"

# Check disk space
df -h ./output-directory
```

### Test Basic Functionality
```bash
# Run built-in tests
bun test test/unit/api/generators/base/

# Test with sample data
bun run examples/json-generator/generate.ts
```

### Performance Diagnostics
```typescript
// Add to your generator
const startTime = performance.now();
const results = await generator.generate(schemas);
const duration = performance.now() - startTime;

console.log(`Generation completed in ${duration.toFixed(2)}ms`);
console.log(`Average time per schema: ${(duration / schemas.length).toFixed(2)}ms`);
console.log(`Memory usage: ${JSON.stringify(process.memoryUsage(), null, 2)}`);
```

## 🆘 Getting More Help

If you're still having issues:

1. **Check the Examples**: Browse [`examples/`](../examples/) for working code
2. **Run Tests**: Use `bun test` to verify your setup
3. **Enable Verbose Mode**: Add `verbose: true` to see detailed logs
4. **Create Minimal Reproduction**: Isolate the issue with a small test case
5. **Open an Issue**: [Report the bug](https://github.com/atomic-ehr/codegen/issues/new?template=bug.md)

## 📋 Issue Report Template

When reporting issues, please include:

```
**Environment:**
- Bun version: 
- Node.js version: 
- OS: 
- Package version: 

**Code Sample:**
```typescript
// Minimal code that reproduces the issue
```

**Error Output:**
```
// Full error message and stack trace
```

**Expected Behavior:**
// What should happen

**Actual Behavior:**
// What actually happens
```

## 💡 Pro Tips

1. **Start with Examples**: Copy and modify existing examples rather than starting from scratch
2. **Test Incrementally**: Test each component (TypeMapper, templates, etc.) separately
3. **Use TypeScript**: Full type safety helps catch issues early
4. **Monitor Performance**: Add timing logs to identify bottlenecks
5. **Keep it Simple**: Start with basic functionality, add complexity gradually

Remember: Most issues are configuration or import problems. Double-check your setup before diving deep! 🔧