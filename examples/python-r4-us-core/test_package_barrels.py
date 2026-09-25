"""Profile classes are reachable from their package, not only their module.

TypeScript emits an `index.ts` per package re-exporting `./profiles`; these are
the Python equivalent. Importing from the package is the ergonomic path — the
module path keeps working either way.
"""

from fhir_types.hl7_fhir_r4_core import NationalityExtension, ObservationBodyweightProfile
from fhir_types.hl7_fhir_us_core import UscorePatientProfile, UscoreRaceExtension
from fhir_types.hl7_fhir_us_core.profiles.patient_uscore_patient_profile import (
    UscorePatientProfile as UscorePatientProfileViaModule,
)


def test_a_profile_only_package_exports_its_profiles() -> None:
    assert UscorePatientProfile.resource_type == "Patient"
    assert UscoreRaceExtension.canonical_url.endswith("us-core-race")


def test_a_package_with_types_also_exports_its_profiles() -> None:
    assert ObservationBodyweightProfile.resource_type == "Observation"
    assert NationalityExtension.canonical_url.endswith("patient-nationality")


def test_the_package_export_is_the_same_class_as_the_module_one() -> None:
    assert UscorePatientProfile is UscorePatientProfileViaModule
