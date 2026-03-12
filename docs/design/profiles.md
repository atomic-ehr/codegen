# FHIR Profiles Representation

Status: Implemented (TypeScript). See `examples/typescript-r4/` and `examples/typescript-us-core/` for working examples.

This document covers the representation of FHIR profiles in generated code: resource profiles, extension profiles, and their relationship to base resources.

## Profile Example

Let's see an example of a profile for `bodyweight` from R4. That profile is defined by the following StructureDefinitions:

1. Constraint: <http://hl7.org/fhir/StructureDefinition/bodyweight>
2. Constraint: <http://hl7.org/fhir/StructureDefinition/vitalsigns>
3. Specialization: <http://hl7.org/fhir/StructureDefinition/Observation>
4. Specialization: <http://hl7.org/fhir/StructureDefinition/DomainResource>
5. Specialization: <http://hl7.org/fhir/StructureDefinition/Resource>

[^universal]: Here, **universal** means that the data structure of the last specialization (`Observation`) should be able to represent all "Profiled" resources.

Constraints define:
- Additional constraints, e.g., `bodyweight` requires that coding should contain `BodyWeightCode`
- Named *virtual* fields defined by slices to access array elements, e.g., in `Observation` we have an array of `Categories`, in `vitalsigns` we have a `VSCat` slice which should contain a fixed value [^slice-as-interface].

[^slice-as-interface]: For a better example, see the us-core-package and `USCoreBloodPressure` profile, which defines `systolic` and `diastolic` fields.

Example of the resource:

```jsonc
{
  "meta": {
    "profile": [
      // implicitly: "http://hl7.org/fhir/StructureDefinition/vitalsigns",
      "http://hl7.org/fhir/StructureDefinition/bodyweight"
    ]
  },
  "resourceType": "Observation",
  "id": "example-genetics-1",
  "effectiveDateTime": "2020-10-10",
  "status": "final",
  "category": [
    {"coding": [{"code": "vital-signs", "system": "http://terminology.hl7.org/CodeSystem/observation-category"}]}
  ],
  "code": {"coding": [{"code": "29463-7", "system": "http://loinc.org"}]},
  "valueCodeableConcept": {"coding": [{"code": "10828004", "system": "http://snomed.info/sct"}]},
  "subject": {"reference": "Patient/pt-1"}
}
```

## SDK Design Questions

### Interaction between the resource and profiles

Problem: resource (`Observation`) and profile (`bodyweight`) can be related to each other by:

1. `subclass`: profile is a subclass of resource.
    - **Advantage**:
        - full access to the resource and profile interface at same time
        - polymorphism between profiles and resource.
    - **Disadvantage**:
        - inconsistencies between resource and profile can be resolved only at runtime (e.g. forbidden fields)
        - switching between multiple profiles.
2. `link`: profile is linked to resource where profile is an adaptor to resource.
    - **Advantage**:
        - fully independent interfaces and separation of concern,
    - **Disadvantage**:
        - lack of polymorphism between profiles and resources,
            - don't need to partly implement resource API in profile type (use only mentioned in profile things)
        - data inconsistencies (edit profile then resource and break profile).

**Decision: `link` (adaptor pattern).** The profile class wraps a mutable reference to the base resource. This follows the same approach as HAPI FHIR. The profile class provides typed getters/setters and slice accessors, while the underlying data remains a plain resource object.

### Interactions between inheritance profiles

Problem: if we have several levels of profiles on top of the resource how they should be related (e.g. `bodyweight`, `vitalsigns`)?

- the same arguments as for *Interaction between the resource and profiles* are applicable.
- plus polymorphism between profiles.

**Current state:** each profile in the inheritance chain generates an independent profile class. `observation_bodyweightProfile` and `observation_vitalsignsProfile` are both generated, each wrapping `Observation` directly. There is no inheritance between the two profile classes.

### JSON -> object conversion and Profile

Arbitrary JSON can be converted to:

1. Resource type, independently from the profiles.
1. Profile type via `ProfileClass.from(resource)` or `ProfileClass.apply(resource)`.

```typescript
// Parse as resource
const obs: Observation = JSON.parse(json)

// from() validates meta.profile and runs validate(), throws on errors
const bodyweight = observation_bodyweightProfile.from(obs)

// apply() stamps meta.profile without validation, for incremental construction
const bodyweight = observation_bodyweightProfile.apply(obs)

bodyweight.getVSCat()      // access slice (flat by default)
bodyweight.getVSCat("raw") // access raw FHIR element
bodyweight.toResource()    // back to Observation (same object)
```

### Mutable/Immutable Representation

The profile class holds a mutable reference to the underlying resource. Mutations through the profile are visible on the resource and vice versa:

```typescript
const obs: Observation = { resourceType: "Observation", status: "preliminary", ... }
const profile = observation_bodyweightProfile.apply(obs)
profile.setStatus("final")
obs.status // "final" — same object
```

## Profile Types

### Resource Profiles

Resource profiles constrain a base resource (e.g., `bodyweight` constrains `Observation`). The generator produces:

1. **Narrowed interface** — `extends` the base resource, tightens optional fields to required, narrows bindings:

```typescript
export interface observation_bodyweight extends Observation {
    category: CodeableConcept<(... | string)>[];  // required (was optional)
    subject: Reference<"Patient">;                 // required, narrowed to Patient
}
```

2. **Profile class** — wraps the resource with factory methods, typed getters/setters, slice accessors, extension accessors, and validation:

```typescript
export class observation_bodyweightProfile {
    static readonly canonicalUrl = "http://hl7.org/fhir/StructureDefinition/bodyweight"
    private resource: Observation

    constructor(resource: Observation) { ... }

    // Factory methods
    static from(resource: Observation): observation_bodyweightProfile { ... }     // validates, throws on error
    static apply(resource: Observation): observation_bodyweightProfile { ... }    // stamps meta.profile, no validation
    static createResource(args: observation_bodyweightProfileRaw): Observation { ... }
    static create(args: observation_bodyweightProfileRaw): observation_bodyweightProfile { ... }

    // Typed getters/setters for constrained fields
    getStatus(): (...) | undefined { ... }
    setStatus(value: ...): this { ... }

    // Slice accessors with mode overloads (see slices.md)
    setVSCat(input?: VSCatSliceFlat | CodeableConcept): this { ... }
    getVSCat(): VSCatSliceFlat | undefined { ... }          // flat (default)
    getVSCat(mode: 'flat'): VSCatSliceFlat | undefined { ... }
    getVSCat(mode: 'raw'): CodeableConcept | undefined { ... }

    // Conversion
    toResource(): Observation { ... }

    // Validation
    validate(): { errors: string[]; warnings: string[] } { ... }
}
```

3. **Params type** — lists fields for the `createResource`/`create` factory methods. Array fields with required slices are optional -- stubs are auto-merged:

```typescript
export type observation_bodyweightProfileRaw = {
    status: (...);
    subject: Reference<"Patient">;
    category?: CodeableConcept<(...)>[];  // optional -- required slice stubs auto-merged
}
```

### Extension Profiles

Extension profiles constrain the `Extension` type. They come in two forms:

#### Simple extensions (single value)

A simple extension carries one `value[x]` field (e.g., `patient-birthPlace` carries `valueAddress`):

```typescript
export type birthPlaceProfileRaw = {
    valueAddress: Address;
}

export class birthPlaceProfile {
    static readonly canonicalUrl = "http://hl7.org/fhir/StructureDefinition/patient-birthPlace"
    private resource: Extension

    static from(resource: Extension): birthPlaceProfile { ... }   // validates
    static apply(resource: Extension): birthPlaceProfile { ... }  // no validation
    static createResource(args: birthPlaceProfileRaw): Extension { ... }
    static create(args: birthPlaceProfileRaw): birthPlaceProfile { ... }

    getValueAddress(): Address | undefined { ... }
    setValueAddress(value: Address): this { ... }

    toResource(): Extension { ... }
    validate(): { errors: string[]; warnings: string[] } { ... }
}
```

Usage:

```typescript
const patient: Patient = {
    resourceType: "Patient",
    extension: [
        birthPlaceProfile.createResource({ valueAddress: { city: "Boston", country: "US" } }),
    ],
}
```

#### Complex extensions (sub-extensions)

A complex extension has nested extension elements instead of a single value (e.g., `patient-nationality` has `code` and `period` sub-extensions):

```typescript
// Raw input — pass extension[] directly
export type nationalityProfileRaw = { extension?: Extension[] }

// Flat input — typed sub-extension fields
export type nationalityProfileFlat = { code?: CodeableConcept; period?: Period }

export class nationalityProfile {
    static readonly canonicalUrl = "http://hl7.org/fhir/StructureDefinition/patient-nationality"
    private resource: Extension

    static from(resource: Extension): nationalityProfile { ... }
    static apply(resource: Extension): nationalityProfile { ... }

    // create/createResource accept both raw and flat input
    static createResource(args?: nationalityProfileRaw | nationalityProfileFlat): Extension { ... }
    static create(args?: nationalityProfileRaw | nationalityProfileFlat): nationalityProfile { ... }

    // Sub-extension accessors with mode overloads
    setCode(value: CodeableConcept): this { ... }
    getCode(): CodeableConcept | undefined { ... }          // flat (default)
    getCode(mode: 'flat'): CodeableConcept | undefined { ... }
    getCode(mode: 'raw'): Extension | undefined { ... }     // raw sub-extension

    setPeriod(value: Period): this { ... }
    getPeriod(): Period | undefined { ... }
    getPeriod(mode: 'raw'): Extension | undefined { ... }

    toResource(): Extension { ... }
    validate(): { errors: string[]; warnings: string[] } { ... }
}
```

Usage:

```typescript
// Flat input
const profile = nationalityProfile.create({
    code: { coding: [{ system: "urn:iso:std:iso:3166", code: "US" }] },
    period: { start: "2000-01-01" },
})

// Read values back
profile.getCode()        // { coding: [...] }
profile.getCode("raw")   // { url: "code", valueCodeableConcept: { coding: [...] } }

const ext: Extension = profile.toResource()
```

### Extension Accessors on Resource Profiles

Resource profiles that declare extensions (e.g., US Core Patient with `us-core-race`) generate multi-form setters and overloaded getters:

```typescript
// Setter accepts flat input, profile instance, or raw Extension
patient.setRace({ ombCategory: { code: "2028-9" }, text: "Asian" })      // flat input
patient.setRace(USCoreRaceExtensionProfile.create({ ... }))               // profile instance
patient.setRace({ url: "http://.../us-core-race", extension: [...] })     // raw Extension

// Getter with mode overloads
patient.getRace()            // flat: { ombCategory: ..., text: "Asian" }
patient.getRace("profile")   // USCoreRaceExtensionProfile instance
patient.getRace("raw")       // raw FHIR Extension
```

## TypeSchema Representation

Profiles use `kind = "constraint"` in TypeSchema.

Current approach: to collect all profile elements we traverse the inheritance tree and collect the first-found description for each field (snapshot-like). This supports the `link` approach where each profile class has a complete view of its constrained fields.

## Runtime Helpers

Profile classes depend on a generated `profile-helpers.ts` module that provides:

Slice helpers:
- `applySliceMatch(input, match)` — merges discriminator values into a slice element
- `matchesValue(value, match)` — recursive structural match test
- `setArraySlice(list, match, value)` — find-or-insert in array by discriminator
- `getArraySlice(list, match)` — find first matching element
- `ensureSliceDefaults(items, ...matches)` — ensure required slices have stubs
- `stripMatchKeys(slice, matchKeys)` — remove discriminator keys from getter result
- `wrapSliceChoice(input, choiceVariant)` — wrap flat input fields under a single choice variant key (for setter)
- `unwrapSliceChoice(slice, matchKeys, choiceVariant)` — inverse of wrap

Extension helpers:
- `ensurePath(root, path)` — navigate/create nested paths for deep extensions
- `extractComplexExtension(extension, config)` — extracts typed values from nested extension elements
- `isExtension(input, url?)` — type guard for raw Extension detection
- `isRawExtensionInput(input)` — discriminate raw vs flat input for extension profile factories
- `getExtensionValue(ext, field)` — read a typed value field from Extension
- `pushExtension(target, ext)` — push extension onto target.extension array

Factory helpers:
- `buildResource(obj)` — cast object to resource type
- `ensureProfile(resource, canonicalUrl)` — add profile URL to meta.profile
- `mergeMatch(target, match)` — deep-merges match values into target

Validation helpers:
- `validateRequired(res, profileName, field)` — checks that a required field is present
- `validateMustSupport(res, profileName, field)` — checks that a must-support field is populated (warning, not error)
- `validateExcluded(res, profileName, field)` — checks that a forbidden field is absent
- `validateFixedValue(res, profileName, field, expected)` — checks that a field matches a fixed/pattern value
- `validateSliceCardinality(res, profileName, field, match, sliceName, min, max)` — checks min/max counts for a named slice
- `validateChoiceRequired(res, profileName, choices)` — checks that at least one choice variant is present
- `validateEnum(res, profileName, field, allowed)` — checks that a value is within a value set (supports primitives, Coding, CodeableConcept)
- `validateReference(res, profileName, field, allowed)` — checks that a reference targets an allowed resource type

## Configuration

Profiles are enabled in the TypeScript generator via:

```typescript
new APIBuilder()
    .typescript({ generateProfile: true })
    .typeSchema({
        treeShake: {
            "hl7.fhir.r4.core": {
                // Profiles specified by canonical URL
                "http://hl7.org/fhir/StructureDefinition/bodyweight": {},
                "http://hl7.org/fhir/StructureDefinition/patient-birthPlace": {},
            }
        }
    })
```

## Runtime Validation

Profile classes generate a `validate(): { errors: string[]; warnings: string[] }` method that checks the wrapped resource against the profile's constraints. Empty arrays mean the resource conforms; each string describes one violation.

Errors (hard constraint violations):
- **Required fields** — fields that the profile marks as mandatory (min >= 1)
- **Excluded fields** — fields that the profile forbids (max = 0)
- **Fixed/pattern values** — fields constrained to specific values (e.g., `code.coding` must contain a specific LOINC code)
- **Slice cardinality** — minimum and maximum counts for named slices
- **Closed enum bindings** — values restricted to a required value set
- **Reference types** — reference targets restricted to specific resource types
- **Choice type requirements** — at least one variant must be present when the choice group is required

Warnings (soft checks):
- **Extensible binding mismatches** — values outside an extensible value set
- **Must-support fields** — fields marked `mustSupport: true` in the profile that are not populated (only for non-required fields; required fields already produce errors)

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

`from()` uses `validate()` internally — it throws on errors but allows warnings:

```typescript
const profile = observation_bodyweightProfile.from(obs)
// throws if meta.profile is missing or validate().errors is non-empty
// warnings are not thrown — retrieve them via profile.validate().warnings
```

Validation helpers are emitted into `profile-helpers.ts` alongside the existing slice helpers.

## Future Work

- **Profile inheritance**: currently each profile class is independent. A future enhancement could allow `bodyweightProfile` to compose or extend `vitalsignsProfile`.
