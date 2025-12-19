import asyncio
import base64
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


class CompatibleClient(AsyncFHIRClient):

    async def create_from_pydantic_model(self, model: T):
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

        resource = self.resource(resource_type, **resource_dict)
        await resource.save()
        return resource

    async def update_from_pydantic_model(self, model: T, resource_id: str):
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

        resource = self.resource(resource_type, id=resource_id, **resource_dict)
        await resource.save()
        return resource

    def pydantic_model_to_resource(self, model: T):
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

        return self.resource(resource_type, **resource_dict)


async def main():

    client = CompatibleClient(
        FHIR_SERVER_URL,
        authorization=f"Basic {TOKEN}",
    )

    patient = Patient(
        name=[HumanName(given=["Create"], family="Test")],
        gender="female",
        birthDate="1980-01-01",
    )

    created_patient = await client.create_from_pydantic_model(patient)
    print(f"Created patient: {created_patient.id}")
    print(created_patient.serialize())

    organization = Organization(
        name="Beda Software",
        active=True
    )

    created_org = await client.create_from_pydantic_model(organization)
    print(f"Created organization: {created_org.id}")

    another_patient = Patient(
        name=[HumanName(given=["John"], family="Doe")],
        gender="male",
        birthDate="1990-05-15",
    )

    patient_resource = client.pydantic_model_to_resource(another_patient)

    await patient_resource.save()
    patient_resource.active = True
    await patient_resource.save()

    patients = await client.resources("Patient").search(name="Test").fetch()
    for pat in patients:
        print(f"Found: {pat.get('name', [{}])[0].get('family', 'N/A')}")


if __name__ == "__main__":
    asyncio.run(main())


# import asyncio
# import base64
#
# from fhir_types.hl7_fhir_r4_core import HumanName
# from fhir_types.hl7_fhir_r4_core.bundle import Bundle
# from fhir_types.hl7_fhir_r4_core.patient import Patient
# from fhirpy import AsyncFHIRClient
#
# FHIR_SERVER_URL = "http://localhost:8080/fhir"
# USERNAME = "root"
# PASSWORD = (
#     "mNZq6yJaRi"#"<SECRET>"  # get actual value from docker-compose.yaml: BOX_ROOT_CLIENT_SECRET
# )
# TOKEN = base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode()
#
#
# async def main():
#     # Create an instance
#     client = AsyncFHIRClient(
#         "http://localhost:8080/fhir",
#         authorization=f"Basic {TOKEN}",
#     )
#
#     # Search for patients
#     resources = client.resources("Patient")  # Return lazy search set
#     resources = resources.search(name="John").limit(10).sort("name")
#     patients = await resources.fetch()  # Returns list of AsyncFHIRResource
#
#     # Create Patient reource
#     patient = Patient(
#         name=[HumanName(given=["Create"], family="Test")],
#         gender="female",
#         birthDate="1980-01-01",
#     )
#
#     pat = await client.create(patient)  # returns Patient
#     print(pat)
#
#     # Create Organization resource
#     organization = client.resource("Organization", name="beda.software", active=False)
#     await organization.save()
#
#     # Update (PATCH) organization. Resource support accessing its elements
#     # both as attribute and as a dictionary keys
#     if organization["active"] is False:
#         organization.active = True
#     await organization.save(fields=["active"])
#     # `await organization.patch(active=True)` would do the same PATCH operation
#
#     # # Get patient resource by reference and delete
#     # patient_ref = client.reference("Patient", "new_patient")
#     # # Get resource from this reference
#     # # (throw ResourceNotFound if no resource was found)
#     # patient_res = await patient_ref.to_resource()
#     # await patient_res.delete()
#
#     # Iterate over search set
#     org_resources = client.resources("Organization")
#     # Lazy loading resources page by page with page count = 100
#     async for org_resource in org_resources.limit(100):
#         print(org_resource.serialize())
#
#
# if __name__ == "__main__":
#     loop = asyncio.get_event_loop()
#     loop.run_until_complete(main())
