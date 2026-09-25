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

`target` is `1..*`, so the element holds a list of References; the check reads
every entry. Mirrors
`examples/typescript-r4-us-core/profile-us-core-provenance.test.ts`.
"""

from pathlib import Path

import pytest
from fhir_types.hl7_fhir_r4_core.base import Reference
from fhir_types.hl7_fhir_r4_core.provenance import ProvenanceAgent
from fhir_types.hl7_fhir_us_core.profiles.provenance_uscore_provenance import (
    UscoreProvenanceProfile,
)

GENERATED_SOURCE = (
    Path(__file__).parent / "fhir_types/hl7_fhir_us_core/profiles/provenance_uscore_provenance.py"
).read_text()

RECORDED = "2024-06-15T10:00:00Z"

ALLOWED = "Bundle, Observation, OperationOutcome, Organization, Patient, Provenance"


def _agent() -> list[ProvenanceAgent]:
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


def test_an_allowed_target_passes() -> None:
    profile = UscoreProvenanceProfile.create(
        target=[Reference(reference="Patient/pt-1")],
        recorded=RECORDED,
        agent=_agent(),
    )

    assert profile.validate()["errors"] == []


@pytest.mark.parametrize("reference", ["Practitioner/pr-1", "NotAResource/x"])
def test_a_target_outside_the_allowed_set_is_reported(reference: str) -> None:
    profile = UscoreProvenanceProfile.create(
        target=[Reference(reference=reference)],
        recorded=RECORDED,
        agent=_agent(),
    )

    reported = reference.split("/")[0]
    assert profile.validate()["errors"] == [
        f"UscoreProvenanceProfile: field 'target' references '{reported}' but only {ALLOWED} are allowed"
    ]


def test_every_entry_of_the_list_is_checked() -> None:
    profile = UscoreProvenanceProfile.create(
        target=[Reference(reference="Patient/pt-1"), Reference(reference="NotAResource/x")],
        recorded=RECORDED,
        agent=_agent(),
    )

    assert profile.validate()["errors"] == [
        f"UscoreProvenanceProfile: field 'target' references 'NotAResource' but only {ALLOWED} are allowed"
    ]


def test_a_repeated_offending_type_is_reported_once() -> None:
    # One error per offending type, so a long list does not bury the rest of
    # validate()'s output.
    profile = UscoreProvenanceProfile.create(
        target=[Reference(reference="NotAResource/x"), Reference(reference="NotAResource/y")],
        recorded=RECORDED,
        agent=_agent(),
    )

    assert len(profile.validate()["errors"]) == 1
