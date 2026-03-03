# FHIR Profiles in TypeScript: Quick Start

*~1 min read*

Atomic EHR Codegen generates profile wrapper classes that let you work with FHIR profiles without memorizing canonical URLs, discriminator values, or extension structures.

## Setup

```typescript
new APIBuilder()
    .fromPackage("hl7.fhir.r4.core", "4.0.1")
    .typescript({ generateProfile: true })
    .typeSchema({
        treeShake: {
            "hl7.fhir.r4.core": {
                "http://hl7.org/fhir/StructureDefinition/Observation": {},
                "http://hl7.org/fhir/StructureDefinition/bodyweight": {},
                "http://hl7.org/fhir/StructureDefinition/patient-birthPlace": {},
            }
        }
    })
    .outputTo("./fhir-types")
    .generate();
```

## Resource Profiles

Profile classes wrap a plain FHIR resource and expose typed getters, setters, and slice accessors:

```typescript
import type { Observation } from "./fhir-types/hl7-fhir-r4-core/Observation";
import { observation_bodyweightProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight";

// Create from scratch
const profile = observation_bodyweightProfile.create({
    status: "final",
    code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
    category: [],
    subject: { reference: "Patient/pt-1" },
});

// Slice setter — discriminator values are applied automatically
profile.setVscat({ text: "Vital Signs" });

// Get the underlying Observation
const obs: Observation = profile.toResource();
```

## Extension Profiles

Extension profile classes handle canonical URLs and value types for you:

```typescript
import { birthPlaceProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Extension_birthPlace";

const ext = birthPlaceProfile.createResource({
    valueAddress: { city: "Boston", country: "US" },
});
// ext.url is already "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"

const patient: Patient = {
    resourceType: "Patient",
    extension: [ext],
};
```

That's it. Profiles add a typed convenience layer on top of plain FHIR resources -- minimal runtime overhead, no special serialization.
