import asyncio
import base64
import json
from fhirpy import AsyncFHIRClient

from fhir_types.hl7_fhir_r4_core import HumanName
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.hl7_fhir_r4_core.organization import Organization


FHIR_SERVER_URL = "http://localhost:8080/fhir"
USERNAME = "root"
PASSWORD = "secret"
TOKEN = base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode()


async def main() -> None:
    """
    Demonstrates usage of fhirpy AsyncFHIRClient to create and fetch FHIR resources.
    Both Client and Resource APIs are showcased.
    """

    client = AsyncFHIRClient(
        FHIR_SERVER_URL,
        authorization=f"Basic {TOKEN}",
        dump_resource=lambda x: x.model_dump(exclude_none=True),
    )

    patient = Patient(
        name=[HumanName(given=["Bob"], family="Cool2")],
        gender="female",
        birthDate="1980-01-01",
    )

    # Create the Patient using fhirpy's client API
    created_patient = await client.create(patient)

    print(f"Created patient: {created_patient.id}")
    print(json.dumps(created_patient.model_dump(exclude_none=True), indent=2))

    organization = Organization(
        name="Beda Software",
        active=True
    )
    created_organization = await client.create(organization)

    print(f"Created organization: {created_organization.id}")

    patients = await client.resources(Patient).fetch()
    for pat in patients:
        print(f"Found: {pat.name[0].family}")


if __name__ == "__main__":
    asyncio.run(main())
