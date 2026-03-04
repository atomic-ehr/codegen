# Profile codegen for TypeScript

[@atomic-ehr/codegen](https://github.com/atomic-ehr/codegen) is an open-source toolkit that generates strongly-typed code from FHIR packages. We've added **FHIR profile support** for TypeScript (dev preview) -- generated classes auto-populate fixed values, provide typed accessors for slices and extensions, and include basic client-side validation:

```typescript
import { observation_bpProfile } from "./profiles/Observation_observation_bp";

// create() auto-sets fixed values and required slice stubs
const bp = observation_bpProfile.create({
    status: "final",
    subject: { reference: "Patient/pt-1" },
});

// Slice setters -- discriminator values applied automatically
// Choice types constrained to a single variant are flattened (value[x] → Quantity fields):
bp.setVSCat({ text: "Vital Signs" })
    .setSystolicBP({ value: 120, unit: "mmHg" })
    .setDiastolicBP({ value: 80, unit: "mmHg" })
    .setEffectiveDateTime("2024-06-15");

bp.validate(); // [] -- valid

// Plain FHIR JSON -- ready for API calls, storage, etc.
const obs = bp.toResource();
```

Wrapping an existing resource to read slices back:

```typescript
const bp2 = observation_bpProfile.from(existingObservation);

bp2.getSystolicBP();        // { value: 120, unit: "mmHg" }
bp2.getDiastolicBP();       // { value: 80, unit: "mmHg" }
bp2.getVSCat();             // { text: "Vital Signs" }
bp2.getEffectiveDateTime(); // "2024-06-15"

// Raw getters return the full FHIR element including discriminator values
bp2.getSystolicBPRaw();
// { code: { coding: [{ code: "8480-6", ... }] }, valueQuantity: { value: 120, ... } }
```

Working examples:

- [hl7.fhir.r4.core](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-r4/README.md)
  - [Blood pressure profile](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-r4/profile-bp.test.ts)
  - [Bodyweight profile](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-r4/profile-bodyweight.test.ts)
  - [Extension profiles](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-r4/extension-profile.test.ts)
- [hl7.fhir.us.core](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/README.md)
  - [Patient, BP, conditions](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/profile-demo.ts)
  - [Multi-profile usage](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/multi-profile.test.ts)
- [hl7.fhir.us.ccda](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-ccda/README.md)
  - [C-CDA profiles](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-ccda/demo-ccda.test.ts)
  - [CDA logical models](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-ccda/demo-cda.test.ts)

## Current status and what's next

This is a **dev preview**. Our main focus right now is stabilization across different profile shapes and edge cases. We're using it ourselves for a FHIR-to-CCDA converter, which is a good stress test for the generator. After stabilization, the plan is to bring profile support to Python next.

We'd appreciate any feedback -- profiles that don't generate correctly, API patterns that feel awkward, validation gaps, or anything else. Issues and discussions welcome on [GitHub](https://github.com/atomic-ehr/codegen).

NPM: [`@atomic-ehr/codegen`](https://www.npmjs.com/package/@atomic-ehr/codegen)
