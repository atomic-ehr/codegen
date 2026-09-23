"""US Core Provenance Profile Class API Tests

US Core restates `Provenance.target`, whose base type is `Reference(Any)` — its
only declared target is the abstract `Resource` type, which admits a reference to
any resource. The generator expands that family into its member resources, so the
emitted check lists the instantiable types a reference can actually have; the
abstract Resource and DomainResource are left out.

The expansion draws on the resources that survived tree shaking, so the allowed
set is this generation's closure rather than every R4 resource — a reference to a
conformant type the generation did not emit is reported as an error. The
TypeScript generator behaves the same way.

The check still never runs, though: `target` is `1..*`, and the helper reads
`reference` from the list itself rather than from each entry. The TypeScript
generator has the same hole, so this mirrors
`examples/typescript-r4-us-core/profile-us-core-provenance.test.ts`.
"""

from pathlib import Path
from typing import Any, cast

import pytest
from fhir_types.hl7_fhir_r4_core.base import BackboneElement, Reference
from fhir_types.hl7_fhir_r4_core.provenance import Provenance, ProvenanceAgent
from fhir_types.hl7_fhir_us_core.profiles.provenance_uscore_provenance import (
    UscoreProvenanceProfile,
)

GENERATED_SOURCE = (
    Path(__file__).parent / "fhir_types/hl7_fhir_us_core/profiles/provenance_uscore_provenance.py"
).read_text()

RECORDED = "2024-06-15T10:00:00Z"

ALLOWED = "Bundle, Observation, OperationOutcome, Organization, Patient, Provenance"


def _agent() -> list[BackboneElement]:
    # The generated factory types `agent` as list[BackboneElement], but the model
    # itself demands the nested ProvenanceAgent, whose `who` is required.
    return [ProvenanceAgent(who=Reference(reference="Practitioner/pr-1"))]


# --- demo ------------------------------------------------------------------


def test_build_a_provenance_resource_targeting_a_patient() -> None:
    profile = UscoreProvenanceProfile.create(
        target=[Reference(reference="Patient/pt-1")],
        recorded=RECORDED,
        agent=_agent(),
    )

    assert profile.validate()["errors"] == []


# --- the generated reference check on target --------------------------------


def test_the_generated_validation_lists_the_member_resource_types() -> None:
    assert '"Bundle","Observation","OperationOutcome","Organization","Patient","Provenance"' in GENERATED_SOURCE
    # The abstract family root can never be an instance's resourceType
    assert '"Resource"' not in GENERATED_SOURCE
    assert '"DomainResource"' not in GENERATED_SOURCE


@pytest.mark.parametrize("reference", ["Patient/pt-1", "Practitioner/pr-1", "NotAResource/x"])
def test_a_target_in_a_list_reports_no_error(reference: str) -> None:
    # `target` is an array, so the emitted check cannot fail for any input — not
    # even a reference to something that is not a FHIR resource at all.
    profile = UscoreProvenanceProfile.create(
        target=[Reference(reference=reference)],
        recorded=RECORDED,
        agent=_agent(),
    )

    assert profile.validate()["errors"] == []


def _single_target(reference: str) -> Provenance:
    # An invalid cardinality, used only to make the check execute.
    resource: dict[str, Any] = {
        "resourceType": "Provenance",
        "recorded": RECORDED,
        "agent": _agent(),
        "target": {"reference": reference},
    }
    return cast(Provenance, resource)


def test_the_check_accepts_an_allowed_resource_once_it_executes() -> None:
    profile = UscoreProvenanceProfile(_single_target("Patient/pt-1"))

    assert profile.validate()["errors"] == []


def test_the_check_rejects_a_type_outside_the_generated_closure_once_it_executes() -> None:
    # Not "is this a FHIR resource" — the allowed set is this generation's
    # closure, so a conformant Practitioner reference is reported here too.
    profile = UscoreProvenanceProfile(_single_target("NotAResource/x"))

    assert profile.validate()["errors"] == [
        f"UscoreProvenanceProfile: field 'target' references 'NotAResource' but only {ALLOWED} are allowed"
    ]
