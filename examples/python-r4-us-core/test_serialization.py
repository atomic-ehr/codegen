"""JSON serialization and deserialization of the generated Pydantic models.

Covers the plain-model contract that every generated resource carries, independent
of profiles and of the fhirpy client: `to_json` / `from_json`, FHIR-shaped output,
polymorphic `Bundle.entry.resource` parsing, and the validation that
`allowExtraFields: false` buys.
"""

import json as json_mod

import pytest
from pydantic import ValidationError

from fhir_types.hl7_fhir_r4_core import HumanName
from fhir_types.hl7_fhir_r4_core.bundle import Bundle
from fhir_types.hl7_fhir_r4_core.patient import Patient


def test_to_json_from_json_round_trip() -> None:
    patient = Patient(
        name=[HumanName(given=["Test"], family="Patient")],
        gender="female",
        birthDate="1980-01-01",
    )

    assert Patient.from_json(patient.to_json(indent=2)) == patient


def test_to_json_emits_fhir_shape() -> None:
    patient = Patient(
        name=[HumanName(given=["Test"], family="Patient")],
        gender="female",
        birthDate="1980-01-01",
    )

    data = json_mod.loads(patient.to_json())

    # FHIR keys and resourceType, whatever the configured field format
    assert data == {
        "resourceType": "Patient",
        "name": [{"given": ["Test"], "family": "Patient"}],
        "gender": "female",
        "birthDate": "1980-01-01",
    }

    # Unset fields are omitted rather than serialized as null
    assert "id" not in data
    assert "address" not in data
    assert "telecom" not in data


def test_bundle_from_json_parses_entries_into_concrete_resources() -> None:
    bundle = Bundle.from_json("""{
        "resourceType": "Bundle",
        "type": "searchset",
        "total": 1,
        "entry": [{
            "resource": {
                "resourceType": "Patient",
                "id": "p-1",
                "gender": "female"
            }
        }]
    }""")

    assert bundle.entry is not None
    assert len(bundle.entry) == 1
    resource = bundle.entry[0].resource
    assert type(resource) is Patient
    assert resource.id == "p-1"


def test_bundle_from_json_rejects_unknown_resource_type() -> None:
    with pytest.raises(ValidationError):
        Bundle.from_json("""{
            "resourceType": "Bundle",
            "type": "searchset",
            "entry": [{
                "resource": {
                    "resourceType": "Weird_Patient",
                    "id": "p-1"
                }
            }]
        }""")


def test_bundle_from_json_rejects_unknown_field() -> None:
    # `allowExtraFields: false` generates `extra="forbid"` on every model
    with pytest.raises(ValidationError):
        Bundle.from_json("""{
            "resourceType": "Bundle",
            "type": "searchset",
            "entry": [{
                "resource": {
                    "resourceType": "Patient",
                    "id": "p-1",
                    "very_wrong_field": "WRONG"
                }
            }]
        }""")
