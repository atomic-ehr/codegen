"""
FHIR US Core Profile API Demo

Demonstrates generated profile wrapper classes for:
  - Resource profiles: UscoreBodyWeightProfile (Observation)
  - Patient profile with complex/simple extension accessors
  - Creation methods: create(), create_resource(), from_resource(), apply()
  - Typed field and slice accessors (get_*/set_*)
  - Validation: validate() returns {"errors": [...], "warnings": [...]}
  - JSON round-trip via to_resource() → to_json() → from_json() → from_resource()
"""

import warnings

import pytest
from fhir_types.hl7_fhir_r4_core.base import CodeableConcept, Coding, HumanName, Identifier, Quantity, Reference
from fhir_types.hl7_fhir_r4_core.observation import Observation
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.hl7_fhir_us_core.profiles.observation_uscore_body_weight_profile import UscoreBodyWeightProfile
from fhir_types.hl7_fhir_us_core.profiles.patient_uscore_patient_profile import UscorePatientProfile

# Pydantic warns when extensions list contains plain dicts instead of Extension
# model instances — this is expected with the current push_extension approach.
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")


# ---------------------------------------------------------------------------
# Body weight profile: creation
# ---------------------------------------------------------------------------


def test_create_returns_profile_wrapping_resource_with_auto_set_code():
    profile = UscoreBodyWeightProfile.create(
        status="final",
        subject=Reference(reference="Patient/pt-1"),
    )
    obs = profile.to_resource()

    assert obs.resource_type == "Observation"
    assert obs.status == "final"
    assert obs.code.coding[0].code == "29463-7"
    assert obs.code.coding[0].system == "http://loinc.org"
    assert obs.subject.reference == "Patient/pt-1"


def test_create_resource_returns_plain_observation():
    obs = UscoreBodyWeightProfile.create_resource(
        status="final",
        subject=Reference(reference="Patient/pt-1"),
    )

    assert isinstance(obs, Observation)
    assert obs.status == "final"
    assert obs.code.coding[0].code == "29463-7"


def test_apply_wraps_existing_observation():
    obs = Observation(resource_type="Observation", status="preliminary", code=CodeableConcept())
    profile = UscoreBodyWeightProfile.apply(obs)

    profile.set_status("final")
    profile.set_subject(Reference(reference="Patient/pt-1"))

    assert profile.to_resource() is obs  # same reference
    assert profile.get_status() == "final"


def test_create_and_create_resource_produce_equal_resources():
    from_create = UscoreBodyWeightProfile.create(
        status="final",
        subject=Reference(reference="Patient/pt-1"),
    ).to_resource()

    from_create_resource = UscoreBodyWeightProfile.create_resource(
        status="final",
        subject=Reference(reference="Patient/pt-1"),
    )

    assert from_create.status == from_create_resource.status
    assert from_create.code.coding[0].code == from_create_resource.code.coding[0].code
    assert from_create.meta.profile == from_create_resource.meta.profile


def test_create_sets_meta_profile():
    profile = UscoreBodyWeightProfile.create(
        status="final",
        subject=Reference(reference="Patient/pt-1"),
    )
    obs = profile.to_resource()

    assert obs.meta is not None
    assert obs.meta.profile == ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight"]


# ---------------------------------------------------------------------------
# Body weight profile: field accessors
# ---------------------------------------------------------------------------


def test_get_status_and_set_status():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))
    assert profile.get_status() == "final"

    profile.set_status("amended")
    assert profile.get_status() == "amended"
    assert profile.to_resource().status == "amended"


def test_get_subject_and_set_subject():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))
    assert profile.get_subject().reference == "Patient/pt-1"

    profile.set_subject(Reference(reference="Patient/pt-2"))
    assert profile.get_subject().reference == "Patient/pt-2"


def test_get_code():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))
    assert profile.get_code().coding[0].code == "29463-7"


def test_canonical_url():
    assert UscoreBodyWeightProfile.canonical_url == "http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight"


# ---------------------------------------------------------------------------
# Body weight profile: slice accessors
# ---------------------------------------------------------------------------


def test_vscat_auto_populated_on_create():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))
    obs = profile.to_resource()

    assert obs.category is not None
    assert len(obs.category) >= 1
    assert obs.category[0].coding[0].code == "vital-signs"


def test_get_vscat_returns_simplified_view():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))

    # simplified view strips discriminator keys, leaving empty dict
    assert profile.get_vscat() == {}


def test_set_vscat_adds_category_with_discriminator():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))
    profile.set_vscat({"text": "Vital Signs"})

    simplified = profile.get_vscat()
    assert simplified["text"] == "Vital Signs"


# ---------------------------------------------------------------------------
# Body weight profile: choice type accessors
# ---------------------------------------------------------------------------


def test_choice_accessors_return_none_when_not_set():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))

    assert profile.get_effective_date_time() is None
    assert profile.get_effective_period() is None
    assert profile.get_value_quantity() is None


def test_set_effective_date_time():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))

    profile.set_effective_date_time("2024-01-15")
    assert profile.get_effective_date_time() == "2024-01-15"
    assert profile.to_resource().effective_date_time == "2024-01-15"


def test_set_value_quantity():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))

    profile.set_value_quantity(Quantity(value=75.0, unit="kg", system="http://unitsofmeasure.org", code="kg"))
    q = profile.get_value_quantity()
    assert q.value == 75.0
    assert q.unit == "kg"


# ---------------------------------------------------------------------------
# Body weight profile: validation
# ---------------------------------------------------------------------------


def test_freshly_created_profile_missing_effective_reports_error():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))
    result = profile.validate()

    assert any("effective" in e for e in result["errors"])


def test_complete_profile_validates_without_errors():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))
    profile.set_effective_date_time("2024-06-15")

    result = profile.validate()
    assert result["errors"] == []


# ---------------------------------------------------------------------------
# Body weight profile: mutability
# ---------------------------------------------------------------------------


def test_profile_mutates_underlying_resource():
    obs = UscoreBodyWeightProfile.create_resource(status="final", subject=Reference(reference="Patient/pt-1"))
    profile = UscoreBodyWeightProfile.apply(obs)

    profile.set_status("amended")
    assert obs.status == "amended"


# ---------------------------------------------------------------------------
# Body weight profile: JSON round-trip
# ---------------------------------------------------------------------------


def test_json_round_trip():
    profile = UscoreBodyWeightProfile.create(status="final", subject=Reference(reference="Patient/pt-1"))
    profile.set_effective_date_time("2024-06-15")
    profile.set_value_quantity(Quantity(value=82.5, unit="kg", system="http://unitsofmeasure.org", code="kg"))

    obs = profile.to_resource()
    json_str = obs.to_json(by_alias=True)
    restored = Observation.from_json(json_str)
    p2 = UscoreBodyWeightProfile.from_resource(restored)

    assert p2.get_status() == "final"
    assert p2.get_value_quantity().value == 82.5
    assert p2.get_code().coding[0].code == "29463-7"
    assert p2.get_effective_date_time() == "2024-06-15"


# ---------------------------------------------------------------------------
# Body weight profile: from_resource validation
# ---------------------------------------------------------------------------


def test_from_resource_rejects_missing_meta_profile():
    obs = Observation(resource_type="Observation", status="final", code=CodeableConcept())
    with pytest.raises(ValueError, match="meta.profile must include"):
        UscoreBodyWeightProfile.from_resource(obs)


# ---------------------------------------------------------------------------
# US Core Patient profile: creation and field accessors
# ---------------------------------------------------------------------------


def test_patient_create():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(system="http://hospital.example.org/mrn", value="MRN-12345")],
        name=[HumanName(family="Garcia", given=["Maria", "Elena"])],
    )
    res = profile.to_resource()

    assert res.resource_type == "Patient"
    assert res.identifier[0].value == "MRN-12345"
    assert res.name[0].family == "Garcia"
    assert res.meta.profile == ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"]


def test_patient_field_accessors():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(system="http://hospital.example.org", value="12345")],
        name=[HumanName(family="Smith", given=["John"])],
    )

    assert profile.get_identifier()[0].value == "12345"
    assert profile.get_name()[0].family == "Smith"

    profile.set_identifier([Identifier(system="http://hospital.example.org", value="67890")])
    assert profile.get_identifier()[0].value == "67890"

    profile.set_name([HumanName(family="Doe", given=["Jane"])])
    assert profile.get_name()[0].family == "Doe"


def test_patient_apply_wraps_existing_resource():
    patient = Patient(resource_type="Patient")
    profile = UscorePatientProfile.apply(patient)

    profile.set_identifier([Identifier(system="http://hospital.example.org/mrn", value="MRN-00001")])
    profile.set_name([HumanName(family="Chen", given=["Wei"])])

    assert profile.to_resource() is patient  # same reference
    assert patient.identifier[0].value == "MRN-00001"
    assert profile.validate()["errors"] == []


# ---------------------------------------------------------------------------
# US Core Patient profile: extension accessors
# ---------------------------------------------------------------------------


def test_patient_extension_setters_and_getters():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(system="http://hospital.example.org/mrn", value="MRN-12345")],
        name=[HumanName(family="Garcia", given=["Maria", "Elena"])],
    )

    profile.set_race({"ombCategory": {"code": "2106-3", "display": "White"}, "text": "White"})
    profile.set_ethnicity({"ombCategory": {"code": "2135-2", "display": "Hispanic or Latino"}, "text": "Hispanic or Latino"})
    profile.set_sex(Coding(code="female", display="Female"))

    race = profile.get_race()
    assert race["text"] == "White"

    ethnicity = profile.get_ethnicity()
    assert ethnicity["text"] == "Hispanic or Latino"

    sex = profile.get_sex()
    assert sex.code == "female"


def test_patient_extensions_roundtrip():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(system="http://hospital.example.org/mrn", value="MRN-12345")],
        name=[HumanName(family="Garcia", given=["Maria"])],
    )
    profile.set_race({"ombCategory": {"code": "2106-3", "display": "White"}, "text": "White"})
    profile.set_sex(Coding(code="female", display="Female"))

    res = profile.to_resource()
    json_str = res.to_json(by_alias=True)
    restored = Patient.from_json(json_str)
    p2 = UscorePatientProfile.from_resource(restored)

    assert p2.get_race()["text"] == "White"
    assert p2.get_sex().code == "female"
    assert p2.get_name()[0].family == "Garcia"


def test_patient_extension_getters_return_none_when_not_set():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )

    assert profile.get_race() is None
    assert profile.get_ethnicity() is None
    assert profile.get_sex() is None
    assert profile.get_tribal_affiliation() is None
    assert profile.get_interpreter_required() is None


def test_patient_extensions_added_to_resource():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    profile.set_race({"text": "White"})
    profile.set_sex(Coding(code="male"))

    res = profile.to_resource()
    assert res.extension is not None
    assert len(res.extension) == 2


# ---------------------------------------------------------------------------
# US Core Patient profile: validation
# ---------------------------------------------------------------------------


def test_patient_validates_with_required_fields():
    profile = UscorePatientProfile.create(
        identifier=[Identifier(value="1")],
        name=[HumanName(family="Test")],
    )
    assert profile.validate()["errors"] == []


def test_patient_reports_missing_required_fields():
    profile = UscorePatientProfile.apply(Patient(resource_type="Patient"))
    errors = profile.validate()["errors"]

    assert any("identifier" in e for e in errors)
    assert any("name" in e for e in errors)
