# Writer Sections

Status: Proof of concept. Core in `src/api/writer-generator/section-writer.ts`, tests in `test/unit/api/writer-generator/section-writer.test.ts`. No generator uses it yet.

Motivation: [#256](https://github.com/atomic-ehr/codegen/pull/256) removes unused imports from TypeScript profile modules by recomputing, ahead of emission, the conditions under which each helper and type will be written. That logic duplicates every emitter's conditions and has to be kept in sync with them by hand; Python has the same shape in `collectHelperImports` and `emitModuleImports`.

## Goal

A generated file declares exactly what it uses — no unused imports or helpers, no missing ones — without a separate "what does this file need" pass. The writer observes the code as it is emitted, and the mechanism is the same for every target language.

## Model

A file contains **sections**: places reserved in its text whose content is decided once the whole file is generated. A section collects:

- **definitions** (`def`): file-local symbols written by the generator, emitted only when something uses them;
- **usages** (`use`): references to a symbol. A usage without a definition in the file is passed to the section as is — for an import section that is the normal case;
- a **renderer** that turns the used definitions and the usages into code.

Exported symbols are not managed: they are the file's contract with its consumers, so the generator writes them directly and they are always present.

## API

```ts
type Import = { module: string; name: string };
type ConstDef = { type: string; value: string };

const imports = this.section<never, Import>({
    name: (i) => i.name,
    render: (_definitions, usages) => { /* import lines from u.key.module, u.key.name, u.local */ },
});
const consts = this.section<ConstDef, string>({
    name: (name) => name,
    defRender: (name, def) => this.lineSM(`const ${name}: ${def.type} = ${def.value}`),
});

consts.def("a", { type: "string", value: `"foo"` });
this.lineSM(`export const x = ${imports.use({ module: "node:path", name: "join" })}(${consts.use("a")})`);
```

- `section<D, S>(spec)` places a section at the current position and returns a typed handle. Both type arguments are always given.
  - `D` is the user's definition type. `never` means the section has no definitions: `def` does not compile and `defRender` is not allowed. Otherwise the spec must provide `defRender`.
  - `S` is the key that identifies a symbol, shared by `def` and `use`, and chosen by the section: a string, a record such as `{ module, name }`, or a FHIR type identifier. Two keys are the same symbol when they are equal as JSON (object fields compared in sorted order). The spec's `name(key)` gives a symbol's preferred local name.
- `handle.def(key, value)` records a definition. The section's `defRender(name, value)` runs immediately and writes the declaration; what it writes is captured as the definition's code, and every `use()` inside it is recorded as a dependency. `name` is the definition's own local name.
- `handle.use(key)` returns a short marker string, `NUL:<section>:<symbol>NUL`, that fits into any Writer call or template string. The key is kept in the section's symbol table, numbered on first sight, so the same key always gives the same marker; it is resolved to the symbol's final local name when the sections are rendered.

Spec fields:

| Field | Purpose | Default |
|---|---|---|
| `name(key)` | a symbol's preferred local name; a clash gets a `_N` suffix | required |
| `defRender(name, value)` | writes one definition's code | required when the section has definitions |
| `render(definitions, usages)` | writes the whole section | writes the used definitions' code |

`render` receives `definitions` — the used ones in dependency order, as `{ key, local, code, value }` — and `usages`, every distinct usage as `{ key, local }`. Policies such as "every usage must be defined" belong to the section's `render`, not to the core.

## How it works

**Capture.** `SectionWriter` overrides `write()`, so it sees every token written through `line`, `lineSM`, `curlyBlock` and friends. The file being generated is a draft whose current output is a buffer — the file body, or, while `defRender` or a section's `render` runs, that definition's or section's own buffer. `write()` splits each string into plain text and symbol references, and `section()` adds a section slot — the place its rendered output goes — so a buffer is a list of typed tokens, and its usages are the references in it. A usage is recorded when its marker is written, not when `use()` is called, so a marker that is never written adds nothing.

**Rendering sections.** When the `cat` body returns, while the file is still open:

1. **Bottom-up.** Sections render from the last placed to the first; a section's entries are final once every section below it has rendered.
2. **Reachability.** Before a section renders, the writer walks from the body's usages and from what lower sections rendered, through definitions' dependencies. Unreachable definitions are dropped.
3. **Naming.** Names are shared by the whole file. Within a section, its definitions take their preferred names first, then its other usages; lower sections have already chosen theirs. A clash gets a `_1`, `_2`, … suffix.
4. **Order.** Within a section a definition follows the definitions it depends on; definition order breaks ties, and a cycle throws.
5. **Render.** The renderer writes through the regular Writer API. Usages it creates become roots for the sections above it. A rendered section is closed: using it or defining into it throws.
6. **Assemble and write.** The body's tokens are joined: text as is, each symbol reference as its local name, each section slot as that section's rendered tokens; the file is written once.

## Guarantees

- An import or helper exists only because code written into the file uses it.
- A definition is emitted only when reachable from the file body.
- Raw markers never reach the output, and there is no separate step to forget.
- Misuse fails at compile time where types allow it — wrong key shape, `def` on a usage-only section, wrong definition type — and loudly at run time otherwise: a handle used in another file, a section used after it rendered, a key defined twice.

## Known limits

- Names written directly (exports, generator-spelled locals) are invisible to the writer, so a managed name can clash with them. A way to reserve names is the planned fix.
- Order across sections is not checked: a definition depending on one in a later section can come out in the wrong order.
- `defRender` output is captured at indent 0, which is right at file level only.
- Markers are opaque until the sections are rendered: code that measures strings (line-width checks, `.length`) sees the marker, not the final name.
- A section's position decides naming priority, so moving sections can change which symbol is aliased.

## Next steps

1. Reserve names written directly into the file.
2. Move TypeScript profile modules onto an import section and a helper section, replacing the import derivation from #256.
3. The same for Python profile modules (`collectHelperImports`, `emitModuleImports`).
4. Type modules (`generateDependenciesImports`).
