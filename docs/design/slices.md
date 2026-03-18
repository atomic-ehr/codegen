# FHIR Slices Representation

Status: Implemented (TypeScript, Lens level). See `examples/typescript-r4/` for working examples.

Working issue: [#24](https://github.com/atomic-ehr/codegen/issues/24)

## Slicing

Slicing is an approach to work with arrays in FHIR. It allows defining a `view` on the array and constraints on them. Let's examine the `us-core-blood-pressure` example:

- Built on top of the generic `Observation` resource which contains a `component` array field. This field contains multiple `Observation.component` elements.
- `us-core-blood-pressure` defines the specific `Observation` type for blood pressure measurements which includes a set of slices on the `Observation.component` field:
  - `systolic` slice for systolic blood pressure
  - `diastolic` slice for diastolic blood pressure

## Levels of Slice Support

1. **No support**. We don't provide any slice-specific behavior in SDK, so users should work with `Observation.component` manually. Validation is external.
2. **Lens** (implemented). We provide getter/setter methods in profile classes to find/insert elements in arrays by discriminator matching.
3. **Refine** (not implemented). We provide dedicated types for slice elements.

## Lens (Current Implementation)

The Lens approach generates getter/setter methods on the profile class. Each slice method knows its discriminator values and uses them to find or insert the correct element in the array.

### How it works

For the bodyweight profile's `VSCat` slice on `category[]`:

```typescript
export type Observation_bodyweight_Category_VSCatSliceInput = Omit<CodeableConcept, "coding">;

export class observation_bodyweightProfile {
    // ...

    // Setter: finds existing slice by discriminator or appends
    setVSCat(input?: Observation_bodyweight_Category_VSCatSliceInput): this {
        const match = {
            "coding": {
                "code": "vital-signs",
                "system": "http://terminology.hl7.org/CodeSystem/observation-category"
            }
        } as Record<string, unknown>
        const value = applySliceMatch((input ?? {}) as Record<string, unknown>, match)
        const list = (this.resource.category ??= [])
        const index = list.findIndex((item) => matchesSlice(item, match))
        if (index === -1) {
            list.push(value)
        } else {
            list[index] = value
        }
        return this
    }

    // Getter: returns simplified view (discriminator fields stripped)
    getVSCat(): Observation_bodyweight_Category_VSCatSliceInput | undefined {
        const match = { ... }
        const item = list.find((item) => matchesSlice(item, match))
        return extractSliceSimplified(item, ["coding"])
    }

    // Raw getter: returns the full element including discriminator fields
    getVSCatRaw(): CodeableConcept | undefined { ... }
}
```

### Slice input types

The input type for a slice setter uses `Omit<>` to remove discriminator fields. This way the user provides only the non-fixed parts and the discriminator values are applied automatically:

```typescript
// User provides text, coding is applied automatically
profile.setVSCat({ text: "Vital Signs" })

// Discriminator values are merged in:
// { text: "Vital Signs", coding: [{ code: "vital-signs", system: "..." }] }
```

### Three accessor methods per slice

Each slice generates three methods:

| Method | Returns | Description |
|---|---|---|
| `setXxx(input)` | `this` | Find-or-insert element by discriminator match. Merges discriminator values into input. |
| `getXxx()` | simplified type or `undefined` | Find element by discriminator match. Returns view with discriminator fields stripped. |
| `getXxxRaw()` | full type or `undefined` | Find element by discriminator match. Returns the full element as-is. |

### Runtime helpers

Slice operations depend on `profile-helpers.ts`:

- `matchesSlice(value, match)` — deep-compares an element against discriminator values. Supports nested objects and arrays (e.g., matching a coding within a CodeableConcept).
- `applySliceMatch(input, match)` — deep-merges discriminator values into user input to produce the complete element.
- `extractSliceSimplified(slice, matchKeys)` — strips top-level discriminator keys from a slice element to produce the simplified view.

### Advantages

- Non-invasive: the underlying array remains a standard FHIR array
- Users don't need to know discriminator values
- Find-or-insert semantics prevent duplicate slice entries
- Fluent API with method chaining
- Three accessor variants (set, get simplified, get raw) cover different use cases

### Slice Cardinality Validation

Profile classes with slices also generate `validate()` checks for slice cardinality. When a profile requires a minimum number of matching slice elements (e.g., blood pressure requires exactly 1 SystolicBP and 1 DiastolicBP component), `validate()` counts elements matching the discriminator and reports violations:

```typescript
const bp = observation_bpProfile.create({ status: "final", subject: { reference: "Patient/pt-1" } });
bp.validate();
// ["effective: at least one of effectiveDateTime, effectivePeriod is required"]
// Required slices (VSCat, SystolicBP, DiastolicBP) are auto-populated by create()
```

### Limitations

- No compile-time enforcement of slice constraints
- No dedicated types for slice elements (see Refine below)
- Array ordering is not enforced by the setter
- Only `value`/`pattern`/`type` (resource type) discriminator types are supported; `profile` and `exists` discriminators are not yet implemented

## Refine (Not Implemented)

The Refine approach would generate dedicated types for each slice element, providing stronger compile-time guarantees:

```typescript
// Hypothetical — not yet implemented
type BloodPressureSystolic = ObservationComponent & {
    code: CodeableConcept;  // fixed to systolic LOINC code
    valueQuantity: Quantity;
}

class USCoreBloodPressureProfile {
    getSystolic(): BloodPressureSystolic | undefined { ... }
    setSystolic(value: Omit<BloodPressureSystolic, "code">): this { ... }
    getDiastolic(): BloodPressureDiastolic | undefined { ... }
    setDiastolic(value: Omit<BloodPressureDiastolic, "code">): this { ... }
}
```

### Tradeoffs vs Lens

| | Lens (current) | Refine (future) |
|---|---|---|
| Compile-time safety | Weak — input is `Omit<BaseType, discriminatorKeys>` | Strong — dedicated types per slice |
| Type count | Low — reuses base types | High — one type per slice |
| Implementation complexity | Low | High |
| Runtime behavior | Same | Same |

## Discriminator Support

| Discriminator type | Status | Notes |
|---|---|---|
| `value` | Supported | Fixed value matching (most common) |
| `pattern` | Supported | Pattern matching on element |
| `type` | Partial | Resource type discrimination (by `resourceType` field) |
| `profile` | Not supported | Discriminate by profile URL |
| `exists` | Not supported | Discriminate by field presence |

## Run-Elements

- Slice selection:
    - `ElementDefinition.slicing.discriminator.type` -- engine for each [discriminator type](https://build.fhir.org/valueset-discriminator-type.html)
    - `ElementDefinition.slicing.discriminator.path` -- [Restricted Subset ("Simple") of FHIRPath](https://build.fhir.org/fhirpath.html#simple)
- Slice Order/Shape
- Slice validation:
    - `ElementDefinition.slicing.rules` -- is open or closed set ([all rules](http://hl7.org/fhir/ValueSet/resource-slicing-rules))
    - etc.
