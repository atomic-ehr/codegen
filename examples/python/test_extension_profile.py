"""
FHIR R4 Extension Profile Tests

Tests generated extension profile classes (Pydantic subclasses of Extension).
"""

import json

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
    Extension profiles are typed Pydantic wrappers around FHIR extensions.

    Instead of working with raw Extension dicts, you get:
    - Auto-complete and type checking for extension values
    - Canonical URL enforced at construction time
    - Proper serialization to FHIR JSON with correct aliases
    - Discriminated unions for complex extensions with sub-extensions

    This test shows all three extension placement levels on a Patient resource.
    """

    # 1. Simple extension — wraps a single typed value
    birth_place = BirthPlaceExtension(value_address=Address(city="Bonn", country="DE"))
    assert birth_place.url == "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"
    assert birth_place.value_address.city == "Bonn"

    # 2. Complex extension — contains sub-extensions routed by URL discriminator
    nationality = NationalityExtension(extension=[
        NationalityCodeExtension(
            value_codeable_concept=CodeableConcept(
                coding=[Coding(system="urn:iso:std:iso:3166", code="DE")],
            ),
        ),
        NationalityPeriodExtension(value_period=Period(start="1770-12-17")),
    ])
    assert isinstance(nationality.extension[0], NationalityCodeExtension)
    assert nationality.extension[0].value_codeable_concept.coding[0].code == "DE"

    # 3. Primitive extension — attached via _field pattern on primitive fields
    name = HumanName(
        family="van Beethoven",
        family_extension=Element(extension=[OwnPrefixExtension(value_string="van")]),
        given=["Ludwig"],
    )

    # 4. Build a Patient with all extension types at once
    patient = Patient(
        resource_type="Patient",
        birth_date="1770-12-17",
        birth_date_extension=Element(
            extension=[BirthTimeExtension(value_date_time="1770-12-17T12:00:00+01:00")],
        ),
        extension=[birth_place, nationality],
        name=[name],
    )

    # 5. Serializes to standard FHIR JSON
    raw = json.loads(patient.model_dump_json(by_alias=True, exclude_none=True))
    assert raw["extension"][0]["valueAddress"]["city"] == "Bonn"
    assert raw["extension"][1]["extension"][0]["valueCodeableConcept"]["coding"][0]["code"] == "DE"
    assert raw["_birthDate"]["extension"][0]["valueDateTime"] == "1770-12-17T12:00:00+01:00"
    assert raw["name"][0]["_family"]["extension"][0]["valueString"] == "van"

    # 6. Round-trips back through deserialization
    restored = Patient.model_validate_json(patient.model_dump_json(by_alias=True, exclude_none=True))
    assert restored.birth_date == "1770-12-17"
    assert len(restored.extension) == 2
    assert restored.name[0].family == "van Beethoven"


# ---------------------------------------------------------------------------
# Simple extensions
# ---------------------------------------------------------------------------


class TestBirthPlaceExtension:
    def test_construction_and_url(self) -> None:
        ext = BirthPlaceExtension(value_address=Address(city="Bonn"))
        assert ext.url == "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"
        assert isinstance(ext, Extension)

    def test_rejects_wrong_url(self) -> None:
        with pytest.raises(ValidationError):
            BirthPlaceExtension(url="http://wrong", value_address=Address(city="Bonn"))

    def test_value_is_required(self) -> None:
        with pytest.raises(ValidationError):
            BirthPlaceExtension()

    def test_round_trip(self) -> None:
        original = BirthPlaceExtension(value_address=Address(city="Bonn"))
        restored = BirthPlaceExtension.model_validate_json(
            original.model_dump_json(by_alias=True, exclude_none=True)
        )
        assert restored.url == "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"


class TestBirthTimeExtension:
    def test_construction_and_url(self) -> None:
        ext = BirthTimeExtension(value_date_time="1990-03-15T08:22:00-05:00")
        assert ext.url == "http://hl7.org/fhir/StructureDefinition/patient-birthTime"
        assert isinstance(ext, Extension)

    def test_rejects_wrong_url(self) -> None:
        with pytest.raises(ValidationError):
            BirthTimeExtension(url="http://wrong", value_date_time="1990-03-15T08:22:00-05:00")

    def test_value_is_required(self) -> None:
        with pytest.raises(ValidationError):
            BirthTimeExtension()

    def test_round_trip(self) -> None:
        original = BirthTimeExtension(value_date_time="1990-03-15T08:22:00-05:00")
        restored = BirthTimeExtension.model_validate_json(
            original.model_dump_json(by_alias=True, exclude_none=True)
        )
        assert restored.url == "http://hl7.org/fhir/StructureDefinition/patient-birthTime"


class TestOwnPrefixExtension:
    def test_construction_and_url(self) -> None:
        ext = OwnPrefixExtension(value_string="van")
        assert ext.url == "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix"
        assert isinstance(ext, Extension)

    def test_rejects_wrong_url(self) -> None:
        with pytest.raises(ValidationError):
            OwnPrefixExtension(url="http://wrong", value_string="van")

    def test_value_is_required(self) -> None:
        with pytest.raises(ValidationError):
            OwnPrefixExtension()

    def test_round_trip(self) -> None:
        original = OwnPrefixExtension(value_string="van")
        restored = OwnPrefixExtension.model_validate_json(
            original.model_dump_json(by_alias=True, exclude_none=True)
        )
        assert restored.url == "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix"


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
        ext = NationalityExtension(extension=[
            NationalityCodeExtension(
                value_codeable_concept=CodeableConcept(
                    coding=[Coding(system="urn:iso:std:iso:3166", code="DE")],
                ),
            ),
            NationalityPeriodExtension(value_period=Period(start="1770-12-17")),
        ])
        assert len(ext.extension) == 2
        assert isinstance(ext.extension[0], NationalityCodeExtension)
        assert isinstance(ext.extension[1], NationalityPeriodExtension)

    def test_sub_extension_rejects_wrong_url(self) -> None:
        with pytest.raises(ValidationError):
            NationalityCodeExtension(url="wrong", value_codeable_concept=CodeableConcept())

    def test_sub_extension_value_is_required(self) -> None:
        with pytest.raises(ValidationError):
            NationalityCodeExtension()

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
        assert len(restored.extension) == 2
        assert isinstance(restored.extension[0], NationalityCodeExtension)
        assert restored.extension[0].value_codeable_concept.coding[0].code == "DE"
        assert isinstance(restored.extension[1], NationalityPeriodExtension)
        assert restored.extension[1].value_period.start == "1770-12-17"

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
        assert isinstance(ext.extension[0], NationalityCodeExtension)
        assert ext.extension[0].value_codeable_concept.coding[0].code == "FR"
        assert isinstance(ext.extension[1], NationalityPeriodExtension)


# ---------------------------------------------------------------------------
# Serialization: FHIR-aliased JSON keys
# ---------------------------------------------------------------------------


def test_simple_extension_serializes_with_fhir_aliases() -> None:
    ext = OwnPrefixExtension(value_string="van")
    raw = json.loads(ext.model_dump_json(by_alias=True, exclude_none=True))
    assert raw == {
        "url": "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix",
        "valueString": "van",
    }


def test_complex_extension_serializes_with_fhir_aliases() -> None:
    ext = NationalityExtension(extension=[
        NationalityCodeExtension(
            value_codeable_concept=CodeableConcept(
                coding=[Coding(system="urn:iso:std:iso:3166", code="DE")],
            ),
        ),
        NationalityPeriodExtension(value_period=Period(start="2000-01-01")),
    ])
    data = json.loads(ext.model_dump_json(by_alias=True, exclude_none=True))
    assert data["extension"][0]["url"] == "code"
    assert "valueCodeableConcept" in data["extension"][0]
    assert "value_codeable_concept" not in data["extension"][0]
    assert data["extension"][1]["valuePeriod"]["start"] == "2000-01-01"
