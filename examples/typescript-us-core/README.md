# TypeScript US Core Example

US Core FHIR profile generation with type-safe profile wrapper classes.

## Generating Types

```bash
bun run examples/typescript-us-core/generate.ts
```

Edit [`generate.ts`](generate.ts) to customize which profiles to include. Tree shaking keeps only the specified profiles and their transitive dependencies. Output goes to `./fhir-types/`.

## Profile Class API

Each profile class provides:

- **`from(resource)`** -- validate the resource conforms to the profile (meta.profile + required fields), throw on errors
- **`apply(resource)`** -- attach meta.profile without validation, useful for incremental construction
- **`create(args)`** -- build a new resource from typed input, auto-sets fixed values
- **`validate()`** -- check required fields, return error list
- **`toResource()`** -- get the underlying FHIR resource

Generated accessors depend on what the profile defines:

- **Fields** -- `getStatus()` / `setStatus(value)` for profile-constrained fields with narrowed types
- **Choice types** -- `getEffectiveDateTime()` / `setEffectiveDateTime(value)`, `getEffectivePeriod()` / `setEffectivePeriod(value)` etc.
- **Fixed values** -- auto-set by `create()` (e.g. `code` on body weight is always LOINC 29463-7)
- **Slices** -- `setSystolic(value)` / `getSystolic()` for component slices; discriminator values auto-applied; `getSystolic('raw')` returns the full element
- **Extensions** -- `setRace(value)` accepts flat input, profile instance, or raw FHIR Extension; `getRace()` / `getRace("profile")` / `getRace("raw")` for three return modes

## Tests

```bash
cd examples/typescript-us-core && bun test
```

- [profile-patient.test.ts](profile-patient.test.ts) -- Patient profile with extensions (race, ethnicity, sex)
- [profile-bp.test.ts](profile-bp.test.ts) -- Blood Pressure with component slices
- [profile-bodyweight.test.ts](profile-bodyweight.test.ts) -- Body Weight with choice types, slice getter modes

## File Structure

```
typescript-us-core/
├── generate.ts                  # Type generation script
├── profile-patient.test.ts      # Patient profile tests
├── profile-bp.test.ts           # Blood pressure tests
├── profile-bodyweight.test.ts   # Body weight tests
├── fhir-types/                  # Generated output
│   ├── hl7-fhir-r4-core/        # FHIR R4 base types
│   ├── hl7-fhir-us-core/        # US Core types
│   │   └── profiles/            # Profile wrapper classes
│   └── profile-helpers.ts       # Runtime helpers
└── type-tree.yaml               # Dependency tree (debug)
```
