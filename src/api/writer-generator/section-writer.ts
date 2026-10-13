import * as Path from "node:path";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";

// Buffers each file so sections emit only the symbols its code uses.
// `def` records a value; `use` returns a marker resolved to its local name.
// Sections render bottom-up, allowing their renderers to use sections above them.
// Design: docs/design/writer-sections.md

export type Definition<Def, Sym> = { key: Sym; local: string; value: Def };
export type Usage<Sym> = { key: Sym; local: string };
export type SectionRender<Def, Sym> = (definitions: Definition<Def, Sym>[], usages: Usage<Sym>[]) => void;

export type SectionConfig<Def, Sym> = {
    name: (key: Sym) => string;
    render?: SectionRender<Def, Sym>;
    defRender?: (name: string, value: Def) => void;
};

export type SectionHandle<Def, Sym> = {
    def: (key: Sym, value: Def) => void;
    use: (key: Sym) => string;
};

type SectionSymbol = {
    section: DraftSection;
    number: number;
    key: unknown;
    definition?: unknown;
    local?: string;
};
type DraftSection = {
    index: number;
    name: (key: unknown) => string;
    defRender?: (name: string, value: unknown) => void;
    render: SectionRender<unknown, unknown>;
    symbols: SectionSymbol[];
    byKeyId: Record<string, SectionSymbol>;
    output?: string;
};
type Draft = {
    path: string;
    body: string[];
    out: string[];
    sections: DraftSection[];
};

// A section slot is NUL:<section>NUL; a symbol is NUL:<section>:<symbol>NUL.
const MARK = "\u0000";
const sectionRe = new RegExp(`${MARK}:(\\d+)${MARK}`, "g");
const symbolRe = new RegExp(`${MARK}:(\\d+):(\\d+)${MARK}`, "g");
const marker = (s: SectionSymbol) => `${MARK}:${s.section.index}:${s.number}${MARK}`;

/** Compare keys as JSON, independently of object field order. */
const keyId = (key: unknown): string =>
    JSON.stringify(key, (_, value) =>
        value && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
            : value,
    );
const nameOf = (s: SectionSymbol): string => s.section.name(s.key);

export abstract class SectionWriter<T extends WriterOptions = WriterOptions> extends Writer<T> {
    protected draft?: Draft;

    override cat(fn: string, gen: () => void) {
        if (!this.currentDir) throw new Error("Should be in a directory (`cd`)");
        if (this.currentFile) throw new Error("Can't open file when another file is open");
        const body: string[] = [];
        const draft: Draft = {
            path: Path.relative(this.opts.outputDir, Path.join(this.currentDir, fn)),
            body,
            out: body,
            sections: [],
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
        this.assertDraft();
        // Validate references in the text being written.
        this.references(str);
        this.draft.out.push(str);
    }

    section<Def, Sym>(spec: SectionConfig<Def, Sym>): SectionHandle<Def, Sym> {
        this.assertDraft("file");
        const section: DraftSection = {
            index: this.draft.sections.length,
            name: spec.name as DraftSection["name"],
            defRender: spec.defRender as DraftSection["defRender"],
            render: (spec.render ??
                ((definitions) => {
                    for (const d of definitions) section.defRender?.(d.local, d.value);
                })) as DraftSection["render"],
            symbols: [],
            byKeyId: {},
        };
        this.draft.sections.push(section);
        this.write(`${MARK}:${section.index}${MARK}`);
        return {
            def: (sym, def) => {
                this.assertDraft();
                if (!section.defRender)
                    throw new Error(`${this.draft.path}: section #${section.index} has no defRender`);
                const existedSym = this.symbolOf(section, sym);
                if ("definition" in existedSym)
                    throw new Error(
                        `${this.draft.path}: '${nameOf(existedSym)}' defined twice in section #${section.index}`,
                    );
                existedSym.definition = def;
            },
            use: (key) => marker(this.symbolOf(section, key)),
        };
    }

    private symbolOf(section: DraftSection, key: unknown): SectionSymbol {
        this.assertDraft();
        if (!this.draft.sections.includes(section))
            throw new Error(`${this.draft.path}: section #${section.index} belongs to another file`);
        if (section.output !== undefined)
            throw new Error(
                `${this.draft.path}: section #${section.index} is already rendered; only sections above it can still be used`,
            );
        const id = keyId(key);
        let symbol = section.byKeyId[id];
        if (!symbol) {
            symbol = {
                section,
                number: section.symbols.length,
                key,
            };
            section.symbols.push(symbol);
            section.byKeyId[id] = symbol;
        }
        return symbol;
    }

    private assertDraft(level?: "file"): asserts this is this & { draft: Draft } {
        if (!this.draft) throw new Error("No file open");
        if (level === "file" && this.draft.out !== this.draft.body)
            throw new Error("A section must be placed at file level");
    }

    /** Capture regular Writer calls, then restore the output target and indent. */
    private capture(gen: () => void, indent = this.currentIndent): string {
        this.assertDraft();
        const draft = this.draft;
        const [prevOut, prevIndent] = [draft.out, this.currentIndent];
        draft.out = [];
        this.currentIndent = indent;
        try {
            gen();
            return draft.out.join("");
        } finally {
            draft.out = prevOut;
            this.currentIndent = prevIndent;
        }
    }

    private references(code: string): SectionSymbol[] {
        this.assertDraft();
        return Array.from(code.matchAll(symbolRe), (match) => {
            const sectionN = Number(match[1]);
            const section = this.draft.sections[sectionN];
            if (!section) throw new Error(`Internal section error: section #${match[1]}`);
            const symbol = section.symbols[Number(match[2])];
            if (!symbol) throw new Error(`Internal section error: symbol ${match[0]}`);
            return symbol;
        });
    }

    private renderSections(draft: Draft): string {
        const body = draft.body.join("");
        const dependencies = new Map<SectionSymbol, SectionSymbol[]>();
        const used = new Set<SectionSymbol>();
        const markUsed = (s: SectionSymbol): void => {
            if (used.has(s)) return;
            used.add(s);
            if (!("definition" in s)) return;
            const value = s.definition;
            const defRender = s.section.defRender;
            if (!defRender) throw new Error(`Internal section error: defRender for '${nameOf(s)}'`);
            const code = this.capture(() => defRender(marker(s), value), 0);
            const deps = this.references(code).filter((dep) => dep !== s);
            dependencies.set(s, deps);
            for (const dep of deps) markUsed(dep);
        };
        for (const s of this.references(body)) markUsed(s);
        const taken = new Set<string>();

        for (const section of [...draft.sections].reverse()) {
            const symbols = section.symbols
                .filter((s) => used.has(s))
                .sort((a, b) => keyId(a.key).localeCompare(keyId(b.key)));

            // Definitions get naming priority over other usages within a section.
            for (const s of [
                ...symbols.filter((s) => "definition" in s),
                ...symbols.filter((s) => !("definition" in s)),
            ]) {
                const preferred = nameOf(s);
                let name = preferred;
                for (let i = 1; taken.has(name); i++) name = `${preferred}_${i}`;
                taken.add(name);
                s.local = name;
            }

            // Emit dependencies first; first-seen order breaks ties.
            const ordered: SectionSymbol[] = [];
            const visiting = new Set<SectionSymbol>();
            const done = new Set<SectionSymbol>();
            const visit = (s: SectionSymbol) => {
                if (done.has(s)) return;
                if (visiting.has(s)) throw new Error(`${draft.path}: cycle through '${nameOf(s)}'`);
                visiting.add(s);
                for (const dep of dependencies.get(s) ?? [])
                    if (section.symbols.includes(dep) && "definition" in dep) visit(dep);
                visiting.delete(s);
                done.add(s);
                ordered.push(s);
            };
            for (const s of section.symbols) if ("definition" in s && used.has(s)) visit(s);

            const local = (s: SectionSymbol) => {
                if (s.local === undefined) throw new Error(`Internal section error: name for '${nameOf(s)}'`);
                return s.local;
            };
            const definitions = ordered.map((s) => ({
                key: s.key,
                local: local(s),
                value: s.definition,
            }));
            const usages = symbols.map((s) => ({ key: s.key, local: local(s) }));
            section.output = this.capture(() => section.render(definitions, usages));
            for (const s of this.references(section.output)) markUsed(s);
        }

        // Insert sections, then replace all symbol markers with their assigned names.
        return body
            .replace(sectionRe, (_, index) => {
                const output = draft.sections[Number(index)]?.output;
                if (output === undefined) throw new Error(`Internal section error: section #${index} output`);
                return output;
            })
            .replace(symbolRe, (ref) => {
                const s = this.references(ref)[0];
                if (!s) throw new Error(`Internal section error: symbol ${ref}`);
                if (s.local === undefined) throw new Error(`Internal section error: name for '${nameOf(s)}'`);
                return s.local;
            });
    }
}
