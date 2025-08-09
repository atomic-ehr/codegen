# ADR 001: TypeScript Class Generation Support

## Status
Proposed

## Context
The current TypeScript generator only produces TypeScript interfaces from TypeSchema documents. While interfaces are excellent for type checking and IntelliSense support, they don't provide runtime capabilities. Many FHIR applications need runtime functionality such as:
- Resource validation
- Default value initialization  
- Serialization/deserialization helpers
- Builder patterns for constructing complex resources
- Runtime type guards and discriminated unions
- Utility methods for common operations

## Decision
We will extend the TypeScript generator to support optional class generation alongside interfaces. This will be controlled by a new configuration option `generateClasses` in the TypeScript generator config.

## Proposed Implementation

### Configuration Extension
```typescript
export interface TypeScriptGeneratorConfig {
  // ... existing options ...
  
  generateClasses?: boolean;
  classOptions?: {
    subfolder?: string;           // Default: "classes"
    includeValidation?: boolean;  // Include validation methods
    includeBuilders?: boolean;    // Include builder pattern
    includeFactories?: boolean;   // Include factory methods
    includeSerializers?: boolean; // Include toJSON/fromJSON
    includeHelpers?: boolean;     // Include utility helpers
    extendInterfaces?: boolean;   // Classes implement interfaces
    generateBase?: boolean;       // Generate base classes
  };
}
```

### Generated Class Structure
Classes will be generated in a `classes/` subfolder with the following structure:

```typescript
// generated/classes/Patient.ts
import type { Patient as IPatient } from '../Patient';
import { BaseResource } from './BaseResource';
import { validatePatient } from '../validators/Patient';

export class Patient extends BaseResource implements IPatient {
  resourceType: 'Patient' = 'Patient';
  
  // Properties with defaults
  identifier?: Identifier[] = [];
  active?: boolean;
  name?: HumanName[] = [];
  // ... other properties
  
  constructor(data?: Partial<IPatient>) {
    super();
    if (data) {
      Object.assign(this, data);
    }
  }
  
  // Validation method
  validate(): ValidationResult {
    return validatePatient(this);
  }
  
  // Builder pattern
  static builder(): PatientBuilder {
    return new PatientBuilder();
  }
  
  // Factory method
  static create(data: Partial<IPatient>): Patient {
    return new Patient(data);
  }
  
  // Helper methods
  getDisplayName(): string {
    const name = this.name?.[0];
    if (!name) return 'Unknown';
    return [name.given?.join(' '), name.family].filter(Boolean).join(' ');
  }
  
  isActive(): boolean {
    return this.active ?? true;
  }
  
  // Serialization
  toJSON(): IPatient {
    return super.toJSON() as IPatient;
  }
  
  static fromJSON(json: unknown): Patient {
    // Validate and construct
    const validated = validatePatient(json);
    if (!validated.valid) {
      throw new Error(`Invalid Patient resource: ${validated.errors.join(', ')}`);
    }
    return new Patient(json as IPatient);
  }
}

// Builder class
export class PatientBuilder {
  private patient: Partial<IPatient> = { resourceType: 'Patient' };
  
  withId(id: string): this {
    this.patient.id = id;
    return this;
  }
  
  withName(given: string[], family?: string): this {
    this.patient.name = this.patient.name || [];
    this.patient.name.push({ given, family });
    return this;
  }
  
  withIdentifier(system: string, value: string): this {
    this.patient.identifier = this.patient.identifier || [];
    this.patient.identifier.push({ system, value });
    return this;
  }
  
  active(isActive: boolean = true): this {
    this.patient.active = isActive;
    return this;
  }
  
  build(): Patient {
    return new Patient(this.patient);
  }
}
```

### Base Classes
Common base classes will be generated for resource hierarchies:

```typescript
// generated/classes/BaseResource.ts
export abstract class BaseResource {
  abstract resourceType: string;
  id?: string;
  meta?: Meta;
  
  abstract validate(): ValidationResult;
  
  toJSON(): Record<string, any> {
    const json: Record<string, any> = {};
    for (const [key, value] of Object.entries(this)) {
      if (value !== undefined && value !== null) {
        json[key] = value;
      }
    }
    return json;
  }
}

// generated/classes/DomainResource.ts  
export abstract class DomainResource extends BaseResource {
  text?: Narrative;
  contained?: Resource[];
  extension?: Extension[];
  modifierExtension?: Extension[];
}
```

### Integration with Existing Generators
The class generation will:
1. Reuse type information from interface generation
2. Import and implement the corresponding interfaces
3. Leverage validator generation for runtime validation
4. Work alongside existing type guards and validators

## Consequences

### Positive
- **Runtime capabilities**: Classes provide actual runtime objects with methods
- **Better DX**: Builders and factories improve developer experience
- **Validation**: Built-in validation methods ensure data integrity
- **Backwards compatible**: Opt-in feature that doesn't affect existing usage
- **Type safety**: Classes implement interfaces, maintaining type safety
- **Extensibility**: Users can extend generated classes for custom behavior

### Negative
- **Bundle size**: Classes add to the final bundle size
- **Complexity**: More generated code to maintain and debug
- **Performance**: Class instantiation has overhead vs plain objects
- **Duplication**: Some logic duplicated between interfaces and classes

### Neutral
- **Testing**: Need to add tests for class generation
- **Documentation**: Need to document when to use classes vs interfaces
- **Migration**: Existing users need guidance on adopting classes

## Migration Path
1. Feature is opt-in via `generateClasses: true` configuration
2. Classes are generated in separate subfolder to avoid conflicts
3. Existing interface-based code continues to work unchanged
4. Gradual adoption possible - can mix interfaces and classes

## Example Usage
```typescript
import { Patient } from './generated/classes/Patient';

// Using builder pattern
const patient = Patient.builder()
  .withId('123')
  .withName(['John'], 'Doe')
  .withIdentifier('http://hospital.org', 'MRN-12345')
  .active()
  .build();

// Validation
const result = patient.validate();
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}

// Helper methods
console.log(patient.getDisplayName()); // "John Doe"

// Serialization
const json = patient.toJSON();
const restored = Patient.fromJSON(json);
```

## References
- TypeScript Handbook: Classes
- FHIR Resource definitions
- Existing FHIR TypeScript libraries (for patterns)