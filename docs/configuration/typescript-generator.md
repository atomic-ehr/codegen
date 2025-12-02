# TypeScript Generator Configuration

## Value Set Options

### generateValueSets
**Type**: `boolean`  
**Default**: `false`

Enables generation of TypeScript value set files from FHIR bindings.

```typescript
{
  generateValueSets: true
}
```

### valueSetMode
**Type**: `'all' | 'required-only' | 'custom'`  
**Default**: `'required-only'`

Controls the strategy for which FHIR bindings generate value sets.

```typescript
{
  valueSetMode: 'custom' // Use with valueSetStrengths
}
```

**Options**:
- `'required-only'`: Generate only for required bindings (safe default)
- `'custom'`: Use `valueSetStrengths` array to control generation
- `'all'`: Generate for all binding strengths with enums

### valueSetStrengths  
**Type**: `('required' | 'preferred' | 'extensible' | 'example')[]`  
**Default**: `['required']`

Controls which FHIR binding strengths generate value set types. Only used when `valueSetMode` is `'custom'`.

```typescript
{
  valueSetMode: 'custom',
  valueSetStrengths: ['required', 'preferred']
}
```

**Recommendations**:
- Use `['required']` for strict type safety
- Add `'preferred'` for better FHIR compliance  
- Include `'extensible'` for comprehensive coverage
- Avoid `'example'` unless specifically needed

### includeValueSetHelpers
**Type**: `boolean`  
**Default**: `false`

Includes validation helper functions in generated value set files.

```typescript
{
  includeValueSetHelpers: true
}
```

Generates functions like:
```typescript
export const isValidAdministrativeGender = (value: string): value is AdministrativeGender =>
  AdministrativeGenderValues.includes(value as AdministrativeGender);
```

### valueSetDirectory
**Type**: `string`  
**Default**: `'valuesets'`

Directory name for generated value set files, relative to output directory.

```typescript
{
  valueSetDirectory: 'enums' // generates files in generated/enums/
}
```

## Example Configurations

### Minimal Configuration
```typescript
// atomic-codegen.config.ts
export default defineConfig({
  generators: {
    typescript: {
      generateValueSets: true,
    },
  },
});
```

### Recommended Configuration
```typescript
// atomic-codegen.config.ts
export default defineConfig({
  generators: {
    typescript: {
      generateValueSets: true,
      valueSetMode: 'custom',
      valueSetStrengths: ['required', 'preferred'],
      includeValueSetHelpers: true,
      includeDocuments: true,
    },
  },
});
```

### Advanced Configuration
```typescript
// atomic-codegen.config.ts
export default defineConfig({
  generators: {
    typescript: {
      generateValueSets: true,
      valueSetMode: 'all',
      includeValueSetHelpers: true,
      valueSetDirectory: 'fhir-enums',
      includeDocuments: true,
    },
  },
});
```

## Performance Considerations

- **Build Time**: Value set generation adds minimal overhead to build time
- **Output Size**: Generated files are small and compress well
- **Runtime Impact**: Helper functions are lightweight and optional
- **Tree Shaking**: Import only the value sets you need

## Security Considerations

- Value set directory path cannot contain `..` path segments
- Generated files use proper TypeScript const assertions
- Helper functions include type guards for runtime safety