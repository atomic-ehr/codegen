# Writer Sections

Status: Proof of concept. The [implementation](../../src/api/writer-generator/section-writer.ts) and [tests](../../test/unit/api/writer-generator/section-writer.test.ts) exist, but no language generator uses it yet.

## Problem and goal

Generators currently decide which imports and helpers to emit separately from the code that uses them. For example, [#256](https://github.com/atomic-ehr/codegen/pull/256) computes the imports needed by TypeScript profile modules ahead of emission. Python has similar logic in `collectHelperImports` and `emitModuleImports`. These collectors repeat conditions from the emitters and must stay in sync with them.

`SectionWriter` moves dependency discovery into the writer. A generator registers definitions and writes references to them; the writer finds reachable definitions, assigns local names, and emits sections at their reserved positions. The mechanism works with the existing `Writer` methods and does not depend on a target language.

## Model

A **section** reserves a position in one file. It contains symbols identified by keys chosen by the generator: strings, records such as `{ module, name }`, or FHIR type identifiers.

A symbol can have a **definition**, registered with `def(key, value)`. The value is the generator's data for that declaration. A symbol without a definition can still be used: an import section normally contains only such symbols.

`use(key)` returns a marker string. Writing that marker through `write`, `line`, `lineSM`, or another `Writer` method creates a reference. Calling `use()` without writing its result does not make the symbol reachable.

All placed sections are registered while the file body is generated, even if they remain unused. Reachability filters their symbols, not the list of sections. Every section's renderer runs, including empty sections with `render([], [])`.

Exports and other declarations written directly into the body are always present. They are not managed definitions, but references in their text make managed symbols reachable.

## API

```ts
export type Definition<Def, Sym> = { key: Sym; local: string; value: Def };
export type Usage<Sym> = { key: Sym; local: string };
export type SectionRender<Def, Sym> = (
    definitions: Definition<Def, Sym>[],
    usages: Usage<Sym>[],
) => void;

export type SectionConfig<Def, Sym> = {
    name: (key: Sym) => string;
    render?: SectionRender<Def, Sym>;
    defRender?: (name: string, value: Def) => void;
};

export type SectionHandle<Def, Sym> = {
    def: (key: Sym, value: Def) => void;
    use: (key: Sym) => string;
};
```

`section<Def, Sym>(config)` places a section and returns its handle. `Def` describes definition values; `Sym` describes keys accepted by both `def` and `use`. Use `never` for `Def` when the section has no definitions. The handle then rejects calls to `def` at compile time.

| Configuration field | Purpose | Default |
|---|---|---|
| `name(key)` | Returns the preferred local name of a symbol | Required |
| `defRender(name, value)` | Writes a declaration through the writer | Absent; calling `def` throws |
| `render(definitions, usages)` | Writes the section using its reachable entries | Calls `defRender` for each definition |

### Registering definitions

`def(key, value)` stores the value without invoking `defRender`. Defining the same key twice throws. `defRender` must be provided even when the section has a custom `render` callback, because the writer uses it to discover definition dependencies.

Definition values can be `undefined`, `null`, `false`, `0`, or an empty string. Internally, the presence of the `definition` property distinguishes a definition from a usage-only symbol; its truthiness does not.

### Rendering callbacks

For each reachable definition, the writer first invokes `defRender` to discover dependencies. It passes a marker as the definition's name, captures the written text, scans its references, and discards the text. Unreachable definitions never invoke `defRender`.

The default section renderer invokes `defRender` a second time to emit each declaration, now using its final local name. Discovery runs at indent 0; emission uses the current indent. A renderer should write code without external side effects and produce the same dependencies in both passes. Its behavior must not depend on whether `name` is a marker or the final name.

A custom `render` replaces default emission. It receives reachable definitions in dependency order as `{ key, local, value }`, and all reachable symbols of that section as `{ key, local }`. `usages` includes symbols with definitions as well as usage-only symbols. No stored source code is passed to the renderer: it writes declarations from the values it receives. Rules such as "every usage must have a definition" belong in this callback.

While a section renders, its callback can use sections placed above it. Those sections render later and can include the newly discovered references. A section that has finished rendering is closed; calling its handle's `use` or `def` throws, even if its output was empty.

## Example

Inside a `SectionWriter` subclass, with the output directory selected through `cd`:

```ts
type Import = { module: string; name: string };
type ConstDef = { type: string; value: string };

this.cat("main.ts", () => {
    const imports = this.section<never, Import>({
        name: (key) => key.name,
        render: (_definitions, usages) => {
            for (const { key, local } of usages) {
                const imported = local === key.name ? local : `${key.name} as ${local}`;
                this.lineSM(`import { ${imported} } from ${JSON.stringify(key.module)}`);
            }
        },
    });
    const consts = this.section<ConstDef, string>({
        name: (key) => key,
        defRender: (name, value) => this.lineSM(`const ${name}: ${value.type} = ${value.value}`),
    });

    consts.def("b", { type: "string", value: `${consts.use("a")} + "/bar"` });
    consts.def("a", { type: "string", value: '"/foo"' });
    consts.def("unused", { type: "number", value: "0" });

    const join = imports.use({ module: "node:path", name: "join" });
    this.lineSM(`export const path = ${join}(${consts.use("a")}, ${consts.use("b")})`);
});
```

Output:

```ts
import { join } from "node:path";
const a: string = "/foo";
const b: string = a + "/bar";
export const path = join(a, b);
```

The export makes `a`, `b`, and `join` reachable. The writer emits `a` before `b`, omits `unused`, and puts the import at the position reserved for the import section. The default renderer never runs `defRender` for `unused`.

## File lifecycle

`cat()` creates a draft for the current file and clears it in `finally`. Section handles belong to that draft and cannot be reused in another file. Nested `cat()` calls are rejected.

1. **Collect the body.** `write()` appends strings to the draft's active buffer and validates symbol markers. `section()` registers a section and writes its placeholder. `def()` stores a value, and `use()` registers a symbol and returns its marker.
2. **Discover dependencies.** Scan the body for references. For each newly reachable definition, capture `defRender` output and recursively follow its references. Keep dependency lists for ordering, but discard the captured declaration text. A definition's own name or self-reference is not an ordering dependency.
3. **Render sections bottom-up.** For each section, choose names for its reachable symbols, order its definitions, and capture its renderer's output. References in that output become roots for dependency discovery before the next section renders.
4. **Assemble the file.** Replace section placeholders with their captured output, then replace symbol markers with final names. Pass the assembled text to the base writer in one `write()` call.

### Naming and ordering

Names share one namespace per file. Sections placed lower in the file choose their names first. Within a section, definitions choose names before usage-only symbols; each group is sorted by key. If a preferred name is taken, the writer tries `_1`, `_2`, and so on.

Definition emission follows dependency order within the same section. First-seen symbol order breaks ties: a symbol first encountered through `use` can precede one registered earlier through `def`. Self-references are allowed; cycles between distinct reachable definitions throw. Unreachable cycles are not examined.

These are separate orders: names and the `usages` array use sorted keys, while the `definitions` array follows dependencies and first-seen order.

## Internal representation

The draft stores the file's `body`, the active output buffer `out`, and all placed `sections`. Both buffers contain strings. `capture()` temporarily changes `out`, restores it and the previous indent in `finally`, and returns the captured text. There is no separate token graph.

Each section keeps symbols in first-seen order and a key lookup for deduplication. Each symbol stores its owner section, its number within that section, its key, an optional definition value, and its assigned local name. The owner supplies the naming callback and the section identity used in markers. Membership checks validate file ownership and identify dependencies within the same section.

The public configuration and handle preserve each section's `Def` and `Sym` types. The internal section list contains sections with different type arguments, so its callbacks and values use `unknown`.

The marker formats are implementation details:

| Marker | Meaning |
|---|---|
| `NUL:<section>NUL` | Position reserved for a section |
| `NUL:<section>:<symbol>NUL` | Reference to a symbol |

Section and symbol numbers identify positions in their arrays. Markers remain strings until final assembly, which lets them travel through template strings and the existing writer methods.

## Errors and limits

- Writing, placing sections, or using handles requires an open draft. Sections can only be placed while writing the file body, not inside a captured definition or section renderer.
- Wrong key or definition types are rejected by the typed handle. Duplicate definitions, definitions without `defRender`, handles from another file, and calls to a rendered section fail at runtime.
- Keys are compared as JSON with object fields sorted recursively. Use JSON-serializable keys and keep them unchanged after registration.
- Names written directly into the body are invisible to managed naming and can collide with managed symbols. A name-reservation API is still needed.
- Dependency ordering applies within a section. Dependencies across sections are not reordered; place imports and shared helpers above sections that use them.
- Discovery assumes that definition data and callback dependency choices stay stable until emission. Custom renderers should emit code consistent with `defRender`: dependencies found during discovery remain reachable even if the custom renderer omits their references.
- String measurements see markers until assembly, not final names. Moving sections can also change which symbol receives an alias.

## Next steps

1. Add a way to reserve names written directly into the body.
2. Move TypeScript profile modules onto import and helper sections, replacing the separate import collector.
3. Apply the same approach to Python profile modules.
4. Adopt sections for type modules and `generateDependenciesImports`.
