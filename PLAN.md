# Plan: Precompute profile data in TypeSchema

Move slice, extension, and naming data from per-language generation time into the TypeSchema intermediate representation. This enables multi-language profile support (Python, C#) without each language re-implementing structural analysis.

## Motivation

Currently, TypeScript profile generation (`profile.ts`, `profile-slices.ts`, `profile-extensions.ts`) computes a lot of structural, language-agnostic data on the fly:
- Flattened profile fields (merging constraint hierarchy)
- Constrained choice detection
- Slice type classification (type-discriminated vs value-discriminated)
- Required fields within slices
- Factory parameter classification (auto vs param vs slice-auto)
- Extension sub-slice extraction
- Method/class name base names (before language-specific casing)

Each new language would need to recompute all of this. The fix: precompute structural data in TypeSchema, let language generators only handle naming style and syntax.

## Phase 1: Precompute `flatProfile` in TypeSchema pipeline

**Current**: `flatProfile()` in `utils.ts` runs at generation time, called by every writer.
**Proposed**: Run flattening during TypeSchema generation. Store the result as the canonical `ProfileTypeSchema`.

What `flatProfile` does (all language-agnostic):
- Walks constraint hierarchy, merges fields from parent profiles
- Narrows choice declarations (removes prohibited variants)
- Deduplicates extensions by `path|name` key
- Collects dependencies from constraint chain
- Resolves the non-profile base type

**Benefit**: Every language gets a ready-to-use merged profile — no need to understand profile inheritance.

## Phase 2: Precompute `constrainedChoice` on `FieldSlice`

**Current**: Computed in `tsIndex.constrainedChoice()` and `collectSliceDefs()`.
**Proposed**: Add `constrainedChoice?: ConstrainedChoiceInfo` directly on `FieldSlice` in `types.ts`.

```typescript
// Already defined in types.ts, just not stored on FieldSlice
export type ConstrainedChoiceInfo = {
    choiceBase: string;       // "value"
    variant: string;          // "valueQuantity"
    variantType: TypeIdentifier;
    allChoiceNames: string[];
};
```

Compute during field-builder or transformer phase. The info is structural: "this slice constrains `value[x]` to `valueQuantity`."

## Phase 3: Precompute slice classification on `FieldSlice`

Add to `FieldSlice`:

```typescript
export interface FieldSlice {
    // ... existing fields ...
    typeDiscriminator?: boolean;          // slice matches by resourceType
    typedResourceIdentifier?: TypeIdentifier; // for type-disc slices: the concrete resource type
    constrainedChoice?: ConstrainedChoiceInfo;
}
```

- `typeDiscriminator`: simple check on `discriminator[0].type === "type"` — currently computed in `collectSliceDefs`
- `typedResourceIdentifier`: for type-discriminated slices, extracted from match pattern `{ resourceType: "Patient" }` → `Patient` identifier. Currently computed per-language to build generic types like `BundleEntry<Patient>`.

## Phase 4: Precompute factory field classification

Add a `factoryRole` to profile fields or a separate structure on `ProfileTypeSchema`:

```typescript
type ProfileFactoryField =
    | { role: "auto"; name: string; value: unknown }         // fixed value, auto-set
    | { role: "param"; name: string }                        // required, user-provided
    | { role: "sliceAuto"; name: string; sliceNames: string[] }  // array with auto-populated slices

type ProfileFactory = {
    autoFields: ProfileFactoryField[];
    params: ProfileFactoryField[];
    sliceAutoFields: ProfileFactoryField[];
};
```

**Current**: `collectProfileFactoryInfo()` in `profile.ts` classifies each field by walking the profile fields, checking `valueConstraint`, `required`, and `collectRequiredSliceNames()`.

**Proposed**: Precompute during TypeSchema generation. The classification is structural — which fields have fixed values, which are required params, which have auto-populated slices. Language generators then just format the names and types.

## Phase 5: Precompute base names for profile methods

**Current**: `resolveProfileMethodBaseNames()` in `profile.ts` computes collision-free base names for slice/extension getter/setter methods. It uses a multi-level candidate system:
- Slice: `baseName → qualifiedName → qualifiedNameSlice`
- Extension: `baseName → qualifiedName → qualifiedNameExtension`

**Problem**: Each language must re-implement collision detection, which requires seeing all names simultaneously.

**Proposed**: Precompute base names (without language-specific casing) on the profile schema:

```typescript
// On ProfileExtension
export interface ProfileExtension {
    // ... existing fields ...
    baseName?: string;  // collision-free base name, e.g. "Ethnicity", "RaceOmbCategory"
}

// On FieldSlice
export interface FieldSlice {
    // ... existing fields ...
    baseName?: string;  // collision-free base name, e.g. "VSCat", "SystolicBP"
}
```

Language generators then apply their casing: `getVSCat`/`setVSCat` (TS), `get_vs_cat`/`set_vs_cat` (Python).

The collision resolution algorithm itself (`resolveNameCollisions`) is language-agnostic — it just picks the shortest non-colliding candidate.

## Phase 6: Precompute profile class/module base name

**Current**: `tsProfileClassName()` appends "Profile" suffix, `tsProfileModuleName()` prefixes with base resource name. Both use TS naming conventions but the structural decision (what the name is based on) is generic.

**Proposed**: Add `baseName` on `ProfileIdentifier`:

```typescript
export interface ProfileIdentifier {
    // ... existing fields ...
    baseName?: string;       // e.g. "observation_bodyweight" (from profile name)
    baseResourceName?: string; // e.g. "Observation" (from base type)
}
```

Language generators then apply their conventions:
- TS: `observation_bodyweightProfile` (class), `Observation_observation_bodyweight` (module)
- Python: `ObservationBodyweightProfile` (class)

## Execution order

1. **Phase 1** (biggest win) — flatProfile precomputation. Unblocks Python profile support.
2. **Phase 2 + 3** — slice classification. Simplifies all language generators.
3. **Phase 5 + 6** — name precomputation. Removes per-language collision detection.
4. **Phase 4** — factory classification. Lower priority, can stay per-language initially.

## Non-goals

- Language-specific type formatting (`Reference<"Patient">`, `BundleEntry<Patient>`) stays in generators
- Import path resolution stays in generators
- Syntax generation (curlyBlock, indentation) stays in generators
