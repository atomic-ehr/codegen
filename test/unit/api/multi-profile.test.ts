import { describe, expect, it } from "bun:test";
import { USCoreBodyWeightProfileProfile } from "../../../examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/UscoreBodyWeightProfile";
import { USCoreBodyHeightProfileProfile } from "../../../examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/UscoreBodyHeightProfile";
import type { Observation } from "../../../examples/typescript-us-core/fhir-types/hl7-fhir-r4-core/Observation";

const createObservation = (): Observation => ({ resourceType: "Observation", status: "final", code: {} });

describe("Multi-Profile Pattern", () => {
	describe("Body Weight Profile", () => {
		it("creates valid body weight observation", () => {
			const profile = new USCoreBodyWeightProfileProfile(createObservation());
			profile.setVscat({});

			const resource = profile.toResource();
			expect(resource.resourceType).toBe("Observation");
			expect(resource.category).toBeDefined();
			expect(resource.category?.length).toBeGreaterThan(0);
		});

		it("has getters for slices", () => {
			const profile = new USCoreBodyWeightProfileProfile(createObservation());
			profile.setVscat({});

			const vscat = profile.getVscat();
			expect(vscat).toBeDefined();
		});
	});

	describe("Body Height Profile", () => {
		it("creates valid body height observation", () => {
			const profile = new USCoreBodyHeightProfileProfile(createObservation());
			profile.setVscat({});

			const resource = profile.toResource();
			expect(resource.resourceType).toBe("Observation");
			expect(resource.category).toBeDefined();
			expect(resource.category?.length).toBeGreaterThan(0);
		});

		it("has getters for slices", () => {
			const profile = new USCoreBodyHeightProfileProfile(createObservation());
			profile.setVscat({});

			const vscat = profile.getVscat();
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
			const weightProfile = new USCoreBodyWeightProfileProfile(baseObservation);
			weightProfile.setVscat({});

			const resource = weightProfile.toResource();
			expect(resource.status).toBe("final");
			expect(resource.code?.coding?.[0]?.code).toBe("29463-7");
			expect(resource.category).toBeDefined();
		});

		it("creates separate weight and height observations", () => {
			// Create weight observation
			const weightProfile = new USCoreBodyWeightProfileProfile(createObservation());
			weightProfile.setVscat({});
			const weightObs = weightProfile.toResource();
			weightObs.code = { coding: [{ system: "http://loinc.org", code: "29463-7", display: "Body Weight" }] };
			weightObs.valueQuantity = { value: 70, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" };

			// Create height observation
			const heightProfile = new USCoreBodyHeightProfileProfile(createObservation());
			heightProfile.setVscat({});
			const heightObs = heightProfile.toResource();
			heightObs.code = { coding: [{ system: "http://loinc.org", code: "8302-2", display: "Body Height" }] };
			heightObs.valueQuantity = { value: 175, unit: "cm", system: "http://unitsofmeasure.org", code: "cm" };

			// Both should have vital-signs category
			expect(weightObs.category?.length).toBeGreaterThan(0);
			expect(heightObs.category?.length).toBeGreaterThan(0);

			// But have different codes
			expect(weightObs.code?.coding?.[0]?.code).toBe("29463-7");
			expect(heightObs.code?.coding?.[0]?.code).toBe("8302-2");

			// And different values
			expect(weightObs.valueQuantity?.value).toBe(70);
			expect(heightObs.valueQuantity?.value).toBe(175);
		});
	});

	describe("Override interface type safety", () => {
		it("profile class uses narrowed types from override interface", () => {
			// The generated USCoreBodyWeightProfile interface extends Observation
			// with narrowed subject: Reference<"Patient"> instead of the base type's
			// subject?: Reference<"Device" | "Group" | "Location" | "Patient">
			const profile = new USCoreBodyWeightProfileProfile(createObservation());
			const resource = profile.toResource();

			// TypeScript should enforce that subject is Reference<"Patient">
			// This test just verifies the resource structure is correct
			expect(resource.resourceType).toBe("Observation");
		});
	});
});
