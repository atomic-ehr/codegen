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
    bundle.set_patient_entry(BundleEntry(resource=smith_patient))


def test_get_patient_entry_returns_bundle_entry_instance():
    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry(BundleEntry(resource=smith_patient))

    entry = bundle.get_patient_entry()
    assert isinstance(entry, BundleEntry)
    assert entry.resource.resource_type == "Patient"
    assert entry.resource.name[0].family == "Smith"


def test_get_patient_entry_raw_mode_returns_bundle_entry_instance():
    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry(BundleEntry(resource=smith_patient))

    entry = bundle.get_patient_entry()
    assert isinstance(entry, BundleEntry)
    assert entry.resource.resource_type == "Patient"


def test_get_patient_entry_returns_stored_entry_including_resource():
    """Getter returns the stored entry as-is — resource data is preserved."""
    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry({"resource": smith_patient.model_dump(by_alias=True, exclude_none=True)})

    entry = bundle.get_patient_entry()
    assert entry is not None
    resource = entry.resource if hasattr(entry, "resource") else (entry or {}).get("resource")
    assert resource is not None


def test_get_patient_entry_resource_accessible_in_raw_mode():
    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry({"resource": smith_patient.model_dump(by_alias=True, exclude_none=True)})

    entry = bundle.get_patient_entry()
    assert entry is not None
    resource = entry.resource if hasattr(entry, "resource") else (entry or {}).get("resource")
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
    from fhir_types.hl7_fhir_r4_core.organization import Organization

    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry({"resource": smith_patient.model_dump(by_alias=True, exclude_none=True)})

    clinic = Organization(resource_type="Organization", name="Clinic")
    acme = Organization(resource_type="Organization", name="Acme")

    bundle.set_organization_entry([BundleEntry(resource=clinic), BundleEntry(resource=acme)])

    orgs = bundle.get_organization_entry()
    assert orgs is not None
    assert len(orgs) == 2


def test_get_organization_entry_returns_list():
    from fhir_types.hl7_fhir_r4_core.organization import Organization

    bundle = ExampleTypedBundleProfile.create(type="collection")
    bundle.set_patient_entry({"resource": smith_patient.model_dump(by_alias=True, exclude_none=True)})
    org = Organization(resource_type="Organization", name="Clinic")
    bundle.set_organization_entry([BundleEntry(resource=org)])

    result = bundle.get_organization_entry()
    assert isinstance(result, list)