import * as Path from "node:path";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";

// Writer that resolves each file before writing it: imports and file-local
// definitions are emitted only when the code written into the file uses them.
//
// `section(spec)` reserves a place in the file and returns a typed handle.
// Keys are whatever the section chooses (a string, a record, a FHIR identifier),
// and the spec's `name(key)` gives a symbol's preferred local name:
//   - `handle.def(key, value)`: file-local definition; the section's
//     `defRender(name, value)` writes its code right away, `name` being its
//     local name;
//   - `handle.use(key)`: a marker string that drops into any Writer call and
//     is resolved to the local name when the sections are rendered.
// When the `cat` body returns, sections render bottom-up with only what is
// used, markers are resolved, and the file is written once.
//
// Design: docs/design/writer-sections.md

/** A used symbol: its key and the local name it got in the file. */
export type Usage<S> = { key: S; local: string };
/** A used definition: its key, local name, the code `defRender` wrote for it, and the user's value. */
export type Definition<D, S> = { key: S; local: string; code: string; value: D };
export type SectionRender<D, S> = (definitions: Definition<D, S>[], usages: Usage<S>[]) => void;

/** Typed access to a placed section. `D`: the user's definition type (`never`: the section has none);
 *  `S`: the key that identifies a symbol, taken by both `def` and `use`. */
export type SectionHandle<D, S> = {
    /** File-local definition; `value` is the user's definition. */
    def: (key: S, value: D) => void;
    use: (key: S) => string;
};

export type SectionSpec<D, S> = {
    /** A symbol's preferred local name; the writer adds a `_N` suffix on a clash. */
    name: (key: S) => string;
    /** Default: write the used definitions' code. */
    render?: SectionRender<D, S>;
    /** Writes one definition's code with the regular Writer API; `name` is its local name.
     *  Needed by a section that has definitions: `def` throws without it. */
    defRender?: (name: string, value: D) => void;
};

/** A symbol of a section: its key, its definition if the file defines it, and its local name once named. */
type SectionSymbol = {
    section: DraftSection;
    /** Index in `section.symbols`; with the section's index it forms the symbol's marker. */
    number: number;
    key: unknown;
    def?: DefRecord;
    local?: string;
};
/** A symbol's definition: the user's value and the code `defRender` wrote for it. */
type DefRecord = { symbol: SectionSymbol; value: unknown; out: Buffer };
/** Where a section's rendered output goes in the file. */
type SectionSlot = { kind: "section-slot"; section: DraftSection };
/** A usage of a section's symbol, replaced by its local name. */
type SymbolRef = { kind: "ref"; symbol: SectionSymbol };
type Token = string | SectionSlot | SymbolRef;
/** Text written so far, with its section slots and symbol references, and what it is written for. */
type Buffer = {
    tokens: Token[];
    /** `"file"`: the file body; a symbol: its definition's code, whose own name is not its dependency;
     *  `"render"`: a section's rendered text. */
    for: "file" | "render" | SectionSymbol;
};
type DraftSection = {
    /** Position in the file; a section's id. */
    index: number;
    name: (key: unknown) => string;
    defRender?: (name: string, value: unknown) => void;
    render: SectionRender<unknown, unknown>;
    /** In first-seen order; a symbol's number is its index. */
    symbols: SectionSymbol[];
    /** Key id → symbol, so the same key is always the same symbol. */
    byKeyId: Record<string, SectionSymbol>;
    /** The rendered tokens; set once the section has rendered. */
    output?: Token[];
};
/** The file being generated: buffered until its sections are rendered. */
type Draft = {
    /** Output-relative path, for error messages. */
    path: string;
    /** Where `write()` goes now: the file body, or a definition's or section's buffer. */
    out: Buffer;
    /** In placement order. */
    sections: DraftSection[];
};

// A symbol reference travels as text only between `use()` and `write()`:
// `NUL:<section>:<symbol>NUL`. `write()` turns it into a `SymbolRef` token.
const MARK = "\u0000";
const markerRe = new RegExp(`${MARK}:(\\d+):(\\d+)${MARK}`, "g");
const marker = (symbol: SectionSymbol) => `${MARK}:${symbol.section.index}:${symbol.number}${MARK}`;
const newBuffer = (target: Buffer["for"]): Buffer => ({ tokens: [], for: target });
/** The symbols a buffer refers to; a definition's own name is not one of them. */
const usesOf = (buffer: Buffer): SectionSymbol[] =>
    buffer.tokens.flatMap((t) =>
        typeof t === "object" && t.kind === "ref" && t.symbol !== buffer.for ? [t.symbol] : [],
    );
/** The buffer as text, references kept as markers so writing it elsewhere keeps them. */
const textOf = (buffer: Buffer): string =>
    buffer.tokens
        .map((t) => {
            if (typeof t === "string") return t;
            if (t.kind === "ref") return marker(t.symbol);
            throw new Error("Internal section error: a section slot outside the file body");
        })
        .join("");
/** A lookup the writer's own bookkeeping guarantees; a miss is an internal error. */
const must = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`Internal section error: ${what}`);
    return value;
};
/** A key's identity: JSON with object fields sorted, so equal keys are the same symbol whatever their field order. */
const keyId = (key: unknown): string =>
    JSON.stringify(key, (_, value) =>
        value && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
            : value,
    );
const nameOf = (symbol: SectionSymbol): string => symbol.section.name(symbol.key);

export abstract class SectionWriter<T extends WriterOptions = WriterOptions> extends Writer<T> {
    private draft?: Draft;

    /** The body is buffered; when it returns, the sections are rendered and the file is written once. */
    override cat(fn: string, gen: () => void) {
        if (!this.currentDir) throw new Error("Should be in a directory (`cd`)");
        const relPath = Path.normalize(`${this.currentDir}/${fn}`);
        const body = newBuffer("file");
        const draft: Draft = { path: Path.relative(this.opts.outputDir, relPath), out: body, sections: [] };
        this.draft = draft;
        try {
            super.cat(fn, () => {
                gen();
                super.write(this.renderSections(draft, body));
            });
        } finally {
            this.draft = undefined;
        }
    }

    /** Splits the text into plain pieces and symbol references. */
    override write(str: string) {
        const draft = this.openDraft();
        const { tokens } = draft.out;
        let last = 0;
        for (const match of str.matchAll(markerRe)) {
            if (match.index > last) tokens.push(str.slice(last, match.index));
            const section = must(draft.sections[Number(match[1])], `section #${match[1]}`);
            tokens.push({ kind: "ref", symbol: must(section.symbols[Number(match[2])], `symbol ${match[0]}`) });
            last = match.index + match[0].length;
        }
        if (last < str.length) tokens.push(str.slice(last));
    }

    /** Place a section here; `render` writes its definitions and usages when the sections are rendered. */
    section<D, S>(spec: SectionSpec<D, S>): SectionHandle<D, S> {
        const draft = this.openDraft();
        if (draft.out.for !== "file") throw new Error("A section must be placed at file level");
        const render: SectionRender<D, S> =
            spec.render ??
            ((definitions) => {
                for (const d of definitions) this.write(d.code);
            });
        const section: DraftSection = {
            index: draft.sections.length,
            name: spec.name as DraftSection["name"],
            defRender: spec.defRender as DraftSection["defRender"],
            render: render as DraftSection["render"],
            symbols: [],
            byKeyId: {},
        };
        draft.sections.push(section);
        draft.out.tokens.push({ kind: "section-slot", section });
        return {
            def: (key, value) => this.define(section, key, value),
            use: (key) => marker(this.symbolOf(section, key)),
        };
    }

    private define(section: DraftSection, key: unknown, value: unknown): void {
        const { defRender } = section;
        if (!defRender) throw new Error(`${this.openDraft().path}: section #${section.index} has no defRender`);
        const symbol = this.symbolOf(section, key);
        if (symbol.def)
            throw new Error(`${this.openDraft().path}: '${nameOf(symbol)}' defined twice in section #${section.index}`);
        const def: DefRecord = { symbol, value, out: newBuffer(symbol) };
        symbol.def = def;
        this.writingTo(def.out, () => defRender(marker(symbol), value), 0);
    }

    /** The key's symbol in the section, created on first sight. */
    private symbolOf(section: DraftSection, key: unknown): SectionSymbol {
        const draft = this.openDraft();
        if (draft.sections[section.index] !== section)
            throw new Error(`${draft.path}: section #${section.index} belongs to another file`);
        if (section.output)
            throw new Error(
                `${draft.path}: section #${section.index} is already rendered; only sections above it can still be used`,
            );
        const id = keyId(key);
        let symbol = section.byKeyId[id];
        if (!symbol) {
            symbol = { section, number: section.symbols.length, key };
            section.symbols.push(symbol);
            section.byKeyId[id] = symbol;
        }
        return symbol;
    }

    /** Run `gen` with writes going to `buffer`, then restore the previous target (and indent). */
    private writingTo(buffer: Buffer, gen: () => void, indent?: number): void {
        const draft = this.openDraft();
        const [prevOut, prevIndent] = [draft.out, this.currentIndent];
        draft.out = buffer;
        if (indent !== undefined) this.currentIndent = indent;
        try {
            gen();
        } finally {
            draft.out = prevOut;
            this.currentIndent = prevIndent;
        }
    }

    private openDraft(): Draft {
        if (!this.draft) throw new Error("No file open");
        return this.draft;
    }

    /** Renders every section with what the file uses and returns the final text, references replaced by names.
     *  Bottom-up: a section's entries are final once every section below it has rendered.
     */
    private renderSections(draft: Draft, body: Buffer): string {
        // Used: reachable from the body, through definitions, and from what rendered sections write.
        const used = new Set<SectionSymbol>();
        const markUsed = (symbol: SectionSymbol): void => {
            if (used.has(symbol)) return;
            used.add(symbol);
            if (symbol.def) for (const dep of usesOf(symbol.def.out)) markUsed(dep);
        };
        for (const symbol of usesOf(body)) markUsed(symbol);
        const taken = new Set<string>();

        for (const section of [...draft.sections].reverse()) {
            // Ordered by key, so names and render order do not depend on the order symbols were first seen.
            const symbols = section.symbols
                .filter((s) => used.has(s))
                .sort((a, b) => keyId(a.key).localeCompare(keyId(b.key)));

            // Naming: this section's definitions first, then its other usages; lower sections already took theirs.
            const assign = (symbol: SectionSymbol) => {
                const preferred = nameOf(symbol);
                let name = preferred;
                for (let i = 1; taken.has(name); i++) name = `${preferred}_${i}`;
                taken.add(name);
                symbol.local = name;
            };
            for (const s of symbols) if (s.def) assign(s);
            for (const s of symbols) if (!s.def) assign(s);

            // Order: a definition follows the definitions of this section it depends on; first-seen order breaks ties.
            const ordered: DefRecord[] = [];
            const done = new Set<DefRecord>();
            const visiting = new Set<DefRecord>();
            const visit = (def: DefRecord) => {
                if (done.has(def)) return;
                if (visiting.has(def)) throw new Error(`${draft.path}: cycle through '${nameOf(def.symbol)}'`);
                visiting.add(def);
                for (const dep of usesOf(def.out)) if (dep.section === section && dep.def) visit(dep.def);
                visiting.delete(def);
                done.add(def);
                ordered.push(def);
            };
            for (const s of section.symbols) if (s.def && used.has(s)) visit(s.def);

            // Render into its own buffer; its usages of sections above become used.
            const local = (s: SectionSymbol) => must(s.local, `name for '${nameOf(s)}'`);
            const definitions = ordered.map((d) => ({
                key: d.symbol.key,
                local: local(d.symbol),
                code: textOf(d.out),
                value: d.value,
            }));
            const usages = symbols.map((s) => ({ key: s.key, local: local(s) }));
            const out = newBuffer("render");
            this.writingTo(out, () => section.render(definitions, usages));
            section.output = out.tokens;
            for (const symbol of usesOf(out)) markUsed(symbol);
        }

        const assemble = (tokens: Token[]): string =>
            tokens
                .map((t) => {
                    if (typeof t === "string") return t;
                    if (t.kind === "ref") return must(t.symbol.local, `name for '${nameOf(t.symbol)}'`);
                    return assemble(must(t.section.output, `section #${t.section.index} output`));
                })
                .join("");
        return assemble(body.tokens);
    }
}
