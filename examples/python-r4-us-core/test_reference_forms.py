"""How `validate_reference` reads each shape a FHIR reference can take.

`Reference.reference` is a relative or absolute URL to a FHIR resource, and the
resource type is the segment before the id — optionally followed by
`/_history/<vid>`. A `urn:` or `#contained` reference carries no type at all, so
nothing can be checked for those.

Mirrors `test/api/write-generator/reference-helpers.test.ts`, so the two runtimes
are pinned against one matrix.
"""

import pytest
from fhir_types.profile_helpers import referenced_resource_type, validate_reference

ALLOWED = ["Patient", "Organization"]
PROFILE = "P"


def _errors(reference: str) -> list[str]:
    return validate_reference({"subject": {"reference": reference}}, PROFILE, "subject", ALLOWED)


@pytest.mark.parametrize(
    ("reference", "expected_type"),
    [
        ("Patient/123", "Patient"),
        ("Patient/123/_history/2", "Patient"),
        ("http://ex.org/fhir/Patient/123", "Patient"),
        ("https://ex.org/fhir/Patient/123/_history/2", "Patient"),
        ("http://ex.org/Patient/123", "Patient"),
        ("Practitioner/pr-1", "Practitioner"),
        ("https://ex.org/fhir/Banana/1", "Banana"),
        # no resource type is recoverable from these
        ("urn:uuid:3fdc72f4-a11d-4a9d-9260-a9f745779e1d", None),
        ("urn:oid:1.2.3.4", None),
        ("#contained-1", None),
        ("no-slash", None),
    ],
)
def test_the_resource_type_is_the_segment_before_the_id(reference: str, expected_type: str | None) -> None:
    assert referenced_resource_type(reference) == expected_type


@pytest.mark.parametrize(
    "reference",
    [
        "Patient/123",
        "Patient/123/_history/2",
        "Organization/org-1",
        # absolute references are equally legal FHIR
        "http://ex.org/fhir/Patient/123",
        "http://ex.org/Patient/123",
        "https://ex.org/fhir/Patient/123/_history/2",
    ],
)
def test_a_conformant_reference_is_accepted(reference: str) -> None:
    assert _errors(reference) == []


@pytest.mark.parametrize(
    ("reference", "reported"),
    [
        ("Practitioner/pr-1", "Practitioner"),
        ("Banana/1", "Banana"),
        ("http://ex.org/fhir/Practitioner/pr-1", "Practitioner"),
        ("https://ex.org/fhir/Banana/1", "Banana"),
    ],
)
def test_a_reference_outside_the_allowed_set_names_the_real_type(reference: str, reported: str) -> None:
    assert _errors(reference) == [
        f"{PROFILE}: field 'subject' references '{reported}' but only Patient, Organization are allowed"
    ]


@pytest.mark.parametrize(
    "reference",
    ["urn:uuid:3fdc72f4-a11d-4a9d-9260-a9f745779e1d", "urn:oid:1.2.3.4", "#contained-1", "no-slash"],
)
def test_a_reference_carrying_no_resource_type_is_not_reported(reference: str) -> None:
    assert _errors(reference) == []
