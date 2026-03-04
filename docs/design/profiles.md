# FHIR Profiles Representation

Status: Implemented (TypeScript). See `examples/typescript-r4/` for working examples.

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
1. Profile type via `ProfileClass.from(resource)`.

```typescript
// Parse as resource
const obs: Observation = JSON.parse(json)

// Wrap with profile
const bodyweight = observation_bodyweightProfile.from(obs)
bodyweight.getVscat() // access slice
bodyweight.toResource() // back to Observation (same object)
```

### Mutable/Immutable Representation

The profile class holds a mutable reference to the underlying resource. Mutations through the profile are visible on the resource and vice versa:

```typescript
const obs: Observation = { resourceType: "Observation", status: "preliminary", ... }
const profile = observation_bodyweightProfile.from(obs)
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

2. **Profile class** — wraps the resource with typed getters/setters and slice accessors:

```typescript
export class observation_bodyweightProfile {
    private resource: Observation

    constructor(resource: Observation) { ... }
    static from(resource: Observation): observation_bodyweightProfile { ... }
    static createResource(args: observation_bodyweightProfileParams): Observation { ... }
    static create(args: observation_bodyweightProfileParams): observation_bodyweightProfile { ... }

    // Typed getters/setters for constrained fields
    getStatus(): (...) | undefined { ... }
    setStatus(value: ...): this { ... }

    // Slice accessors (see slices.md)
    setVscat(input?: Observation_bodyweight_Category_VSCatSliceInput): this { ... }
    getVscat(): Observation_bodyweight_Category_VSCatSliceInput | undefined { ... }
    getVscatRaw(): CodeableConcept | undefined { ... }

    // Conversion
    toResource(): Observation { ... }
    toProfile(): observation_bodyweight { ... }
}
```

3. **Params type** — lists required fields for the `createResource`/`create` factory methods:

```typescript
export type observation_bodyweightProfileParams = {
    status: (...);
    category: CodeableConcept<(...)>[];
    code: CodeableConcept<(...)>;
    subject: Reference<"Patient">;
}
```

### Extension Profiles

Extension profiles constrain the `Extension` type. They come in two forms:

#### Simple extensions (single value)

A simple extension carries one `value[x]` field (e.g., `patient-birthPlace` carries `valueAddress`):

```typescript
export type birthPlaceProfileParams = {
    valueAddress: Address;
}

export class birthPlaceProfile {
    private resource: Extension

    static createResource(args: birthPlaceProfileParams): Extension {
        return {
            url: "http://hl7.org/fhir/StructureDefinition/patient-birthPlace",
            valueAddress: args.valueAddress,
        } as unknown as Extension
    }

    static create(args: birthPlaceProfileParams): birthPlaceProfile { ... }
    static from(resource: Extension): birthPlaceProfile { ... }

    getValueAddress(): Address | undefined { ... }
    setValueAddress(value: Address): this { ... }

    toResource(): Extension { ... }
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
export class nationalityProfile {
    private resource: Extension

    static createResource(): Extension {
        return {
            url: "http://hl7.org/fhir/StructureDefinition/patient-nationality",
        } as unknown as Extension
    }

    // Sub-extension accessors
    setCode(value: CodeableConcept): this { ... }
    setPeriod(value: Period): this { ... }
    getCode(): CodeableConcept | undefined { ... }
    getCodeExtension(): Extension | undefined { ... }  // raw access
    getPeriod(): Period | undefined { ... }
    getPeriodExtension(): Extension | undefined { ... }

    toResource(): Extension { ... }
}
```

Usage:

```typescript
const profile = nationalityProfile.create()
    .setCode({ coding: [{ system: "urn:iso:std:iso:3166", code: "US" }] })
    .setPeriod({ start: "2000-01-01" })
const ext: Extension = profile.toResource()
```

## TypeSchema Representation

Profiles use `kind = "constraint"` in TypeSchema.

Current approach: to collect all profile elements we traverse the inheritance tree and collect the first-found description for each field (snapshot-like). This supports the `link` approach where each profile class has a complete view of its constrained fields.

## Runtime Helpers

Profile classes depend on a generated `profile-helpers.ts` module that provides:

- `applySliceMatch(input, match)` — merges discriminator values into a slice element
- `matchesSlice(value, match)` — checks if an element matches a slice discriminator
- `extractSliceSimplified(slice, matchKeys)` — strips discriminator keys from a slice for the simplified input type
- `mergeMatch(target, match)` — deep-merges match values into target
- `extractComplexExtension(extension, config)` — extracts typed values from nested extension elements
- `validateRequired(r, field, path)` — checks that a required field is present
- `validateExcluded(r, field, path)` — checks that a forbidden field is absent
- `validateFixedValue(r, field, expected, path)` — checks that a field matches a fixed/pattern value
- `validateSliceCardinality(items, match, sliceName, min, max, path)` — checks min/max counts for a named slice
- `validateEnum(value, allowed, field, path)` — checks that a value is within a required value set (supports primitives, Coding, CodeableConcept)
- `validateReference(value, allowed, field, path)` — checks that a reference targets an allowed resource type

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

Profile classes generate a `validate(): string[]` method that checks the wrapped resource against the profile's constraints. An empty array means the resource conforms; each string describes one violation.

Checks performed:
- **Required fields** — fields that the profile marks as mandatory (min >= 1)
- **Excluded fields** — fields that the profile forbids (max = 0)
- **Fixed/pattern values** — fields constrained to specific values (e.g., `code.coding` must contain a specific LOINC code)
- **Slice cardinality** — minimum and maximum counts for named slices
- **Closed enum bindings** — values restricted to a required value set
- **Reference types** — reference targets restricted to specific resource types
- **Choice type requirements** — at least one variant must be present when the choice group is required

```typescript
const bp = observation_bpProfile.create({
    status: "final",
    category: [],
    subject: { reference: "Patient/pt-1" },
});

const errors = bp.validate();
// [
//     "observation-bp.category: slice 'VSCat' requires at least 1 item(s), found 0",
//     "effective: at least one of effectiveDateTime, effectivePeriod is required",
//     "observation-bp.component: slice 'SystolicBP' requires at least 1 item(s), found 0",
//     "observation-bp.component: slice 'DiastolicBP' requires at least 1 item(s), found 0",
// ]
```

Validation helpers are emitted into `profile-helpers.ts` alongside the existing slice helpers.

## Future Work

- **Profile inheritance**: currently each profile class is independent. A future enhancement could allow `bodyweightProfile` to compose or extend `vitalsignsProfile`.
- **Choice type narrowing**: profiles that remove choice type variants (e.g., vitalsigns removes `effectiveTiming` and `effectiveInstant`) are represented in the interface but not enforced by the profile class.
