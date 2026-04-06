"""
FHIR R4 Extension Profile Tests

Tests generated extension profile classes (Pydantic subclasses of Extension).
"""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from fhir_types.hl7_fhir_r4_core import Address, CodeableConcept, Coding, Element, HumanName, Period
from fhir_types.hl7_fhir_r4_core.base import Extension
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.hl7_fhir_r4_core.profiles.extension_birth_place import BirthPlaceExtension
from fhir_types.hl7_fhir_r4_core.profiles.extension_birth_time import BirthTimeExtension
from fhir_types.hl7_fhir_r4_core.profiles.extension_nationality import (
    NationalityCodeExtension,
    NationalityExtension,
    NationalityPeriodExtension,
)
from fhir_types.hl7_fhir_r4_core.profiles.extension_own_prefix import OwnPrefixExtension


def test_extension_profiles_demo() -> None:
    """
    This test shows all three extension placement levels on a Patient resource.
    """

    birth_place = BirthPlaceExtension(value_address=Address(city="Bonn", country="DE"))
    assert birth_place == BirthPlaceExtension(value_address=Address(city="Bonn", country="DE"))

    nationality = NationalityExtension(extension=[
        NationalityCodeExtension(
            value_codeable_concept=CodeableConcept(
                coding=[Coding(system="urn:iso:std:iso:3166", code="DE")],
            ),
        ),
        NationalityPeriodExtension(value_period=Period(start="1770-12-17")),
    ])
    assert isinstance(nationality.extension[0], NationalityCodeExtension)

    # Primitive extension — attached via _field pattern on primitive fields
    name = HumanName(
        family="van Beethoven",
        family_extension=Element(extension=[OwnPrefixExtension(value_string="van")]),
        given=["Ludwig"],
    )

    # Build a Patient with all extension types at once
    patient = Patient(
        resource_type="Patient",
        birth_date="1770-12-17",
        birth_date_extension=Element(
            extension=[BirthTimeExtension(value_date_time="1770-12-17T12:00:00+01:00")],
        ),
        extension=[birth_place, nationality],
        name=[name],
    )

    patient_json = patient.to_json(by_alias=True, exclude_unset=False)
    expected = json.loads(((Path(__file__).parent / "__snapshots__") / "patient_with_extension_profiles.json").read_text())
    assert json.loads(patient_json) == expected

    restored = Patient.from_json(patient_json)
    assert restored == patient

def test_non_conformant_extension() -> None:
    """Demonstrates what happens when incoming FHIR JSON contains extensions
        that don't conform to a profile's constraints."""
    patient_json = json.dumps({
        "resourceType": "Patient",
        "extension": [
            {
                "url": "http://hl7.org/fhir/StructureDefinition/patient-birthPlace",
                "valueString": "not an address",
            },
        ],
    })
    patient = Patient.from_json(patient_json)
    ext = patient.extension[0]
    assert ext.value_string == "not an address"
    assert ext.value_address is None

    with pytest.raises(ValidationError):
        BirthPlaceExtension.model_validate(ext.model_dump(by_alias=True))


# ---------------------------------------------------------------------------
# Simple extensions
# ---------------------------------------------------------------------------


class TestSimpleExtension:
    def test_construction_and_url(self) -> None:
        ext = BirthPlaceExtension(value_address=Address(city="Bonn"))
        assert ext.url == "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"
        assert isinstance(ext, Extension)

    def test_rejects_wrong_url(self) -> None:
        with pytest.raises(ValidationError):
            BirthPlaceExtension(url="http://wrong", value_address=Address(city="Bonn"))

    def test_value_is_required(self) -> None:
        with pytest.raises(ValidationError):
            BirthPlaceExtension()  # type: ignore[call-arg]

    def test_round_trip(self) -> None:
        original = BirthPlaceExtension(value_address=Address(city="Bonn"))
        restored = BirthPlaceExtension.model_validate_json(
            original.model_dump_json(by_alias=True, exclude_none=True)
        )
        assert restored == original

# ---------------------------------------------------------------------------
# Complex extension: NationalityExtension with discriminated sub-extensions
# ---------------------------------------------------------------------------


class TestNationalityExtension:
    def test_construction_no_sub_extensions(self) -> None:
        ext = NationalityExtension()
        assert ext.url == "http://hl7.org/fhir/StructureDefinition/patient-nationality"
        assert ext.extension is None

    def test_sub_extensions_construction_and_url(self) -> None:
        code_ext = NationalityCodeExtension(
            value_codeable_concept=CodeableConcept(
                coding=[Coding(system="urn:iso:std:iso:3166", code="DE")],
            ),
        )
        period_ext = NationalityPeriodExtension(value_period=Period(start="1770-12-17"))
        assert code_ext.url == "code"
        assert period_ext.url == "period"
        assert isinstance(code_ext, Extension)

    def test_with_both_sub_extensions(self) -> None:
        code_ext = NationalityCodeExtension(
            value_codeable_concept=CodeableConcept(
                coding=[Coding(system="urn:iso:std:iso:3166", code="DE")],
            ),
        )
        period_ext = NationalityPeriodExtension(value_period=Period(start="1770-12-17"))
        ext = NationalityExtension(extension=[code_ext, period_ext])
        assert ext.extension == [code_ext, period_ext]

    def test_sub_extension_rejects_wrong_url(self) -> None:
        with pytest.raises(ValidationError):
            NationalityCodeExtension(url="wrong", value_codeable_concept=CodeableConcept())

    def test_sub_extension_value_is_required(self) -> None:
        with pytest.raises(ValidationError):
            NationalityCodeExtension()  # type: ignore[call-arg]

    def test_round_trip(self) -> None:
        original = NationalityExtension(extension=[
            NationalityCodeExtension(
                value_codeable_concept=CodeableConcept(
                    coding=[Coding(system="urn:iso:std:iso:3166", code="DE")],
                ),
            ),
            NationalityPeriodExtension(value_period=Period(start="1770-12-17", end="1827-03-26")),
        ])
        json_str = original.model_dump_json(by_alias=True, exclude_none=True)
        restored = NationalityExtension.model_validate_json(json_str)
        assert restored == original

    def test_deserialization_from_fhir_json(self) -> None:
        """Discriminated union routes sub-extensions by url during deserialization."""
        raw = json.dumps({
            "url": "http://hl7.org/fhir/StructureDefinition/patient-nationality",
            "extension": [
                {"url": "code", "valueCodeableConcept": {"coding": [{"system": "urn:iso:std:iso:3166", "code": "FR"}]}},
                {"url": "period", "valuePeriod": {"start": "1990-01-01"}},
            ],
        })
        ext = NationalityExtension.model_validate_json(raw)
        assert ext == NationalityExtension(extension=[
            NationalityCodeExtension(
                value_codeable_concept=CodeableConcept(
                    coding=[Coding(system="urn:iso:std:iso:3166", code="FR")],
                ),
            ),
            NationalityPeriodExtension(value_period=Period(start="1990-01-01")),
        ])
