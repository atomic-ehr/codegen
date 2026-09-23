"""A precisely-typed value flows into a wider slot.

The generated generic parameters are covariant, so `Reference[Literal["Patient"]]`
is usable wherever a plain `Reference` is expected, and `BundleEntry[Patient]`
wherever `BundleEntry[Resource]` is. Without that, a caller holding an exact type
has to widen or cast to hand it on — the narrower type becomes a liability.

The assertions that matter here are the *annotations*: the example runs `mypy` over
this file, so an annotation that stops being satisfiable fails the build. The
runtime asserts only keep pytest honest about the values.
"""

from typing import Literal

from fhir_types.hl7_fhir_r4_core.base import Reference
from fhir_types.hl7_fhir_r4_core.bundle import BundleEntry
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.hl7_fhir_r4_core.provenance import Provenance, ProvenanceAgent
from fhir_types.hl7_fhir_r4_core.resource import Resource

PATIENT_REF: Reference[Literal["Patient"]] = Reference(reference="Patient/pt-1", type="Patient")


def test_a_narrow_reference_is_usable_where_any_reference_is_expected() -> None:
    def resolve(ref: Reference) -> str | None:
        return ref.reference

    assert resolve(PATIENT_REF) == "Patient/pt-1"


def test_a_narrow_reference_goes_into_a_reference_any_element() -> None:
    # Provenance.target is Reference(Any), so it is typed as a plain Reference
    provenance = Provenance(
        recorded="2024-06-15T10:00:00Z",
        agent=[ProvenanceAgent(who=Reference(reference="Practitioner/pr-1"))],
        target=[PATIENT_REF],
    )

    assert provenance.target[0].reference == "Patient/pt-1"


def test_a_narrow_reference_collects_into_a_wider_list() -> None:
    targets: list[Reference] = [PATIENT_REF]

    assert len(targets) == 1


def test_a_narrow_bundle_entry_is_usable_where_a_wide_one_is_expected() -> None:
    narrow: BundleEntry[Patient] = BundleEntry(resource=Patient(id="pt-1"))
    wide: BundleEntry[Resource] = narrow

    assert wide.resource is not None
    assert wide.resource.id == "pt-1"
