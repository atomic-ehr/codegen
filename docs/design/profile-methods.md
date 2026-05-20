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

## Out of scope

- Concrete method-spec record types (the `Param`, `SliceDef`, `ExtensionMethodSpec` shapes already exist in the writer; the migration step formalizes them as snapshot-level types).
- Migration order across writer modules.
- Multi-language renderer details.

Those land in follow-up design notes once the descriptor model is agreed.
