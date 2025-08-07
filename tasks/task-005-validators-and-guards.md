# Task 005: Implement Validators and Type Guards

## Priority: Medium
## Status: TODO
## Estimated Effort: 3 hours

## Description
Generate runtime validators and type guards for FHIR resources to ensure type safety at runtime and provide better error messages.

## Goals
- Generate type guard functions for resource discrimination
- Create runtime validators with detailed error reporting
- Support partial validation for updates
- Implement schema-based validation
- Provide custom validation rules

## Implementation

### 1. Type Guard Generator
Create `src/fhir/generators/typescript/guards.ts`:

```typescript
interface GuardGeneratorOptions {
  strictMode: boolean;
  checkReferences: boolean;
  validateCardinality: boolean;
  customValidators?: Map<string, ValidationRule>;
}

class GuardGenerator {
  generateTypeGuard(resource: TypeSchema): string;
  generateDiscriminator(resources: TypeSchema[]): string;
  generateUnionGuard(unions: TypeSchema[]): string;
}
```

### 2. Basic Type Guards
```typescript
// Generated type guards
export function isPatient(value: unknown): value is Patient {
  return (
    isObject(value) &&
    value.resourceType === 'Patient' &&
    (value.id === undefined || isString(value.id)) &&
    (value.identifier === undefined || isIdentifierArray(value.identifier)) &&
    (value.name === undefined || isHumanNameArray(value.name)) &&
    (value.birthDate === undefined || isDateString(value.birthDate)) &&
    (value.gender === undefined || isGenderCode(value.gender))
  );
}

// Resource discriminator
export function isResource(value: unknown): value is Resource {
  return (
    isObject(value) &&
    'resourceType' in value &&
    typeof value.resourceType === 'string'
  );
}

// Specific resource type guard
export function isResourceOfType<T extends Resource>(
  value: unknown,
  resourceType: T['resourceType']
): value is T {
  return isResource(value) && value.resourceType === resourceType;
}

// Bundle entry type guard
export function isBundleEntry<T extends Resource>(
  entry: unknown,
  resourceType?: T['resourceType']
): entry is BundleEntry<T> {
  if (!isObject(entry)) return false;
  if (!('resource' in entry)) return true; // Entry without resource
  
  const resource = entry.resource;
  if (resourceType) {
    return isResourceOfType(resource, resourceType);
  }
  return isResource(resource);
}
```

### 3. Validator Generator
Create `src/fhir/generators/typescript/validators.ts`:

```typescript
// Generated validators with detailed errors
export class PatientValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];

  validate(value: unknown): ValidationResult<Patient> {
    this.errors = [];
    this.warnings = [];

    if (!isObject(value)) {
      this.addError('root', 'Value must be an object');
      return this.getResult();
    }

    // Required fields
    if (value.resourceType !== 'Patient') {
      this.addError('resourceType', 'Must be "Patient"');
    }

    // Optional fields with validation
    if (value.id !== undefined) {
      this.validateId(value.id, 'id');
    }

    if (value.identifier !== undefined) {
      this.validateIdentifierArray(value.identifier, 'identifier');
    }

    if (value.name !== undefined) {
      this.validateHumanNameArray(value.name, 'name');
    }

    if (value.birthDate !== undefined) {
      this.validateDate(value.birthDate, 'birthDate');
    }

    if (value.gender !== undefined) {
      this.validateGender(value.gender, 'gender');
    }

    // Reference validation
    if (value.managingOrganization !== undefined) {
      this.validateReference(
        value.managingOrganization,
        'managingOrganization',
        ['Organization']
      );
    }

    // Cardinality validation
    if (value.name && value.name.length > 10) {
      this.addWarning('name', 'Unusual number of names (>10)');
    }

    return this.getResult();
  }

  private validateId(value: unknown, path: string): void {
    if (!isString(value)) {
      this.addError(path, 'Must be a string');
      return;
    }

    if (!/^[A-Za-z0-9\-\.]{1,64}$/.test(value)) {
      this.addError(path, 'Invalid ID format');
    }
  }

  private validateDate(value: unknown, path: string): void {
    if (!isString(value)) {
      this.addError(path, 'Must be a string');
      return;
    }

    // FHIR date regex
    const dateRegex = /^([0-9]{4})(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$/;
    if (!dateRegex.test(value)) {
      this.addError(path, 'Invalid FHIR date format');
    }
  }

  private validateGender(value: unknown, path: string): void {
    const validGenders = ['male', 'female', 'other', 'unknown'];
    if (!validGenders.includes(value as string)) {
      this.addError(
        path,
        `Must be one of: ${validGenders.join(', ')}`
      );
    }
  }

  private validateReference(
    value: unknown,
    path: string,
    allowedTypes: string[]
  ): void {
    if (!isObject(value)) {
      this.addError(path, 'Must be an object');
      return;
    }

    if (value.reference) {
      const refPattern = /^([A-Z][a-zA-Z]+)\/([A-Za-z0-9\-\.]{1,64})$/;
      const match = value.reference.match(refPattern);
      
      if (!match) {
        this.addError(`${path}.reference`, 'Invalid reference format');
      } else if (!allowedTypes.includes(match[1])) {
        this.addError(
          `${path}.reference`,
          `Reference must be to: ${allowedTypes.join(', ')}`
        );
      }
    }
  }

  private addError(path: string, message: string): void {
    this.errors.push({ path, message, severity: 'error' });
  }

  private addWarning(path: string, message: string): void {
    this.warnings.push({ path, message, severity: 'warning' });
  }

  private getResult(): ValidationResult<Patient> {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      value: this.errors.length === 0 ? value as Patient : undefined
    };
  }
}
```

### 4. Schema-Based Validation
```typescript
// JSON Schema based validation
export class SchemaValidator {
  private ajv: Ajv;
  private schemas: Map<string, ValidateFunction>;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false
    });
    this.schemas = new Map();
    this.loadSchemas();
  }

  validate<T extends Resource>(
    resourceType: T['resourceType'],
    value: unknown
  ): ValidationResult<T> {
    const validator = this.schemas.get(resourceType);
    if (!validator) {
      return {
        valid: false,
        errors: [{ 
          path: 'root',
          message: `No schema for ${resourceType}`
        }]
      };
    }

    const valid = validator(value);
    if (valid) {
      return { valid: true, value: value as T };
    }

    return {
      valid: false,
      errors: this.formatAjvErrors(validator.errors)
    };
  }

  private formatAjvErrors(errors: ErrorObject[]): ValidationError[] {
    return errors.map(err => ({
      path: err.instancePath || 'root',
      message: err.message || 'Validation failed',
      severity: 'error',
      details: err.params
    }));
  }
}
```

### 5. Composite Validators
```typescript
// Validate with multiple strategies
export class CompositeValidator {
  private validators: Validator[] = [];

  addValidator(validator: Validator): this {
    this.validators.push(validator);
    return this;
  }

  async validate(value: unknown): Promise<ValidationResult> {
    const results = await Promise.all(
      this.validators.map(v => v.validate(value))
    );

    const errors = results.flatMap(r => r.errors || []);
    const warnings = results.flatMap(r => r.warnings || []);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      value: errors.length === 0 ? value : undefined
    };
  }
}

// Usage
const validator = new CompositeValidator()
  .addValidator(new PatientValidator())
  .addValidator(new SchemaValidator())
  .addValidator(new BusinessRuleValidator());

const result = await validator.validate(patientData);
```

### 6. Helper Functions
```typescript
// Validation helpers
export function assertPatient(
  value: unknown,
  message?: string
): asserts value is Patient {
  if (!isPatient(value)) {
    throw new ValidationError(message || 'Value is not a Patient');
  }
}

export function validateAndTransform<T extends Resource>(
  value: unknown,
  resourceType: T['resourceType']
): T {
  const validator = getValidator(resourceType);
  const result = validator.validate(value);
  
  if (!result.valid) {
    throw new ValidationError(
      'Validation failed',
      result.errors
    );
  }
  
  return result.value;
}

// Partial validation for updates
export function validatePartial<T extends Resource>(
  value: Partial<T>,
  resourceType: T['resourceType']
): ValidationResult<Partial<T>> {
  const validator = getValidator(resourceType);
  return validator.validatePartial(value);
}
```

## Files to Create

### New Files
- `src/fhir/generators/typescript/guards.ts`
- `src/fhir/generators/typescript/validators.ts`
- `src/fhir/core/validation.ts`
- `test/fhir/validators.test.ts`

### Modified Files
- `src/api/generators/typescript.ts` - Add validation generation
- `src/config.ts` - Add validation options

## Success Criteria
- [ ] Type guards correctly identify resource types
- [ ] Validators provide detailed error messages
- [ ] Performance is acceptable for large resources
- [ ] Custom validation rules can be added
- [ ] Partial validation works for updates
- [ ] Integration with existing code is smooth

## Testing
```bash
# Unit tests
bun test test/fhir/validators.test.ts

# Performance tests
bun test test/benchmarks/validation.test.ts

# Integration test
bun run codegen:all
```

## Dependencies
- Task 001: Reorganize FHIR Module Structure
- Task 002: Enhance TypeScript Interface Generation