"""
US Core Patient Profile Class API Tests

Mirrors examples/typescript-us-core/profile-patient.test.ts.
"""

import warnings

import pytest
from fhir_types.hl7_fhir_r4_core.base import Coding, Extension, HumanName, Identifier
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.hl7_fhir_us_core.profiles.extension_uscore_ethnicity_extension import (
    UscoreEthnicityExtension,
)
from fhir_types.hl7_fhir_us_core.profiles.extension_uscore_individual_sex_extension import (
    UscoreIndividualSexExtension,
)
from fhir_types.hl7_fhir_us_core.profiles.extension_uscore_race_extension import UscoreRaceExtension
from fhir_types.hl7_fhir_us_core.profiles.patient_uscore_patient_profile import UscorePatientProfile

# Pydantic warns when extensions list contains plain dicts instead of Extension
# model instances — this is expected with the current push_extension approach.
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")


CANONICAL_URL = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"
RACE_URL = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race"
ETHNICITY_URL = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity"
SEX_URL = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex"

# ---------------------------------------------------------------------------
# demo
# ---------------------------------------------------------------------------


def test_set_extension_via_flat_input():
    """Flat-dict form of the extension setters (the only form Python currently supports)."""
    patient = UscorePatientProfile.create(
        identifier=[Identifier(system="http://hospital.example.org/mrn", value="MRN-12345")],
        name=[HumanName(family="Garcia", given=["Maria", "Elena"])],
    )

    patient.set_race(
        {
            "ombCategory": {"system": "urn:oid:2.16.840.1.113883.6.238", "code": "2106-3", "display": "White"},
            "text": "White",
        }
    )
    patient.set_ethnicity(
        {
            "ombCategory": {"code": "2135-2", "display": "Hispanic or Latino"},
            "detailed": [{"code": "2148-5", "display": "Mexican"}],
            "text": "Mexican",
        }
    )
    patient.set_sex(Coding(code="female", display="Female"))

    assert patient.validate()["errors"] == []

    res = patient.to_resource()
    assert res.resource_type == "Patient"
    assert res.identifier[0].value == "MRN-12345"
    assert res.name[0].family == "Garcia"
    assert res.meta.profile == [CANONICAL_URL]
    assert len(res.extension) == 3


def test_set_extension_via_extension_profile_instance():
    patient = UscorePatientProfile.create(
        identifier=[Identifier(system="http://hospital.example.org/mrn", value="MRN-12345")],
        name=[HumanName(family="Garcia", given=["Maria", "Elena"])],
    )
    ethnicity_profile = UscoreEthnicityExtension.create()
    ethnicity_profile.set_extension_omb_category({"code": "2135-2", "display": "Hispanic or Latino"})
    ethnicity_profile.set_extension_text({"value_string": "Hispanic or Latino"})
    patient.set_ethnicity(ethnicity_profile)
    assert patient.get_ethnicity() is not None


def test_set_extension_via_raw_extension():
    patient = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    sex_extension = Extension(url=SEX_URL, value_coding=Coding(code="female", display="Female"))
    patient.set_sex(sex_extension)
    assert patient.get_sex().code == "female"


def test_import_profiled_resource_from_api_and_access_data_via_typed_getters():
    api_response = Patient(
        resource_type="Patient",
        meta={"profile": [CANONICAL_URL]},
        identifier=[Identifier(system="http://hospital.example.org/mrn", value="MRN-99999")],
        name=[HumanName(family="Smith", given=["John"])],
        extension=[
            {
                "url": RACE_URL,
                "extension": [
                    {"url": "ombCategory", "value_coding": {"code": "2054-5", "display": "Black or African American"}},
                    {"url": "text", "value_string": "Black or African American"},
                ],
            },
            {
                "url": SEX_URL,
                "value_coding": {"code": "male"},
            },
        ],
    )

    patient = UscorePatientProfile.from_resource(api_response)

    assert CANONICAL_URL in api_response.meta.profile
    names = patient.get_name()
    assert names[0].family == "Smith"
    assert names[0].given == ["John"]

    race = patient.get_race()
    # Pydantic parses the value_coding sub-extension input into a Coding model,
    # so race["ombCategory"] is a Coding instance (not a dict like in TS).
    assert race["ombCategory"].code == "2054-5"
    assert race["ombCategory"].display == "Black or African American"
    assert race["detailed"] == []
    assert race["text"] == "Black or African American"
    sex = patient.get_sex()
    assert sex.code == "male"
    assert patient.get_ethnicity() is None


def test_apply_profile_to_a_bare_resource_and_populate_it():
    patient = UscorePatientProfile.apply(Patient(resource_type="Patient"))

    patient.set_identifier([Identifier(system="http://hospital.example.org/mrn", value="MRN-00001")])
    patient.set_name([HumanName(family="Chen", given=["Wei"])])
    patient.set_race({"ombCategory": {"code": "2028-9", "display": "Asian"}, "text": "Chinese"})
    patient.set_ethnicity({"text": "Not Hispanic or Latino"})

    assert patient.validate()["errors"] == []

    res = patient.to_resource()
    assert res.identifier[0].value == "MRN-00001"
    assert res.name[0].family == "Chen"
    assert res.meta.profile == [CANONICAL_URL]
    assert len(res.extension) == 2
    race_ext = next(e for e in res.extension if (e.get("url") if isinstance(e, dict) else e.url) == RACE_URL)
    eth_ext = next(e for e in res.extension if (e.get("url") if isinstance(e, dict) else e.url) == ETHNICITY_URL)
    assert race_ext is not None
    assert eth_ext is not None


# ---------------------------------------------------------------------------
# US Core Patient profile creation
# ---------------------------------------------------------------------------


def test_create_returns_a_profile_wrapping_the_resource():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(system="http://hospital.example.org", value="12345")],
        name=[HumanName(family="Smith", given=["John"])],
    )
    res = profile.to_resource()

    assert res.resource_type == "Patient"
    assert res.identifier[0].value == "12345"
    assert res.name[0].family == "Smith"


def test_create_resource_returns_a_plain_patient():
    res = UscorePatientProfile.create_resource(
        identifier=[Identifier(system="http://hospital.example.org", value="12345")],
        name=[HumanName(family="Smith", given=["John"])],
    )
    assert isinstance(res, Patient)
    assert res.resource_type == "Patient"
    assert res.identifier[0].value == "12345"


def test_apply_wraps_an_existing_patient():
    patient = Patient(resource_type="Patient")
    profile = UscorePatientProfile.apply(patient)

    profile.set_identifier([Identifier(system="http://hospital.example.org", value="12345")])
    profile.set_name([HumanName(family="Smith", given=["John"])])

    assert profile.to_resource() is patient
    assert profile.get_identifier()[0].value == "12345"
    assert profile.get_name()[0].family == "Smith"


def test_all_three_methods_produce_equivalent_resources():
    args = dict(
        identifier=[Identifier(system="http://hospital.example.org", value="12345")],
        name=[HumanName(family="Smith", given=["John"])],
    )
    from_create = UscorePatientProfile.create(**args).to_resource()
    from_create_resource = UscorePatientProfile.create_resource(**args)

    bare = Patient(resource_type="Patient")
    profile = UscorePatientProfile.apply(bare)
    profile.set_identifier(args["identifier"]).set_name(args["name"])
    from_apply = profile.to_resource()

    for res in (from_create, from_create_resource, from_apply):
        assert res.identifier[0].value == "12345"
        assert res.name[0].family == "Smith"
        assert res.meta.profile == [CANONICAL_URL]


# ---------------------------------------------------------------------------
# Field accessors
# ---------------------------------------------------------------------------


def _make_patient() -> UscorePatientProfile:
    return UscorePatientProfile.create(
        identifier=[Identifier(system="http://hospital.example.org", value="12345")],
        name=[HumanName(family="Smith", given=["John"])],
    )


def test_get_identifier_set_identifier():
    profile = _make_patient()
    assert profile.get_identifier()[0].value == "12345"
    profile.set_identifier([Identifier(system="http://hospital.example.org", value="67890")])
    assert profile.get_identifier()[0].value == "67890"


def test_get_name_set_name():
    profile = _make_patient()
    assert profile.get_name()[0].family == "Smith"
    profile.set_name([HumanName(family="Doe", given=["Jane"])])
    assert profile.get_name()[0].family == "Doe"


def test_fluent_chaining_across_field_accessors():
    profile = _make_patient()
    result = profile.set_identifier(
        [Identifier(system="http://hospital.example.org", value="AAA")]
    ).set_name([HumanName(family="Lee")])

    assert result is profile
    assert profile.get_identifier()[0].value == "AAA"
    assert profile.get_name()[0].family == "Lee"


# ---------------------------------------------------------------------------
# Extensions
# ---------------------------------------------------------------------------


def test_canonical_url_is_exposed():
    assert UscorePatientProfile.canonical_url == CANONICAL_URL


def test_set_race_get_race_round_trip_with_detailed_categories():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )

    profile.set_race(
        {
            "ombCategory": {"system": "urn:oid:2.16.840.1.113883.6.238", "code": "2106-3", "display": "White"},
            "detailed": [{"code": "2108-9", "display": "European"}],
            "text": "White European",
        }
    )

    race = profile.get_race()
    assert race["ombCategory"]["code"] == "2106-3"
    assert race["text"] == "White European"


def test_get_race_raw_returns_raw_extension():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    profile.set_race({"ombCategory": {"code": "2106-3", "display": "White"}, "text": "White"})

    raw = profile.get_race("raw")  # type: ignore[call-arg]
    assert raw is not None
    assert raw.url == RACE_URL


def test_set_sex_get_sex_round_trip():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    profile.set_sex(Coding(system="http://hl7.org/fhir/administrative-gender", code="male"))

    sex = profile.get_sex()
    assert sex.code == "male"


def test_get_sex_raw_returns_raw_extension():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    profile.set_sex(Coding(system="http://hl7.org/fhir/administrative-gender", code="female"))

    raw = profile.get_sex("raw")  # type: ignore[call-arg]
    assert raw.url == SEX_URL
    assert raw.value_coding.code == "female"


def test_extension_getters_return_none_when_not_set():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )

    assert profile.get_race() is None
    assert profile.get_ethnicity() is None
    assert profile.get_sex() is None
    assert profile.get_tribal_affiliation() is None
    assert profile.get_interpreter_required() is None


def test_extension_raw_getters_return_none_when_not_set():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )

    assert profile.get_race("raw") is None  # type: ignore[call-arg]
    assert profile.get_ethnicity("raw") is None  # type: ignore[call-arg]
    assert profile.get_sex("raw") is None  # type: ignore[call-arg]
    assert profile.get_tribal_affiliation("raw") is None  # type: ignore[call-arg]
    assert profile.get_interpreter_required("raw") is None  # type: ignore[call-arg]


def test_fluent_chaining_across_extensions():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )

    result = (
        profile.set_race({"text": "White"})
        .set_ethnicity({"text": "Not Hispanic or Latino"})
        .set_sex(Coding(code="male"))
        .set_tribal_affiliation({"tribalAffiliation": {"text": "Navajo"}})
        .set_interpreter_required(Coding(code="no"))
    )

    assert result is profile
    assert profile.get_race()["text"] == "White"
    assert profile.get_ethnicity()["text"] == "Not Hispanic or Latino"
    assert profile.get_sex().code == "male"
    assert profile.get_tribal_affiliation()["tribalAffiliation"]["text"] == "Navajo"
    assert profile.get_interpreter_required().code == "no"


def test_extensions_are_added_to_the_resource():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )

    profile.set_race({"text": "White"}).set_sex(Coding(code="male"))

    res = profile.to_resource()
    assert res.extension is not None
    assert len(res.extension) == 2
    urls = [(e.get("url") if isinstance(e, dict) else e.url) for e in res.extension]
    assert any("us-core-race" in u for u in urls)
    assert any("us-core-individual-sex" in u for u in urls)


# ---------------------------------------------------------------------------
# Multi-form extension setters (TODO — Python only supports the flat-dict form)
# ---------------------------------------------------------------------------


def test_set_race_accepts_extension_profile_instance():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    race_profile = UscoreRaceExtension.create()
    # equivalent to TS: raceProfile.setExtensionOmbCategory({...}); raceProfile.setExtensionText({...})
    profile.set_race(race_profile)
    assert profile.get_race() is not None


def test_set_race_accepts_raw_extension():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    raw_extension = Extension(
        url=RACE_URL,
        extension=[
            {"url": "ombCategory", "value_coding": {"code": "2106-3", "display": "White"}},
            {"url": "text", "value_string": "White"},
        ],
    )
    profile.set_race(raw_extension)
    assert profile.get_race() is not None


def test_set_race_throws_on_wrong_extension_url():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    wrong_extension = Extension(url="http://example.com/wrong-url", extension=[])
    with pytest.raises(ValueError, match="Expected extension url"):
        profile.set_race(wrong_extension)


def test_set_sex_accepts_extension_profile_instance():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    sex_profile = UscoreIndividualSexExtension.create(value_coding=Coding(code="male"))
    profile.set_sex(sex_profile)
    assert profile.get_sex().code == "male"


def test_set_sex_accepts_raw_extension():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    raw_extension = Extension(url=SEX_URL, value_coding=Coding(code="female"))
    profile.set_sex(raw_extension)
    assert profile.get_sex().code == "female"


# ---------------------------------------------------------------------------
# Mutability
# ---------------------------------------------------------------------------


def test_profile_mutates_the_underlying_resource():
    patient = Patient(resource_type="Patient")
    profile = UscorePatientProfile.apply(patient)

    profile.set_identifier([Identifier(value="123")])
    assert patient.identifier[0].value == "123"

    profile.set_name([HumanName(family="Doe")])
    assert patient.name[0].family == "Doe"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_freshly_created_profile_with_required_fields_is_valid():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    assert profile.validate()["errors"] == []


def test_profile_from_empty_resource_reports_missing_required_fields():
    profile = UscorePatientProfile.apply(Patient(resource_type="Patient"))
    errors = profile.validate()["errors"]

    assert "UscorePatientProfile: required field 'identifier' is missing" in errors
    assert "UscorePatientProfile: required field 'name' is missing" in errors
