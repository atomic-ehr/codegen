# Python Example

FHIR R4 type generation with Pydantic models, configurable field formats, and validation.

## Overview

This example demonstrates how to generate Python/Pydantic models from the FHIR R4 specification using the Atomic EHR Codegen toolkit. It includes:

- Full FHIR R4 resource type definitions as Pydantic models
- Automatic validation and serialization
- Configurable field naming conventions (snake_case or camelCase)
- Integration with Python type checking and IDE support
- Virtual environment setup
- FHIR server client example

## Setup

### Python Environment

1. Create virtual environment:

```bash
cd examples/python
python3 -m venv venv

# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate
```

2. Install Python dependencies:

```bash
pip install -r requirements.txt
```

3. Check Python version:

```bash
python --version  # Should be 3.10 or higher
```

## Generating Types

To generate Python/Pydantic types for FHIR R4:

```bash
bun run examples/python/generate.ts
```

This will output to `./examples/python/fhir_types/`

## Configuration

Edit `generate.ts` to customize:

```typescript
.python({
  allowExtraFields: false,              // Reject unknown fields in models
  fieldFormat: "snake_case"             // or "camelCase"
})
```

**Field Format Options:**

- `snake_case`: Python convention, converts `firstName` → `first_name`
- `camelCase`: Preserves FHIR naming (less Pythonic)

**Extra Fields:**

- `true`: Allow undefined fields (more lenient)
- `false`: Reject unknown fields (strict validation)

## Using Generated Types

### Create and Validate

```python
from fhir_types import Patient, Observation
from datetime import date

patient = Patient(
    resource_type="Patient",
    id="patient-1",
    name=[{
        "use": "official",
        "family": "Smith",
        "given": ["John"]
    }],
    birth_date=date(1980, 1, 15),
    gender="male"
)

print(f"Patient: {patient.family_name}")  # Snake case access
```

### Validation

```python
from pydantic import ValidationError

try:
    patient = Patient(
        resource_type="Patient",
        gender="invalid"  # Must be in value set
    )
except ValidationError as e:
    print(f"Validation error: {e}")
```

### Working with Observations

```python
from fhir_types import Observation
from datetime import datetime

observation = Observation(
    resource_type="Observation",
    id="obs-1",
    status="final",
    code={
        "coding": [{
            "system": "http://loinc.org",
            "code": "39156-5",
            "display": "BMI"
        }]
    },
    subject={"reference": "Patient/patient-1"},
    effective_date_time=datetime.now(),
    value={
        "quantity": {
            "value": 25.5,
            "unit": "kg/m2"
        }
    }
)

print(observation.code.coding[0].display)
```

### Serialization and Deserialization

```python
# To JSON
json_str = patient.model_dump_json(indent=2)

# From JSON
patient = Patient.model_validate_json(json_str)

# To dictionary (excludes None values)
dict_data = patient.model_dump(exclude_none=True)

# From dictionary
patient = Patient.model_validate(dict_data)
```

## Type Checking

### MyPy Integration

Verify type safety with MyPy:

```bash
pip install mypy
mypy fhir_types/
```

### IDE Support

Generated Pydantic models provide:
- Autocomplete for all fields
- Type hints for parameters and returns
- Inline documentation from FHIR specs
- Real-time validation errors

## Running Tests

Create tests to verify generated types:

```bash
pytest tests/ -v
```

### Example Test

```python
from fhir_types import Patient, Observation
from pydantic import ValidationError
import pytest

def test_patient_creation():
    patient = Patient(
        resource_type="Patient",
        id="patient-1",
        name=[{"family": "Smith", "given": ["John"]}]
    )
    assert patient.id == "patient-1"
    assert patient.name[0].family == "Smith"

def test_patient_validation():
    with pytest.raises(ValidationError):
        Patient(
            resource_type="InvalidType",
            id="patient-1"
        )

def test_field_format():
    patient = Patient(
        resource_type="Patient",
        birth_date="1980-01-15"  # snake_case format
    )
    assert patient.birth_date is not None
```

## Customization

### Different Field Format

Regenerate with camelCase:

```typescript
.python({
  fieldFormat: "camelCase"
})
```

### Lenient Validation

Allow extra fields:

```typescript
.python({
  allowExtraFields: true
})
```

### Custom Output Directory

```typescript
.outputTo("./my_fhir_types")
```

## Next Steps

- See [examples/](../) overview for other language examples
- Check [../../CLAUDE.md](../../CLAUDE.md) for architecture details
