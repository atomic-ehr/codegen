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


# ---------------------------------------------------------------------------
# Simple extensions: construction, url enforcement, required value, subclass
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("cls", "kwargs", "expected_url"),
    [
        (BirthPlaceExtension, {"value_address": Address(city="Bonn")}, "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"),
        (BirthTimeExtension, {"value_date_time": "1990-03-15T08:22:00-05:00"}, "http://hl7.org/fhir/StructureDefinition/patient-birthTime"),
        (OwnPrefixExtension, {"value_string": "van"}, "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix"),
    ],
    ids=["birth_place", "birth_time", "own_prefix"],
)
class TestSimpleExtension:
    def test_construction_and_url(self, cls, kwargs, expected_url) -> None:
        ext = cls(**kwargs)
        assert ext.url == expected_url
        assert isinstance(ext, Extension)

    def test_rejects_wrong_url(self, cls, kwargs, expected_url) -> None:
        with pytest.raises(ValidationError):
            cls(url="http://wrong", **kwargs)

    def test_value_is_required(self, cls, kwargs, expected_url) -> None:
        with pytest.raises(ValidationError):
            cls()

    def test_round_trip(self, cls, kwargs, expected_url) -> None:
        original = cls(**kwargs)
        restored = cls.model_validate_json(original.model_dump_json(by_alias=True, exclude_none=True))
        assert restored.url == expected_url


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


# ---------------------------------------------------------------------------
# Patient integration: all extension placement types + full round-trip
# ---------------------------------------------------------------------------


def test_patient_with_all_extension_types() -> None:
    """Resource-level, element-level, and primitive-level extensions on one Patient."""
    patient = Patient(
        resource_type="Patient",
        birth_date="1770-12-17",
        birth_date_extension=Element(
            extension=[BirthTimeExtension(value_date_time="1770-12-17T12:00:00+01:00")],
        ),
        extension=[
            BirthPlaceExtension(value_address=Address(city="Bonn", country="DE")),
            NationalityExtension(extension=[
                NationalityCodeExtension(
                    value_codeable_concept=CodeableConcept(
                        coding=[Coding(system="urn:iso:std:iso:3166", code="DE")],
                    ),
                ),
                NationalityPeriodExtension(value_period=Period(start="1770-12-17")),
            ]),
        ],
        name=[
            HumanName(
                family="van Beethoven",
                family_extension=Element(extension=[OwnPrefixExtension(value_string="van")]),
                given=["Ludwig"],
            ),
        ],
    )

    # Resource-level
    assert patient.extension[0].url == "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"
    assert patient.extension[1].url == "http://hl7.org/fhir/StructureDefinition/patient-nationality"
    # Primitive-level
    assert patient.birth_date_extension.extension[0].url == "http://hl7.org/fhir/StructureDefinition/patient-birthTime"
    # Element-level
    assert patient.name[0].family_extension.extension[0].url == "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix"

    # Round-trip through FHIR JSON
    json_str = patient.model_dump_json(by_alias=True, exclude_none=True)
    raw = json.loads(json_str)

    assert raw["_birthDate"]["extension"][0]["url"] == "http://hl7.org/fhir/StructureDefinition/patient-birthTime"
    assert raw["_birthDate"]["extension"][0]["valueDateTime"] == "1770-12-17T12:00:00+01:00"
    assert raw["extension"][0]["valueAddress"]["city"] == "Bonn"
    assert raw["name"][0]["_family"]["extension"][0]["valueString"] == "van"

    restored = Patient.model_validate_json(json_str)
    assert restored.birth_date == "1770-12-17"
    assert len(restored.extension) == 2
    assert restored.name[0].family == "van Beethoven"
