"""
FHIR R4 Extension Demo Test

Mirrors examples/typescript-r4/raw-extension.test.ts for the Python generator.
"""

import json

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
        _family=Element(
            extension=[
                Extension(
                    url="http://hl7.org/fhir/StructureDefinition/humanname-own-prefix",
                    value_string="van",
                ),
            ],
        ),
        given=["Ludwig", "Maria", "Johann"],
        _given=[
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
        _birth_date=Element(
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


def test_patient_with_extensions() -> None:
    patient = create_patient_with_extensions()
    dumped = json.loads(patient.to_json(indent=2))

    # NOTE: With allowExtraFields (extra="allow"), primitive extension fields
    # on resources serialize using their Python kwarg name (_birth_date),
    # not the FHIR alias (_birthDate). Complex-type extras (_family, _given)
    # keep FHIR names since they don't go through alias resolution.
    # Use primitiveTypeExtension for correct FHIR aliases everywhere.
    assert dumped == {
        "id": "ext-demo",
        "extension": [
            {
                "url": "http://hl7.org/fhir/StructureDefinition/patient-birthPlace",
                "valueAddress": {"city": "Springfield", "country": "US"},
            }
        ],
        "modifierExtension": [
            {
                "url": "http://example.org/fhir/StructureDefinition/do-not-contact",
                "valueBoolean": False,
            }
        ],
        "birthDate": "1990-03-15",
        "_birth_date": {
            "extension": [
                {
                    "url": "http://hl7.org/fhir/StructureDefinition/patient-birthTime",
                    "valueDateTime": "1990-03-15T08:22:00-05:00",
                }
            ]
        },
        "name": [
            {
                "extension": [
                    {
                        "url": "http://example.org/fhir/StructureDefinition/name-verified",
                        "valueBoolean": True,
                    }
                ],
                "family": "van Beethoven",
                "_family": {
                    "extension": [
                        {
                            "url": "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix",
                            "valueString": "van",
                        }
                    ]
                },
                "given": ["Ludwig", "Maria", "Johann"],
                "_given": [
                    {
                        "extension": [
                            {
                                "url": "http://example.org/fhir/StructureDefinition/name-source",
                                "valueCode": "birth-certificate",
                            }
                        ]
                    },
                    None,
                    {
                        "extension": [
                            {
                                "url": "http://example.org/fhir/StructureDefinition/name-source",
                                "valueCode": "baptism-record",
                            }
                        ]
                    },
                ],
            }
        ],
        "contact": [
            {
                "extension": [
                    {
                        "url": "http://example.org/fhir/StructureDefinition/contact-priority",
                        "valueInteger": 1,
                    }
                ],
                "name": {"family": "Watson", "given": ["John"]},
                "telecom": [{"system": "phone", "value": "+44-20-7946-1234"}],
            }
        ],
    }
