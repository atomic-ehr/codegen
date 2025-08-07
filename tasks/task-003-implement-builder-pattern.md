# Task 003: Implement Builder Pattern Generation

## Priority: Medium
## Status: TODO
## Estimated Effort: 3 hours

## Description
Generate fluent builder classes for FHIR resources to simplify resource creation with excellent autocomplete support.

## Goals
- Generate type-safe builder classes for each resource
- Provide fluent API with method chaining
- Include validation at build time
- Support partial resource construction
- Enable autocomplete for all properties

## Implementation

### 1. Create Builder Generator
Create `src/fhir/generators/typescript/builders.ts`:

```typescript
interface BuilderGeneratorOptions {
  validateOnBuild: boolean;
  includeHelpers: boolean;
  generateFactories: boolean;
  supportPartialBuild: boolean;
}

class BuilderGenerator {
  generateBuilder(resource: TypeSchema): string;
  generateFactory(resource: TypeSchema): string;
  generateHelpers(resource: TypeSchema): string;
}
```

### 2. Builder Pattern Template
```typescript
// Generated builder example
export class PatientBuilder {
  private resource: Partial<Patient> = {
    resourceType: 'Patient'
  };

  withId(id: string): this {
    this.resource.id = id as PatientId;
    return this;
  }

  withIdentifier(system: string, value: string): this {
    if (!this.resource.identifier) {
      this.resource.identifier = [];
    }
    this.resource.identifier.push({ system, value });
    return this;
  }

  withName(given: string | string[], family?: string): this {
    if (!this.resource.name) {
      this.resource.name = [];
    }
    this.resource.name.push({
      given: Array.isArray(given) ? given : [given],
      family
    });
    return this;
  }

  withBirthDate(date: string | Date): this {
    this.resource.birthDate = typeof date === 'string' 
      ? date 
      : date.toISOString().split('T')[0];
    return this;
  }

  withGender(gender: 'male' | 'female' | 'other' | 'unknown'): this {
    this.resource.gender = gender;
    return this;
  }

  withAddress(address: Partial<Address>): this {
    if (!this.resource.address) {
      this.resource.address = [];
    }
    this.resource.address.push(address as Address);
    return this;
  }

  withTelecom(system: 'phone' | 'email', value: string, use?: string): this {
    if (!this.resource.telecom) {
      this.resource.telecom = [];
    }
    this.resource.telecom.push({ system, value, use });
    return this;
  }

  withManagingOrganization(reference: string | Organization): this {
    this.resource.managingOrganization = typeof reference === 'string'
      ? { reference: `Organization/${reference}` }
      : { reference: `Organization/${reference.id}`, display: reference.name };
    return this;
  }

  build(): Patient {
    // Validate required fields
    if (!this.resource.resourceType) {
      throw new Error('resourceType is required');
    }
    
    return this.resource as Patient;
  }

  buildPartial(): Partial<Patient> {
    return { ...this.resource };
  }
}
```

### 3. Factory Functions
```typescript
// Generated factory functions
export function createPatient(
  options?: Partial<Patient>
): PatientBuilder {
  const builder = new PatientBuilder();
  if (options) {
    Object.entries(options).forEach(([key, value]) => {
      const methodName = `with${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      if (typeof builder[methodName] === 'function') {
        builder[methodName](value);
      }
    });
  }
  return builder;
}

// Quick creation helpers
export const patient = createPatient;
```

### 4. Complex Type Builders
```typescript
// Builders for complex types
export class AddressBuilder {
  private address: Partial<Address> = {};

  withLine(line: string | string[]): this {
    this.address.line = Array.isArray(line) ? line : [line];
    return this;
  }

  withCity(city: string): this {
    this.address.city = city;
    return this;
  }

  withState(state: string): this {
    this.address.state = state;
    return this;
  }

  withPostalCode(postalCode: string): this {
    this.address.postalCode = postalCode;
    return this;
  }

  withCountry(country: string): this {
    this.address.country = country;
    return this;
  }

  withUse(use: 'home' | 'work' | 'temp' | 'old'): this {
    this.address.use = use;
    return this;
  }

  build(): Address {
    return this.address as Address;
  }
}
```

### 5. Nested Builder Support
```typescript
// Support for nested builders
export class PatientBuilder {
  withAddressBuilder(
    configure: (builder: AddressBuilder) => AddressBuilder
  ): this {
    const addressBuilder = new AddressBuilder();
    const address = configure(addressBuilder).build();
    return this.withAddress(address);
  }

  withContactBuilder(
    configure: (builder: ContactBuilder) => ContactBuilder
  ): this {
    const contactBuilder = new ContactBuilder();
    const contact = configure(contactBuilder).build();
    if (!this.resource.contact) {
      this.resource.contact = [];
    }
    this.resource.contact.push(contact);
    return this;
  }
}
```

### 6. Usage Examples
```typescript
// Simple usage
const patient = new PatientBuilder()
  .withName('John', 'Doe')
  .withBirthDate('1990-01-01')
  .withGender('male')
  .build();

// With nested builders
const patient = new PatientBuilder()
  .withName('Jane', 'Smith')
  .withAddressBuilder(addr => addr
    .withLine('123 Main St')
    .withCity('Boston')
    .withState('MA')
    .withPostalCode('02134')
    .withUse('home')
  )
  .withTelecom('phone', '555-1234', 'mobile')
  .build();

// Using factory
const patient = createPatient()
  .withIdentifier('MRN', '12345')
  .withManagingOrganization('org-123')
  .build();
```

## Files to Create

### New Files
- `src/fhir/generators/typescript/builders.ts`
- `src/fhir/generators/typescript/factories.ts`
- `test/fhir/generators/builders.test.ts`

### Modified Files
- `src/api/generators/typescript.ts` - Add builder generation option
- `src/config.ts` - Add builder configuration options

## Success Criteria
- [ ] Builders generated for all resources
- [ ] Fluent API with method chaining works
- [ ] Autocomplete suggests appropriate methods
- [ ] Validation prevents invalid resources
- [ ] Nested builders simplify complex structures
- [ ] Factory functions provide quick creation

## Testing
```bash
# Unit tests
bun test test/fhir/generators/builders.test.ts

# Integration test
bun run codegen:all
# Test generated builders in TypeScript project
```

## Dependencies
- Task 001: Reorganize FHIR Module Structure
- Task 002: Enhance TypeScript Interface Generation