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
    Demonstrates usage of fhirpy AsyncFHIRClient with generated FHIR types.
    Shows create, search, fetch, and update operations.
    """

    client = AsyncFHIRClient(
        FHIR_SERVER_URL,
        authorization=f"Basic {TOKEN}",
        dump_resource=lambda x: x.model_dump(exclude_none=True),
    )

    # Create a Patient
    patient = Patient(
        name=[HumanName(given=["Bob"], family="Cool2")],
        gender="female",
        birthDate="1980-01-01",
    )
    created_patient = await client.create(patient)
    print(f"Created patient: {created_patient.id}")
    print(json.dumps(created_patient.model_dump(exclude_none=True), indent=2))

    # Create an Organization
    organization = Organization(
        name="Beda Software",
        active=True
    )
    created_organization = await client.create(organization)
    print(f"Created organization: {created_organization.id}")

    # Search for all patients
    patients = await client.resources(Patient).fetch()
    print(f"\nFound {len(patients)} patients:")
    for pat in patients:
        print(f"  - {pat.name[0].family}, {pat.name[0].given[0]}")

    # Search with filters
    female_patients = await client.resources(Patient).search(gender="female").fetch()
    print(f"\nFound {len(female_patients)} female patients")

    # Search and limit results
    first_patient = await client.resources(Patient).first()
    if first_patient:
        print(f"\nFirst patient: {first_patient.name[0].family}")

    # Fetch a single patient by ID
    fetched_patient = await client.reference("Patient", created_patient.id).to_resource()
    print(f"\nFetched patient by ID: {fetched_patient.name[0].family}")

    # Update a patient
    created_patient.name = [HumanName(given=["Bob"], family="Updated")]
    updated_patient = await client.update(created_patient)
    print(f"\nUpdated patient family name to: {updated_patient.name[0].family}")

    # Cleanup
    await client.delete(f"Patient/{created_patient.id}")
    await client.delete(f"Organization/{created_organization.id}")
    print("\nCleaned up created resources")


if __name__ == "__main__":
    asyncio.run(main())
