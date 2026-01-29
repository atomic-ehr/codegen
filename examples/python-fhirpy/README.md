# Python fhirpy Example

FHIR R4 type generation with Pydantic models integrated with the [fhirpy](https://github.com/beda-software/fhir-py) async client library.

## Overview

This example demonstrates how to use generated Python/Pydantic models with the `fhirpy` async FHIR client. It includes:

- Full FHIR R4 resource type definitions as Pydantic models
- Integration with `fhirpy` AsyncFHIRClient
- Automatic validation and serialization
- Async/await patterns for FHIR operations

For a simpler example using `requests`, see [python-simple/](../python-simple/).

## Setup

### Python Environment

1. Create virtual environment:

```bash
cd examples/python-fhirpy
python3 -m venv venv

# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate
```

2. Install Python dependencies:

```bash
pip install -r fhir_types/requirements.txt
pip install fhirpy
```

3. Check Python version:

```bash
python --version  # Should be 3.10 or higher
```

## Generating Types

To generate Python/Pydantic types for FHIR R4 with fhirpy support:

```bash
bun run examples/python-fhirpy/generate.ts
```

This will output to `./examples/python-fhirpy/fhir_types/`

## Configuration

Edit `generate.ts` to customize:

```typescript
.python({
  allowExtraFields: false,              // Reject unknown fields in models
  fieldFormat: "snake_case",            // or "camelCase"
  fhirpyClient: true                    // Enable fhirpy integration
})
```

The `fhirpyClient: true` option generates models that inherit from a base class compatible with fhirpy's client API.

## Using with fhirpy

### Basic Usage

```python
import asyncio
from fhirpy import AsyncFHIRClient
from fhir_types.hl7_fhir_r4_core import HumanName
from fhir_types.hl7_fhir_r4_core.patient import Patient

async def main():
    client = AsyncFHIRClient(
        "http://localhost:8080/fhir",
        authorization="Basic <token>",
    )

    # Create a patient using typed models
    patient = Patient(
        name=[HumanName(given=["John"], family="Doe")],
        gender="male",
        birthDate="1980-01-01",
    )

    # Use fhirpy's client API with the typed model
    created = await client.create(patient)
    print(f"Created patient: {created.id}")

    # Search for patients
    patients = await client.resources("Patient").fetch()
    for pat in patients:
        print(f"Found: {pat.get('name', [{}])[0].get('family', 'N/A')}")

asyncio.run(main())
```

### Resource API

```python
from fhir_types.hl7_fhir_r4_core.organization import Organization

organization = Organization(
    name="My Organization",
    active=True
)

# Use fhirpy's resource API
org_resource = await client.resource(
    "Organization",
    **organization.model_dump(exclude_none=True)
).save()

print(f"Created organization: {org_resource.id}")
```

## Type Checking

### MyPy Integration

Verify type safety with MyPy:

```bash
pip install mypy
mypy fhir_types/
```

## Running the Demo

Start a FHIR server (e.g., using the docker-compose in examples/), then run:

```bash
python client.py
```

## Next Steps

- See [python-simple/](../python-simple/) for basic requests-based example
- See [examples/](../) overview for other language examples
- Check [../../CLAUDE.md](../../CLAUDE.md) for architecture details
- Learn more about [fhirpy](https://github.com/beda-software/fhir-py)
