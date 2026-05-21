"""
Typed Bundle Profile Class API Tests
"""

import pytest
from fhir_types.hl7_fhir_r4_core.base import HumanName
from fhir_types.hl7_fhir_r4_core.bundle import Bundle, BundleEntry
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.example_folder_structures.profiles.bundle_example_typed_bundle import ExampleTypedBundleProfile


smith_patient = Patient(resource_type="Patient", name=[HumanName(family="Smith")])
active_patient = Patient(resource_type="Patient", active=True)


# ---------------------------------------------------------------------------
# demo: single-element slice (max: 1) — PatientEntry
# ---------------------------------------------------------------------------


def test_freshly_created_bundle_fails_validation_missing_patient_entry():
    bundle = ExampleTypedBundleProfile.create(type="collection")
    errors = bundle.validate()["errors"]
    assert errors == [
        "ExampleTypedBundleProfile.entry: slice 'PatientEntry' requires at least 1 item(s), found 0",
    ]


def test_set_patient_entry_accepts_typed_bundle_entry():
    bundle = ExampleTypedBundleProfile.create(type="collection")

    # Desired: setter accepts a typed BundleEntry[Patient] instance.
    # FAILS: setter signature is `value: dict | None` — passing a BundleEntry model
    # causes apply_slice_match to call dict(model), which raises TypeError.
    bundle.set_patient_entry(BundleEntry(resource=smith_patient))  # FAILS


def test_get_patient_entry_returns_bundle_entry_instance():
    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry(BundleEntry(resource=smith_patient))  # FAILS (see above)

    entry = bundle.get_patient_entry()

    # Desired: typed BundleEntry[Patient], not a plain dict.
    assert isinstance(entry, BundleEntry)  # FAILS: returns dict
    assert entry.resource.resource_type == "Patient"  # FAILS: no .resource on dict
    assert entry.resource.name[0].family == "Smith"  # FAILS


def test_get_patient_entry_raw_mode_returns_bundle_entry_instance():
    """Raw mode should return the stored BundleEntry regardless."""
    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry(BundleEntry(resource=smith_patient))  # FAILS

    raw = bundle.get_patient_entry("raw")
    assert isinstance(raw, BundleEntry)  # FAILS
    assert raw.resource.resource_type == "Patient"  # FAILS


def test_get_patient_entry_strips_resource_key_in_flat_mode():
    """
    Documents the current (broken) behavior: strip_match_keys removes the
    "resource" key from the returned dict, so the Patient data is inaccessible.

    With a plain-dict patient this at least runs without error, making the
    data-loss observable.
    """
    bundle = ExampleTypedBundleProfile.create(type="collection")
    # Use model_dump so the setter receives a plain dict (avoids the TypeError).
    bundle.set_patient_entry({"resource": smith_patient.model_dump(by_alias=True, exclude_none=True)})

    entry = bundle.get_patient_entry()
    assert entry is not None
    # strip_match_keys(item_dict, ["resource"]) removes "resource" entirely.
    assert "resource" not in entry  # documents the bug — resource data is lost


def test_get_patient_entry_resource_accessible_in_raw_mode():
    """
    Raw mode bypasses strip_match_keys, so the resource IS present.
    This confirms the data is stored correctly — only the flat getter is broken.
    """
    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry({"resource": smith_patient.model_dump(by_alias=True, exclude_none=True)})

    raw = bundle.get_patient_entry("raw")
    assert raw is not None
    # In raw mode the full BundleEntry is returned — resource is accessible.
    resource = raw.resource if hasattr(raw, "resource") else (raw or {}).get("resource")
    assert resource is not None


def test_set_patient_entry_replaces_existing():
    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry({"resource": smith_patient.model_dump(by_alias=True, exclude_none=True)})
    bundle.set_patient_entry({"resource": active_patient.model_dump(by_alias=True, exclude_none=True)})

    # Only one patient entry — the second call replaced the first.
    assert len(bundle.to_resource().entry) == 1


# ---------------------------------------------------------------------------
# demo: unbounded slice (max: *) — OrganizationEntry
# ---------------------------------------------------------------------------


def test_set_organization_entry_accepts_a_list():
    """
    Desired: set_organization_entry takes a list[BundleEntry[Organization]]
    because OrganizationEntry has max: *.

    FAILS: the generated setter signature is `value: dict | None` (single-item),
    mirroring single-element slices — the unbounded-slice distinction is lost.
    """
    from fhir_types.hl7_fhir_r4_core.organization import Organization

    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry({"resource": smith_patient.model_dump(by_alias=True, exclude_none=True)})

    clinic = Organization(resource_type="Organization", name="Clinic")
    acme = Organization(resource_type="Organization", name="Acme")

    # Desired: accept a list (TS: setOrganizationEntry([...]))
    bundle.set_organization_entry([BundleEntry(resource=clinic), BundleEntry(resource=acme)])  # FAILS

    orgs = bundle.get_organization_entry()
    assert orgs is not None
    assert len(orgs) == 2  # FAILS: would return a single dict (or None)


def test_get_organization_entry_returns_list():
    """
    Desired: get_organization_entry() returns list[BundleEntry[Organization]]
    for max: * slices. Currently returns a single dict | None.
    """
    from fhir_types.hl7_fhir_r4_core.organization import Organization

    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry({"resource": smith_patient.model_dump(by_alias=True, exclude_none=True)})
    org = Organization(resource_type="Organization", name="Clinic")
    bundle.set_organization_entry({"resource": org.model_dump(by_alias=True, exclude_none=True)})

    result = bundle.get_organization_entry()
    # Desired: a list, not a single dict.
    assert isinstance(result, list)  # FAILS: returns dict