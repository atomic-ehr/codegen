import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import type { TypeScriptOptions } from "@root/api/writer-generator/typescript/writer";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-inherited-required");
const PACKAGE_DIR = "cognovis-test-praxis";

const generate = async (style?: TypeScriptOptions["moduleSpecifierStyle"]) => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "cognovis.test.praxis", version: "0.0.1" },
            path: FIXTURE_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({
            inMemoryOnly: true,
            generateProfile: true,
            withDebugComment: false,
            ...(style ? { moduleSpecifierStyle: style } : {}),
        })
        .generate();
    if (!result.success) throw new Error("generation failed");
    return result.filesGenerated.typescript ?? {};
};

const relativeSpecifiers = (files: Record<string, string>): string[] =>
    Object.values(files).flatMap((source) =>
        [...source.matchAll(/ from "(\.[^"]*)"/g)].map(([, specifier]) => specifier ?? ""),
    );

const fileBySuffix = (files: Record<string, string>, suffix: string): string => {
    const found = Object.entries(files).find(([path]) => path.endsWith(suffix));
    if (!found) throw new Error(`No generated file matching '*${suffix}'`);
    return found[1];
};

describe("module specifier styles", async () => {
    const extensionless = await generate();
    const nodeEsm = await generate("node-esm");

    it("defaults to extensionless specifiers", () => {
        const withExtension = relativeSpecifiers(extensionless).filter((specifier) => specifier.endsWith(".js"));
        expect(withExtension).toEqual([]);
    });

    it("node-esm style leaves no extensionless relative specifier anywhere", () => {
        const offenders = relativeSpecifiers(nodeEsm).filter((specifier) => !specifier.endsWith(".js"));
        expect(offenders).toEqual([]);
    });

    it("both styles generate the same file set", () => {
        expect(Object.keys(nodeEsm).sort()).toEqual(Object.keys(extensionless).sort());
    });

    it("node-esm package index pinned", () => {
        expect(fileBySuffix(nodeEsm, `${PACKAGE_DIR}/index.ts`)).toMatchSnapshot();
    });

    it("node-esm profiles barrel pinned", () => {
        expect(fileBySuffix(nodeEsm, `${PACKAGE_DIR}/profiles/index.ts`)).toMatchSnapshot();
    });

    it("node-esm profile module imports pinned", () => {
        const module = fileBySuffix(nodeEsm, "profiles/Provenance_PraxisProposalProvenance.ts");
        const imports = module
            .split("\n")
            .filter((line) => line.includes(' from "'))
            .join("\n");
        expect(imports).toMatchSnapshot();
    });
});

/**
 * The style exists because Node's ESM resolver takes relative specifiers
 * literally: no extension appending, no directory index. A projection
 * transpiled to plain `.js` under `"type": "module"` only loads when every
 * relative specifier names its file — the check runs the real `node` binary,
 * where Bun's more forgiving resolver can't mask the defect.
 */
describe("node-esm style under the Node ESM resolver", async () => {
    const dir = await fs.mkdtemp(Path.join(os.tmpdir(), "module-specifier-style-"));
    await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "cognovis.test.praxis", version: "0.0.1" },
            path: FIXTURE_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({ generateProfile: true, withDebugComment: false, moduleSpecifierStyle: "node-esm" })
        .outputTo(dir)
        .generate();

    // Transpiling only erases types — it rewrites no import specifier — so
    // what Node resolves here is exactly what the generator emitted.
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    for (const entry of await fs.readdir(dir, { recursive: true })) {
        if (!entry.endsWith(".ts")) continue;
        const source = Path.join(dir, entry);
        await fs.writeFile(source.replace(/\.ts$/, ".js"), transpiler.transformSync(await fs.readFile(source, "utf8")));
    }
    await fs.writeFile(Path.join(dir, "package.json"), JSON.stringify({ type: "module" }));

    it("resolves the whole chain from the package index", async () => {
        const url = new URL(`file://${Path.join(dir, `${PACKAGE_DIR}/index.js`)}`).href;
        const script = `const m = await import(${JSON.stringify(url)}); if (typeof m.PraxisProposalProvenanceProfile !== "function") { console.error("missing export"); process.exit(3); }`;
        const proc = Bun.spawn(["node", "--input-type=module", "-e", script], { stdout: "pipe", stderr: "pipe" });
        const stderr = await new Response(proc.stderr).text();

        expect(stderr).not.toContain("ERR_MODULE_NOT_FOUND");
        expect(stderr).not.toContain("ERR_UNSUPPORTED_DIR_IMPORT");
        expect(await proc.exited).toBe(0);
    });
});
