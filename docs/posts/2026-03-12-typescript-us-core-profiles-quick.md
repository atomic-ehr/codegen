# `@atomic-ehr/codegen` v0.0.9 — FHIR profile class generation

Hey @**everyone**!

We're excited to share **[`@atomic-ehr/codegen` v0.0.9](https://github.com/atomic-ehr/codegen/releases/tag/v0.0.9)** — this release adds **FHIR profile class generation** for TypeScript. We demonstrate it on the **[US Core IG](https://www.hl7.org/fhir/us/core/)** package.

Each profile class provides:

- **Slices** -- category and component slices with discriminator values applied automatically
- **Extensions** -- flat API for complex and simple extensions, multi-form setters (flat input, profile instance, raw Extension)
- **Field accessors** -- typed get/set for profiled fields with fluent chaining
- **Fixed values** -- `code`, `meta.profile` auto-set on `create()`
- **Choice types** -- `effective[x]`, `value[x]` with per-branch accessors
- **Factory methods** -- `from()` (validates), `apply()` (stamps), `create()` (builds from typed input)
- **Validation** -- `validate()` returns `{ errors, warnings }` — checks required fields, choice constraints, and must-support field population

---

Let's see some general use cases on the [US Core Patient](https://www.hl7.org/fhir/us/core/StructureDefinition-us-core-patient.html) profile.

## Reading data from a received resource

```typescript
import { USCorePatientProfile } from "./profiles/Patient_USCorePatientProfile";

// from() validates the resource conforms to the profile (meta.profile + required fields)
const patient = USCorePatientProfile.from(apiResponse);

patient.getName();              // [{ family: "Smith", given: ["John"] }]
patient.getRace();              // { ombCategory: { code: "2054-5", ... }, text: "Black or African American" }
patient.getSex("profile");      // profile instance: USCoreIndividualSexExtensionProfile
patient.getRace("extension");   // { url: ".../us-core-race", extension: [{ url: "ombCategory", ... }, ...] }
```

## Building a resource with a profile

```typescript
import type { Extension } from "./fhir-types/hl7-fhir-r4-core/Extension";
import { USCoreEthnicityExtensionProfile, USCorePatientProfile } from "./fhir-types/hl7-fhir-us-core/profiles";
import type { USCoreRaceExtensionProfileInput } from "./fhir-types/hl7-fhir-us-core/profiles/Extension_USCoreRaceExtension";

// apply() attaches meta.profile without validation -- useful for incremental construction
const patient = USCorePatientProfile.apply({ resourceType: "Patient" });

patient.setIdentifier([{ system: "http://hospital.example.org/mrn", value: "MRN-00001" }]);
patient.setName([{ family: "Chen", given: ["Wei"] }]);

// 1. Flat input -- the most common way
const race: USCoreRaceExtensionProfileInput = {
    ombCategory: { code: "2028-9", display: "Asian" },
    text: "Chinese",
};
patient.setRace(race);

// 2. Profile instance -- when you already have one from another source
const ethnicity: USCoreEthnicityExtensionProfile = USCoreEthnicityExtensionProfile.create({
    ombCategory: { code: "2135-2", display: "Hispanic or Latino" },
    text: "Hispanic or Latino",
});
patient.setEthnicity(ethnicity);

// 3. Raw FHIR Extension -- for pass-through from external sources
const sex: Extension = {
    url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex",
    valueCoding: { code: "female", display: "Female" },
};
patient.setSex(sex);

patient.validate(); // { errors: [], warnings: [...] }
patient.toResource();
// {
//     resourceType: "Patient",
//     meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
//     identifier: [{ system: "http://hospital.example.org/mrn", value: "MRN-00001" }],
//     name: [{ family: "Chen", given: ["Wei"] }],
//     extension: [
//         { url: ".../us-core-race", extension: [
//             { url: "ombCategory", valueCoding: { code: "2028-9", display: "Asian" } },
//             { url: "text", valueString: "Chinese" },
//         ]},
//         { url: ".../us-core-ethnicity", extension: [
//             { url: "ombCategory", valueCoding: { code: "2135-2", display: "Hispanic or Latino" } },
//             { url: "text", valueString: "Hispanic or Latino" },
//         ]},
//         { url: ".../us-core-individual-sex", valueCoding: { code: "female", display: "Female" } },
//     ],
// }
```

See the [generate script](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/generate.ts) and [example README](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/README.md) for setup.

Working examples:

- Patient: [base type](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-r4-core/Patient.ts), [profile class](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/Patient_USCorePatientProfile.ts), [tests](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/profile-patient.test.ts)
- Extensions ([base type](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-r4-core/Extension.ts)): [race](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/Extension_USCoreRaceExtension.ts), [ethnicity](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/Extension_USCoreEthnicityExtension.ts), [tribal affiliation](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/Extension_USCoreTribalAffiliationExtension.ts)
- Blood pressure: [base type](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-r4-core/Observation.ts), [profile class](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/Observation_USCoreBloodPressureProfile.ts), [tests](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/profile-bp.test.ts)
- Body weight: [base type](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-r4-core/Observation.ts), [profile class](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/fhir-types/hl7-fhir-us-core/profiles/Observation_USCoreBodyWeightProfile.ts), [tests](https://github.com/atomic-ehr/codegen/blob/main/examples/typescript-us-core/profile-bodyweight.test.ts)

Feedback welcome on [GitHub](https://github.com/atomic-ehr/codegen).

NPM: [`@atomic-ehr/codegen`](https://www.npmjs.com/package/@atomic-ehr/codegen) | [Release v0.0.9](https://github.com/atomic-ehr/codegen/releases/tag/v0.0.9)
