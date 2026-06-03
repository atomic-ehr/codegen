# Migrating package/SD defect handling into CanonicalManager (#128)

## Goal

Move every transformation that *patches or filters raw FHIR data to work around
package defects* out of codegen and into CanonicalManager (CM), so codegen
receives a clean, consistent view. Phases:

0. **CM foundation, one release** — `packageIndex` mode (P0.1), patch/report/`entry`
   types (P0.2), the live patch + exclusion runtime incl. `manager.report()` (P0.3),
   and updated CM docs (P0.4). This single release unblocks everything that follows.
1. **Helpers in codegen** — write the transform helpers + combinators as codegen factory
   functions on top of CM's `patches` runtime, one helper per commit, migrating the
   relevant example each time. No further CM release.
2. **Migrate skip-hack** to CM-level exclusion (the risky step), with an optional
   helper-factory relocation into CM.
3. **Follow-up** — remove the deprecated API once the dust settles.

The detailed *target design* of each piece is below; the step-by-step order is in the
Execution plan.

### Repos & coordination

| Repo | Path | State |
|---|---|---|
| codegen | `…/codegen` | consumes `@atomic-ehr/fhir-canonical-manager@0.0.23` |
| CM | `…/fhir-canonical-manager` | `main`, `0.0.23` |

Only **Phase 0** touches CM and needs a release; Phases 1–2 are codegen-only (aside from
the optional P2.2 helper-factory relocation). Develop Phase 0 against the local CM
checkout, validate end-to-end via `npm link` / `bun link` or a `file:` dependency, then
publish and pin the exact version in codegen before starting Phase 1.

---

## Scope: what moves vs. what stays

CM only knows **package.json**, **raw FHIR resources** (read from disk), and **the
index** (resolve/search). It has no FHIRSchema/TypeSchema layer, no enums, no
fields-as-codegen-concepts. That boundary decides what can physically move.

### In scope — moves to CM (operates on raw FHIR / package.json)

| Mechanism | Today (codegen) | Defect | CM injection point |
|---|---|---|---|
| `packageIndex` mode (was `ignorePackageIndex`) | CM config | corrupt `.index.json` | scan (see 1.0) |
| inject dependency | `kbv`, `norge` preprocessPackage | missing dependency | scan (package.json) |
| rename package | `norge` preprocessPackage | name typo | scan (package.json) |
| rename canonical / ref target | `norge` RelatedPerson, `ccda` IVL_TS | URL typo, bad ref target | read (resource body) |
| swap binding | `ccda` CarePlanAct | unavailable ValueSet | read (resource body) |
| patch CodeSystem codes | `ccda` bundle-type | missing codes | read (resource body) |
| exclude canonical | `skip-hack.ts` → `typeschema/index.ts:115` | cross-version type refs | **index build** |

### Boundary — enforcement moves to CM, the *list* stays codegen-owned data

CM owns **enforcement**: an excluded canonical is dropped from the index, so it never
enters the register. But codegen still owns the exclude **list as data** — and must,
for one subtle reason:

> **Do not collapse "deliberately excluded" into "resolution failed".** Today
> `transformer.ts:51` drops a field *only if its type is in the curated skip list*; any
> *other* unresolvable type (a canonical typo, a genuinely missing dependency) falls
> through to the error / R5-hint path. If we replaced that with "type resolves to
> nothing → drop", typos and missing deps would be **silently dropped** instead of
> erroring — a regression that defeats the diagnostics goal.

So the field-level reaction checks **membership in codegen's known exclude set**, not
"did resolution fail". Codegen keeps the exclude rules as data and uses them twice:
(1) to build `excludeCanonical` patches handed to CM, and (2) to gate the field-level
drop. This resolves the "where do defaults live" decision → **codegen-owned data**.

- **Field-level skip** (`transformer.ts:51`) — today `shouldSkipCanonical(pkg, fcurl)`.
  After: drop the field with a `#skipCanonical` warning **iff `fcurl` is in the exclude
  set**; otherwise leave the existing resolve/error path untouched.
- **R5-only hint** (`field-builder.ts:29-56`, `R5_ONLY_TYPES`) — a *second* hardcoded R5
  list whose error message points at `skip-hack.ts`. Retarget its pointer to the new
  exclude-set mechanism; keep it as the *diagnostic* for non-excluded R5 types.

Verified: `registerFromManager` builds `register.allFs()` from `manager.search({ package })`
(`register.ts:96`); a CM-excluded canonical never enters the register, so the
**schema-level** skip (`index.ts:115`) becomes dead code automatically. Only the
**field-level** reference needs the exclude-set-gated drop above.

### Out of scope — stays in codegen (TypeSchema-level, not package defects)

- Internal binding/enum drops (placeholder-only, >100 codes, non-bindable) — `binding.ts`
- `missing_valuesets` synthetic fallback — `identifier.ts`
- Broken-package graceful field warns (`#fieldTypeNotFound`, constraint FIXME) — `field-builder.ts`
- IR transforms `treeShake` / `promoteLogical` / `resolveCollisions` — user features, not defects
- Normal mechanics: version stripping, canonical normalization, Python keyword escaping,
  generic-type rewrites, fragment-path navigation, fixed-coding synthesis

---

## Target design (end state)

This section specifies *what* each piece looks like in its final home. **Where/when**
each lands (per the Execution plan):

| Piece | Where it's built | When |
|---|---|---|
| `packageIndex` mode (1.0) | CM (scanner) | **P0.1** |
| patch/report/`entry` **types** (1.1, 1.4) | CM (`types/core.ts`) | **P0.2** |
| `composePatches`, `entry` exclusion, `excludeCanonical`, `report()` runtime (1.1–1.4) | CM | **P0.3** |
| transform helpers (rename/inject/swap/patchCodeSystem) | codegen factory fns, via CM `patches` | Phase 1 |
| scoping combinators (`whenPackage`/`forResource`) | codegen factory fns | Phase 1 |
| (optional) relocate helper factories into CM | CM | P2.2 |

So the CM patch + exclusion **runtime** ships in Phase 0; the transform **helper
functions** are written in codegen (Phase 1) and passed via CM's `patches` config.
Relocating those factories into CM (P2.2) is an optional code-sharing step.

### Current CM surface (`src/types/core.ts:87`)

```ts
interface Config {
  packages: string[];
  workingDir: string;
  registry?: string;
  dropCache?: boolean;
  preprocessPackage?: (ctx: PreprocessContext) => PreprocessContext;  // transform only
  ignorePackageIndex?: boolean;
}
type PreprocessContext = PreprocessPackageContext | PreprocessResourceContext;
```

Two gaps: not **composable**, and can **only transform, not drop** (skip-hack needs drop).
The single callback already runs at two points:
- `kind: "package"` in `scanner/package.ts:103` (loadPackage, at scan)
- `kind: "resource"` in `manager/canonical.ts:390` (read(), per read)

### 1.0 Replace `ignorePackageIndex` boolean with a `packageIndex` mode

The boolean can't express "try the shipped index, but heal it if it's broken" —
exactly the kbv case. Today's silent failure modes (verified in `scanner/`):

- `parseIndex` is all-or-nothing (`parser.ts:29`, `.every()`): one bad file entry,
  invalid JSON, or missing `index-version` → `null` → `processIndex` adds **zero**
  entries and swallows the error (`processor.ts:75`).
- `loadPackage` sets `resourceCount = 1` whenever `.index.json` *exists*
  (`package.ts:136`), so a present-but-corrupt index produces **no fallback** — the
  package silently loads zero resources.
- Partial corruption (index references files not on disk) loads a **partial** set +
  warning, still no fallback (`processor.ts:70-73`).

Replace the boolean with a tri-state mode:

```ts
type PackageIndexMode =
  | "use"         // trust shipped .index.json as-is; scan only if the file is absent  (DEFAULT)
  | "recover"     // use the index, but fall back to a directory scan if corrupt/incomplete
  | "regenerate"; // always scan the directory, ignore .index.json                     (old `true`)

interface Config {
  // …
  packageIndex?: PackageIndexMode;     // NEW — defaults to "use"
  /** @deprecated use `packageIndex` */
  ignorePackageIndex?: boolean;        // kept as alias; new field wins if both set
}
```

**Default: `"use"`** (decided) — strict backward compatibility with today's behavior.
`"recover"` is opt-in; when set, recovery always emits a warning so the heal is never silent.

Because the default stays `"use"`, most users would still hit today's silent
zero/partial load. So **`"use"` mode also warns** when `processIndex` reports `!ok`
(`unparseable` or `missing-files`) — it just doesn't fall back. This turns the silent
failure into a visible one (and a clear hint to set `"recover"`) without changing
behavior. Only `"recover"` adds the fallback scan.

**Deprecated alias.** `ignorePackageIndex` is kept and translated to `packageIndex`,
emitting a one-time deprecation warning when set:
- `ignorePackageIndex: true  → packageIndex: "regenerate"`
- `ignorePackageIndex: false → packageIndex: "use"`

If **both** `packageIndex` and `ignorePackageIndex` are provided, **throw an error** —
the two would conflict and silently picking one hides bugs. Callers migrate to
`packageIndex` and drop the old field.

The alias exists only as a migration bridge: it is deprecated on introduction and
**scheduled for removal** in a subsequent release (track via a follow-up issue).
Once removed, `packageIndex` is the only option.

`"recover"` requires `processIndex` to report usability instead of returning `void`:

```ts
type IndexLoadResult =
  | { ok: true; count: number }                            // count may be 0 (legit empty package)
  | { ok: false; reason: "unparseable" | "missing-files" };
```

Note: a valid index with `files: []` is `{ ok: true, count: 0 }` — a genuinely
resource-free package, **not** corruption, so it must not trigger recover (that would
cause a spurious fallback scan + warning). Only `unparseable` (parse/schema failure) and
`missing-files` (listed files absent on disk) are corruption.

In `loadPackage`, for `"recover"`: when the result is `!ok`,
roll back any partial entries added for that package, run
`scanDirectoryForResources`, and emit a `recovered index for <pkg>` warning. The
mode is global config but applies **per-package** — each package heals
independently, fixing the old "coarse, whole-manager" limitation without per-package config.

Implementation note: recovery must avoid duplicate entries. Either track and clear
the package's `cache.entries` before the fallback scan, or dedupe by `(url, package)`.

### 1.1 Add a third context kind for exclusion

Exclusion must happen where the index is built, before `search`/`resolve` see it.
Add an **entry** context that fires during `processIndex` / `scanDirectoryForResources`
with metadata only, and may return `null` to exclude:

```ts
// CM src/types/core.ts
type PreprocessEntryContext = PreprocessBaseContext & {
  kind: "entry";
  entry: IndexEntry;            // url, type, kind, version, package — no body
};
type PreprocessContext =
  | PreprocessPackageContext
  | PreprocessResourceContext
  | PreprocessEntryContext;

type PreprocessFn = (ctx: PreprocessContext, report: PatchReportSink) =>
  PreprocessContext | null | undefined;
//   ctx' → use it   |   undefined / same ctx → no-op   |   null → explicit drop
//   report: the diagnostics sink (§1.4), passed by CM; legacy 1-arg callbacks ignore it
```

**Return semantics — `null` vs `undefined`.** A JS function returns `undefined` on a
bare `return;`, a forgotten branch, or falling off the end. If `undefined` meant
"drop", any such accidental fall-through in a legacy `(ctx) => ctx` callback would
**silently delete the resource**. So reserve by intent:
- `undefined` (or returning the ctx unchanged) → **no-op** — the forgiving default, so
  a missing `return` does no harm; helpers no-op on an unmatched ctx with `return;`.
- `null` → **explicit drop** — cannot be produced by accident; signals intent.

Drop (`null`) is only **honored at the entry phase** — exclusion must happen before
the index is built. A `null` returned at the `resource`/`read()` phase cannot remove
an already-indexed entry; CM ignores it there and warns, rather than misleading.

Wire `entry` into `scanner/package.ts` so excluded entries never enter `cache`. It
must fire in **both** index-build paths, independent of `packageIndex` mode:
- `processIndex` — the `"use"` case and successful `"recover"` (shipped `.index.json`)
- `scanDirectoryForResources` — `"regenerate"` and the `"recover"` fallback

If exclusion only fired in the scan path, skip-hack would silently stop working the
moment a package ships a valid `.index.json` — so the hook is applied per entry in
both paths, with the same metadata shape (`IndexEntry`). Leave `package`/`resource`
injection points unchanged. BC: existing callbacks ignore `kind: "entry"` and fall
through (→ `undefined` → no-op), and a legacy `=> PreprocessContext` signature stays
assignable to the widened `PreprocessFn`.

### 1.2 Composable patch list

```ts
// CM
type Patch = PreprocessFn;
const composePatches = (...patches: Patch[]): Patch =>
  (ctx, report) => patches.reduce<PreprocessContext | null>((acc, p) => {
    if (acc === null) return null;          // already dropped — short-circuit
    const r = p(acc, report);               // thread the diagnostics sink
    if (r === null) return null;            // explicit drop
    return r === undefined ? acc : r;       // undefined = no-op, keep acc
  }, ctx);

interface Config {
  // …existing…
  /** @deprecated use `patches` — equivalent to a single-element `patches` array */
  preprocessPackage?: (ctx: PreprocessContext) => PreprocessContext;  // BC alias
  patches?: Patch[];                  // the one mechanism going forward
}
```

**`patches` is the only real mechanism; `preprocessPackage` is the pre-existing name
for "one patch."** A legacy `(ctx) => PreprocessContext` is structurally assignable to
`Patch`, so CM wraps it internally (no public-type change) and resolves an effective
patch = `composePatches(...(patches ?? []), ...(preprocessPackage ? [preprocessPackage] : []))`.
Order: `patches` first, legacy callback last.

**Both may be set at once — they compose, no error.** This is the deliberate opposite of
`packageIndex`/`ignorePackageIndex` (which *throw* if both set): those are contradictory
ways to express one setting, whereas `preprocessPackage` + `patches` are *additive* (two
patch sources), so forbidding the combination would only add migration friction. Note a
legacy callback is now also invoked at the `entry` phase; since it only handles
`kind === "package"|"resource"`, it falls through to `undefined` (no-op) there and can't
accidentally drop. `preprocessPackage` is **deprecated from P0.3** (JSDoc; no runtime
warning, to avoid noise during migration) and **removed in Phase 3**.

### 1.3 Helper factories shipped by CM

Each returns a `Patch`. Return discipline (from 1.1): **`null` removes, `undefined`
is no-op.** A patch returns `null` only on the exact ctx it targets; for the wrong
`kind`, a non-matching target, or "no change needed", it returns `undefined`. This
keeps a forgotten branch from silently dropping data. Internals reuse the
`JSON.stringify → replaceAll → JSON.parse` trick the examples already use.

**Sharp edge — `replaceAll` is blunt.** `renameCanonical`/`renameReferenceTarget`
string-replace over the *whole* serialized resource, so a `from` value that is a
substring of another URL (or appears in `text`/`description`) will be over-replaced.
This is no worse than the examples do today, but as a shipped helper it must default to
**scoping** (`package`/`url`) and the docs (P0.4/P2.3) must call out the footgun and
recommend the most specific `from` possible.

Concrete shape (exclusion is the only helper that returns `null`):

```ts
const excludeCanonical =
  (opts: { package?: PackageMatch; url: string; reason: string }): Patch =>
  (ctx, report) => {
    if (ctx.kind !== "entry") return undefined;                     // not the entry phase → no-op
    if (ctx.entry.url !== opts.url) return undefined;               // not our target → no-op
    if (opts.package && !matchPackage(opts.package, ctx.package)) return undefined;
    report.note({ kind: "exclusion", package: ctx.package, url: opts.url, reason: opts.reason });
    return null;                                                    // matched → drop
  };
```

```ts
// CM — new module src/patches/index.ts (exported from src/index.ts)
renamePackage(map: Record<string,string>): Patch
  // kind:"package" → rewrite packageJson.name

injectDependency(match: (name: string) => boolean, deps: Record<string,string>): Patch
  // kind:"package" → merge into packageJson.dependencies if absent

renameCanonical(opts: { from: string; to: string; package?: PackageMatch }): Patch
  // kind:"resource" → replaceAll(from,to) over the serialized resource

renameReferenceTarget(opts: { url: string; from: string[]; to: string }): Patch
  // kind:"resource", scoped to resource.url === opts.url

swapBinding(opts: { url: string; from: string; to: string }): Patch
  // kind:"resource", scoped to resource.url

patchCodeSystem(opts: { url: string; addCodes: string[] }): Patch
  // kind:"resource", scoped to CodeSystem.url; appends missing concept codes

excludeCanonical(opts: { package?: PackageMatch; url: string; reason: string }): Patch
  // kind:"entry" → report.note(exclusion) + return null on match; undefined otherwise (see below)

type PackageMatch = string | { name: string; version?: string } | ((p: PackageId) => boolean);
```

#### Chaining: scoping combinators

The real noise in the examples is repeated guards (ccda checks `package.name` in
several patches; norge checks one `resource.url`). Scoping combinators hoist the
guard out of each leaf and wrap a sub-chain that runs only when matched:

```ts
whenPackage(match: PackageMatch, ...patches: Patch[]): Patch
  // run inner only when ctx.package matches (any phase)
forResource(url: string, ...patches: Patch[]): Patch
  // run inner only when ctx.kind==="resource" && ctx.resource.url===url
```

Both return a `Patch`, so they nest and compose. ccda becomes a grouped chain:

```ts
patches: [
  whenPackage("hl7.cda.uv.core",
    renameCanonical({ from: "…/IVL_TS", to: "…/IVL-TS" }),
    forResource("…/CarePlanAct", swapBinding({ from, to })),
  ),
  patchCodeSystem({ url: "…/bundle-type", addCodes: ["bundle", "subscription-notification"] }),
]
```

**This also dissolves the "run every patch at every phase" engine question.** A
combinator checks `kind`/target **once** and returns `undefined` on a miss,
short-circuiting the whole group — so a wrong-phase group bails after one cheap
comparison, not per-leaf. The combinator *is* the phase tag, carried inline, so CM
never needs to introspect or tag patches to route them: the engine stays a dumb
sequential reduce. No optimization to add, no tag to maintain.

The same short-circuit matters on the **per-read hot path**: resource patches fire on
*every* `read()`, and codegen reads thousands of resources building the register. A
well-scoped `forResource`/`whenPackage` group bails after one comparison, keeping
per-read cost near-zero — so scoping patches isn't just for readability.

#### Patch contract

Chaining stays sane only if every patch obeys:
- **Idempotent** — resource patches fire on every `read()`, possibly repeatedly;
  `replaceAll`-renames and inject-if-absent already are. No append-on-every-call.
- **Order-significant** — output of patch *i* feeds *i+1*. Defaults run **before**
  user patches so a user patch can post-process/override a default. (Exclusions are
  order-independent; transforms are not.)
- **Throw-fast + reported** — a throwing patch is a config bug; CM records a
  `{ kind: "patch-error", patch, reason }` entry and re-throws by default (codegen's
  `throwException` wraps the run). A lenient skip-and-continue flag can come later.
- **Don't nest phases** — `forResource(...)` only runs at the resource phase, so
  wrapping an entry-phase patch (`excludeCanonical`) inside it silently never fires.
  Group excludes under `whenPackage(...)` (any phase) instead, or leave them top-level.

### 1.4 Diagnostics report ("why we see what we see")

Every defect action today is a `console.warn` or silent. Once exclusions move into
CM (skip-hack), the `#skipCanonical` reasons that were at least codegen warnings now
happen inside CM — so without a report, "why is type X missing/changed?" becomes
unanswerable. CM accumulates a structured report and exposes it; codegen folds it
into its markdown output (P1.7 consuming `manager.report()`).

```ts
// CM
type ReportEntry =
  | { kind: "index-recovery"; package: PackageId; reason: "unparseable"|"missing-files"; recovered: number }
  | { kind: "exclusion";      package: PackageId; url: string; reason: string }
  | { kind: "patch";          patch: string; package: PackageId; url?: string; detail: string }
  | { kind: "patch-error";    patch: string; package: PackageId; url?: string; reason: string }
  | { kind: "deprecation";    message: string };
type CanonicalManagerReport = { entries: ReportEntry[] };

interface CanonicalManager { /* … */ report(): CanonicalManagerReport; }
```

The `report` sink is the second `Patch` arg (defined in §1.1, `PatchReportSink`).
Legacy `preprocessPackage(ctx) => ctx` callbacks ignore it (JS drops the extra arg),
so nothing breaks. CM owns the sink, passes it to every patch, and **also records the
things it controls directly**: index recovery (1.0), the `null`-return exclusion + its
`reason` (1.1), and the `ignorePackageIndex` deprecation (1.0).

Helper factories call `report.note(...)` only when they actually apply a change
(e.g. `injectDependency` notes nothing if the dep was already present), so the
report reflects real mutations, not attempted ones.

**De-duplication.** Resource patches fire on *every* `read()`, and a resource is read
more than once (search + register building), so a naive `note()` would log the same
mutation repeatedly. The sink **de-dupes by entry identity** (e.g. `kind` + `url` +
`patch` + `detail`) so each real change appears once. Index- and package-phase entries
(recovery, exclusion, dependency injection) fire once at scan and need no dedup. The
report grows over the manager lifetime; `report()` returns the current accumulation.

The `patch` field (a label) is set by the shipped helpers; a raw user `(ctx, report) =>`
patch must supply its own label, else the dedup key is weaker (still de-dupes on
`kind`+`url`+`detail`). Document this in the helper-authoring guide.

**Scope.** Resource-phase entries appear only for resources codegen actually `read()`s,
so `report()` reflects "what was touched," not an exhaustive audit of every package.
That's the intended "why is *this* type off" view — don't expect full coverage.

### 1.5 CM test plan

- Unit tests per helper (in CM `test/unit/patches/`): each transforms/excludes its
  target ctx and no-ops on others, and emits the expected report entry (or none).
- `composePatches`: order, short-circuit on `null`.
- BC regression: existing `preprocessPackage` tests (`test/unit/manager/preprocess-resource.test.ts`,
  `test/unit/scanner/scanner.test.ts`) still pass unchanged; a 1-arg legacy callback
  works under the 2-arg `Patch` signature.
- `entry` exclusion: an excluded canonical is absent from `search`/`resolve`/`resolveEntry`/`searchEntries`/`smartSearch`,
  and verified **in both index modes** — a package with a shipped `.index.json`
  (`"use"` → `processIndex`) and one forced to scan (`"regenerate"` → `scanDirectoryForResources`).
- `report()`: recovery + exclusion + patch + deprecation entries appear with correct reasons.

---

## Execution plan

Each step = one independent codegen (or CM) commit (or small commit group). Per repo
commit guidelines: source change first, **regenerated examples as the last commit** of
the step. Verify each step with `bun run typecheck && bun run lint && bun test`, then
`make all` for example + cross-project type checks. Confirm example snapshots are
**unchanged** (behavior parity) before committing the regeneration.

### Phase 0 — CM foundations (start here)

Four CM-side steps (`…/fhir-canonical-manager`, on a feature branch), shipped as one
release. P0.1 (packageIndex) is independent; P0.2 (types) → P0.3 (runtime) are ordered;
P0.4 (docs) is last before tagging. P0.2 is types-only (dormant until P0.3 wires it),
so it's near-zero risk.

#### P0.1 — `ignorePackageIndex` → `packageIndex` mode

Target design: §1.0. File-level change list (verify exact lines at implementation):

- **`src/types/core.ts`** (`Config`, ~87–96): add `PackageIndexMode =
  "use" | "recover" | "regenerate"` and `packageIndex?: PackageIndexMode`; keep
  `ignorePackageIndex?: boolean` with a `@deprecated` JSDoc.
- **`src/manager/canonical.ts`** (config consumption, ~where `config.ignorePackageIndex`
  is read/threaded to `scanDirectory`, ~line 272): add a `resolvePackageIndexMode(config)`
  that — defaults to `"use"`; if `ignorePackageIndex` is set, translate
  (`true→"regenerate"`, `false→"use"`) **and emit a one-time deprecation warning**;
  **throw** if both `packageIndex` and `ignorePackageIndex` are present. Pass the
  resolved mode down instead of the boolean.
- **`src/scanner/directory.ts`** (options param, ~14–15): change the threaded option
  type from `{ ignorePackageIndex?: boolean }` to `{ packageIndex: PackageIndexMode }`.
- **`src/scanner/processor.ts`** (`processIndex`, currently returns `void`, swallows
  errors at `:75`): return an `IndexLoadResult = { ok: true; count } | { ok: false;
  reason: "unparseable" | "missing-files" }`. Map: `parseIndex`→null ⇒ `unparseable`;
  `missingCount > 0` ⇒ `missing-files`; otherwise `{ ok: true, count }` (count may be 0
  for a legitimately resource-free index — not corruption).
- **`src/scanner/package.ts`** (`loadPackage` `hasIndex` block, ~125–142): branch on the
  mode — `"use"` = today's behavior (index if present else scan), **plus warn on `!ok`**
  (no fallback); `"regenerate"` = always `scanDirectoryForResources`; `"recover"` = run
  `processIndex`, and on `!ok` roll back the package's partial entries, run the directory
  scan, and emit a `recovered index for <pkg> (reason)` warning.
  - **Rollback-of-partials decision (resolve at impl):** cleanest is to refactor
    `processIndex` to *collect* entries and return them (pure), so `loadPackage` commits
    index-entries only on `ok` and discards on recover — avoids touching `cache.entries`
    twice. Fallback: dedupe `cache.entries` by `(url, package)` after the scan.
- **Tests** (`test/unit/scanner/`): update existing `ignorePackageIndex` tests to
  `packageIndex`; add (a) corrupt-index → `"recover"` falls back to scan, (b) deprecation
  warning fires on `ignorePackageIndex`, (c) both-set throws, (d) `"use"` behavior
  unchanged but **warns** on a corrupt index, (e) a valid empty index (`files: []`) is
  `ok`/`count:0` and does **not** trigger recover.

Note: P0.1 is independently useful (it fixes today's silent zero/partial-resource
failure), so it can ship in its own CM release ahead of the helper promotion if desired.

#### P0.2 — Types for the `entry` context and the patch arg

Target design: §1.1 (entry context) + §1.4 (report sink). **Types only — no behavior;
nothing emits an `entry` context or calls a sink until later steps wire the scanner and
`composePatches`.** All in **`src/types/core.ts`** (+ re-export via `src/types/index.ts`
and `src/index.ts`):

- `PreprocessEntryContext = PreprocessBaseContext & { kind: "entry"; entry: IndexEntry }`;
  add it to the `PreprocessContext` union.
- `ReportEntry` (the §1.4 union) + `CanonicalManagerReport = { entries: ReportEntry[] }`
  + `PatchReportSink = { note: (e: ReportEntry) => void }`.
- `Patch = (ctx: PreprocessContext, report: PatchReportSink) =>
  PreprocessContext | null | undefined`. Leave the existing
  `preprocessPackage?: (ctx) => PreprocessContext` field untouched for now (a legacy
  1-arg `=> PreprocessContext` stays assignable to `Patch`).

Risk: adding `kind:"entry"` widens `PreprocessContext`, so a typed consumer doing an
exhaustive `switch (ctx.kind)` would now get a missing-case warning — intended, and
harmless at runtime since no entry context is produced yet.

#### P0.3 — CM-level exclusion + patch runtime + report

Target design: §1.1 (entry drop), §1.2 (`composePatches`), §1.3 (`excludeCanonical`),
§1.4 (report). This makes the P0.2 types *live* and is what lets exclusion physically
happen inside CM. File-level change list (CM repo):

- **`src/types/core.ts`** — add `patches?: Patch[]` to `Config`; keep `preprocessPackage`
  but mark it `@deprecated` (JSDoc only, no runtime warning yet) pointing to `patches`.
- **`src/manager/canonical.ts`** — build the effective callback
  `composePatches(...(patches ?? []), ...(preprocessPackage ? [preprocessPackage] : []))`;
  own a report sink; implement `manager.report()` returning the accumulated
  `CanonicalManagerReport`. CM also records index-recovery (P0.1) and the deprecation
  (P0.1) into the sink directly.
- **Run the composed callback at all three phases**, threading the sink as the 2nd arg:
  - `package` (loadPackage, `scanner/package.ts:103`) — existing point
  - `resource` (`read()`, `manager/canonical.ts:390`) — existing point
  - **`entry`** (new) — in `processIndex` **and** `scanDirectoryForResources`, both
    `packageIndex` modes; honor `null` ⇒ skip adding to `cache.entries` (drop honored
    only here; a `null` at the resource phase is ignored + warned). The entry phase is
    on the index-build hot path (thousands of entries for core packages), so **skip the
    invocation entirely when no patches are configured** — non-users pay nothing.
- **Ordering vs recover (P0.1):** run the entry hook **once, on the committed entry
  set**, *after* the use/recover/regenerate decision picks index-vs-scan — not during a
  discarded `processIndex` attempt. With P0.1's "collect then commit" refactor this falls
  out naturally (decide source → final entries → entry hook → commit), avoiding
  double-invocation and double report entries.
- **`src/patches/index.ts`** (new, exported from `src/index.ts`) — ship `composePatches`
  and the `excludeCanonical` helper (the one helper that needs entry + `null`). The
  transform helpers stay in codegen for now (Phase 1) and pass via `patches`.
- **Tests** — exclusion in both index modes across `search`/`resolve`/`resolveEntry`/
  `searchEntries`/`smartSearch`; `composePatches` order + `null` short-circuit;
  `report()` entries with reasons; BC (legacy `preprocessPackage` still works, 1-arg
  assignable to `Patch`).

P0.3 depends on P0.2 (types) and is independent of P0.1. **Together, P0.1–P0.3
complete the CM foundation: a single CM release after Phase 0 unblocks all remaining
codegen work** — including real CM-level exclusion — with no second CM release.

#### P0.4 — Update CM documentation (before the release)

The Phase-0 changes are user-facing CM API, so update the CM repo's docs as the last
commit before tagging the release:

- **`README.md`** (and any `docs/`) — document the `packageIndex` modes (with the
  `ignorePackageIndex` deprecation + the both-set error), the `patches` config, the
  `Patch`/`PreprocessContext` (incl. `entry`) types, `composePatches`, the shipped
  `excludeCanonical` helper, and `manager.report()`.
- **CHANGELOG / release notes** — additive features + the `ignorePackageIndex`
  deprecation and its removal plan (Phase 3).
- **JSDoc** on the new `Config` fields and exported helpers, so editor hovers match.

Keep examples in the docs minimal and runnable; the fuller patch-helper guide lives on
the codegen side (P2.3).

### Phase 1 — Build & debug helpers in codegen (on CM's patch runtime)

The CM patch runtime + `excludeCanonical` shipped in P0.3, so codegen passes its
patches via CM's `patches` config directly (no `preprocessPackage` adapter). Helpers
are codegen-side **factory functions** in a new module (`src/api/patches/`) — debugged
against CM's real runtime, one helper per commit, migrating the relevant example each
time. (Relocating these factories into CM for sharing is optional; see Phase 2.)

- **P1.0 Scaffolding.** `PackageMatch` + `matchPackage` and the codegen helper module;
  thread `patches?: Patch[]` through the `APIBuilder` constructor (`builder.ts:170`) →
  CM config (`builder.ts:216`). `Patch`/`composePatches`/report types are imported from
  CM (P0.2/P0.3). No example change yet.
  - **Limitation:** `patches` apply only when codegen *constructs* the CM. If a caller
    passes their own `manager` (or a prebuilt `register`) to `APIBuilder`, they own
    patch wiring — document this, and warn if `patches` is set alongside an injected
    `manager`/`register`.
- **P1.1 `injectDependency`** → migrate `kbv-r4` and `norge-r4` dependency-injection blocks.
  Before (`kbv-r4/generate.ts:4-25`): ~20 lines. After:
  `injectDependency((n) => n === "de.basisprofil.r4", { "hl7.fhir.r4.core": "4.0.1" })`.
  Norge reuses its `needsCoreDependency` predicate verbatim.
- **P1.2 `renamePackage`** → migrate `norge-r4` `packageNameFixes`.
- **P1.3 `renameCanonical` + `renameReferenceTarget`** → migrate `ccda` IVL_TS→IVL-TS and
  `norge` gd-RelatedPerson Person→Patient widening.
- **P1.4 `swapBinding`** → migrate `ccda` CarePlanAct ValueSet swap.
- **P1.5 `patchCodeSystem`** → migrate `ccda` bundle-type missing codes.
- **P1.6 `whenPackage` / `forResource` combinators** → refactor the `ccda` chain into the
  grouped form (Target design §1.3 Chaining).
- **P1.7 Report in `prettyReport`.** Capture `manager.report()` after
  `registerFromManager` (`builder.ts:463`; guard prebuilt-register path), extend
  `GenerationReport` (`builder.ts:50`) with `inputReport?`, and render an "Input fixes"
  section in `prettyReport` (`builder.ts:77`). (Until P2.1 migrates skip-hack, exclusion
  reasons still come from skip-hack's own warns; transform-patch reasons come from
  `manager.report()`.)

After Phase 1 the three example `preprocessPackage` functions are gone, replaced by
declarative helper lists passed via CM `patches`, and confirmed byte-identical. **No
new CM release — Phase 1 runs entirely on the Phase-0 CM release.**

### Phase 2 — Migrate skip-hack (+ optional helper promotion)

The CM exclusion runtime already shipped in **P0.3**, so this phase is codegen-side and
needs no further CM release. It's the risky step — gate on snapshots.

- **P2.1 skip-hack → CM exclusion (the risky step).**
  1. Turn `skipList` (`skip-hack.ts:6-23`) into codegen-owned exclude **data** — the
     source of truth for both (a) `excludeCanonical` patches handed to CM and (b) the
     field-level drop gate. Ship it as the default patch set, overridable per #128 req 1.
  2. Rewire the field-level reaction (`transformer.ts:46-57`): drop the field **iff
     `fcurl` is in the exclude set** (warn `#skipCanonical`); leave every *other*
     unresolvable type on the existing resolve/error path — do **not** treat
     "resolution failed" as "drop" (see §Boundary; avoids silently swallowing typos /
     missing deps). The schema-level call (`index.ts:115`) is deleted since CM exclusion
     already removes those schemas from the register.
  3. R5 lists: `R5_ONLY_TYPES` (type *names*, drives the hint) and the skip-hack
     *canonical URLs* (drive SD exclusion) are **different granularities** — verify
     before merging. Likely outcome: keep them distinct but derive the hint's pointer
     from the new exclude mechanism rather than naming `skip-hack.ts`. Don't force a
     single list if they don't actually unify.
  4. Delete `src/typeschema/skip-hack.ts`, re-exports (`typeschema/index.ts:17,22`),
     and calls in `transformer.ts:9,51` and `index.ts:115`.
  5. Migrate `test/unit/typeschema/skip-hack.test.ts`; add a codegen field-drop test
     **and** a negative test: a non-excluded unresolvable type still errors (guards #2).
  6. Replace `ignorePackageIndex: true` in `kbv-r4/generate.ts:33` with `packageIndex: "recover"`.

  Gate the whole step on **unchanged example snapshots** (US Core, CCDA, Norge, KBV).
- **P2.2 (optional) Promote helper factories to CM.** Move the codegen transform-helper
  factories + combinators from `src/api/patches/` into CM `src/patches/` for sharing,
  then have codegen re-export them. Pure code relocation — the runtime already lives in
  CM (P0.3). Needs a CM release; skip if not worth it.
- **P2.3 Docs.** Update `examples/README.md`; add `docs/guides/package-patches.md`
  covering the helper API, `packageIndex` modes, the report, and extend/disable of the
  default skip set.

### Phase 3 — Follow-up (after everything above is merged)

Open a tracking issue to **remove the deprecated API**:
- `ignorePackageIndex` (CM) — replaced by `packageIndex`.
- `preprocessPackage` callback (CM) — subsumed by `patches` (a single patch), deprecated
  since P0.3; remove here (and add a runtime deprecation warning one release before
  removal, once downstreams have migrated).
- Any codegen-side compatibility shims kept during Phase 2.

Bump CM to a version that drops the aliases, then update codegen. Do **not** create the
issue until the deprecating release has shipped and downstreams have had a migration window.

---

## Risks & open decisions

- **One CM release unblocks all codegen work**: Phase 0 (P0.1–P0.3) completes the CM
  foundation — `packageIndex`, the patch/report types, and the live exclusion + patch
  runtime. After it ships, Phases 1–2 are codegen-side and need no further CM release
  (the optional P2.2 helper-factory relocation aside).
- **Helper logic is still debugged before it matters**: transform helpers are codegen
  factory functions run against CM's real `patches` runtime in Phase 1, migrating one
  example at a time, before the risky skip-hack step.
- **Release coordination**: pin the exact Phase-0 CM version; develop it via local link.
- **Backward compatibility**: `preprocessPackage` stays (deprecated alias for a single
  patch, composes with `patches`); `patches` and `kind:"entry"` are additive. Existing
  CM consumers see no behavior change.
- **P2.1 (skip-hack) is the riskiest**: it changes control flow (throw → graceful drop).
  The field-level skip and the unresolved-type error path interact; gate on snapshots.
- **Decided: `packageIndex` mode** — field `packageIndex`, values `"use"/"recover"/"regenerate"`,
  default `"use"` (strict BC; `"recover"` opt-in, warns on heal). `ignorePackageIndex`
  kept as a deprecated translating alias (warns), but providing both throws; the alias
  is scheduled for removal in a later release.
- **Decided: default exclusions are codegen-owned data** — they must be (the field-level
  drop gates on membership, §Boundary), and the canonical is valid FHIR (an R4-generation
  concern). Codegen builds `excludeCanonical` patches from that data and hands them to CM.
- **Decided: exclusion mechanism** — `kind:"entry"` returning `null` at index build
  (one mental model), honored in both index paths.
- **Open: APIBuilder default-patch ergonomics** — array spread vs. a `.patches()`
  builder method with extend/replace/disable. Settle in P1.0 (the `patches` entry point).
  **Constraint:** patch composition is *append-only and cannot un-exclude* (once CM drops
  a canonical, no later patch resurrects it). So "disable/override a *default exclusion*"
  (#128 req 1) must be a **data-level** op on the default exclude set (remove/replace by
  URL) — `extend`/`disable` on data, not just appending patches. This is a second reason
  (besides the field-level drop gate) the default exclude set is codegen-owned data.
