/**
 * Demonstrates using profile classes with the generated getter/setter methods.
 *
 * This example shows:
 * 1. Creating observations with Body Weight and Body Height profiles
 * 2. Using setters to apply profile-defined slices (no input needed for constant slices)
 * 3. Using getters to read values:
 *    - getVscat() - returns flat API (simplified, without discriminator)
 *    - getVscatRaw() - returns full FHIR type (with discriminator)
 * 4. The override interface for type-safe cardinality constraints
 */

import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { USCoreBodyHeightProfileProfile } from "./fhir-types/hl7-fhir-us-core/profiles/UscoreBodyHeightProfile";
import { USCoreBodyWeightProfileProfile } from "./fhir-types/hl7-fhir-us-core/profiles/UscoreBodyWeightProfile";

// Helper to create a base Observation resource
const createBaseObservation = (): Observation => ({
    resourceType: "Observation",
    status: "final",
    code: {},
});

// Example 1: Create a Body Weight observation
function createBodyWeightObservation(): Observation {
    const resource = createBaseObservation();
    const profile = new USCoreBodyWeightProfileProfile(resource);

    // Set the vital-signs category slice (auto-applies discriminator)
    // No input needed when all fields are part of the discriminator
    profile.setVscat();

    // Set additional required fields
    resource.code = {
        coding: [{ system: "http://loinc.org", code: "29463-7", display: "Body Weight" }],
    };
    resource.valueQuantity = {
        value: 70,
        unit: "kg",
        system: "http://unitsofmeasure.org",
        code: "kg",
    };
    resource.subject = { reference: "Patient/example" };
    resource.effectiveDateTime = new Date().toISOString();

    return profile.toResource();
}

// Example 2: Create a Body Height observation
function createBodyHeightObservation(): Observation {
    const resource = createBaseObservation();
    const profile = new USCoreBodyHeightProfileProfile(resource);

    // Set the vital-signs category slice
    profile.setVscat();

    // Set additional required fields
    resource.code = {
        coding: [{ system: "http://loinc.org", code: "8302-2", display: "Body Height" }],
    };
    resource.valueQuantity = {
        value: 175,
        unit: "cm",
        system: "http://unitsofmeasure.org",
        code: "cm",
    };
    resource.subject = { reference: "Patient/example" };
    resource.effectiveDateTime = new Date().toISOString();

    return profile.toResource();
}

// Example 3: Using getters to read values
function demonstrateGetters() {
    const resource = createBaseObservation();
    const profile = new USCoreBodyWeightProfileProfile(resource);
    profile.setVscat();

    // Get simplified value (without discriminator) - flat API
    const simplified = profile.getVscat();
    console.log("Simplified slice:", simplified);

    // Get raw value (with discriminator) - full FHIR type
    const raw = profile.getVscatRaw();
    console.log("Raw slice:", raw);

    // The raw value includes the coding discriminator
    console.log("Raw coding:", raw?.coding);
}

// Example 4: Using override interface types
function demonstrateTypeNarrowing() {
    // The USCoreBodyWeightProfile interface extends Observation with:
    // - subject: Reference<"Patient"> (narrowed from broader union)
    // - category: CodeableConcept[] (made required)

    const resource = createBaseObservation();
    const profile = new USCoreBodyWeightProfileProfile(resource);
    profile.setVscat();

    // TypeScript knows this is an Observation
    // The override interface ensures type safety for constrained fields
    console.log("Resource type:", profile.toResource().resourceType);
}

// Run examples
if (require.main === module) {
    console.log("=== Body Weight Observation ===");
    console.log(JSON.stringify(createBodyWeightObservation(), null, 2));

    console.log("\n=== Body Height Observation ===");
    console.log(JSON.stringify(createBodyHeightObservation(), null, 2));

    console.log("\n=== Getter Demonstration ===");
    demonstrateGetters();

    console.log("\n=== Type Narrowing ===");
    demonstrateTypeNarrowing();
}
