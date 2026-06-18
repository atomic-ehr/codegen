# Python Simple Client Example

FHIR R4 type generation with Pydantic models and a minimal **`requests`-based** FHIR client.

> Note: this example hosts the simple synchronous `requests` client. The default
> [`fhirpy`](https://github.com/beda-software/fhir-py) async client is demonstrated in
> [python-r4-us-core/](../python-r4-us-core/).

## Overview

This example demonstrates the generated Python/Pydantic models with a small, dependency-light
FHIR client built on `requests`. It includes:

- FHIR R4 resource type definitions as Pydantic models (snake_case fields, FHIR camelCase aliases)
- A reusable `Client` class (`client.py`) with basic auth and create/read/update/delete/search
- Automatic validation and serialization (`to_json` / `from_json`)

Generated with `client: "none"` (no client-specific code) and `fieldFormat: "snake_case"`.

## Setup

```bash
cd examples/python-r4
python3 -m venv venv
source venv/bin/activate
pip install -r fhir_types/requirements.txt
```

## Generating Types

```bash
bun run examples/python-r4/generate.ts
```

Outputs to `./examples/python-r4/fhir_types/`.

## Using the Client

```python
from client import Auth, AuthCredentials, Client
from fhir_types.hl7_fhir_r4_core import HumanName
from fhir_types.hl7_fhir_r4_core.patient import Patient

client = Client(
    base_url="http://localhost:8080/fhir",
    auth=Auth(method="basic", credentials=AuthCredentials(username="root", password="secret")),
)

created = client.create(Patient(name=[HumanName(given=["Bob"], family="Cool")], birth_date="1980-01-01"))
fetched = client.read(Patient, created.id)
```

## Tests

- `test_sdk.py` — live CRUD against a FHIR server via the `requests` `Client` (requires Aidbox)

## Next Steps

- See [python-r4-us-core/](../python-r4-us-core/) for the default `fhirpy` async client and US Core profiles
- See [examples/](../) for other language examples
