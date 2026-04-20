"""
US Core Blood Pressure Profile Class API Tests

Mirrors examples/typescript-us-core/profile-bp.test.ts.
"""

import warnings

from fhir_types.hl7_fhir_r4_core.base import CodeableConcept, Coding, Quantity, Reference
from fhir_types.hl7_fhir_r4_core.observation import Observation, ObservationComponent
from fhir_types.hl7_fhir_r4_core.resource import Meta
from fhir_types.hl7_fhir_us_core.profiles.observation_uscore_blood_pressure_profile import UscoreBloodPressureProfile

# Pydantic warns when extensions list contains plain dicts instead of Extension
# model instances — this is expected with the current push_extension approach.
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")


CANONICAL_URL = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure"
VSCAT_CODING = Coding(code="vital-signs", system="http://terminology.hl7.org/CodeSystem/observation-category")


def _make_bp() -> UscoreBloodPressureProfile:
    return UscoreBloodPressureProfile.create(
        status="final",
        subject=Reference(reference="Patient/pt-1"),
    )


# ---------------------------------------------------------------------------
# demo
# ---------------------------------------------------------------------------


def test_import_profiled_observation_from_api_and_read_components():
    api_response = Observation(
        resource_type="Observation",
        meta=Meta(profile=[CANONICAL_URL]),
        status="final",
        category=[CodeableConcept(coding=[VSCAT_CODING])],
        code=CodeableConcept(coding=[Coding(code="85354-9", system="http://loinc.org", display="Blood pressure panel")]),
        subject=Reference(reference="Patient/pt-1"),
        effective_date_time="2024-06-15",
        component=[
            ObservationComponent(
                code=CodeableConcept(coding=[Coding(code="8480-6", system="http://loinc.org")]),
                value_quantity=Quantity(value=120, unit="mmHg", system="http://unitsofmeasure.org", code="mm[Hg]"),
            ),
            ObservationComponent(
                code=CodeableConcept(coding=[Coding(code="8462-4", system="http://loinc.org")]),
                value_quantity=Quantity(value=80, unit="mmHg", system="http://unitsofmeasure.org", code="mm[Hg]"),
            ),
        ],
    )

    profile = UscoreBloodPressureProfile.from_resource(api_response)

    assert profile.get_systolic() == {
        "value": 120,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]",
    }
    assert profile.get_diastolic() == {
        "value": 80,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]",
    }
    assert profile.get_effective_date_time() == "2024-06-15"


def test_apply_profile_to_bare_observation_and_populate_it():
    bare_observation = Observation(resource_type="Observation", status="preliminary", code=CodeableConcept())
    profile = UscoreBloodPressureProfile.apply(bare_observation)

    profile.set_status("final")
    profile.set_code(CodeableConcept(coding=[Coding(code="85354-9", system="http://loinc.org")]))
    profile.set_subject(Reference(reference="Patient/pt-1"))
    profile.set_vscat({})
    profile.set_effective_date_time("2024-06-15")
    profile.set_systolic({"value": 120, "unit": "mmHg"})
    profile.set_diastolic({"value": 80, "unit": "mmHg"})

    assert profile.validate()["errors"] == []
    assert CANONICAL_URL in profile.to_resource().meta.profile


# ---------------------------------------------------------------------------
# US Core blood pressure profile
# ---------------------------------------------------------------------------


def test_canonical_url_is_exposed():
    assert UscoreBloodPressureProfile.canonical_url == CANONICAL_URL


def test_create_auto_sets_code_and_meta_profile():
    profile = _make_bp()
    obs = profile.to_resource()
    assert obs.resource_type == "Observation"
    assert obs.code.coding[0].code == "85354-9"
    assert obs.code.coding[0].system == "http://loinc.org"
    assert obs.meta.profile == [CANONICAL_URL]


def test_freshly_created_profile_is_not_yet_valid_missing_effective():
    profile = _make_bp()
    errors = profile.validate()["errors"]
    assert errors == [
        "UscoreBloodPressureProfile: at least one of effective_date_time, effective_period is required",
    ]


def test_create_auto_populates_component_with_systolic_diastolic_stubs():
    profile = _make_bp()
    obs = profile.to_resource()
    assert len(obs.component) == 2


def test_set_systolic_get_systolic_get_systolic_raw():
    profile = _make_bp()
    profile.set_systolic({"value": 120, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]"})

    assert profile.get_systolic() == {
        "value": 120,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]",
    }

    raw = profile.get_systolic("raw")  # type: ignore[call-arg]
    assert raw.value_quantity.value == 120
    assert raw.code.coding[0].code == "8480-6"


def test_set_diastolic_get_diastolic_get_diastolic_raw():
    profile = _make_bp()
    profile.set_diastolic({"value": 80, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]"})

    assert profile.get_diastolic() == {
        "value": 80,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]",
    }

    raw = profile.get_diastolic("raw")  # type: ignore[call-arg]
    assert raw.value_quantity.value == 80
    assert raw.code.coding[0].code == "8462-4"


def test_both_systolic_and_diastolic_are_in_the_component_array():
    profile = _make_bp()
    obs = profile.to_resource()
    assert len(obs.component) == 2


def test_set_systolic_replaces_an_existing_systolic_component():
    profile = _make_bp()
    profile.set_systolic({"value": 130, "unit": "mmHg"})
    obs = profile.to_resource()
    assert len(obs.component) == 2
    assert profile.get_systolic("raw").value_quantity.value == 130  # type: ignore[call-arg]


def test_set_vscat_adds_category_with_discriminator_values():
    profile = _make_bp()
    profile.set_vscat({"text": "Vital Signs"})
    flat = profile.get_vscat()
    assert flat["text"] == "Vital Signs"


def test_set_effective_date_time_get_effective_date_time():
    profile = _make_bp()
    profile.set_effective_date_time("2024-06-15T10:30:00Z")
    assert profile.get_effective_date_time() == "2024-06-15T10:30:00Z"
    assert profile.get_value_quantity() is None


def test_fluent_chaining_across_all_accessor_types():
    profile = _make_bp()
    result = (
        profile.set_status("final")
        .set_vscat({"text": "Vital Signs"})
        .set_effective_date_time("2024-06-15")
        .set_subject(Reference(reference="Patient/pt-2"))
    )
    assert result is profile
    assert profile.get_status() == "final"
    assert profile.get_vscat()["text"] == "Vital Signs"
    assert profile.get_effective_date_time() == "2024-06-15"
    assert profile.get_subject().reference == "Patient/pt-2"


def test_set_systolic_with_no_args_inserts_discriminator_only_component():
    profile = _make_bp()
    profile.set_systolic()  # type: ignore[call-arg]
    assert profile.get_systolic() is not None


def test_create_with_custom_category_preserves_user_values_and_adds_required_vscat():
    custom = UscoreBloodPressureProfile.create(
        status="final",
        subject=Reference(reference="Patient/pt-1"),
        category=[CodeableConcept(text="My Category")],
    )
    obs = custom.to_resource()
    assert len(obs.category) == 2


def test_create_with_empty_category_still_adds_required_vscat():
    custom = UscoreBloodPressureProfile.create(
        status="final",
        subject=Reference(reference="Patient/pt-1"),
        category=[],
    )
    obs = custom.to_resource()
    assert len(obs.category) == 1


def test_create_with_category_already_containing_vscat_does_not_duplicate_it():
    custom = UscoreBloodPressureProfile.create(
        status="final",
        subject=Reference(reference="Patient/pt-1"),
        category=[CodeableConcept(coding=[VSCAT_CODING])],
    )
    obs = custom.to_resource()
    assert len(obs.category) == 1
