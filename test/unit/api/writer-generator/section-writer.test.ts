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

describe("definitions and names", () => {
    it.each([undefined, null, false, 0, ""])("emits a definition with value %j", (value) => {
        const content = generate((w) => {
            const helpers = w.section<unknown, string>({
                name: (name) => name,
                defRender: (name, def) => w.lineSM(`const ${name} = ${JSON.stringify(def)}`),
            });
            helpers.def("helper", value);
            w.lineSM(`f(${helpers.use("helper")})`);
        });

        expect(content).toBe([`const helper = ${JSON.stringify(value)};`, `f(helper);`, ``].join("\n"));
    });

    it("renders only reachable definitions and discovers dependencies created by defRender", () => {
        const content = generate((w) => {
            const imports = importSection(w);
            const helpers = w.section<string, string>({
                name: (name) => name,
                defRender: (name, value) => {
                    if (value === "unused") throw new Error("Unused definitions must not render");
                    w.lineSM(`const ${name} = ${imports.use({ module: "./used", name: value })}`);
                },
            });
            helpers.def("unused", "unused");
            helpers.def("helper", "used");
            w.lineSM(`f(${helpers.use("helper")})`);
        });

        expect(content).toBe([`import { used } from "./used";`, `const helper = used;`, `f(helper);`, ``].join("\n"));
    });

    it("passes values and final names to a custom definition renderer", () => {
        const content = generate((w) => {
            const helpers = w.section<string, string>({
                name: () => "helper",
                defRender: (name, value) => w.lineSM(`const ${name} = ${value}`),
                render: (definitions) => {
                    for (const d of definitions) w.lineSM(`export const ${d.local} = ${d.value}`);
                },
            });
            helpers.def("a", "1");
            helpers.def("b", "2");
            w.lineSM(`f(${helpers.use("b")}, ${helpers.use("a")})`);
        });

        expect(content).toBe(
            [`export const helper = 1;`, `export const helper_1 = 2;`, `f(helper_1, helper);`, ``].join("\n"),
        );
    });

    it("keeps dependencies of used definitions and drops unused ones", () => {
        const content = generate((w) => {
            const imports = importSection(w);
            const helpers = w.section<string, string>({
                name: (name) => name,
                defRender: (name, value) => w.lineSM(`const ${name} = ${value}`),
            });
            helpers.def("unused", imports.use({ module: "./unused", name: "unused" }));
            helpers.def("helper", imports.use({ module: "./used", name: "used" }));
            imports.use({ module: "./ignored", name: "ignored" });
            w.lineSM(`export const result = ${helpers.use("helper")}`);
        });

        expect(content).toBe(
            [`import { used } from "./used";`, `const helper = used;`, `export const result = helper;`, ``].join("\n"),
        );
    });

    it("deduplicates object keys and assigns names in key order", () => {
        const content = generate((w) => {
            const imports = importSection(w);
            w.lineSM(`f(${imports.use({ module: "./b", name: "T" })})`);
            w.lineSM(`f(${imports.use({ name: "T", module: "./a" })})`);
            w.lineSM(`f(${imports.use({ module: "./a", name: "T" })})`);
        });

        expect(content).toBe(
            [`import { T } from "./a";`, `import { T as T_1 } from "./b";`, `f(T_1);`, `f(T);`, `f(T);`, ``].join("\n"),
        );
    });

    it("allows a definition to refer to itself", () => {
        const content = generate((w) => {
            const helpers = w.section<undefined, string>({
                name: (name) => name,
                defRender: (name) => w.lineSM(`const ${name} = () => ${helpers.use("recursive")}()`),
            });
            helpers.def("recursive", undefined);
            w.lineSM(`f(${helpers.use("recursive")})`);
        });

        expect(content).toBe([`const recursive = () => recursive();`, `f(recursive);`, ``].join("\n"));
    });

    it("rejects cycles between used definitions", () => {
        const run = () =>
            generate((w) => {
                const helpers = w.section<string, string>({
                    name: (name) => name,
                    defRender: (name, value) => w.lineSM(`const ${name} = ${value}`),
                });
                helpers.def("a", helpers.use("b"));
                helpers.def("b", helpers.use("a"));
                w.lineSM(`f(${helpers.use("a")})`);
            });

        expect(run).toThrow("main.js: cycle through");
    });

    it("rejects duplicate definitions", () => {
        const run = () =>
            generate((w) => {
                const helpers = w.section<undefined, string>({ name: (name) => name, defRender: () => undefined });
                helpers.def("a", undefined);
                helpers.def("a", undefined);
            });

        expect(run).toThrow("main.js: 'a' defined twice in section #0");
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
