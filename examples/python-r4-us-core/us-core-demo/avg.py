"""Read bundle.json and compute average blood pressure across all patients."""

import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

sys.path.insert(0, str(Path(__file__).parent.parent))

from fhir_types.hl7_fhir_r4_core.observation import Observation
from fhir_types.hl7_fhir_us_core.profiles import UscoreBloodPressureProfile

BP_CANONICAL = UscoreBloodPressureProfile.canonical_url


def main() -> None:
    here = Path(__file__).parent
    bundle_path = sys.argv[1] if len(sys.argv) > 1 else str(here / "bundle.json")

    with open(bundle_path) as f:
        bundle = json.load(f)

    systolic_values: list[float] = []
    diastolic_values: list[float] = []

    for entry in bundle.get("entry", []):
        resource = entry.get("resource", {})
        if resource.get("resourceType") != "Observation":
            continue
        profiles = (resource.get("meta") or {}).get("profile") or []
        if BP_CANONICAL not in profiles:
            continue

        obs = Observation.model_validate(resource)
        profile = UscoreBloodPressureProfile.apply(obs)

        systolic = profile.get_systolic()
        diastolic = profile.get_diastolic()
        if systolic and diastolic:
            systolic_values.append(float(systolic["value"]))
            diastolic_values.append(float(diastolic["value"]))

    n = len(systolic_values)
    if n == 0:
        print("No blood pressure observations found. Run load.py first.")
        return

    avg_sys = sum(systolic_values) / n
    avg_dia = sum(diastolic_values) / n
    print(f"Avg BP: {avg_sys:.1f}/{avg_dia:.1f} mmHg (n={n})")


if __name__ == "__main__":
    main()