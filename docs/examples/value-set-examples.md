# Value Set Examples

## Basic Configuration

### Minimal Setup
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

### Full Configuration
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
      valueSetDirectory: 'valuesets',
    },
  },
});
```

## Usage Patterns

### Type-Safe FHIR Resources
```typescript
import { Patient } from './generated/types/Patient.js';
import { AdministrativeGender } from './generated/valuesets/index.js';

// Type-safe patient creation
const createPatient = (gender: AdministrativeGender): Patient => ({
  resourceType: 'Patient',
  gender,
  // Other fields...
});

// Usage
const patient = createPatient('female'); // ✅ Valid
// const invalid = createPatient('invalid'); // ❌ Compile error
```

### Runtime Validation
```typescript
import { 
  AdministrativeGender, 
  isValidAdministrativeGender 
} from './generated/valuesets/AdministrativeGender.js';

function parseGenderFromForm(input: string): AdministrativeGender {
  if (isValidAdministrativeGender(input)) {
    return input; // Properly typed as AdministrativeGender
  }
  throw new Error(`Invalid gender value: ${input}`);
}

// Usage with form data
const formData = new FormData(form);
const genderInput = formData.get('gender');
if (typeof genderInput === 'string') {
  const gender = parseGenderFromForm(genderInput);
}
```

### Array Operations
```typescript
import { 
  AdministrativeGenderValues, 
  AdministrativeGender 
} from './generated/valuesets/AdministrativeGender.js';

// Get all valid values
const allGenders = AdministrativeGenderValues; // readonly ['male', 'female', 'other', 'unknown']

// Create dropdown options
const genderOptions = AdministrativeGenderValues.map(value => ({
  label: value.charAt(0).toUpperCase() + value.slice(1),
  value,
}));

// Filter valid values
const userInputs = ['male', 'female', 'invalid', 'other'];
const validGenders = userInputs.filter(
  (input): input is AdministrativeGender => 
    AdministrativeGenderValues.includes(input as AdministrativeGender)
);
```

### Integration with Validation Libraries

#### Zod Integration
```typescript
import { z } from 'zod';
import { AdministrativeGenderValues } from './generated/valuesets/AdministrativeGender.js';

const PatientSchema = z.object({
  resourceType: z.literal('Patient'),
  gender: z.enum(AdministrativeGenderValues).optional(),
  // Other fields...
});

type Patient = z.infer<typeof PatientSchema>;
```

#### Joi Integration  
```typescript
import Joi from 'joi';
import { AdministrativeGenderValues } from './generated/valuesets/AdministrativeGender.js';

const patientSchema = Joi.object({
  resourceType: Joi.string().valid('Patient').required(),
  gender: Joi.string().valid(...AdministrativeGenderValues).optional(),
  // Other fields...
});
```

## Advanced Patterns

### Custom Type Guards
```typescript
import { AdministrativeGender, isValidAdministrativeGender } from './generated/valuesets/AdministrativeGender.js';

function isGenderValue(value: unknown): value is AdministrativeGender {
  return typeof value === 'string' && 
    isValidAdministrativeGender(value);
}

// Usage with unknown data
function processApiResponse(data: unknown) {
  if (typeof data === 'object' && data !== null && 'gender' in data) {
    const { gender } = data as { gender: unknown };
    if (isGenderValue(gender)) {
      // gender is properly typed as AdministrativeGender
      console.log(`Valid gender: ${gender}`);
    }
  }
}
```

### Conditional Imports
```typescript
// Only import what you need for tree shaking
import type { AdministrativeGender } from './generated/valuesets/AdministrativeGender.js';
import type { AddressUse } from './generated/valuesets/AddressUse.js';

// Or import everything from index
import type { 
  AdministrativeGender, 
  AddressUse,
  ContactPointSystem 
} from './generated/valuesets/index.js';
```

### React Component Integration
```typescript
import React from 'react';
import { AdministrativeGenderValues, AdministrativeGender } from './generated/valuesets/AdministrativeGender.js';

interface GenderSelectProps {
  value?: AdministrativeGender;
  onChange: (gender: AdministrativeGender) => void;
}

const GenderSelect: React.FC<GenderSelectProps> = ({ value, onChange }) => {
  return (
    <select 
      value={value || ''} 
      onChange={(e) => {
        const selectedValue = e.target.value;
        if (selectedValue && AdministrativeGenderValues.includes(selectedValue as AdministrativeGender)) {
          onChange(selectedValue as AdministrativeGender);
        }
      }}
    >
      <option value="">Select gender...</option>
      {AdministrativeGenderValues.map(gender => (
        <option key={gender} value={gender}>
          {gender.charAt(0).toUpperCase() + gender.slice(1)}
        </option>
      ))}
    </select>
  );
};
```

## Migration Examples

### Before (String Types)
```typescript
// Old generated interface
interface Patient {
  gender?: string;
  addressUse?: string;
}

// Old usage - no type safety
const patient: Patient = {
  gender: 'invalid-value', // No compile error
  addressUse: 'typo',     // No compile error
};
```

### After (Value Set Types)
```typescript
// New generated interface
import type { AdministrativeGender, AddressUse } from '../valuesets/index.js';

interface Patient {
  gender?: AdministrativeGender;
  addressUse?: AddressUse;
}

// New usage - type safe
const patient: Patient = {
  gender: 'male',     // ✅ Valid value
  // gender: 'invalid', // ❌ Compile error
  addressUse: 'home', // ✅ Valid value  
  // addressUse: 'typo', // ❌ Compile error
};
```

## API Integration Examples

### RESTful API with Express
```typescript
import express from 'express';
import { isValidAdministrativeGender } from './generated/valuesets/AdministrativeGender.js';

const app = express();

app.post('/patients', (req, res) => {
  const { gender } = req.body;
  
  // Validate gender if provided
  if (gender && !isValidAdministrativeGender(gender)) {
    return res.status(400).json({
      error: 'Invalid gender value',
      validValues: AdministrativeGenderValues
    });
  }
  
  // Process valid patient data
  const patient: Patient = {
    resourceType: 'Patient',
    gender, // Type-safe after validation
  };
  
  res.json(patient);
});
```

### GraphQL Schema Integration
```typescript
import { AdministrativeGenderValues } from './generated/valuesets/AdministrativeGender.js';
import { GraphQLEnumType } from 'graphql';

const AdministrativeGenderType = new GraphQLEnumType({
  name: 'AdministrativeGender',
  values: AdministrativeGenderValues.reduce((acc, value) => {
    acc[value.toUpperCase()] = { value };
    return acc;
  }, {} as Record<string, { value: string }>)
});
```

## Testing Examples

### Unit Tests with Jest
```typescript
import { isValidAdministrativeGender, AdministrativeGenderValues } from './generated/valuesets/AdministrativeGender.js';

describe('Gender Validation', () => {
  test('validates correct gender values', () => {
    expect(isValidAdministrativeGender('male')).toBe(true);
    expect(isValidAdministrativeGender('female')).toBe(true);
    expect(isValidAdministrativeGender('other')).toBe(true);
    expect(isValidAdministrativeGender('unknown')).toBe(true);
  });

  test('rejects invalid gender values', () => {
    expect(isValidAdministrativeGender('invalid')).toBe(false);
    expect(isValidAdministrativeGender('')).toBe(false);
    expect(isValidAdministrativeGender('MALE')).toBe(false); // Case sensitive
  });

  test('all enum values are valid', () => {
    AdministrativeGenderValues.forEach(gender => {
      expect(isValidAdministrativeGender(gender)).toBe(true);
    });
  });
});
```

### Mock Data Generation
```typescript
import { AdministrativeGenderValues } from './generated/valuesets/AdministrativeGender.js';

function createMockPatient(): Patient {
  const randomGender = AdministrativeGenderValues[
    Math.floor(Math.random() * AdministrativeGenderValues.length)
  ];
  
  return {
    resourceType: 'Patient',
    id: 'test-' + Math.random().toString(36).substr(2, 9),
    gender: randomGender,
    // Other mock fields...
  };
}