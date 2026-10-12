import { describe, expect, it } from "bun:test";
import { SectionWriter, type Usage } from "@root/api/writer-generator/section-writer";

type Import = { module: string; name: string };
type ConstDef = { type: string; value: string };

class TestWriter extends SectionWriter {
    generate = async () => undefined;
}

/** Generates one file with `body` and returns its content. */
const generate = (generatorBody: (w: TestWriter) => void): string => {
    const w = new TestWriter({
        outputDir: "/virtual",
        tabSize: 4,
        commentLinePrefix: "//",
        inMemoryOnly: true,
    });
    w.cd("/", () => {
        w.cat("main.js", () => {
            generatorBody(w);
        });
    });
    return w.writtenFiles()[0]?.content ?? "";
};

const importSection = (w: TestWriter) =>
    w.section<never, Import>({
        name: (i) => i.name,
        render: (_definitions, usages) => {
            const byModule: Record<string, Usage<Import>[]> = {};
            for (const u of usages) (byModule[u.key.module] ??= []).push(u);
            for (const [from, names] of Object.entries(byModule)) {
                const list = names.map((u) => (u.local === u.key.name ? u.local : `${u.key.name} as ${u.local}`));
                w.lineSM(`import { ${list.join(", ")} } from "${from}"`);
            }
        },
    });

describe("demo: imports and file-local constants", () => {
    it("emits only what the file uses", () => {
        const content = generate((w) => {
            const imports = importSection(w);
            const consts = w.section<ConstDef, string>({
                name: (name) => name,
                defRender: (name, def) => w.lineSM(`const ${name}: ${def.type} = ${def.value}`),
            });
            // Defined before `a`; the writer orders it after `a` because it depends on it.
            consts.def("b", { type: "() => string", value: `() => ${consts.use("a")}` });
            consts.def("a", { type: "string", value: `"foo"` });
            // Nobody uses it, so it is not emitted.
            consts.def("unused", { type: "number", value: "0" });
            // A local `basename` takes the name, so the imported one gets aliased.
            consts.def("basename", { type: "string", value: `"main"` });

            // Exports are the file's contract: written directly, always present.
            const join = imports.use({ module: "node:path", name: "join" });
            w.lineSM(`export const path = ${join}(${consts.use("basename")}, ${consts.use("b")}())`);
            w.lineSM(`export const file = ${imports.use({ module: "node:path", name: "basename" })}(path)`);
        });

        expect(content).toBe(
            [
                `import { basename as basename_1, join } from "node:path";`,
                `const a: string = "foo";`,
                `const b: () => string = () => a;`,
                `const basename: string = "main";`,
                `export const path = join(basename, b());`,
                `export const file = basename_1(path);`,
                ``,
            ].join("\n"),
        );
    });
});

describe("section order", () => {
    it("lets a renderer use a section placed above it", () => {
        const content = generate((w) => {
            const imports = importSection(w);
            const lets = w.section<never, string>({
                name: (name) => name,
                render: (_, usages) => {
                    for (const u of usages) w.lineSM(`let ${u.local}: ${imports.use({ module: "./t", name: "T" })}`);
                },
            });
            w.lineSM(`f(${lets.use("x")})`);
        });

        expect(content).toBe([`import { T } from "./t";`, `let x: T;`, `f(x);`, ``].join("\n"));
    });

    it("rejects a definition in a section without defRender", () => {
        const run = () =>
            generate((w) =>
                w.section<ConstDef, string>({ name: (name) => name }).def("a", { type: "string", value: "1" }),
            );

        expect(run).toThrow("main.js: section #0 has no defRender");
    });

    it("rejects a section used after it rendered", () => {
        const run = () =>
            generate((w) => {
                const lets = w.section<never, string>({
                    name: (name) => name,
                    render: () => imports.use({ module: "./t", name: "T" }),
                });
                const imports = importSection(w);
                w.lineSM(`f(${lets.use("x")})`);
            });

        expect(run).toThrow("main.js: section #1 is already rendered");
    });
});

/** Mistakes the handle types reject; checked by the project typecheck, never run. */
export const typeChecks = (w: TestWriter) => {
    const imports = importSection(w);
    const consts = w.section<ConstDef, string>({ name: (name) => name, defRender: () => undefined });
    // @ts-expect-error a section names its symbols
    w.section<never, string>({});
    // @ts-expect-error the import section has no definitions
    imports.def({ module: "node:path", name: "join" }, {});
    // @ts-expect-error an import key is `{ module, name }`
    imports.use("join");
    // @ts-expect-error a definition must match the section's definition type
    consts.def("a", { code: "foo" });
};
