# FHIR Profiles in TypeScript: Deep Dive

*~7 min read*

FHIR profiles are one of the trickiest parts of the specification to work with in code. A profile constrains a base resource -- making fields required, restricting value sets, defining slices on arrays, or attaching extensions -- but the wire format is still just a plain JSON resource. This gap between "what the profile expects" and "what the JSON looks like" is where bugs hide.

Atomic EHR Codegen bridges this gap by generating TypeScript profile classes that give you a typed, fluent API while keeping the underlying data as standard FHIR JSON.

## The Problem

Consider the FHIR bodyweight profile. It constrains `Observation` by:

- Requiring `category`, `code`, and `subject`
- Defining a `VSCat` slice on `category[]` that must contain a coding with `code: "vital-signs"` and `system: "http://terminology.hl7.org/CodeSystem/observation-category"`
- Restricting `subject` to `Reference<Patient>` only

Without profile support, you'd write something like:

```typescript
const obs: Observation = {
    resourceType: "Observation",
    status: "final",
    code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
    subject: { reference: "Patient/pt-1" },
    category: [
        {
            coding: [{
                code: "vital-signs",
                system: "http://terminology.hl7.org/CodeSystem/observation-category",
            }],
            text: "Vital Signs",
        },
    ],
    valueQuantity: { value: 75.5, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" },
};
```

You have to know the exact system URL for the category coding, remember that `subject` should only reference a Patient, and there's nothing stopping you from forgetting the category entirely. The TypeScript compiler can't help -- everything is optional on the base `Observation` type.

## What Gets Generated

When you enable `generateProfile: true` and include a profile in your tree-shake config, the generator produces three things for each resource profile:

### 1. A Narrowed Interface

```typescript
export interface observation_bodyweight extends Observation {
    category: CodeableConcept<("social-history" | "vital-signs" | ... | string)>[];
    subject: Reference<"Patient">;
}
```

This interface tightens the base type: `category` and `subject` are now required, and `subject` is narrowed from `Reference<"Device" | "Group" | "Location" | "Patient">` down to just `Reference<"Patient">`. You can use this interface for type annotations when you know you're working with bodyweight observations.

### 2. A Params Type

```typescript
export type observation_bodyweightProfileParams = {
    status: ("registered" | "preliminary" | "final" | ...);
    code: CodeableConcept<(...)>;
    subject: Reference<"Patient">;
    category?: CodeableConcept<(...)>[];  // optional -- required slice stubs auto-merged
}
```

This captures the fields for creating a new bodyweight observation. Required fields are mandatory; array fields with required slices (like `category`) are optional -- if omitted or missing required slice stubs, the factory auto-merges them.

### 3. A Profile Class

```typescript
export class observation_bodyweightProfile {
    constructor(resource: Observation) { ... }

    // Factory methods
    static from(resource: Observation): observation_bodyweightProfile;
    static create(args: observation_bodyweightProfileParams): observation_bodyweightProfile;
    static createResource(args: observation_bodyweightProfileParams): Observation;

    // Typed getters/setters
    getStatus(): (...) | undefined;
    setStatus(value: ...): this;
    getCode(): CodeableConcept<(...)> | undefined;
    setCode(value: CodeableConcept<(...)>): this;
    getSubject(): Reference<"Patient"> | undefined;
    setSubject(value: Reference<"Patient">): this;

    // Slice accessors
    setVSCat(input?: Observation_bodyweight_Category_VSCatSliceInput): this;
    getVSCat(): Observation_bodyweight_Category_VSCatSliceInput | undefined;
    getVSCatRaw(): CodeableConcept | undefined;

    // Conversion
    toResource(): Observation;
    toProfile(): observation_bodyweight;
}
```

The class wraps a mutable `Observation` reference. All mutations go through to the underlying resource -- there's no copy, no separate data structure. This is the adaptor pattern: the profile is a lens over the resource, not a replacement for it.

## Working with Resource Profiles

### Creating from Scratch

```typescript
import { observation_bodyweightProfile } from "./profiles/Observation_observation_bodyweight";

const profile = observation_bodyweightProfile.create({
    status: "final",
    code: { coding: [{ code: "29463-7", system: "http://loinc.org" }] },
    subject: { reference: "Patient/pt-1" },
});

profile.setVSCat({ text: "Vital Signs" });

const obs = profile.toResource();
```

`create()` builds both the resource and the wrapper in one call. Array fields with required slices (like `category`) are optional params -- required slice stubs are auto-merged when missing. `createResource()` does the same but returns the plain `Observation` without wrapping it.

### Wrapping an Existing Resource

```typescript
const obs: Observation = await fhirClient.read("Observation", "bodyweight-123");
const profile = observation_bodyweightProfile.from(obs);

const vscat = profile.getVSCat();
console.log(vscat?.text); // "Vital Signs"
```

`from()` wraps an existing resource. The profile class doesn't validate that the resource actually conforms to the profile -- it's a convenience API, not a validator. If the resource doesn't have a VSCat slice, `getVSCat()` returns `undefined`.

### Mutability

The profile holds a reference to the resource, not a copy. Mutations are visible from both sides:

```typescript
const obs: Observation = { resourceType: "Observation", status: "preliminary", ... };
const profile = observation_bodyweightProfile.from(obs);

profile.setStatus("final");
console.log(obs.status); // "final" -- same object
```

## How Slicing Works

Slicing is where profiles get interesting. A slice defines a named "view" into an array field, identified by discriminator values. The bodyweight profile's `VSCat` slice says: "in the `category` array, there should be an element where `coding` contains `code: "vital-signs"` with `system: "http://terminology.hl7.org/CodeSystem/observation-category"`".

The generator produces three methods for each slice:

### `setVSCat(input?)`

Finds an existing element matching the discriminator, or appends a new one. The discriminator values are merged into your input automatically. The parameter is optional -- when called with no arguments, an element containing only the discriminator values is inserted:

```typescript
// You provide only the non-discriminator fields:
profile.setVSCat({ text: "Vital Signs" });

// The generated code merges in the discriminator:
// {
//     text: "Vital Signs",
//     coding: [{
//         code: "vital-signs",
//         system: "http://terminology.hl7.org/CodeSystem/observation-category"
//     }]
// }
```

The input type uses `Omit<CodeableConcept, "coding">` -- the discriminator field `coding` is stripped from the input because it's applied automatically.

### `getVSCat()`

Finds the matching element and returns a simplified view with discriminator fields stripped:

```typescript
const vscat = profile.getVSCat();
// Returns: { text: "Vital Signs" }
// The coding discriminator is stripped from the result
```

### `getVSCatRaw()`

Returns the full element as-is, including discriminator fields:

```typescript
const raw = profile.getVSCatRaw();
// Returns: { text: "Vital Signs", coding: [{ code: "vital-signs", system: "..." }] }
```

This three-method pattern (set, get simplified, get raw) gives you the right level of abstraction for each use case.

## Extension Profiles

Extensions in FHIR come in two flavors, and the generator handles both.

### Simple Extensions

A simple extension carries a single `value[x]` field. The `patient-birthPlace` extension carries a `valueAddress`:

```typescript
import { birthPlaceProfile } from "./profiles/Extension_birthPlace";

// Create -- the canonical URL is embedded automatically
const ext = birthPlaceProfile.createResource({
    valueAddress: { city: "Boston", country: "US" },
});
// ext.url === "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"

// Use it on a Patient
const patient: Patient = {
    resourceType: "Patient",
    extension: [ext],
};

// Read it back
const profile = birthPlaceProfile.from(ext);
console.log(profile.getValueAddress()?.city); // "Boston"
```

### Complex Extensions

A complex extension has nested sub-extensions instead of a single value. The `patient-nationality` extension has `code` and `period` sub-extensions:

```typescript
import { nationalityProfile } from "./profiles/Extension_nationality";

const profile = nationalityProfile.create()
    .setCode({ coding: [{ system: "urn:iso:std:iso:3166", code: "US" }] })
    .setPeriod({ start: "2000-01-01" });

const ext = profile.toResource();
// ext.url === "http://hl7.org/fhir/StructureDefinition/patient-nationality"
// ext.extension === [
//     { url: "code", valueCodeableConcept: { coding: [...] } },
//     { url: "period", valuePeriod: { start: "2000-01-01" } }
// ]

// Read values back
console.log(profile.getCode()?.coding?.[0]?.code); // "US"
console.log(profile.getPeriod()?.start); // "2000-01-01"

// Access the raw sub-extension when needed
const codeExt = profile.getCodeExtension();
console.log(codeExt?.url); // "code"
```

The generator figures out the value field name for each sub-extension (`valueCodeableConcept`, `valuePeriod`, etc.) from the StructureDefinition and generates type-safe accessors.

## Extensions on Primitive Fields

TypeScript generation also supports the `_field` pattern for attaching extensions to primitive fields. When a FHIR resource has a primitive field like `birthDate`, the generated type includes a corresponding `_birthDate` field where extensions can be placed:

```typescript
import { birthTimeProfile } from "./profiles/Extension_birthTime";

const patient: Patient = {
    resourceType: "Patient",
    birthDate: "1770-12-17",
    _birthDate: {
        extension: [
            birthTimeProfile.createResource({
                valueDateTime: "1770-12-17T12:00:00+01:00",
            }),
        ],
    },
};
```

Extension profile classes work naturally with the `_field` pattern -- you use `createResource()` to build the extension, then place it in the `_field.extension` array.

## Generation Config

To generate profiles, include them in your tree-shake config by canonical URL alongside the base resources:

```typescript
new APIBuilder()
    .fromPackage("hl7.fhir.r4.core", "4.0.1")
    .typescript({ generateProfile: true })
    .typeSchema({
        treeShake: {
            "hl7.fhir.r4.core": {
                // Base resources
                "http://hl7.org/fhir/StructureDefinition/Patient": {},
                "http://hl7.org/fhir/StructureDefinition/Observation": {},
                // Resource profiles
                "http://hl7.org/fhir/StructureDefinition/bodyweight": {},
                // Extension profiles
                "http://hl7.org/fhir/StructureDefinition/patient-birthPlace": {},
                "http://hl7.org/fhir/StructureDefinition/patient-nationality": {},
            }
        }
    })
    .outputTo("./fhir-types")
    .generate();
```

The generator resolves dependencies automatically. If you include `bodyweight`, it knows to include `Observation`, `DomainResource`, and any types referenced by the profile's fields. Extension definitions used by profiles (e.g., `us-core-race`, `us-core-ethnicity`) are also auto-collected — you don't need to list them manually. To exclude specific extensions, use `ignoreExtensions`:

```typescript
"http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient": {
    ignoreExtensions: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity"]
}
```

Generated files land in a `profiles/` subdirectory alongside the base types:

```
fhir-types/
    hl7-fhir-r4-core/
        Observation.ts
        Patient.ts
        ...
        profiles/
            Observation_observation_bodyweight.ts
            Extension_birthPlace.ts
            Extension_nationality.ts
            index.ts
    profile-helpers.ts
```

The `profile-helpers.ts` file contains runtime utilities for slice matching and extension extraction, shared across all profile classes.

## Design Decisions

A few choices worth understanding:

**Adaptor, not subclass.** Profile classes wrap the resource rather than extending it. This means you always work with plain `Observation` objects for serialization, and the profile is just a typed view. This follows the same pattern as HAPI FHIR.

**Validation is opt-in.** `from()` wraps any `Observation` without checking conformance -- this keeps wrapping cheap. Call `validate()` explicitly when you need to check constraints (see below).

**Mutable reference.** The profile operates directly on the resource you give it. There's no cloning. This keeps memory usage low and avoids confusion about which copy is "real".

**Independent profile classes.** Even when profiles form an inheritance chain (bodyweight -> vitalsigns -> Observation), each profile class wraps `Observation` directly. There's no class inheritance between `observation_bodyweightProfile` and `observation_vitalsignsProfile`.

## Runtime Validation

Profile classes generate a `validate()` method that checks the wrapped resource against profile constraints. It returns `{ errors, warnings }` -- errors are hard constraint violations, warnings are soft checks like extensible binding mismatches and unpopulated must-support fields:

```typescript
const bp = observation_bpProfile.create({
    status: "final",
    subject: { reference: "Patient/pt-1" },
});

const { errors, warnings } = bp.validate();
// errors: ["effective: at least one of effectiveDateTime, effectivePeriod is required"]
// warnings: ["observation_bp: must-support field 'dataAbsentReason' is not populated"]
// Required slices (VSCat, SystolicBP, DiastolicBP) are auto-populated by create()
```

Fill in the required slices and choice fields, and validation passes:

```typescript
bp.setVSCat({ text: "Vital Signs" })
    .setEffectiveDateTime("2024-06-15")
    .setSystolicBP({ value: 120, unit: "mmHg" })
    .setDiastolicBP({ value: 80, unit: "mmHg" });

bp.validate(); // { errors: [], warnings: [...] }
```

The method checks required fields, excluded fields, fixed/pattern values, slice cardinality, closed enum bindings, reference types, choice type requirements, and must-support field population (as warnings).

## What's Next

Profile support is currently TypeScript-only. The design patterns (adaptor, slice lens, extension accessors, validation) are language-independent and could be applied to Python and C# generators in the future. See the [design docs](../design/profiles.md) for the architectural decisions behind this implementation.
