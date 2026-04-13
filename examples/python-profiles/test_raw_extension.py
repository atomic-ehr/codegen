"""
FHIR R4 Extension Demo Test

Mirrors examples/typescript-r4/raw-extension.test.ts for the Python generator.
"""

import json
from pathlib import Path

from fhir_types.hl7_fhir_r4_core import (
    Address,
    ContactPoint,
    Element,
    Extension,
    HumanName,
)
from fhir_types.hl7_fhir_r4_core.patient import Patient, PatientContact


def create_patient_with_extensions() -> Patient:
    name = HumanName(
        extension=[
            Extension(
                url="http://example.org/fhir/StructureDefinition/name-verified",
                value_boolean=True,
            )
        ],
        family="van Beethoven",
        family_extension=Element(
            extension=[
                Extension(
                    url="http://hl7.org/fhir/StructureDefinition/humanname-own-prefix",
                    value_string="van",
                ),
            ],
        ),
        given=["Ludwig", "Maria", "Johann"],
        given_extension=[
            Element(
                extension=[
                    Extension(
                        url="http://example.org/fhir/StructureDefinition/name-source",
                        value_code="birth-certificate",
                    ),
                ],
            ),
            None,
            Element(
                extension=[
                    Extension(
                        url="http://example.org/fhir/StructureDefinition/name-source",
                        value_code="baptism-record",
                    ),
                ],
            ),
        ],
    )

    contact = PatientContact(
        extension=[
            Extension(
                url="http://example.org/fhir/StructureDefinition/contact-priority",
                value_integer=1,
            )
        ],
        name=HumanName(family="Watson", given=["John"]),
        telecom=[ContactPoint(system="phone", value="+44-20-7946-1234")],
    )

    return Patient(
        id="ext-demo",
        extension=[
            Extension(
                url="http://hl7.org/fhir/StructureDefinition/patient-birthPlace",
                value_address=Address(city="Springfield", country="US"),
            ),
        ],
        modifier_extension=[
            Extension(
                url="http://example.org/fhir/StructureDefinition/do-not-contact",
                value_boolean=False,
            ),
        ],
        birth_date="1990-03-15",
        birth_date_extension=Element(
            extension=[
                Extension(
                    url="http://hl7.org/fhir/StructureDefinition/patient-birthTime",
                    value_date_time="1990-03-15T08:22:00-05:00",
                ),
            ],
        ),
        name=[name],
        contact=[contact],
    )


SNAPSHOT_DIR = Path(__file__).parent / "__snapshots__"


def test_patient_with_extensions() -> None:
    patient = create_patient_with_extensions()
    actual = json.loads(patient.to_json(indent=2, by_alias=True))
    expected = json.loads((SNAPSHOT_DIR / "patient_with_extensions.json").read_text())
    assert actual == expected


def test_read_resource_level_extension() -> None:
    patient = create_patient_with_extensions()

    assert patient.extension is not None
    assert patient.extension[0].url == "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"
    assert patient.extension[0].value_address is not None
    assert patient.extension[0].value_address.city == "Springfield"

    assert patient.modifier_extension is not None
    assert patient.modifier_extension[0].value_boolean is False


def test_read_element_level_extension() -> None:
    patient = create_patient_with_extensions()

    assert patient.name is not None
    name = patient.name[0]
    assert name.extension is not None
    assert name.extension[0].url == "http://example.org/fhir/StructureDefinition/name-verified"
    assert name.extension[0].value_boolean is True

    assert patient.contact is not None
    contact = patient.contact[0]
    assert contact.extension is not None
    assert contact.extension[0].value_integer == 1


def test_read_primitive_extension() -> None:
    patient = create_patient_with_extensions()

    name = patient.name[0]
    assert isinstance(name.family_extension, Element)
    assert name.family_extension.extension[0].value_string == "van"

    assert isinstance(name.given_extension, list)
    assert name.given_extension[0].extension[0].value_code == "birth-certificate"
    assert name.given_extension[1] is None
    assert name.given_extension[2].extension[0].value_code == "baptism-record"

    assert patient.birth_date_extension is not None
    assert isinstance(patient.birth_date_extension, Element)
    assert patient.birth_date_extension.extension[0].value_date_time == "1990-03-15T08:22:00-05:00"


def test_primitive_extension_survives_round_trip() -> None:
    """After serialize → deserialize, typed _extension fields come back as Element instances."""
    patient = create_patient_with_extensions()
    restored = Patient.from_json(patient.to_json())

    assert restored.birth_date == "1990-03-15"
    assert restored.extension is not None
    assert restored.extension[0].value_address is not None
    assert restored.extension[0].value_address.city == "Springfield"

    assert restored.birth_date_extension is not None
    assert isinstance(restored.birth_date_extension, Element)
    assert restored.birth_date_extension.extension[0].value_date_time == "1990-03-15T08:22:00-05:00"
