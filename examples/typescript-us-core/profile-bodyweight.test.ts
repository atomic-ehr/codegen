/**
 * US Core Body Weight Profile Class API Tests
 *
 * Feature coverage focus: from() / apply() / create(), slice getter modes.
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

    test("create() builds a resource with fixed code and required slice stubs", () => {
        const profile = USCoreBodyWeightProfile.create({
            status: "final",
            subject: { reference: "Patient/example" },
        });

        profile.setValueQuantity({ value: 70, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" });
        profile.setEffectiveDateTime("2024-01-15");

        const obs = profile.toResource();
        expect(obs.code!.coding![0]!.code).toBe("29463-7");
        expect(obs.valueQuantity!.value).toBe(70);
        expect(obs.category).toHaveLength(1);
        expect(profile.validate().errors).toEqual([]);
    });

    test("validate() catches disallowed value[x] variants on raw resource", () => {
        const resource: Observation = {
            resourceType: "Observation",
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight"] },
            status: "final",
            category: [
                {
                    coding: {
                        code: "vital-signs",
                        system: "http://terminology.hl7.org/CodeSystem/observation-category",
                    },
                },
            ] as any,
            code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
            subject: { reference: "Patient/pt-1" },
            effectiveDateTime: "2024-06-15",
            valueString: "not allowed",
        };

        const profile = USCoreBodyWeightProfile.apply(resource);
        const { errors } = profile.validate();
        expect(errors).toContain("USCoreBodyWeightProfile: field 'valueString' must not be present");
    });

    test("getVSCat() returns flat value, getVSCat('raw') includes discriminator", () => {
        const profile = USCoreBodyWeightProfile.create({
            status: "final",
            subject: { reference: "Patient/example" },
        });

        const flat = profile.getVSCat();
        expect(flat).toBeDefined();
        expect(flat).not.toHaveProperty("coding");

        const raw = profile.getVSCat("raw");
        expect(raw).toBeDefined();
        expect(raw!.coding).toBeDefined();
    });
});
