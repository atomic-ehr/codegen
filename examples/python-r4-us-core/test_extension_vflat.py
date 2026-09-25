"""The `vflat` arm of a complex extension getter — a validated read.

The default flat read extracts whatever sub-extensions are present, so a
non-conformant extension comes back as a dict quietly missing its required
members and the caller meets a `KeyError` with no FHIR context. `vflat` runs the
extension's own `validate()` first and raises with the conformance errors
instead.

Mirrors the TypeScript getter's `vflat` mode. The Python flat return stays
`dict[str, Any]` in both arms: TypeScript narrows the validated read to a
separate type whose required members are non-optional, which has no equivalent
here without introducing TypedDicts.
"""

import pytest
from fhir_types.hl7_fhir_r4_core.base import Extension
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.hl7_fhir_us_core.profiles.patient_uscore_patient_profile import UscorePatientProfile

OMB_CATEGORY = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race"


def _patient_with_race(*sub_extensions: Extension) -> UscorePatientProfile:
    patient = Patient()
    profile = UscorePatientProfile.apply(patient)
    profile.set_race(Extension(url=OMB_CATEGORY, extension=list(sub_extensions)))
    return profile


def test_a_conformant_extension_reads_the_same_either_way() -> None:
    profile = _patient_with_race(Extension(url="text", valueString="White"))

    # `detailed` is an array sub-extension, so extraction always seeds it
    assert profile.get_race() == {"detailed": [], "text": "White"}
    assert profile.get_race("vflat") == {"detailed": [], "text": "White"}


def test_the_default_read_returns_a_dict_missing_its_required_members() -> None:
    # `text` is required by the race extension; nothing here reports that
    profile = _patient_with_race()

    # `text` is simply absent — the read reports nothing
    assert profile.get_race() == {"detailed": []}


def test_the_validated_read_raises_with_the_conformance_errors() -> None:
    profile = _patient_with_race()

    with pytest.raises(ValueError) as excinfo:
        profile.get_race("vflat")

    assert "text" in str(excinfo.value)


def test_the_other_modes_are_unaffected() -> None:
    profile = _patient_with_race(Extension(url="text", valueString="White"))

    raw = profile.get_race("raw")
    assert raw is not None
    assert raw.url == OMB_CATEGORY

    wrapped = profile.get_race("profile")
    assert wrapped is not None
    assert wrapped.to_resource().url == OMB_CATEGORY
