import { describe, expect, it } from "bun:test";
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { USCoreBodyWeightProfileProfile as usWeightProfile } from "./fhir-types/hl7-fhir-us-core/profiles";

const createObservation = (): Observation => ({ resourceType: "Observation", status: "final", code: {} });

describe("Multi-Profile Pattern", () => {
    describe("Body Weight Profile", () => {
        it("creates valid body weight observation", () => {
            const profile = new usWeightProfile(createObservation());
            profile.setVSCat({});

            const resource = profile.toResource();
            expect(resource.resourceType).toBe("Observation");
            expect(resource.category).toBeDefined();
            expect(resource.category?.length).toBeGreaterThan(0);
        });

        it("has getters for slices", () => {
            const profile = new usWeightProfile(createObservation());
            profile.setVSCat({});

            const vscat = profile.getVSCat();
            expect(vscat).toBeDefined();
        });
    });

    describe("Profile composition patterns", () => {
        it("wraps existing resource with profile", () => {
            // Create a base observation
            const baseObservation: Observation = {
                resourceType: "Observation",
                status: "final",
                code: { coding: [{ system: "http://loinc.org", code: "29463-7", display: "Body Weight" }] },
            };

            // Wrap with body weight profile
            const weightProfile = new usWeightProfile(baseObservation);
            weightProfile.setVSCat({});

            const resource = weightProfile.toResource();
            expect(resource.status).toBe("final");
            expect(resource.code?.coding?.[0]?.code).toBe("29463-7");
            expect(resource.category).toBeDefined();
        });

        it("creates weight observation with value", () => {
            const weightProfile = new usWeightProfile(createObservation());
            weightProfile.setVSCat({});
            const weightObs = weightProfile.toResource();
            weightObs.code = { coding: [{ system: "http://loinc.org", code: "29463-7", display: "Body Weight" }] };
            weightObs.valueQuantity = { value: 70, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" };

            expect(weightObs.category?.length).toBeGreaterThan(0);
            expect(weightObs.code?.coding?.[0]?.code).toBe("29463-7");
            expect(weightObs.valueQuantity?.value).toBe(70);
        });
    });

    describe("Override interface type safety", () => {
        it("profile class uses narrowed types from override interface", () => {
            const profile = new usWeightProfile(createObservation());
            const resource = profile.toResource();
            expect(resource.resourceType).toBe("Observation");
        });
    });
});
