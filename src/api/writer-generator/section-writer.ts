import * as Path from "node:path";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";

// Writer that resolves each file before writing it: imports and file-local
// definitions are emitted only when the code written into the file uses them.
//
// `section(spec)` reserves a place in the file and returns a typed handle:
//   - `handle.def(key, value)`: file-local definition; the section's
//     `defRender(name, value)` writes its code right away, `name` being its
//     local name;
//   - `handle.use(key)`: a marker string that drops into any Writer call and
//     is resolved to the local name when the sections are rendered.
// When the `cat` body returns, sections render bottom-up with only what is
// used, markers are resolved, and the file is written once.
//
// Design: docs/design/writer-sections.md

/** Identifies a symbol in a section; `name` is the preferred local name. A string is shorthand for `{ name }`. */
export type NamedKey = { name: string } & Record<string, string>;
/** Tuple form, e.g. `[module, name]`; the last element is the preferred local name. */
export type TupleKey = readonly [string, ...string[]];
export type Key = NamedKey | TupleKey;
export type Usage<K extends Key = Key> = K & { local: string };
/** A used definition: its key, local name, the code `defRender` wrote for it, and the user's value. */
export type Definition<K extends Key = Key, D = unknown> = K & { local: string; code: string; value: D };
export type Render<K extends Key = Key, D = never> = (definitions: Definition<K, D>[], usages: Usage<K>[]) => void;

/** A key, or its `name` alone when the key has no other fields. */
export type KeyArg<K extends Key> = K | ({ name: string } extends K ? string : never);

/** Typed access to a placed section; `def` and `use` take the same key type `K`. */
export type SectionHandle<K extends Key, D> = {
    /** File-local definition; `value` is the user's definition (`D = never`: the section has none). */
    def: (key: KeyArg<K>, value: D) => void;
    use: (key: KeyArg<K>) => string;
};

/** `defRender` is required exactly when the section has definitions (`D` is not `never`). */
export type SectionSpec<K extends Key, D> = SectionHooks<K, D> &
    ([D] extends [never]
        ? { defRender?: undefined }
        : {
              /** Writes one definition's code with the regular Writer API; `name` is its local name. */
              defRender: (name: string, value: D) => void;
          });

type SectionHooks<K extends Key, D> = {
    /** Default: write the used definitions' code. */
    render?: Render<K, D>;
    /** Hook around `def`; call `record` to store the definition. */
    onDef?: (key: KeyArg<K>, value: D, record: SectionHandle<K, D>["def"]) => void;
    /** Hook around `use`; call `record` to store the usage and return its marker. */
    onUse?: (key: KeyArg<K>, record: SectionHandle<K, D>["use"]) => string;
};

type Ref = { section: string; id: string };
type Def = Ref & { key: Key; value: unknown; tokens: string[]; deps: Ref[] };
type DraftSection = {
    defRender?: (name: string, value: any) => void;
    render: Render<any, any>;
    keys: Record<string, Key>;
    defs: Record<string, Def>;
    rendered: boolean;
};
/** The file being generated: buffered until its sections are rendered. */
type Draft = {
    /** Output-relative path, for error messages. */
    path: string;
    tokens: string[];
    uses: Ref[];
    sections: Record<string, DraftSection>;
    /** Section ids in placement order. */
    order: string[];
};

const MARK = "\u0000";
const markerRe = new RegExp(`${MARK}(ref|slot):([^:${MARK}]*):?([^${MARK}]*)${MARK}`, "g");
const refKey = (r: Ref) => `${r.section}:${r.id}`;
/** A lookup the writer's own bookkeeping guarantees; a miss is an internal error. */
const must = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`Internal section error: ${what}`);
    return value;
};
const isTuple = (key: Key): key is TupleKey => Array.isArray(key);
const toKey = (key: string | Key): Key => (typeof key === "string" ? { name: key } : key);
const nameOf = (key: Key): string => (isTuple(key) ? must(key.at(-1), "empty tuple key") : key.name);
const idOf = (key: Key) =>
    JSON.stringify(isTuple(key) ? key : Object.entries(key).sort(([a], [b]) => a.localeCompare(b)));
/** The key's own fields plus `extra`; a tuple stays a tuple. */
const withFields = <E extends object>(key: Key, extra: E) =>
    isTuple(key) ? Object.assign([...key], extra) : { ...key, ...extra };

export abstract class SectionWriter<T extends WriterOptions = WriterOptions> extends Writer<T> {
    private draft?: Draft;
    /** Where writes go while a definition or a section is being generated; `self` is the definition being written. */
    private capture?: { tokens: string[]; deps: Ref[]; self?: Ref };

    /** The body is buffered; when it returns, the sections are rendered and the file is written once. */
    override cat(fn: string, gen: () => void) {
        if (!this.currentDir) throw new Error("Should be in a directory (`cd`)");
        const relPath = Path.normalize(`${this.currentDir}/${fn}`);
        const draft: Draft = {
            path: Path.relative(this.opts.outputDir, relPath),
            tokens: [],
            uses: [],
            sections: {},
            order: [],
        };
        this.draft = draft;
        try {
            super.cat(fn, () => {
                gen();
                super.write(this.renderSections(draft));
            });
        } finally {
            this.draft = undefined;
        }
    }

    override write(str: string) {
        const draft = this.openDraft();
        const sink = this.capture?.deps ?? draft.uses;
        const self = this.capture?.self;
        for (const [, kind, section = "", id = ""] of str.matchAll(markerRe))
            if (kind === "ref" && !(self && self.section === section && self.id === id)) sink.push({ section, id });
        (this.capture?.tokens ?? draft.tokens).push(str);
    }

    /** Place a section here; `render` writes its definitions and usages when the sections are rendered. */
    section<K extends Key = Key, D = never>(spec: SectionSpec<K, D>): SectionHandle<K, D> {
        const draft = this.openDraft();
        if (this.capture) throw new Error("A section must be placed at file level");
        const id = String(draft.order.length);
        const render: Render<K, D> =
            spec.render ??
            ((definitions) => {
                for (const d of definitions) this.write(d.code);
            });
        draft.sections[id] = { defRender: spec.defRender, render, keys: {}, defs: {}, rendered: false };
        draft.order.push(id);
        this.write(`${MARK}slot:${id}${MARK}`);
        const recordDef: SectionHandle<K, D>["def"] = (key, value) => this.defIn(id, key as string | Key, value);
        const recordUse: SectionHandle<K, D>["use"] = (key) => this.useIn(id, key as string | Key);
        const { onDef, onUse } = spec;
        return {
            def: onDef ? (key, value) => onDef(key, value, recordDef) : recordDef,
            use: onUse ? (key) => onUse(key, recordUse) : recordUse,
        };
    }

    private defIn(sectionId: string, key: string | Key, value: unknown): void {
        const section = this.draftSection(sectionId);
        const defRender = must(section.defRender, `section #${sectionId} has no defRender`);
        const k = toKey(key);
        const id = idOf(k);
        if (section.defs[id])
            throw new Error(`${this.openDraft().path}: '${nameOf(k)}' defined twice in section #${sectionId}`);
        const def: Def = { section: sectionId, id, key: k, value, tokens: [], deps: [] };
        section.defs[id] = def;
        section.keys[id] = k;
        const [prevCapture, prevIndent] = [this.capture, this.currentIndent];
        this.capture = { tokens: def.tokens, deps: def.deps, self: { section: sectionId, id } };
        this.currentIndent = 0;
        try {
            defRender(this.useIn(sectionId, k), value);
        } finally {
            this.capture = prevCapture;
            this.currentIndent = prevIndent;
        }
    }

    private useIn(sectionId: string, key: string | Key): string {
        const k = toKey(key);
        const id = idOf(k);
        this.draftSection(sectionId).keys[id] = k;
        return `${MARK}ref:${sectionId}:${id}${MARK}`;
    }

    private openDraft(): Draft {
        if (!this.draft) throw new Error("No file open");
        return this.draft;
    }

    private draftSection(id: string): DraftSection {
        const draft = this.openDraft();
        const section = draft.sections[id];
        if (!section) throw new Error(`${draft.path}: section #${id} belongs to another file`);
        if (section.rendered)
            throw new Error(
                `${draft.path}: section #${id} is already rendered; only sections above it can still be used`,
            );
        return section;
    }

    /** Renders every section with what the file uses and returns the final text, markers replaced by names.
     *  Bottom-up: a section's entries are final once every section below it has rendered.
     */
    private renderSections(draft: Draft): string {
        const sectionOf = (id: string) => must(draft.sections[id], `section #${id}`);
        const defOf = (r: Ref) => sectionOf(r.section).defs[r.id];
        const keyOf = (r: Ref) => must(sectionOf(r.section).keys[r.id], `key ${r.id}`);
        const nameFor = (r: Ref) => must(localName[refKey(r)], `name for ${r.id}`);
        const roots: Ref[] = [...draft.uses];
        const localName: Record<string, string> = {};
        const taken = new Set<string>();
        const slots: Record<string, string> = {};

        for (const sectionId of [...draft.order].reverse()) {
            const section = sectionOf(sectionId);

            const used: Record<string, Ref> = {};
            const stack = [...roots];
            for (let ref = stack.pop(); ref; ref = stack.pop()) {
                if (used[refKey(ref)]) continue;
                used[refKey(ref)] = ref;
                stack.push(...(defOf(ref)?.deps ?? []));
            }
            const refs = Object.values(used)
                .filter((r) => r.section === sectionId)
                .sort((a, b) => refKey(a).localeCompare(refKey(b)));

            const assign = (ref: Ref) => {
                const preferred = nameOf(keyOf(ref));
                let name = preferred;
                for (let i = 1; taken.has(name); i++) name = `${preferred}_${i}`;
                taken.add(name);
                localName[refKey(ref)] = name;
            };
            for (const ref of refs) if (defOf(ref)) assign(ref);
            for (const ref of refs) if (!defOf(ref)) assign(ref);

            const ordered: Def[] = [];
            const state: Record<string, "visiting" | "done"> = {};
            const visit = (def: Def) => {
                if (state[def.id] === "done") return;
                if (state[def.id] === "visiting") throw new Error(`${draft.path}: cycle through '${nameOf(def.key)}'`);
                state[def.id] = "visiting";
                for (const dep of def.deps)
                    if (dep.section === sectionId) visit(must(section.defs[dep.id], `definition ${dep.id}`));
                state[def.id] = "done";
                ordered.push(def);
            };
            for (const def of Object.values(section.defs)) if (used[refKey(def)]) visit(def);

            const definitions = ordered.map((d) =>
                withFields(d.key, { local: nameFor(d), code: d.tokens.join(""), value: d.value }),
            );
            const usages = refs.map((r) => withFields(keyOf(r), { local: nameFor(r) }));
            // Rendered into its own buffer; its usages of sections above become roots for them.
            const prev = this.capture;
            const out = { tokens: [] as string[], deps: [] as Ref[] };
            this.capture = out;
            try {
                section.render(definitions, usages);
            } finally {
                this.capture = prev;
            }
            section.rendered = true;
            slots[sectionId] = out.tokens.join("");
            roots.push(...out.deps);
        }

        const resolve = (s: string): string =>
            s.replace(markerRe, (_, kind: string, section: string, id: string) =>
                kind === "slot" ? resolve(slots[section] ?? "") : nameFor({ section, id }),
            );
        return resolve(draft.tokens.join(""));
    }
}
