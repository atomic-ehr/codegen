/**
 * FHIR R4 Profile Class API Tests
 *
 * Tests for Profile class usage with bodyweight observation.
 */

import { expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { observation_bodyweightProfile as bodyweightProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight";

function createBodyWeightObservation(): Observation {
    const baseObservation: Observation = {
        resourceType: "Observation",
        id: "bodyweight-obs-1",
        status: "final",
        code: {
            coding: [{ code: "29463-7", system: "http://loinc.org", display: "Body weight" }],
        },
        subject: { reference: "Patient/pt-1", display: "John Smith" },
        effectiveDateTime: "2023-03-15T09:30:00Z",
        valueQuantity: { value: 75.5, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" },
    };

    const profile = new bodyweightProfile(baseObservation).setVscat({ text: "Vital Signs" });
    return profile.toResource();
}

test("Body weight observation with Profile class", () => {
    const bodyweight = createBodyWeightObservation();

    expect(bodyweight.status).toBe("final");
    expect(bodyweight.code?.coding?.[0]?.code).toBe("29463-7");
    expect(bodyweight.valueQuantity?.value).toBe(75.5);

    // Check vital-signs category was added by profile
    const hasVitalSigns = bodyweight.category?.some((cat) => {
        const coding = cat.coding as unknown;
        if (Array.isArray(coding)) {
            return coding.some((c) => c.code === "vital-signs");
        }
        return (coding as { code?: string })?.code === "vital-signs";
    });
    expect(hasVitalSigns).toBe(true);

    expect(bodyweight).toMatchSnapshot();
});
