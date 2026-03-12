/**
 * Demonstrates using profile classes with the generated getter/setter methods.
 *
 * This example shows:
 * 1. Creating observations with Body Weight profile
 * 2. Using setters to apply profile-defined slices (no input needed for constant slices)
 * 3. Using getters to read values:
 *    - getVSCat() - returns flat API (simplified, without discriminator)
 *    - getVSCatRaw() - returns full FHIR type (with discriminator)
 * 4. The override interface for type-safe cardinality constraints
 */

import { USCoreBodyWeightProfile as usWeightProfile } from "./fhir-types/hl7-fhir-us-core/profiles";

// Example 1: Create a Body Weight observation
const createBodyWeightObservation = () => {
    const profile = usWeightProfile.create({
        status: "final",
        subject: { reference: "Patient/example" },
    });

    profile.setValueQuantity({ value: 70, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" });
    profile.setEffectiveDateTime(new Date().toISOString());

    return profile.toResource();
};

// Example 2: Using getters to read values
const demonstrateGetters = () => {
    const profile = usWeightProfile.create({
        status: "final",
        subject: { reference: "Patient/example" },
    });

    // Get simplified value (without discriminator) - flat API
    const simplified = profile.getVSCat();
    console.log("Simplified slice:", simplified);

    // Get raw value (with discriminator) - full FHIR type
    const raw = profile.getVSCatRaw();
    console.log("Raw slice:", raw);

    // The raw value includes the coding discriminator
    console.log("Raw coding:", raw?.coding);
};

// Run examples
console.log("=== Body Weight Observation ===");
console.log(JSON.stringify(createBodyWeightObservation(), null, 2));

console.log("\n=== Getter Demonstration ===");
demonstrateGetters();
