import asyncio
import base64
from typing import AsyncIterator

import pytest
import pytest_asyncio
from fhirpy import AsyncFHIRClient

from fhir_types.hl7_fhir_r4_core import HumanName
from fhir_types.hl7_fhir_r4_core.bundle import Bundle
from fhir_types.hl7_fhir_r4_core.observation import Observation
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.hl7_fhir_r4_core.organization import Organization
from pydantic import ValidationError

FHIR_SERVER_URL = "http://localhost:8080/fhir"
USERNAME = "root"
PASSWORD = (
    "<SECRET>"
)
TOKEN = base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode()


@pytest.fixture(scope="module")
def client() -> AsyncFHIRClient:
    return AsyncFHIRClient(
        FHIR_SERVER_URL,
        authorization=f"Basic {TOKEN}",
        dump_resource=lambda x: x.model_dump(exclude_none=True),
    )


@pytest_asyncio.fixture
async def created_patient(client: AsyncFHIRClient) -> AsyncIterator[Patient]:
    patient = Patient(
        name=[HumanName(given=["Test"], family="FhirpyPatient")],
        gender="female",
        birthDate="1980-01-01",
    )
    created = await client.create(patient)
    yield created
    try:
        if created.id is not None:
            await client.delete(f"Patient/{created.id}")
    except Exception:
        pass


@pytest.mark.asyncio
async def test_create_patient(client: AsyncFHIRClient) -> None:
    patient = Patient(
        name=[HumanName(given=["Create"], family="Test")],
        gender="female",
        birthDate="1980-01-01",
    )

    created = await client.create(patient)
    assert created.id is not None
    assert created.name is not None
    assert created.name[0].family == "Test"
    assert created.gender == "female"

    await client.delete(f"Patient/{created.id}")


@pytest.mark.asyncio
async def test_search_patients(client: AsyncFHIRClient, created_patient: Patient) -> None:
    """Test client.resources(Patient).fetch() — requires resourceType class-level access"""
    patients = await client.resources(Patient).fetch()
    assert len(patients) > 0

    found = None
    for p in patients:
        if p.id == created_patient.id:
            found = p
            break
    assert found is not None, f"Patient {created_patient.id} not found in search results"


@pytest.mark.asyncio
async def test_search_with_filters(client: AsyncFHIRClient, created_patient: Patient) -> None:
    """Test client.resources(Patient).search(family='FhirpyPatient').fetch()"""
    patients = await client.resources(Patient).search(family="FhirpyPatient").fetch()
    assert len(patients) > 0

    ids = [p.id for p in patients]
    assert created_patient.id in ids


@pytest.mark.asyncio
async def test_search_returns_typed_resources(client: AsyncFHIRClient, created_patient: Patient) -> None:
    """Verify that fetched resources are deserialized into our generated Patient class"""
    patients = await client.resources(Patient).fetch()
    for p in patients:
        assert isinstance(p, Patient)
        assert p.resourceType == "Patient"


@pytest.mark.asyncio
async def test_update_patient(client: AsyncFHIRClient, created_patient: Patient) -> None:
    assert created_patient.id is not None

    created_patient.name = [HumanName(given=["Updated"], family="FhirpyPatient")]
    created_patient.gender = "male"
    updated = await client.update(created_patient)

    assert updated.id == created_patient.id
    assert updated.gender == "male"
    assert updated.name is not None
    assert updated.name[0].given == ["Updated"]


def test_wrong_resource_type() -> None:
    json = """
    {
      "resourceType" : "Bundle",
      "id" : "bundle-example",
      "type" : "searchset",
      "total" : 3,
      "link" : [{
        "relation" : "self",
        "url" : "https://example.com/base/MedicationRequest?patient=347"
      }],
      "entry" : [{
        "fullUrl" : "https://example.com/base/Patient/3123",
        "resource" : {
          "resourceType" : "Weird_Patient",
          "id" : "3123"
        },
        "search" : {
          "mode" : "match",
          "score" : 1
        }
      }]
    }
    """
    with pytest.raises(ValidationError):
        Bundle.from_json(json)


def test_wrong_fields() -> None:
    json = """
    {
      "resourceType" : "Bundle",
      "id" : "bundle-example",
      "type" : "searchset",
      "total" : 3,
      "link" : [{
        "relation" : "self",
        "url" : "https://example.com/base/MedicationRequest?patient=347"
      }],
      "entry" : [{
        "fullUrl" : "https://example.com/base/Patient/3123",
        "resource" : {
          "resourceType" : "Patient",
          "id" : "3123",
          "very_wrong_field" : "WRONG"
        },
        "search" : {
          "mode" : "match",
          "score" : 1
        }
      }]
    }
    """
    with pytest.raises(ValidationError):
        Bundle.from_json(json)


def test_to_from_json() -> None:
    p = Patient(
        name=[HumanName(given=["Test"], family="Patient")],
        gender="female",
        birthDate="1980-01-01",
    )
    json = p.to_json(indent=2)
    p2 = Patient.from_json(json)
    assert p == p2


def test_resource_type_class_access() -> None:
    """Verify that resourceType is accessible at class level (needed for fhirpy search)"""
    assert Patient.resourceType == "Patient"
    assert Observation.resourceType == "Observation"
    assert Bundle.resourceType == "Bundle"
