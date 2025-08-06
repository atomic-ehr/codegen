# Examples

Real-world examples demonstrating how to use Atomic EHR Codegen in different scenarios.

## Available Examples

- **[Healthcare Application](healthcare-app.md)** - Complete full-stack healthcare app with React frontend and FastAPI backend
- **[API Integration](api-integration.md)** - Integrating with external FHIR APIs
- **[CLI Automation](cli-automation.md)** - Automating code generation in CI/CD pipelines
- **[Custom Profiles](custom-profiles.md)** - Working with custom FHIR profiles
- **[Testing Patterns](testing-patterns.md)** - Testing strategies for FHIR applications

## Quick Examples

### Basic TypeScript Generation

```bash
# Generate FHIR R4 types
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o fhir.ndjson
atomic-codegen generate typescript -i fhir.ndjson -o ./types/fhir

# Use in your code
import { Patient, Observation } from './types/fhir';

const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  active: true,
  name: [{ family: 'Doe', given: ['John'] }]
};
```

### Python with Pydantic

```bash
# Generate Python models
atomic-codegen generate python -i fhir.ndjson -o ./fhir_models --include-validation

# Use with automatic validation
from fhir_models import Patient

patient = Patient(
    id="patient-123",
    active=True,
    name=[{"family": "Doe", "given": ["John"]}]
)

# Serialize to JSON
json_data = patient.model_dump_json()
```

### Configuration-based Workflow

```json
// .atomic-codegen.json
{
  "typeschema": {
    "packages": ["hl7.fhir.r4.core@4.0.1"],
    "validation": true
  },
  "generator": {
    "target": "typescript",
    "outputDir": "./src/types",
    "includeComments": true
  }
}
```

```bash
# Generate using configuration
atomic-codegen typeschema create
atomic-codegen generate typescript
```

## Project Templates

### React + TypeScript

```typescript
// hooks/useFhirResource.ts
import { useState, useEffect } from 'react';
import { Bundle, Patient } from '../types/fhir';

export function useFhirResource<T>(url: string) {
  const [resource, setResource] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setResource(data as T);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [url]);

  return { resource, loading, error };
}

// components/PatientCard.tsx
import React from 'react';
import { Patient } from '../types/fhir';

interface PatientCardProps {
  patient: Patient;
}

export const PatientCard: React.FC<PatientCardProps> = ({ patient }) => {
  const displayName = patient.name?.[0] 
    ? `${patient.name[0].given?.join(' ')} ${patient.name[0].family}`
    : 'Unknown Patient';

  return (
    <div className="patient-card">
      <h3>{displayName}</h3>
      <p>Gender: {patient.gender}</p>
      <p>Birth Date: {patient.birthDate}</p>
      <p>Active: {patient.active ? 'Yes' : 'No'}</p>
    </div>
  );
};
```

### FastAPI + Python

```python
# models.py
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fhir_models import Patient, Bundle

app = FastAPI()

# Storage (use proper database in production)
patients: dict[str, Patient] = {}

@app.post("/fhir/Patient", response_model=Patient)
async def create_patient(patient: Patient) -> Patient:
    """Create a new patient resource."""
    if not patient.id:
        patient.id = f"patient-{len(patients) + 1}"
    
    patients[patient.id] = patient
    return patient

@app.get("/fhir/Patient", response_model=Bundle)
async def search_patients(
    name: Optional[str] = None,
    gender: Optional[str] = None
) -> Bundle:
    """Search for patients."""
    filtered_patients = list(patients.values())
    
    if name:
        filtered_patients = [
            p for p in filtered_patients 
            if any(n.family == name for n in p.name or [])
        ]
    
    if gender:
        filtered_patients = [
            p for p in filtered_patients 
            if p.gender == gender
        ]
    
    return Bundle(
        resourceType="Bundle",
        type="searchset",
        total=len(filtered_patients),
        entry=[
            {"resource": patient} 
            for patient in filtered_patients
        ]
    )
```

### Express.js + TypeScript

```typescript
// server.ts
import express from 'express';
import { Patient, Bundle, OperationOutcome } from './types/fhir';

const app = express();
app.use(express.json());

// In-memory storage
const patients = new Map<string, Patient>();

app.post('/fhir/Patient', (req, res) => {
  try {
    const patient: Patient = req.body;
    
    // Basic validation
    if (!patient.resourceType || patient.resourceType !== 'Patient') {
      const outcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'invalid',
          details: { text: 'Invalid resource type' }
        }]
      };
      return res.status(400).json(outcome);
    }
    
    if (!patient.id) {
      patient.id = `patient-${Date.now()}`;
    }
    
    patients.set(patient.id, patient);
    res.status(201).json(patient);
    
  } catch (error) {
    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'exception',
        details: { text: 'Server error' }
      }]
    };
    res.status(500).json(outcome);
  }
});

app.get('/fhir/Patient/:id', (req, res) => {
  const patient = patients.get(req.params.id);
  if (!patient) {
    return res.status(404).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-found',
        details: { text: 'Patient not found' }
      }]
    });
  }
  res.json(patient);
});
```

## Testing Examples

### Jest + TypeScript

```typescript
// __tests__/patient.test.ts
import { Patient, HumanName } from '../types/fhir';

describe('Patient Resource', () => {
  it('should create a valid patient', () => {
    const name: HumanName = {
      use: 'official',
      family: 'Smith',
      given: ['John', 'Michael']
    };

    const patient: Patient = {
      resourceType: 'Patient',
      id: 'test-patient',
      active: true,
      name: [name],
      gender: 'male',
      birthDate: '1980-01-01'
    };

    expect(patient.resourceType).toBe('Patient');
    expect(patient.name?.[0].family).toBe('Smith');
    expect(patient.gender).toBe('male');
  });

  it('should handle optional fields correctly', () => {
    const minimalPatient: Patient = {
      resourceType: 'Patient'
    };

    expect(minimalPatient.active).toBeUndefined();
    expect(minimalPatient.name).toBeUndefined();
    expect(minimalPatient.gender).toBeUndefined();
  });
});
```

### pytest + Python

```python
# test_patient.py
import pytest
from fhir_models import Patient, HumanName
from pydantic import ValidationError

def test_create_valid_patient():
    """Test creating a valid patient."""
    patient = Patient(
        id="test-patient",
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
    
    assert patient.resource_type == "Patient"
    assert patient.name[0].family == "Smith"
    assert patient.gender == "male"

def test_patient_validation():
    """Test patient validation."""
    with pytest.raises(ValidationError):
        # Invalid gender
        Patient(
            gender="invalid-gender"
        )

def test_patient_serialization():
    """Test patient JSON serialization."""
    patient = Patient(
        id="test-patient",
        active=True,
        name=[HumanName(family="Doe", given=["Jane"])]
    )
    
    json_str = patient.model_dump_json()
    assert "test-patient" in json_str
    assert "Doe" in json_str
    
    # Deserialize and verify
    patient_copy = Patient.model_validate_json(json_str)
    assert patient_copy.id == patient.id
    assert patient_copy.name[0].family == "Doe"
```

## Integration Examples

### GitHub Actions Workflow

```yaml
name: FHIR Type Generation

on:
  schedule:
    # Update types weekly
    - cron: '0 0 * * 1'
  workflow_dispatch:

jobs:
  update-types:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      
      - name: Generate Types
        run: |
          bunx @atomic-ehr/codegen typeschema create \
            hl7.fhir.r4.core@4.0.1 \
            hl7.fhir.us.core@6.1.0 \
            -o schemas/fhir.ndjson
          
          bunx @atomic-ehr/codegen generate typescript \
            -i schemas/fhir.ndjson \
            -o src/types/fhir
      
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'Update FHIR types'
          title: 'Automated FHIR Types Update'
          body: |
            This PR updates FHIR types to the latest versions.
            
            Generated with:
            - hl7.fhir.r4.core@4.0.1
            - hl7.fhir.us.core@6.1.0
```

### Docker Development

```dockerfile
# Dockerfile.dev
FROM node:18-alpine

WORKDIR /app

# Install atomic-codegen globally
RUN npm install -g @atomic-ehr/codegen

# Copy configuration
COPY .atomic-codegen.json ./

# Generate types on container start
CMD ["sh", "-c", "atomic-codegen typeschema create && atomic-codegen generate typescript && npm run dev"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  generator:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - ./src:/app/src
      - ./schemas:/app/schemas
    command: |
      sh -c "
        atomic-codegen typeschema create -o schemas/fhir.ndjson &&
        atomic-codegen generate typescript -i schemas/fhir.ndjson -o src/types/fhir &&
        echo 'Types generated successfully!'
      "
```

These examples demonstrate the flexibility and power of Atomic EHR Codegen across different technologies and use cases. Each example includes complete, runnable code that you can adapt for your own projects.