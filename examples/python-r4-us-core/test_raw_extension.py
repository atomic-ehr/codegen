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
                valueBoolean=True,
            )
        ],
        family="van Beethoven",
        familyExtension=Element(
            extension=[
                Extension(
                    url="http://hl7.org/fhir/StructureDefinition/humanname-own-prefix",
                    valueString="van",
                ),
            ],
        ),
        given=["Ludwig", "Maria", "Johann"],
        givenExtension=[
            Element(
                extension=[
                    Extension(
                        url="http://example.org/fhir/StructureDefinition/name-source",
                        valueCode="birth-certificate",
                    ),
                ],
            ),
            None,
            Element(
                extension=[
                    Extension(
                        url="http://example.org/fhir/StructureDefinition/name-source",
                        valueCode="baptism-record",
                    ),
                ],
            ),
        ],
    )

    contact = PatientContact(
        extension=[
            Extension(
                url="http://example.org/fhir/StructureDefinition/contact-priority",
                valueInteger=1,
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
                valueAddress=Address(city="Springfield", country="US"),
            ),
        ],
        modifierExtension=[
            Extension(
                url="http://example.org/fhir/StructureDefinition/do-not-contact",
                valueBoolean=False,
            ),
        ],
        birthDate="1990-03-15",
        birthDateExtension=Element(
            extension=[
                Extension(
                    url="http://hl7.org/fhir/StructureDefinition/patient-birthTime",
                    valueDateTime="1990-03-15T08:22:00-05:00",
                ),
            ],
        ),
        name=[name],
        contact=[contact],
    )


SNAPSHOT_DIR = Path(__file__).parent / "__snapshots__"


def test_patient_with_extensions() -> None:
    patient = create_patient_with_extensions()
    actual = json.loads(patient.to_json(indent=2))
    expected = json.loads((SNAPSHOT_DIR / "patient_with_extensions.json").read_text())
    assert actual == expected


def test_read_resource_level_extension() -> None:
    patient = create_patient_with_extensions()

    assert patient.extension is not None
    assert patient.extension[0].url == "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"
    assert patient.extension[0].valueAddress is not None
    assert patient.extension[0].valueAddress.city == "Springfield"

    assert patient.modifierExtension is not None
    assert patient.modifierExtension[0].valueBoolean is False


def test_read_element_level_extension() -> None:
    patient = create_patient_with_extensions()

    assert patient.name is not None
    name = patient.name[0]
    assert name.extension is not None
    assert name.extension[0].url == "http://example.org/fhir/StructureDefinition/name-verified"
    assert name.extension[0].valueBoolean is True

    assert patient.contact is not None
    contact = patient.contact[0]
    assert contact.extension is not None
    assert contact.extension[0].valueInteger == 1


def test_read_primitive_extension() -> None:
    patient = create_patient_with_extensions()

    name = patient.name[0]
    assert isinstance(name.familyExtension, Element)
    assert name.familyExtension.extension[0].valueString == "van"

    assert isinstance(name.givenExtension, list)
    assert name.givenExtension[0].extension[0].valueCode == "birth-certificate"
    assert name.givenExtension[1] is None
    assert name.givenExtension[2].extension[0].valueCode == "baptism-record"

    assert patient.birthDateExtension is not None
    assert isinstance(patient.birthDateExtension, Element)
    assert patient.birthDateExtension.extension[0].valueDateTime == "1990-03-15T08:22:00-05:00"


def test_primitive_extension_survives_round_trip() -> None:
    """After serialize → deserialize, typed _extension fields come back as Element instances."""
    patient = create_patient_with_extensions()
    restored = Patient.from_json(patient.to_json())

    assert restored.birthDate == "1990-03-15"
    assert restored.extension is not None
    assert restored.extension[0].valueAddress is not None
    assert restored.extension[0].valueAddress.city == "Springfield"

    assert restored.birthDateExtension is not None
    assert isinstance(restored.birthDateExtension, Element)
    assert restored.birthDateExtension.extension[0].valueDateTime == "1990-03-15T08:22:00-05:00"
