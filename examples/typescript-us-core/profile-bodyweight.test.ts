/**
 * US Core Body Weight Profile Class API Tests
 *
 * Feature coverage focus: from() / apply() demo only.
 * Factory methods, field accessors, slice accessors, choice types, validation,
 * and mutability are tested on Patient and Blood Pressure profiles.
 */

import { describe, expect, test } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { USCoreBodyWeightProfile } from "./fhir-types/hl7-fhir-us-core/profiles";

describe("demo", () => {
    test("import a profiled Observation from an API and read values", () => {
        const apiResponse: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight"] },
            status: "final",
            // singular coding matches the slice discriminator format used by the profile
            category: [
                {
                    coding: {
                        code: "vital-signs",
                        system: "http://terminology.hl7.org/CodeSystem/observation-category",
                    },
                },
            ] as any,
            code: { coding: [{ code: "29463-7", system: "http://loinc.org", display: "Body weight" }] },
            subject: { reference: "Patient/pt-1" },
            effectiveDateTime: "2024-06-15",
            valueQuantity: { value: 75, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" },
        };

        const profile = USCoreBodyWeightProfile.from(apiResponse);

        expect(profile.getStatus()).toBe("final");
        expect(profile.getValueQuantity()!.value).toBe(75);
        expect(profile.getEffectiveDateTime()).toBe("2024-06-15");
        expect(profile.getSubject()!.reference).toBe("Patient/pt-1");
    });

    test("apply profile to a bare Observation and populate it", () => {
        const bareObservation: Observation = { resourceType: "Observation", status: "preliminary", code: {} };
        const profile = USCoreBodyWeightProfile.apply(bareObservation);

        profile
            .setStatus("final")
            .setCode({ coding: [{ code: "29463-7", system: "http://loinc.org" }] })
            .setSubject({ reference: "Patient/pt-1" })
            .setVSCat({})
            .setEffectiveDateTime("2024-06-15")
            .setValueQuantity({ value: 75, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" });

        expect(profile.validate().errors).toEqual([]);
        expect(profile.toResource().meta?.profile).toContain(
            "http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight",
        );
    });
});
