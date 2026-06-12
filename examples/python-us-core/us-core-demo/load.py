"""Convert patients.csv to bundle.json using generated US Core profiles."""

import csv
import json
import sys
import uuid
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

sys.path.insert(0, str(Path(__file__).parent.parent))

from fhir_types.hl7_fhir_r4_core.base import HumanName, Identifier, Reference
from fhir_types.hl7_fhir_r4_core.observation import Observation
from fhir_types.hl7_fhir_r4_core.patient import Patient
from fhir_types.hl7_fhir_us_core.profiles import UscoreBloodPressureProfile, UscorePatientProfile
from fhir_types.hl7_fhir_us_core.profiles.extension_uscore_race_extension import UscoreRaceExtension


@dataclass
class Row:
    mrn: str
    first: str
    last: str
    gender: str
    dob: str
    race: str
    race_code: str
    systolic: int
    diastolic: int
    bp_date: str


def parse_csv(path: str) -> Iterator[Row]:
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            yield Row(
                mrn=r["mrn"],
                first=r["first"],
                last=r["last"],
                gender=r["gender"],
                dob=r["dob"],
                race=r["race"],
                race_code=r["race_code"],
                systolic=int(r["systolic"]),
                diastolic=int(r["diastolic"]),
                bp_date=r["bp_date"],
            )


def row_to_patient(row: Row) -> Patient:
    resource = UscorePatientProfile.create_resource(
        identifier=[Identifier(system="http://hospital.example.org/mrn", value=row.mrn)],
        name=[HumanName(family=row.last, given=[row.first])],
    )
    resource.gender = row.gender  # type: ignore[assignment]
    resource.birth_date = row.dob  # type: ignore[assignment]

    race = UscoreRaceExtension.create()
    race.set_extension_omb_category({
        "code": row.race_code,
        "system": "urn:oid:2.16.840.1.113883.6.238",
        "display": row.race,
    })
    race.set_extension_text({"value_string": row.race})

    profile = UscorePatientProfile.apply(resource)
    profile.set_race(race)
    return profile.to_resource()


def row_to_bp(row: Row, patient_uuid: str) -> Observation:
    profile = UscoreBloodPressureProfile.create(
        status="final",
        subject=Reference(reference=f"urn:uuid:{patient_uuid}"),
    )
    profile.set_effective_date_time(row.bp_date)
    profile.set_systolic({
        "value": row.systolic,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]",
    })
    profile.set_diastolic({
        "value": row.diastolic,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]",
    })
    result = profile.validate()
    if result["errors"]:
        raise ValueError(f"{row.mrn}: {'; '.join(result['errors'])}")
    return profile.to_resource()


def make_entry(full_url: str, resource: Any, method: str, url: str) -> dict[str, Any]:
    return {
        "fullUrl": full_url,
        "resource": json.loads(resource.model_dump_json(exclude_none=True)),
        "request": {"method": method, "url": url},
    }


def main() -> None:
    here = Path(__file__).parent
    csv_path = sys.argv[1] if len(sys.argv) > 1 else str(here / "patients.csv")
    out_path = here / "bundle.json"

    entries: list[dict[str, Any]] = []
    for row in parse_csv(csv_path):
        patient_uuid = str(uuid.uuid4())
        bp_uuid = str(uuid.uuid4())
        entries.append(make_entry(f"urn:uuid:{patient_uuid}", row_to_patient(row), "POST", "Patient"))
        entries.append(make_entry(f"urn:uuid:{bp_uuid}", row_to_bp(row, patient_uuid), "POST", "Observation"))

    bundle = {"resourceType": "Bundle", "type": "transaction", "entry": entries}

    with open(out_path, "w") as f:
        json.dump(bundle, f, indent=2)

    print(f"Wrote {len(entries)} entries ({len(entries) // 2} patients) to {out_path}")


if __name__ == "__main__":
    main()