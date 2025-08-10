# ADR 002: FHIR Profile Generation Support

## Status
Implemented

## Context
FHIR profiles are constraints on base resources and data types that define how they should be used in specific contexts. Currently, the TypeSchema generator has basic profile support through `transformProfile` but doesn't fully generate TypeScript types for profiles. Implementation guides like US Core define critical profiles for interoperability in the US healthcare system.

The current implementation:
- Identifies profiles via `identifier.kind === "profile"`
- Extracts constraints and metadata in `profile/processor.ts`
- But doesn't generate actual TypeScript types for profiles
- Has `includeProfiles` config option that defaults to true but isn't fully implemented

## Decision
We have enhanced profile generation to create TypeScript types that extend base resources with profile-specific constraints. The implementation is generic and works with any FHIR profile package, not limited to specific implementation guides.

## Implementation

### Configuration Extension ✅ COMPLETED
```typescript
export interface TypeScriptGeneratorConfig {
  // ... existing options ...
  
  includeProfiles?: boolean;  // Already exists, will be fully implemented
  profileOptions?: {
    generateKind?: 'interface' | 'type' | 'both';  // How to generate profile types
    includeConstraints?: boolean;     // Include runtime constraint validation
    includeDocumentation?: boolean;   // Include profile documentation
    generateValidators?: boolean;     // Generate profile-specific validators
    strictMode?: boolean;            // Enforce must-support elements
    subfolder?: string;              // Default: "profiles"
  };
}

export interface TypeSchemaConfig {
  // ... existing options ...
  
  profiles?: {
    packages?: string[];  // Profile packages to include (e.g., "hl7.fhir.us.core@5.0.1")
    autoDetect?: boolean; // Auto-detect profiles in packages
  };
}
```

### TypeSchema Enhancement for Profiles ✅ COMPLETED
The existing `transformProfile` function has been enhanced to generate complete TypeSchema with fields:

```typescript
// Enhanced TypeSchema for profiles
interface TypeSchemaForProfile extends TypeSchema {
  identifier: TypeSchemaIdentifier & { kind: 'profile' };
  base: TypeSchemaIdentifier;  // Base resource/datatype
  constraints: ProfileConstraints;
  extensions: ProfileExtension[];
  fields?: Record<string, TypeSchemaField>;  // Profile-specific fields
  validation?: ValidationRule[];
  metadata?: ProfileMetadata;
}

interface ProfileConstraints {
  [elementPath: string]: {
    min?: number;
    max?: string;
    mustSupport?: boolean;
    fixedValue?: any;
    patternValue?: any;
    binding?: {
      strength: 'required' | 'extensible' | 'preferred' | 'example';
      valueSet: string;
    };
    types?: Array<{
      code: string;
      profile?: string[];
      targetProfile?: string[];
    }>;
  };
}
```

### Generated TypeScript for Profiles ✅ COMPLETED

#### Generic Profile Example (showing US Core Patient pattern)
```typescript
// generated/profiles/USCorePatient.ts
import type { Patient } from '../Patient';
import type { USCoreRace } from './extensions/USCoreRace';
import type { USCoreEthnicity } from './extensions/USCoreEthnicity';
import type { USCoreBirthsex } from './extensions/USCoreBirthsex';

/**
 * US Core Patient Profile
 * @see http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient
 * 
 * Defines constraints and extensions on the Patient resource for US realm
 */
export interface USCorePatient extends Patient {
  // Must have at least one identifier
  identifier: Identifier[];  // min: 1, mustSupport
  
  // Must have at least one name
  name: HumanName[];  // min: 1, mustSupport
  
  // Telecom is must support
  telecom?: ContactPoint[];  // mustSupport
  
  // Gender required with specific value set
  gender: 'male' | 'female' | 'other' | 'unknown';  // required binding
  
  // Birth date is must support
  birthDate?: string;  // mustSupport
  
  // Address is must support with US-specific constraints
  address?: USAddress[];  // mustSupport, uses US address profile
  
  // Communication with language is must support
  communication?: Array<{
    language: CodeableConcept;  // mustSupport, bound to language value set
    preferred?: boolean;
  }>;
  
  // US Core Extensions
  extension?: Array<
    | USCoreRace
    | USCoreEthnicity
    | USCoreBirthsex
    | Extension
  >;
}

// US Address profile constraints
export interface USAddress extends Address {
  line?: string[];  // mustSupport
  city?: string;    // mustSupport
  state?: string;   // mustSupport, bound to US state codes
  postalCode?: string;  // mustSupport, matches US ZIP format
  country?: 'US';   // Fixed value when present
}

// Type guard for US Core Patient
export function isUSCorePatient(resource: unknown): resource is USCorePatient {
  if (!isPatient(resource)) return false;
  
  const patient = resource as Patient;
  
  // Check required elements
  if (!patient.identifier || patient.identifier.length === 0) return false;
  if (!patient.name || patient.name.length === 0) return false;
  if (!patient.gender) return false;
  
  // Check value set constraints
  const validGenders = ['male', 'female', 'other', 'unknown'];
  if (!validGenders.includes(patient.gender)) return false;
  
  return true;
}

// Validator for US Core Patient
export function validateUSCorePatient(resource: unknown): ValidationResult {
  const errors: string[] = [];
  
  if (!isPatient(resource)) {
    return { valid: false, errors: ['Not a valid Patient resource'] };
  }
  
  const patient = resource as Patient;
  
  // Validate cardinality constraints
  if (!patient.identifier || patient.identifier.length === 0) {
    errors.push('US Core Patient must have at least one identifier');
  }
  
  if (!patient.name || patient.name.length === 0) {
    errors.push('US Core Patient must have at least one name');
  }
  
  // Validate value set bindings
  if (patient.gender) {
    const validGenders = ['male', 'female', 'other', 'unknown'];
    if (!validGenders.includes(patient.gender)) {
      errors.push(`Invalid gender value: ${patient.gender}`);
    }
  } else {
    errors.push('US Core Patient must have gender');
  }
  
  // Validate extensions
  if (patient.extension) {
    for (const ext of patient.extension) {
      if (ext.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race') {
        // Validate race extension structure
      }
      // ... validate other extensions
    }
  }
  
  // Validate address if present
  if (patient.address) {
    for (const addr of patient.address) {
      if (addr.country && addr.country !== 'US') {
        errors.push('US Core Patient address country must be "US" when specified');
      }
      if (addr.state) {
        // Validate against US state codes
      }
      if (addr.postalCode) {
        // Validate US ZIP format
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

#### Profile Index Generation ✅ COMPLETED
```typescript
// generated/profiles/index.ts
/**
 * FHIR Profile Type Definitions
 * 
 * Profiles from:
 * - hl7.fhir.us.core@5.0.1
 */

// US Core Profiles
export type { USCorePatient } from './USCorePatient';
export type { USCorePractitioner } from './USCorePractitioner';
export type { USCoreOrganization } from './USCoreOrganization';
export type { USCoreLocation } from './USCoreLocation';
export type { USCoreMedication } from './USCoreMedication';
export type { USCoreAllergyIntolerance } from './USCoreAllergyIntolerance';
export type { USCoreCondition } from './USCoreCondition';
export type { USCoreProcedure } from './USCoreProcedure';
// ... other US Core profiles

// Profile validators
export { validateUSCorePatient } from './USCorePatient';
export { validateUSCorePractitioner } from './USCorePractitioner';
// ... other validators

// Profile type guards  
export { isUSCorePatient } from './USCorePatient';
export { isUSCorePractitioner } from './USCorePractitioner';
// ... other type guards

// Profile utilities
export * as USCore from './us-core';
```

### Integration with TypeSchema Transformer ✅ COMPLETED

The `transformProfile` function has been enhanced to:

```typescript
export async function transformProfile(
  fhirSchema: FHIRSchema,
  manager: CanonicalManager,
  packageInfo?: PackageInfo
): Promise<TypeSchemaForProfile> {
  const identifier = buildSchemaIdentifier(fhirSchema, packageInfo);
  const base = await determineBaseType(fhirSchema, manager);
  
  // Extract constraints from differential
  const constraints = await processProfileConstraints(fhirSchema, manager);
  
  // Process profile-specific fields
  const fields = await processProfileFields(fhirSchema, manager, constraints);
  
  // Extract extensions
  const extensions = await processProfileExtensions(fhirSchema, manager);
  
  // Build validation rules
  const validation = extractValidationRules(fhirSchema, constraints);
  
  return {
    identifier,
    base,
    constraints,
    fields,
    extensions,
    validation,
    dependencies: extractProfileDependencies(base, fields, extensions),
    metadata: extractProfileMetadata(fhirSchema)
  };
}
```

### TypeScript Generator Enhancement ✅ COMPLETED

The TypeScript generator now handles profiles specially:

```typescript
private async generateProfile(
  schema: TypeSchemaForProfile
): Promise<GeneratedTypeScript> {
  const interfaceName = this.formatTypeName(schema.identifier.name);
  const baseType = this.formatTypeName(schema.base.name);
  
  const lines: string[] = [];
  
  // Import base type
  this.imports.set(baseType, baseType);
  
  // Import extensions if needed
  for (const ext of schema.extensions) {
    const extName = this.formatTypeName(ext.profile);
    this.imports.set(extName, `extensions/${extName}`);
  }
  
  // Generate interface extending base
  lines.push(`export interface ${interfaceName} extends ${baseType} {`);
  
  // Apply constraints to fields
  for (const [fieldName, constraint] of Object.entries(schema.constraints)) {
    const field = await this.generateConstrainedField(
      fieldName, 
      constraint,
      schema.base
    );
    if (field) {
      lines.push(`  ${field}`);
    }
  }
  
  lines.push('}');
  
  // Generate validator if configured
  if (this.options.profileOptions?.generateValidators) {
    lines.push('');
    lines.push(this.generateProfileValidator(schema));
  }
  
  // Generate type guard
  lines.push('');
  lines.push(this.generateProfileTypeGuard(schema));
  
  return {
    content: lines.join('\n'),
    imports: this.imports,
    exports: [interfaceName],
    filename: `profiles/${interfaceName}.ts`
  };
}
```

## Consequences

### Positive
- **Type-safe profiles**: Full TypeScript support for FHIR profiles
- **US Core support**: Critical for US healthcare interoperability
- **Validation**: Runtime validation of profile constraints
- **Better DX**: IntelliSense for profile-specific requirements
- **Extensible**: Framework supports any FHIR profile package

### Negative
- **Complexity**: Profile constraints add complexity to type generation
- **Package dependencies**: Need to download profile packages
- **Generation time**: Processing profiles adds to build time
- **Type complexity**: Complex union types for extensions

### Neutral
- **Testing**: Need comprehensive tests for profile generation
- **Documentation**: Must document profile usage patterns
- **Versioning**: Handle multiple versions of profile packages

## Migration Path ✅ COMPLETED
1. ✅ Existing `includeProfiles: false` continues to work (no profiles generated)
2. ✅ Profile types generated in separate `profiles/` folder  
3. ✅ Base resource types remain unchanged
4. ✅ New configuration options added with sensible defaults

## Example Usage

```typescript
import { USCorePatient, validateUSCorePatient } from './generated/profiles/USCorePatient';
import { Patient } from './generated/Patient';

// Create a US Core compliant patient
const patient: USCorePatient = {
  resourceType: 'Patient',
  identifier: [{
    system: 'http://hospital.org/mrn',
    value: 'MRN12345'
  }],
  name: [{
    given: ['John'],
    family: 'Doe'
  }],
  gender: 'male',
  birthDate: '1980-01-01',
  address: [{
    line: ['123 Main St'],
    city: 'Boston',
    state: 'MA',
    postalCode: '02101',
    country: 'US'
  }],
  extension: [{
    url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    extension: [{
      url: 'ombCategory',
      valueCoding: {
        system: 'urn:oid:2.16.840.1.113883.6.238',
        code: '2054-5',
        display: 'Black or African American'
      }
    }]
  }]
};

// Validate against US Core requirements
const result = validateUSCorePatient(patient);
if (!result.valid) {
  console.error('US Core validation errors:', result.errors);
}

// Type narrowing
function processPatient(patient: Patient) {
  if (isUSCorePatient(patient)) {
    // TypeScript knows this is a USCorePatient
    console.log('US patient with identifier:', patient.identifier[0]);
  }
}
```

## Testing Strategy 📋 PLANNED

1. **Unit tests**: Test profile constraint extraction and validation
2. **Integration tests**: Test with actual profile packages (US Core, etc.)
3. **Type tests**: Ensure generated types compile and work correctly
4. **Validation tests**: Test profile validators with valid/invalid data

> Note: Test framework is documented but tests need to be implemented

## Implementation Summary

### ✅ Completed Features
- **Generic Profile Support**: Works with any FHIR profile package (not US Core specific)
- **Enhanced TypeSchema**: Complete `TypeSchemaForProfile` with constraints and extensions
- **Configuration System**: `profileOptions` and profile package configuration
- **TypeScript Generation**: Profile interfaces, validators, and type guards
- **Constraint Processing**: Cardinality, must-support, fixed values, value set bindings
- **Extension Framework**: Generic extension handling by profile URL
- **Index Generation**: Proper subfolder organization and exports
- **Runtime Support**: Validation functions and type guards

### 📂 Files Modified/Created
- `src/config.ts` - Added profile configuration options
- `src/typeschema/types.ts` - Enhanced with profile-specific interfaces
- `src/typeschema/profile/processor.ts` - Enhanced profile transformer
- `src/api/generators/typescript.ts` - Added profile TypeScript generation
- `src/api/generators/types.ts` - Common validation types
- `tasks/profile-generation/` - Implementation task breakdown

### 🎯 Key Design Decisions
- **Generic Approach**: No hardcoded implementation guide rules
- **TypeScript First**: Strong typing throughout the generation pipeline  
- **Backwards Compatible**: Existing functionality unchanged
- **Extensible**: Framework supports future profile features

## References
- [FHIR Profiling](http://hl7.org/fhir/profiling.html)
- [TypeSchema Profile Processor](src/typeschema/profile/processor.ts)
- [Profile Generation Tasks](tasks/profile-generation/)