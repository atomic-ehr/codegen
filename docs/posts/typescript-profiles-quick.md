# TypeScript Profile Classes in Atomic EHR Codegen

We've added FHIR profile support to the TypeScript generator in [Atomic EHR Codegen](https://github.com/atomic-ehr/codegen). Profiles generate as wrapper classes with typed accessors, automatic slice handling, and runtime validation -- all on top of plain FHIR JSON.

## Quick look

```typescript
import { observation_bpProfile } from "./profiles/Observation_observation_bp";

const bp = observation_bpProfile.create({
    status: "final",
    category: [],
    subject: { reference: "Patient/pt-1" },
});

// Slice setters -- discriminator values (LOINC codes) applied automatically
bp.setVscat({ text: "Vital Signs" })
    .setSystolicBp({ valueQuantity: { value: 120, unit: "mmHg" } })
    .setDiastolicBp({ valueQuantity: { value: 80, unit: "mmHg" } })
    .setEffectiveDateTime("2024-06-15");

// Validate against profile constraints
bp.validate(); // [] -- valid

// Get plain FHIR JSON
const obs = bp.toResource();
// {
//     resourceType: "Observation",
//     meta: { profile: ["http://hl7.org/fhir/StructureDefinition/bp"] },
//     status: "final",
//     code: { coding: [{ code: "85354-9", system: "http://loinc.org" }] },
//     category: [{ text: "Vital Signs", coding: { code: "vital-signs", system: "http://terminology.hl7.org/CodeSystem/observation-category" } }],
//     subject: { reference: "Patient/pt-1" },
//     effectiveDateTime: "2024-06-15",
//     component: [
//         { code: { coding: { code: "8480-6", system: "http://loinc.org" } }, valueQuantity: { value: 120, unit: "mmHg" } },
//         { code: { coding: { code: "8462-4", system: "http://loinc.org" } }, valueQuantity: { value: 80, unit: "mmHg" } },
//     ],
// }
```

Supports resource profiles, simple/complex extension profiles, slice accessors, choice types, and `validate()` checking required fields, fixed values, slice cardinality, enum bindings, and reference types.

## Looking for feedback

This is an early iteration. We'd appreciate hearing about profiles that don't generate correctly, API patterns that feel awkward, or validation gaps.

GitHub: https://github.com/atomic-ehr/codegen
NPM: `@atomic-ehr/codegen`
