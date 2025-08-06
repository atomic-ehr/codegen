# Quick Start

Get up and running with Atomic EHR Codegen in minutes.

## Overview

Atomic EHR Codegen follows a two-step process:

1. **TypeSchema Creation**: Extract type information from FHIR packages
2. **Code Generation**: Generate strongly-typed code in your target language

## Step 1: Create TypeSchema

Generate a TypeSchema file from FHIR packages:

```bash
# Basic FHIR R4 types
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o fhir-types.ndjson

# With US Core profiles
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 hl7.fhir.us.core@6.1.0 -o fhir-with-profiles.ndjson

# Verbose output to see what's happening
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o fhir-types.ndjson --verbose
```

### What is TypeSchema?

TypeSchema is an intermediate format that captures type information from FHIR resources in a language-agnostic way. It includes:

- Resource definitions
- Data types (primitives and complex)
- Value sets and bindings
- Profile constraints
- Documentation and metadata

## Step 2: Generate Code

### TypeScript Generation

```bash
# Basic TypeScript generation
atomic-codegen generate typescript -i fhir-types.ndjson -o ./types

# With additional options
atomic-codegen generate typescript \
  -i fhir-types.ndjson \
  -o ./src/types/fhir \
  --include-validation \
  --format \
  --verbose
```

This creates TypeScript interfaces like:

```typescript
// Generated Patient interface
export interface Patient extends DomainResource {
  resourceType: 'Patient';
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  // ... more fields
}
```

### Python Generation

```bash
# Basic Python generation
atomic-codegen generate python -i fhir-types.ndjson -o ./python_types

# With Pydantic models
atomic-codegen generate python \
  -i fhir-types.ndjson \
  -o ./src/fhir_models \
  --namespace-style flat \
  --format
```

This creates Pydantic models like:

```python
from typing import Optional, List
from pydantic import BaseModel

class Patient(DomainResource):
    resource_type: str = "Patient"
    identifier: Optional[List[Identifier]] = None
    active: Optional[bool] = None
    name: Optional[List[HumanName]] = None
    gender: Optional[str] = None
    birth_date: Optional[str] = None
    # ... more fields
```

## Step 3: Use Generated Types

### In TypeScript Projects

```typescript
import { Patient, Observation, Bundle } from './types/fhir';

// Type-safe FHIR resource creation
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
  birthDate: '1980-01-01'
};

// Type checking catches errors at compile time
// patient.invalidProperty = 'value'; // ✗ TypeScript error

// Build a Bundle
const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: patient
    }
  ]
};
```

### In Python Projects

```python
from fhir_models import Patient, HumanName

# Create type-safe FHIR resources
patient = Patient(
    id="patient-123",
    active=True,
    name=[
        HumanName(
            use="official",
            family="Smith",
            given=["John", "Michael"]
        )
    ],
    gender="male",
    birth_date="1980-01-01"
)

# Pydantic provides automatic validation
# patient.gender = "invalid"  # ✗ Validation error

# Serialize to JSON
patient_json = patient.model_dump_json()

# Parse from JSON with validation
patient_from_json = Patient.model_validate_json(patient_json)
```

## Common Workflows

### Healthcare Application Development

```bash
# 1. Generate comprehensive FHIR types
atomic-codegen typeschema create \
  hl7.fhir.r4.core@4.0.1 \
  hl7.fhir.us.core@6.1.0 \
  -o healthcare-types.ndjson

# 2. Generate TypeScript for frontend
atomic-codegen generate typescript \
  -i healthcare-types.ndjson \
  -o ./frontend/src/types/fhir

# 3. Generate Python for backend API
atomic-codegen generate python \
  -i healthcare-types.ndjson \
  -o ./backend/src/fhir_models
```

### API Integration

```bash
# Generate types for specific FHIR profiles your API uses
atomic-codegen typeschema create \
  hl7.fhir.r4.core@4.0.1 \
  --treeshaking Patient Observation Encounter \
  -o api-types.ndjson

atomic-codegen generate typescript -i api-types.ndjson -o ./types
```

### Testing and Validation

```bash
# Generate types with validation enabled
atomic-codegen generate typescript \
  -i fhir-types.ndjson \
  -o ./types \
  --include-validation

# Validate the generated TypeSchema
atomic-codegen typeschema validate fhir-types.ndjson
```

## Configuration Files

For complex projects, use configuration files to manage settings:

```bash
# Initialize a configuration file
atomic-codegen config init --template typescript

# Use configuration for consistent builds
atomic-codegen typeschema create  # Uses packages from config
atomic-codegen generate typescript  # Uses settings from config
```

## Next Steps

- [Configuration Guide](../guides/configuration.md) - Learn about advanced configuration options
- [CLI Reference](../api-reference/cli.md) - Complete command reference
- [TypeScript Guide](../guides/typescript.md) - TypeScript-specific features
- [Python Guide](../guides/python.md) - Python-specific features
- [Examples](../examples/README.md) - Real-world usage examples

## Troubleshooting

If you encounter issues:

1. **Check package versions**: Ensure FHIR packages exist with `atomic-codegen typeschema create --help`
2. **Validate TypeSchema**: Run `atomic-codegen typeschema validate your-file.ndjson`
3. **Use verbose mode**: Add `--verbose` to see detailed output
4. **Check configuration**: Run `atomic-codegen config show` to see current settings

For more help, see the [troubleshooting guide](../troubleshooting.md) or [open an issue](https://github.com/atomic-ehr/codegen/issues).