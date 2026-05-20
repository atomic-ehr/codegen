# Profile Method Taxonomy

Status: Proposed. Captures the categories of code the TS writer currently emits inside a profile module, and the descriptors each emit needs.

This doc is the foundation for moving method derivation out of the TS writer and onto `SnapshotProfileTypeSchema` — once every emit is classified, the writer becomes a renderer that walks a typed list of descriptors instead of computing decisions inline.

## Categories

### 1. Module type aliases

Emitted before the class body. Each carries shape information consumers need to call factory / accessor methods.

| Name | Source helper | When emitted |
|---|---|---|
| `XxxProfile_extName_Flat` | `generateInlineExtensionInputTypes` | per complex extension that lacks a resolved profile class |
| `XxxProfile_field_sliceFlat` | `generateSliceInputTypes` | per slice — setter input, discriminator fields omitted |
| `XxxProfile_field_sliceFlatAll` | `generateSliceInputTypes` | per slice — getter return, includes discriminator values as readonly literals |
| `XxxProfileRaw` | `generateRawType` | factory args type — emitted when there are params or extension sub-slices |
| `XxxProfileFlat` | `generateFlatInputType` | Extension-profile-only flat input shape |

### 2. Class constants

| Name | Source |
|---|---|
| `static readonly canonicalUrl` | `generateProfileClass` |
| `private static readonly XxxSliceMatch: Record<string, unknown>` | `generateStaticSliceFields`, one per slice |

### 3. Static factory methods

| Method | Role | Emit condition |
|---|---|---|
| `static from(resource)` | wrap an existing FHIR resource and validate it | always |
| `static is(resource): resource is T` | type predicate via `meta.profile` (resource) or `url` (Extension) | resource with `meta` ancestor, or Extension base |
| `static apply(resource): Profile` | tag with canonicalUrl + auto-fields, return wrapper | always |
| `static createResource(args): T` | build the underlying FHIR object | always (signature varies on hasParams) |
| `static create(args): Profile` | `apply(createResource(args))` | always |
| `private static resolveInput(args)` | Extension-only: convert Flat input → `Extension[]` | Extension base **and** has sub-extension slices |

### 4. Instance lifecycle

| Method | Role |
|---|---|
| `constructor(resource)` | store the resource reference |
| `toResource(): T` | unwrap to the underlying FHIR object |

### 5. Field accessors

Pair of `getXxx() / setXxx(value)` per field. Three sub-flavors, all driven by `factoryInfo` from `collectProfileFactoryInfo`:

| Flavor | Source | Setter emitted? | Notes |
|---|---|---|---|
| **param accessor** | `factoryInfo.params` | yes | required fields constrained by the profile, plus base-required fields not otherwise covered |
| **auto accessor** | `factoryInfo.accessors` (autoAccessors branch) | only if not in `factoryInfo.fixedFields` | for `valueConstraint`-driven fields and required-slice array fields |
| **choice accessor** | `factoryInfo.accessors` (choice instances) | yes | non-promoted choice instances |

### 6. Slice accessors

Pair of `setXxxSlice(input) / getXxxSlice(mode?)` per `SliceDef` from `collectSliceDefs`. Sub-flavors driven by `SliceDef` fields:

| Sub-flavor | Triggering shape | Setter | Getter |
|---|---|---|---|
| **unbounded** | `def.array && max === 0/undefined` | accepts `(T \| Flat)[]`, replaces all matched | returns `T[] \| undefined`, with `mode: 'flat'\|'raw'` overloads |
| **single-element** | `def.max === 1` | accepts `T \| Flat`, replaces single match | returns `T \| undefined`, with `mode` overloads |
| **constrained-choice** | `def.constrainedChoice !== undefined` | wraps via `wrapSliceChoice` around the variant | unwraps via `unwrapSliceChoice` |
| **type-discriminator** | `def.typeDiscriminator === true` | uses typed base (`BundleEntry<Patient>`) | same |

### 7. Extension accessors

Pair of `setXxxExt(value) / getXxxExt(mode?)` per `ProfileExtension`. Three branches:

| Branch | Triggering condition | Setter shape | Getter overloads |
|---|---|---|---|
| **complex** | `ext.isComplex && ext.subExtensions` | `Flat \| ProfileClass \| Extension` (or just `Flat` if no profile class resolved) | `'flat' \| 'profile' \| 'raw'` |
| **single-value** | exactly one `valueFieldTypes` entry | value-type \| `ProfileClass \| Extension` if profile class resolved | `'flat' \| 'profile' \| 'raw'` |
| **generic** | otherwise | `Omit<Extension, "url"> \| Extension` | returns `Extension \| undefined` (no overloads) |

Cross-cutting concern: nested-path extensions (e.g. `Patient.address.extension`) use `ensurePath` to walk into the target object before pushing.

### 8. Validation

| Method | Source |
|---|---|
| `validate(): { errors: string[]; warnings: string[] }` | `generateValidateMethod` |

Per-field checks emitted into the body, from `collectRegularFieldValidation`:
- `validateRequired` — required fields
- `validateExcluded` — excluded fields and choice prohibitions
- `validateFixedValue` — `valueConstraint`-driven exact values
- `validateEnum` — closed enums (errors) vs open enums (warnings)
- `validateMustSupport` — `mustSupport && !required` (warning)
- `validateReference` — reference target type names
- `validateSliceCardinality` — slice min/max
- `validateSliceFields` — required fields inside matched slice elements (incl. constrained-choice variant)
- `validateChoiceRequired` — required choice declarations

## Helper imports

Static asset imports from `assets/api/writer-generator/typescript/profile-helpers.ts`, gated by emitted-method footprint via `generateProfileHelpersImport`:

`ensureProfile`, `isRawExtensionInput`, `applySliceMatch`, `matchesValue`, `setArraySlice`, `getArraySlice`, `setArraySliceAll`, `getArraySliceAll`, `ensureSliceDefaults`, `ensurePath`, `extractComplexExtension`, `wrapSliceChoice`, `unwrapSliceChoice`, `isExtension`, `getExtensionValue`, `pushExtension`, `upsertExtension`, plus the `validate*` set.

## Proposed descriptor model

The taxonomy collapses into eight emit roles. Each carries the data needed to render:

```
StaticConstant       — canonicalUrl, slice-match records
Factory              — from, is, apply, create, createResource, resolveInput
Lifecycle            — constructor, toResource
FieldAccessor        — param / auto / choice
SliceAccessor        — single / unbounded / constrained-choice / type-discriminator
ExtensionAccessor    — complex / single-value / generic
Validator            — validate()
ModuleTypeAlias      — Raw, Flat, *SliceFlat, *SliceFlatAll, *_extFlat
```

The migration target: a `methods` array on `SnapshotProfileTypeSchema` (or a paired structure) where each entry is a tagged descriptor in one of these eight categories. The writer then dispatches on `entry.kind` and renders — no decision logic in the writer body.

## What this enables

- **Multi-language reuse** — Python/C# generators can consume the same descriptors with their own renderers.
- **Snapshot inspectability** — `bun run src/cli/index.ts typeschema generate ...` could dump descriptors for review without running a language writer.
- **Testability** — descriptors are pure data; today's tests assert generated text against snapshots, which is coarse.
- **Stability** — adding a new method kind (e.g. a future `clone()` or `diff(other)`) is "add a descriptor variant + a renderer" instead of "edit the writer's monolithic generator".

## `methods` field type — first draft

The descriptors live on `SnapshotProfileTypeSchema` as an ordered array. Each entry is a tagged record; the discriminator `kind` selects the variant. **Everything is language-neutral** — no TS-specific type names, no rendered strings. Renderers consume the records and emit syntax.

### Shared records

```ts
/** Direct or dotted path inside the resource. Single segment = top-level field;
 *  longer = nested (e.g. `["meta", "profile"]` or a backbone path). */
export type FieldPath = string[];

/** Auto-assigned field with a fixed value the renderer formats per its syntax. */
export type AutoField = {
    name: string;
    /** Raw value (string, number, boolean, object, array). Renderer literalizes it. */
    value: unknown;
    /** Wrap in an array literal when emitting. */
    array: boolean;
};

/** Required parameter on factory methods + the type of the corresponding accessor. */
export type ParamField = {
    name: string;
    type: TypeIdentifier;
    reference?: TypeIdentifier[];
    array: boolean;
    binding?: BindingIdentifier;
};

/** Array field with a required slice — factory takes an optional value and auto-merges
 *  stub elements derived from the slice's match record. */
export type SliceAutoField = {
    name: string;
    type: TypeIdentifier;
    array: boolean;
    /** Names of the slice-match constants to seed defaults from. */
    sliceMatchNames: string[];
};

/** Named constant holding a slice's match record, emitted on the class. */
export type SliceMatchConstant = {
    /** Symbol name (e.g. "VSCatSliceMatch"). */
    staticName: string;
    /** The match record itself (raw JSON-like). */
    match: Record<string, unknown>;
};

/** Get/set target for an accessor that lives on the resource. */
export type FieldAccessorSpec = {
    name: string;
    /** Path inside the resource — `[name]` for direct, longer for backbone paths. */
    path: FieldPath;
    type: TypeIdentifier;
    reference?: TypeIdentifier[];
    array: boolean;
    optional: boolean;
};

/** Slice descriptor — captures every fact a renderer needs without going back to the schema. */
export type SliceSpec = {
    fieldName: string;
    sliceName: string;
    /** Collision-free PascalCase base (e.g. "VSCat", "SystolicBP"). */
    baseName: string;
    /** Base type of the field being sliced (e.g. CodeableConcept, ObservationComponent). */
    baseType: TypeIdentifier;
    matchStaticName: string;
    match: Record<string, unknown>;
    /** Required fields inside the slice element, with match-keys/choice-bases removed. */
    required: string[];
    excluded: string[];
    /** Whether the parent field is an array. */
    array: boolean;
    /** unbounded = max 0/undefined, single = max 1. */
    cardinality: "unbounded" | "single";
    /** When the slice constrains a choice declaration to a single variant. */
    constrainedChoice?: ConstrainedChoiceInfo;
    /** Slice discriminated by `resourceType` (e.g. Bundle entries by Patient/Observation). */
    typeDiscriminator: boolean;
    /** When the slice's discriminator yields a concrete resource type (only meaningful
     *  for typeDiscriminator slices). Renderer parameterizes the base type with this. */
    typeDiscriminatorTarget?: ResourceIdentifier;
};

/** Extension accessor descriptor — captures the source extension plus the writer-side
 *  derivations the original code computed inline (flavor, target path, profile link). */
export type ExtensionAccessorSpec = {
    /** Source extension definition (carries url, name, valueFieldTypes, subExtensions, …). */
    ext: ProfileExtension;
    /** Method base name (e.g. "Race" → `setRaceExt`/`getRaceExt`). */
    methodBaseName: string;
    /** Where on the resource the extension lives — empty for root, else nested path. */
    targetPath: FieldPath;
    /** Drives setter/getter shape. */
    flavor: "complex" | "single-value" | "generic";
    /** Resolved extension-profile class (when the extension URL points to a profile we generate). */
    profile?: {
        /** Snapshot identifier — the renderer resolves to a module/symbol per its naming. */
        identifier: SnapshotProfileIdentifier;
        /** Whether the linked profile exposes a Flat input variant (sub-extension slices). */
        hasFlatInput: boolean;
    };
};

/** Validation check, language-neutral. The renderer maps each to its own helper invocation. */
export type ValidationCheck =
    | { kind: "required"; field: string }
    | { kind: "excluded"; field: string }
    | { kind: "fixed-value"; field: string; value: unknown }
    | { kind: "enum"; field: string; values: string[]; severity: "error" | "warning" }
    | { kind: "must-support"; field: string }
    | { kind: "reference"; field: string; allowed: string[] }
    | { kind: "slice-cardinality"; field: string; sliceName: string; match: Record<string, unknown>; min: number; max: number }
    | { kind: "slice-fields"; field: string; sliceName: string; match: Record<string, unknown>; required: string[] }
    | { kind: "choice-required"; choices: string[] };

/** Sub-extension slice on an Extension profile — drives Flat input shape + resolveInput. */
export type SubExtensionSlice = {
    name: string;
    url: string;
    valueField: string;
    /** Resolved type for the value (TypeIdentifier when complex, undefined for primitives). */
    type?: TypeIdentifier;
    /** Primitive fallback name ("string"/"boolean"/"number") when `type` is undefined. */
    primitive?: string;
    array: boolean;
    required: boolean;
};
```

### The tagged union

```ts
export type ProfileMethod =
    // Class constants
    | { kind: "static-canonical-url" }
    | { kind: "static-slice-match"; def: SliceMatchConstant }

    // Static factory
    | { kind: "static-from"; baseType: TypeIdentifier; hasMeta: boolean }
    | { kind: "static-is"; baseType: TypeIdentifier; mode: "resource" | "extension" }
    | {
          kind: "static-apply";
          baseType: TypeIdentifier;
          autoFields: AutoField[];
          sliceAutoFields: SliceAutoField[];
          /** Set `resource.url = canonicalUrl` — Extension-profile only. */
          setExtensionUrl: boolean;
          hasMeta: boolean;
      }
    | {
          kind: "static-create-resource";
          baseType: TypeIdentifier;
          params: ParamField[];
          sliceAutoFields: SliceAutoField[];
          autoFields: AutoField[];
          /** Args go through resolveInput → Extension[] (Extension profiles with sub-slices). */
          viaResolveInput: boolean;
          hasMeta: boolean;
      }
    | { kind: "static-create"; viaResolveInput: boolean }
    | { kind: "static-resolve-input"; subSlices: SubExtensionSlice[] }

    // Lifecycle
    | { kind: "constructor"; baseType: TypeIdentifier }
    | { kind: "to-resource"; baseType: TypeIdentifier }

    // Field accessors — separate get/set so renderers can position or omit either
    | { kind: "field-get"; field: FieldAccessorSpec }
    | { kind: "field-set"; field: FieldAccessorSpec }

    // Slice accessors
    | { kind: "slice-get"; def: SliceSpec }
    | { kind: "slice-set"; def: SliceSpec }

    // Extension accessors
    | { kind: "extension-get"; spec: ExtensionAccessorSpec }
    | { kind: "extension-set"; spec: ExtensionAccessorSpec }

    // Validator
    | { kind: "validate"; checks: ValidationCheck[] }

    // Module-level type aliases — emitted outside the class body
    | {
          kind: "type-alias-raw";
          params: ParamField[];
          sliceAutoFields: SliceAutoField[];
          /** Extension profile with sub-slices but no `extension` param: include `extension?`. */
          includeExtensionField: boolean;
      }
    | { kind: "type-alias-flat"; subSlices: SubExtensionSlice[] }
    | {
          kind: "type-alias-slice-flat";
          def: SliceSpec;
          /** Final excluded list (match keys + slice.excluded + choice-base/variants). */
          excluded: string[];
          /** Fields the input must require. */
          required: string[];
      }
    | {
          kind: "type-alias-slice-flat-all";
          def: SliceSpec;
          /** Literals to emit as readonly discriminator fields on the getter return. */
          matchLiterals: Record<string, unknown>;
      }
    | {
          kind: "type-alias-extension-flat";
          ext: ProfileExtension;
          /** Skip when the extension URL resolves to a profile that exposes its own Flat. */
          shouldEmit: boolean;
      };
```

### Notes / open questions

- **Ordering matters.** The descriptors are an ordered list — renderers emit them in sequence (canonicalUrl first, then static fields, then constructor, then accessors, then validate). Alternative: bucket by kind in named arrays. Single ordered list is simpler and lets the snapshot builder pick a deliberate order once.
- **`hasMeta` / `viaResolveInput` flags vs. derived rendering.** Both are facts about the underlying profile. Renderers could compute them from the snapshot independently, but inlining keeps descriptors self-contained.
- **Extension `flavor` and slice `cardinality` could be encoded as variant kinds.** E.g. `"extension-set-complex"`, `"extension-set-single-value"`, `"extension-set-generic"`. That makes the variant set huge but each renderer dispatch becomes a single switch arm. The current draft keeps three flavors as a sub-field; renderers branch internally. The trade-off: tagged subvariants are nicer when the bodies diverge sharply; sub-fields are nicer when they share a lot of common code. **Recommendation: keep flavor as a sub-field for slice and extension** — the common path (lookup → format → emit) dominates.
- **Validation checks** could move out of `ProfileMethod` as their own array (separate concern from "methods"). Current draft keeps them under the `validate` method so the descriptor sequence is one ordered list. Open to splitting.
- **Helper-import gating** is not encoded — currently derived in `generateProfileHelpersImport` by examining the method footprint. Either: (a) renderers re-derive (simple, slight duplication), or (b) the snapshot builder emits a `required-helpers: Set<string>` alongside. (a) seems fine.
- **Module type aliases** are mixed in with methods. They're not really "methods" — could split into `methods` and `typeAliases` arrays, or rename the field to `emits`.

## Out of scope (still)

- Concrete renderer implementations (TS first, Python/C# later).
- Migration order across writer modules.
- Multi-language renderer details.

Those land in follow-up notes once the descriptor model is agreed.
