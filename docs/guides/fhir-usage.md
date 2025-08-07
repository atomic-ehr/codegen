# FHIR Usage Guide

This guide covers advanced FHIR-specific features of atomic-codegen, including working with profiles, extensions, search parameters, and implementation guides.

## Table of Contents

- [FHIR Basics](#fhir-basics)
- [Core FHIR Resources](#core-fhir-resources)
- [US Core Profiles](#us-core-profiles)
- [Extensions](#extensions)
- [Search Parameters](#search-parameters)
- [Implementation Guides](#implementation-guides)
- [Validation](#validation)
- [Best Practices](#best-practices)

## FHIR Basics

FHIR (Fast Healthcare Interoperability Resources) is a standard for healthcare data exchange. atomic-codegen generates type-safe TypeScript interfaces from FHIR specifications.

### Supported FHIR Versions

- **FHIR R4** (4.0.1) - Fully supported
- **FHIR R5** (5.0.0) - Supported
- **FHIR STU3** - Limited support

### Package Naming Convention

FHIR packages follow this naming pattern:
- Core: `hl7.fhir.r4.core@4.0.1`
- US Core: `hl7.fhir.us.core@6.1.0`
- Implementation Guides: `hl7.fhir.us.davinci-pdex@2.0.0`

## Core FHIR Resources

### Basic Resource Generation

Generate all core FHIR R4 resources:

```typescript
import { APIBuilder } from '@atomic-ehr/codegen';

const result = await new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .typescript({
    moduleFormat: 'esm',
    generateIndex: true,
    includeDocuments: true
  })
  .outputTo('./generated/fhir-core')
  .generate();
```

### Working with Generated Resources

```typescript
import { 
  Patient, 
  Observation, 
  Condition, 
  MedicationRequest,
  Bundle 
} from './generated/fhir-core';

// Create a patient
const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  active: true,
  name: [{
    use: 'official',
    family: 'Smith',
    given: ['John', 'Michael']
  }],
  gender: 'male',
  birthDate: '1980-01-01',
  telecom: [{
    system: 'phone',
    value: '+1-555-0123',
    use: 'home'
  }, {
    system: 'email',
    value: 'john.smith@example.com',
    use: 'home'
  }],
  address: [{
    use: 'home',
    line: ['123 Main St'],
    city: 'Anytown',
    state: 'CA',
    postalCode: '12345',
    country: 'US'
  }]
};

// Create an observation
const observation: Observation = {
  resourceType: 'Observation',
  id: 'obs-123',
  status: 'final',
  category: [{
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'vital-signs',
      display: 'Vital Signs'
    }]
  }],
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: '8480-6',
      display: 'Systolic blood pressure'
    }]
  },
  subject: {
    reference: 'Patient/patient-123'
  },
  effectiveDateTime: '2023-12-01T10:30:00Z',
  valueQuantity: {
    value: 120,
    unit: 'mmHg',
    system: 'http://unitsofmeasure.org',
    code: 'mm[Hg]'
  }
};
```

### Bundle Operations

```typescript
// Create a transaction bundle
const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: 'urn:uuid:patient-123',
      resource: patient,
      request: {
        method: 'POST',
        url: 'Patient'
      }
    },
    {
      fullUrl: 'urn:uuid:obs-123',
      resource: observation,
      request: {
        method: 'POST',
        url: 'Observation'
      }
    }
  ]
};

// Search result bundle
const searchBundle: Bundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  total: 1,
  entry: [{
    fullUrl: 'https://example.com/fhir/Patient/patient-123',
    resource: patient,
    search: {
      mode: 'match'
    }
  }]
};
```

## US Core Profiles

US Core profiles provide constraints and extensions for US healthcare compliance.

### Generating US Core Types

```typescript
const result = await new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .fromPackage('hl7.fhir.us.core@6.1.0')
  .typescript({
    includeProfiles: true,
    includeExtensions: true,
    namingConvention: 'PascalCase'
  })
  .outputTo('./generated/us-core')
  .generate();
```

### US Core Patient

```typescript
import { USCorePatient } from './generated/us-core';

const usCorePatient: USCorePatient = {
  resourceType: 'Patient',
  id: 'us-patient-123',
  
  // Required US Core elements
  identifier: [{
    use: 'official',
    system: 'http://hospital.org/patient-ids',
    value: 'MRN-123456'
  }],
  name: [{
    use: 'official',
    family: 'Johnson',
    given: ['Maria', 'Elena']
  }],
  gender: 'female',
  
  // US Core extensions
  extension: [
    {
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      extension: [
        {
          url: 'ombCategory',
          valueCoding: {
            system: 'urn:oid:2.16.840.1.113883.6.238',
            code: '2054-5',
            display: 'Black or African American'
          }
        },
        {
          url: 'text',
          valueString: 'Black or African American'
        }
      ]
    },
    {
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
      extension: [
        {
          url: 'ombCategory',
          valueCoding: {
            system: 'urn:oid:2.16.840.1.113883.6.238',
            code: '2186-5',
            display: 'Not Hispanic or Latino'
          }
        },
        {
          url: 'text',
          valueString: 'Not Hispanic or Latino'
        }
      ]
    },
    {
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
      valueCode: 'F'
    }
  ]
};
```

### US Core Observation

```typescript
import { USCoreObservation } from './generated/us-core';

// Vital signs observation
const vitalSigns: USCoreObservation = {
  resourceType: 'Observation',
  id: 'us-obs-123',
  status: 'final',
  
  // Required US Core category
  category: [{
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'vital-signs',
      display: 'Vital Signs'
    }]
  }],
  
  // Blood pressure panel
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: '85354-9',
      display: 'Blood pressure panel with all children optional'
    }]
  },
  
  subject: {
    reference: 'Patient/us-patient-123'
  },
  
  effectiveDateTime: '2023-12-01T10:30:00Z',
  
  // Component observations for systolic and diastolic
  component: [
    {
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '8480-6',
          display: 'Systolic blood pressure'
        }]
      },
      valueQuantity: {
        value: 120,
        unit: 'mmHg',
        system: 'http://unitsofmeasure.org',
        code: 'mm[Hg]'
      }
    },
    {
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '8462-4',
          display: 'Diastolic blood pressure'
        }]
      },
      valueQuantity: {
        value: 80,
        unit: 'mmHg',
        system: 'http://unitsofmeasure.org',
        code: 'mm[Hg]'
      }
    }
  ]
};
```

## Extensions

FHIR extensions allow additional data elements beyond the base specification.

### Working with Extensions

```typescript
// Patient with custom extension
const patientWithExtension: Patient = {
  resourceType: 'Patient',
  id: 'patient-with-ext',
  name: [{ family: 'Doe', given: ['John'] }],
  
  extension: [
    {
      url: 'http://example.org/fhir/StructureDefinition/patient-importance',
      valueString: 'VIP'
    },
    {
      url: 'http://example.org/fhir/StructureDefinition/emergency-contact',
      extension: [
        {
          url: 'name',
          valueString: 'Jane Doe'
        },
        {
          url: 'relationship',
          valueString: 'spouse'
        },
        {
          url: 'phone',
          valueString: '+1-555-0124'
        }
      ]
    }
  ]
};
```

### Extension Helper Functions

```typescript
// Helper function to get extension value
function getExtensionValue<T>(
  resource: { extension?: Extension[] },
  url: string
): T | undefined {
  const extension = resource.extension?.find(ext => ext.url === url);
  return extension?.valueString as T;
}

// Helper function to get nested extension
function getNestedExtension(
  extension: Extension,
  url: string
): Extension | undefined {
  return extension.extension?.find(ext => ext.url === url);
}

// Usage
const importance = getExtensionValue<string>(patientWithExtension, 
  'http://example.org/fhir/StructureDefinition/patient-importance');

const emergencyContact = patientWithExtension.extension?.find(
  ext => ext.url === 'http://example.org/fhir/StructureDefinition/emergency-contact'
);
const contactName = getNestedExtension(emergencyContact!, 'name')?.valueString;
```

## Search Parameters

Generate search parameter definitions for FHIR resources.

### Extracting Search Parameters

```typescript
import { TypeSchemaGenerator } from '@atomic-ehr/codegen';

const generator = new TypeSchemaGenerator({
  verbose: true
});

// Generate from package and get search parameters
await generator.generateFromPackage('hl7.fhir.r4.core@4.0.1');

// Get search parameters for Patient resource
const patientSearchParams = await generator.getSearchParameters('Patient');

console.log('Patient search parameters:');
patientSearchParams.forEach(param => {
  console.log(`- ${param.name}: ${param.type} (${param.description})`);
});
```

### Using Search Parameters

```typescript
// Type-safe search parameter interface
interface PatientSearchParams {
  _id?: string;
  identifier?: string;
  name?: string;
  family?: string;
  given?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthdate?: string;
  active?: boolean;
  email?: string;
  phone?: string;
  address?: string;
  'address-city'?: string;
  'address-state'?: string;
  'address-postalcode'?: string;
  organization?: string;
  _lastUpdated?: string;
  _count?: number;
  _offset?: number;
}

// Search function
async function searchPatients(params: PatientSearchParams): Promise<Bundle> {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.append(key, value.toString());
    }
  });
  
  const response = await fetch(`/fhir/Patient?${searchParams}`);
  return response.json();
}

// Usage
const results = await searchPatients({
  name: 'Smith',
  gender: 'male',
  active: true,
  _count: 10
});
```

## Implementation Guides

Work with specific implementation guides beyond US Core.

### Da Vinci PDex

```typescript
// Generate Da Vinci Payer Data Exchange types
const result = await new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .fromPackage('hl7.fhir.us.core@6.1.0')
  .fromPackage('hl7.fhir.us.davinci-pdex@2.0.0')
  .typescript({
    includeProfiles: true,
    includeExtensions: true
  })
  .outputTo('./generated/davinci-pdex')
  .generate();
```

### CARIN Blue Button

```typescript
// Generate CARIN Blue Button types
const result = await new APIBuilder()
  .fromPackage('hl7.fhir.r4.core@4.0.1')
  .fromPackage('hl7.fhir.us.core@6.1.0')
  .fromPackage('hl7.fhir.us.carin-bb@2.0.0')
  .typescript({
    includeProfiles: true,
    includeExtensions: true
  })
  .outputTo('./generated/carin-bb')
  .generate();
```

## Validation

Validate FHIR resources against profiles and constraints.

### Runtime Validation

```typescript
import { 
  isUSCorePatient, 
  validateUSCorePatient 
} from './generated/us-core/guards';

// Type guard validation
if (isUSCorePatient(someData)) {
  // TypeScript knows this is a USCorePatient
  console.log('Valid US Core Patient');
}

// Detailed validation
const validation = validateUSCorePatient(patientData);
if (validation.valid) {
  console.log('✅ Patient is valid');
} else {
  console.error('❌ Validation errors:');
  validation.errors.forEach(error => {
    console.error(`  - ${error.path}: ${error.message}`);
  });
}
```

### Custom Validation Rules

```typescript
// Custom validator for business rules
function validatePatientBusinessRules(patient: USCorePatient): ValidationResult {
  const errors: ValidationError[] = [];
  
  // Must have at least one identifier
  if (!patient.identifier || patient.identifier.length === 0) {
    errors.push({
      path: 'identifier',
      message: 'Patient must have at least one identifier',
      severity: 'error'
    });
  }
  
  // Must have contact information
  const hasContact = patient.telecom && patient.telecom.length > 0;
  const hasAddress = patient.address && patient.address.length > 0;
  
  if (!hasContact && !hasAddress) {
    errors.push({
      path: 'telecom|address',
      message: 'Patient must have contact information (phone/email) or address',
      severity: 'warning'
    });
  }
  
  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors
  };
}
```

## Best Practices

### 1. Resource Identification

Always use proper resource identification:

```typescript
// Good: Use logical IDs
const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',  // Logical ID
  identifier: [{      // Business identifier
    system: 'http://hospital.org/patient-ids',
    value: 'MRN-123456'
  }]
};

// Good: Use UUIDs for temporary resources
const tempPatient: Patient = {
  resourceType: 'Patient',
  id: crypto.randomUUID(),
  // ... other properties
};
```

### 2. Reference Handling

Use proper reference formats:

```typescript
// Good: Relative references within the same server
const observation: Observation = {
  resourceType: 'Observation',
  subject: {
    reference: 'Patient/patient-123'
  }
};

// Good: Absolute references for external resources
const externalRef: Observation = {
  resourceType: 'Observation',
  subject: {
    reference: 'https://external-server.com/fhir/Patient/ext-123'
  }
};

// Good: Contained resources for tightly coupled data
const withContained: Observation = {
  resourceType: 'Observation',
  contained: [{
    resourceType: 'Patient',
    id: 'contained-patient',
    name: [{ family: 'Doe' }]
  }],
  subject: {
    reference: '#contained-patient'
  }
};
```

### 3. Extension Management

Organize extensions properly:

```typescript
// Good: Use typed extension interfaces
interface PatientExtensions {
  race?: USCoreRaceExtension;
  ethnicity?: USCoreEthnicityExtension;
  birthsex?: USCoreBirthSexExtension;
}

function addUSCoreExtensions(
  patient: Patient, 
  extensions: PatientExtensions
): USCorePatient {
  const result: USCorePatient = { ...patient };
  
  if (extensions.race) {
    result.extension = result.extension || [];
    result.extension.push(extensions.race);
  }
  
  return result;
}
```

### 4. Error Handling

Implement proper FHIR error responses:

```typescript
// Good: Use OperationOutcome for errors
function createOperationOutcome(
  severity: 'error' | 'warning' | 'information',
  code: string,
  details: string
): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{
      severity,
      code,
      details: { text: details }
    }]
  };
}

// Usage in API
app.post('/fhir/Patient', async (req, res) => {
  try {
    if (!isUSCorePatient(req.body)) {
      const outcome = createOperationOutcome(
        'error',
        'invalid',
        'Invalid US Core Patient resource'
      );
      return res.status(400).json(outcome);
    }
    
    const patient = await patientService.create(req.body);
    res.status(201).json(patient);
    
  } catch (error) {
    const outcome = createOperationOutcome(
      'error',
      'exception',
      `Internal server error: ${error.message}`
    );
    res.status(500).json(outcome);
  }
});
```

### 5. Performance Optimization

Optimize for large datasets:

```typescript
// Good: Use pagination for search results
interface SearchOptions {
  _count?: number;
  _offset?: number;
  _total?: 'accurate' | 'estimate' | 'none';
}

async function searchWithPagination<T>(
  searchFn: (params: any) => Promise<Bundle>,
  params: any,
  options: SearchOptions = {}
): Promise<Bundle> {
  const searchParams = {
    ...params,
    _count: options._count || 20,
    _offset: options._offset || 0,
    _total: options._total || 'estimate'
  };
  
  return searchFn(searchParams);
}
```

## Next Steps

- **[Frontend Development Guide](./frontend-development.md)** - Building healthcare UIs
- **[API Development Guide](./api-development.md)** - Creating FHIR-compliant APIs
- **[Advanced Configuration](./advanced-configuration.md)** - Complex generation scenarios

## Resources

- **[FHIR Specification](https://hl7.org/fhir/)** - Official FHIR documentation
- **[US Core Implementation Guide](https://hl7.org/fhir/us/core/)** - US Core profiles
- **[FHIR Package Registry](https://registry.fhir.org/)** - Available FHIR packages
- **[Implementation Guide Registry](https://registry.fhir.org/guides)** - Implementation guides
