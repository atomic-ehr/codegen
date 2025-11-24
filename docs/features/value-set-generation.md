# Value Set Generation

The TypeScript generator can create strongly-typed value set files from FHIR bindings, providing compile-time type safety and IntelliSense support for FHIR value sets.

## Overview

When enabled, the generator creates:
- Individual TypeScript files for each FHIR value set
- Union types for type safety
- Optional helper validation functions
- Proper imports in interface files

## Benefits

- **Type Safety**: Compile-time checking of enum values
- **IntelliSense**: Auto-completion for valid FHIR values
- **Runtime Validation**: Optional helper functions
- **Tree Shaking**: Import only the value sets you use
- **Maintainability**: Centralized value set definitions

## Configuration

```typescript
// atomic-codegen.config.ts
export default defineConfig({
  generators: {
    typescript: {
      // Enable value set generation
      generateValueSets: true,
      
      // Configure which binding strengths to generate
      valueSetStrengths: ['required', 'preferred'],
      
      // Include validation helper functions
      includeValueSetHelpers: true,
      
      // Customize output directory
      valueSetDirectory: 'valuesets',
    },
  },
});
```

## Generated Structure

```
generated/
├── types/
│   ├── Patient.ts           # Imports value set types
│   └── Address.ts           # Imports value set types
└── valuesets/
    ├── AdministrativeGender.ts
    ├── AddressUse.ts
    ├── AddressType.ts
    └── index.ts             # Re-exports all value sets
```

## Usage Examples

### Basic Usage
```typescript
import { Patient } from './generated/types/Patient.js';
import { AdministrativeGender } from './generated/valuesets/index.js';

const patient: Patient = {
  resourceType: 'Patient',
  gender: 'male', // Type-safe! Only valid values accepted
};

// Compile-time error:
// patient.gender = 'invalid'; // Error: Type '"invalid"' is not assignable
```

### With PythonHelper Functions
```typescript
import { isValidAdministrativeGender } from './generated/valuesets/AdministrativeGender.js';

function validateGender(input: string) {
  if (isValidAdministrativeGender(input)) {
    // input is now typed as AdministrativeGender
    return input;
  }
  throw new Error(`Invalid gender: ${input}`);
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `generateValueSets` | boolean | false | Enable value set generation |
| `valueSetMode` | string | 'required-only' | Value set generation mode |
| `valueSetStrengths` | string[] | ['required'] | Which binding strengths to generate |
| `includeValueSetHelpers` | boolean | false | Include validation functions |
| `valueSetDirectory` | string | 'valuesets' | Output directory name |

## Value Set Generation Modes

### required-only (Default)
Generates value sets only for bindings with "required" strength. This is the safest option as required bindings must use the specified values.

```typescript
{
  valueSetMode: 'required-only' // Only generates required bindings
}
```

### custom
Allows you to specify exactly which binding strengths to generate using the `valueSetStrengths` array.

```typescript
{
  valueSetMode: 'custom',
  valueSetStrengths: ['required', 'preferred']
}
```

### all
Generates value sets for all binding strengths that have enum values defined.

```typescript
{
  valueSetMode: 'all' // Generates for required, preferred, extensible, example
}
```

## Binding Strengths

- **required**: Must use one of the specified values
- **preferred**: Should use specified values but others allowed
- **extensible**: Must use specified values when applicable, can extend
- **example**: Values are examples, any value allowed

## Migration Guide

See [Value Set Migration Guide](../migration/value-set-migration.md) for upgrading existing codebases.