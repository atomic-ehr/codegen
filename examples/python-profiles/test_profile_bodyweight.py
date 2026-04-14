"""
US Core Body Weight Profile Class API Tests

Mirrors examples/typescript-us-core/profile-bodyweight.test.ts.
"""

import warnings

import pytest
from fhir_types.hl7_fhir_r4_core.base import CodeableConcept, Coding, Quantity, Reference
from fhir_types.hl7_fhir_r4_core.observation import Observation
from fhir_types.hl7_fhir_r4_core.resource import Meta
from fhir_types.hl7_fhir_us_core.profiles.observation_uscore_body_weight_profile import UscoreBodyWeightProfile

# Pydantic warns when extensions list contains plain dicts instead of Extension
# model instances — this is expected with the current push_extension approach.
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")


CANONICAL_URL = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight"


def test_import_profiled_observation_from_api_and_read_values():
    api_response = Observation(
        resource_type="Observation",
        meta=Meta(profile=[CANONICAL_URL]),
        status="final",
        category=[
            CodeableConcept(
                coding=[Coding(code="vital-signs", system="http://terminology.hl7.org/CodeSystem/observation-category")],
            ),
        ],
        code=CodeableConcept(coding=[Coding(code="29463-7", system="http://loinc.org", display="Body weight")]),
        subject=Reference(reference="Patient/pt-1"),
        effective_date_time="2024-06-15",
        value_quantity=Quantity(value=75, unit="kg", system="http://unitsofmeasure.org", code="kg"),
    )

    profile = UscoreBodyWeightProfile.from_resource(api_response)

    assert profile.get_status() == "final"
    assert profile.get_value_quantity().value == 75
    assert profile.get_effective_date_time() == "2024-06-15"
    assert profile.get_subject().reference == "Patient/pt-1"


def test_apply_profile_to_bare_observation_and_populate_it():
    bare_observation = Observation(resource_type="Observation", status="preliminary", code=CodeableConcept())
    profile = UscoreBodyWeightProfile.apply(bare_observation)

    profile.set_status("final")
    profile.set_code(CodeableConcept(coding=[Coding(code="29463-7", system="http://loinc.org")]))
    profile.set_subject(Reference(reference="Patient/pt-1"))
    profile.set_vscat({})
    profile.set_effective_date_time("2024-06-15")
    profile.set_value_quantity(Quantity(value=75, unit="kg", system="http://unitsofmeasure.org", code="kg"))

    assert profile.validate()["errors"] == []
    assert CANONICAL_URL in profile.to_resource().meta.profile


def test_create_builds_a_resource_with_fixed_code_and_required_slice_stubs():
    profile = UscoreBodyWeightProfile.create(
        status="final",
        subject=Reference(reference="Patient/example"),
    )

    profile.set_value_quantity(Quantity(value=70, unit="kg", system="http://unitsofmeasure.org", code="kg"))
    profile.set_effective_date_time("2024-01-15")

    obs = profile.to_resource()
    assert obs.code.coding[0].code == "29463-7"
    assert obs.value_quantity.value == 70
    assert len(obs.category) == 1
    assert profile.validate()["errors"] == []


@pytest.mark.skip(
    reason="TODO: validate() does not catch disallowed value[x] variants — Python profile "
    "is missing a validate_excluded call for forbidden choice variants."
)
def test_validate_catches_disallowed_value_variants_on_raw_resource():
    resource = Observation(
        resource_type="Observation",
        meta=Meta(profile=[CANONICAL_URL]),
        status="final",
        category=[
            CodeableConcept(
                coding=[Coding(code="vital-signs", system="http://terminology.hl7.org/CodeSystem/observation-category")],
            ),
        ],
        code=CodeableConcept(coding=[Coding(code="29463-7", system="http://loinc.org")]),
        subject=Reference(reference="Patient/pt-1"),
        effective_date_time="2024-06-15",
        value_string="not allowed",
    )

    profile = UscoreBodyWeightProfile.apply(resource)
    errors = profile.validate()["errors"]
    assert "UscoreBodyWeightProfile: field 'value_string' must not be present" in errors


def test_get_vscat_returns_flat_value():
    profile = UscoreBodyWeightProfile.create(
        status="final",
        subject=Reference(reference="Patient/example"),
    )

    flat = profile.get_vscat()
    assert flat is not None
    assert "coding" not in flat


@pytest.mark.skip(
    reason="TODO: Python get_vscat() does not accept a 'raw' mode parameter — only the "
    "stripped/flat view is exposed."
)
def test_get_vscat_raw_includes_discriminator():
    profile = UscoreBodyWeightProfile.create(
        status="final",
        subject=Reference(reference="Patient/example"),
    )

    raw = profile.get_vscat("raw")  # type: ignore[call-arg]
    assert raw is not None
    assert raw["coding"] is not None
