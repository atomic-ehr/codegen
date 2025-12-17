import asyncio
import base64

from fhir_types.hl7_fhir_r4_core import HumanName
from fhir_types.hl7_fhir_r4_core.bundle import Bundle
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhirpy import AsyncFHIRClient

FHIR_SERVER_URL = "http://localhost:8080/fhir"
USERNAME = "root"
PASSWORD = (
    "<SECRET>"  # get actual value from docker-compose.yaml: BOX_ROOT_CLIENT_SECRET
)
TOKEN = base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode()


async def main():
    # Create an instance
    client = AsyncFHIRClient(
        "http://localhost:8080/fhir",
        authorization=f"Basic {TOKEN}",
    )

    # Search for patients
    resources = client.resources("Patient")  # Return lazy search set
    resources = resources.search(name="John").limit(10).sort("name")
    patients = await resources.fetch()  # Returns list of AsyncFHIRResource

    # Create Patient reource
    patient = Patient(
        name=[HumanName(given=["Create"], family="Test")],
        gender="female",
        birthDate="1980-01-01",
    )
    pat = await client.create(patient)  # returns Patient
    print(pat)

    # Create Organization resource
    organization = client.resource("Organization", name="beda.software", active=False)
    await organization.save()

    # Update (PATCH) organization. Resource support accessing its elements
    # both as attribute and as a dictionary keys
    if organization["active"] is False:
        organization.active = True
    await organization.save(fields=["active"])
    # `await organization.patch(active=True)` would do the same PATCH operation

    # # Get patient resource by reference and delete
    # patient_ref = client.reference("Patient", "new_patient")
    # # Get resource from this reference
    # # (throw ResourceNotFound if no resource was found)
    # patient_res = await patient_ref.to_resource()
    # await patient_res.delete()

    # Iterate over search set
    org_resources = client.resources("Organization")
    # Lazy loading resources page by page with page count = 100
    async for org_resource in org_resources.limit(100):
        print(org_resource.serialize())


if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
