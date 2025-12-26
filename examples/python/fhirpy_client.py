import asyncio
import base64
import json
from typing import TypeVar, Dict, Any
from pydantic import BaseModel
from fhirpy import AsyncFHIRClient

from fhir_types.hl7_fhir_r4_core import HumanName
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.hl7_fhir_r4_core.organization import Organization

T = TypeVar('T', bound=BaseModel)

FHIR_SERVER_URL = "http://localhost:8080/fhir"
USERNAME = "root"
PASSWORD = "<SECRET>"
TOKEN = base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode()


def get_resource_components(model: T):
    resource_dict = model.model_dump(
        mode='json',
        by_alias=True,
        exclude_none=True
    )

    resource_type = resource_dict.pop('resourceType', None)
    if not resource_type and hasattr(model, 'resource_type'):
        resource_type = model.resource_type

    if not resource_type:
        raise ValueError("Cannot determine resource type from model")

    return resource_type, resource_dict

async def main():

    client = AsyncFHIRClient(
        FHIR_SERVER_URL,
        authorization=f"Basic {TOKEN}",
    )

    patient = Patient(
        name=[HumanName(given=["Bob"], family="Cool2")],
        gender="female",
        birthDate="1980-01-01",
    )

    created_patient = await client.create(patient)

    print(f"Created patient: {created_patient.id}")
    print(json.dumps(created_patient.serialize(), indent=2))

    organization = Organization(
        name="Beda Software",
        active=True
    )

    organization_resource = await client.resource("Organization", **organization.model_dump(exclude_none=True)).save()
    print(f"Created organization: {organization_resource.id}")

    patients = await client.resources("Patient").fetch()
    for pat in patients:
        print(f"Found: {pat.get('name', [{}])[0].get('family', 'N/A')}")


if __name__ == "__main__":
    asyncio.run(main())