from fhir_types.hl7_fhir_r4_core.base import CodeableConcept
from fhir_types.hl7_fhir_r4_core.bundle import Bundle, BundleEntry
from fhir_types.hl7_fhir_r4_core.observation import Observation
from fhir_types.hl7_fhir_r4_core.patient import Patient


def test_bundle_generic_narrows_entry_resources() -> None:
    patient = Patient(id="p-1")
    observation = Observation(id="obs-1", status="final", code=CodeableConcept())

    bundle: Bundle[Patient | Observation] = Bundle(
        type="transaction",
        entry=[
            BundleEntry(resource=patient),
            BundleEntry(resource=observation),
        ],
    )

    observations = [
        e.resource
        for e in (bundle.entry or [])
        if e.resource and e.resource.resource_type == "Observation"
    ]
    assert len(observations) == 1
    assert observations[0].id == "obs-1"


def test_bundle_entry_generic_narrows_resource() -> None:
    patient = Patient(id="p-1")
    entry: BundleEntry[Patient] = BundleEntry(resource=patient)
    assert entry.resource.resource_type == "Patient"


def test_bundle_without_type_param_is_backwards_compatible() -> None:
    patient = Patient(id="p-1")
    bundle: Bundle = Bundle(
        type="collection",
        entry=[BundleEntry(resource=patient)],
    )
    assert len(bundle.entry) == 1