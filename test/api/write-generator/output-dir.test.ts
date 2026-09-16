import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-inherited-required");
const OUTPUT_DIR = "/tmp/atomic-codegen-output-dir";

// The TypeScript and C# generators default to an `<outputDir>/types` subdirectory, which used
// to leak into the output when `outputTo` ran before them.
const generate = async (order: "generator-first" | "output-first") => {
    const builder = new APIBuilder({ logger: mkSilentLogger() }).localStructureDefinitions({
        package: { name: "cognovis.test.praxis", version: "0.0.1" },
        path: FIXTURE_PATH,
        dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
    });

    if (order === "generator-first") {
        builder.typescript({ inMemoryOnly: true, withDebugComment: false }).outputTo(OUTPUT_DIR);
    } else {
        builder.outputTo(OUTPUT_DIR).typescript({ inMemoryOnly: true, withDebugComment: false });
    }

    const result = await builder.generate();
    if (!result.success) throw new Error(`generation failed: ${result.errors.join(", ")}`);
    return Object.keys(result.filesGenerated.typescript ?? {}).sort();
};

describe("outputTo and generator configuration order", () => {
    it("writes into the named directory when the generator is configured first", async () => {
        const paths = await generate("generator-first");

        expect(paths.length).toBeGreaterThan(0);
        for (const path of paths) expect(path.startsWith(`${OUTPUT_DIR}/`)).toBe(true);
        for (const path of paths) expect(path.startsWith(`${OUTPUT_DIR}/types/`)).toBe(false);
    });

    it("writes into the named directory when outputTo is called first", async () => {
        const paths = await generate("output-first");

        expect(paths.length).toBeGreaterThan(0);
        for (const path of paths) expect(path.startsWith(`${OUTPUT_DIR}/`)).toBe(true);
        for (const path of paths) expect(path.startsWith(`${OUTPUT_DIR}/types/`)).toBe(false);
    });

    it("produces the same paths either way", async () => {
        const generatorFirst = await generate("generator-first");
        const outputFirst = await generate("output-first");

        expect(outputFirst).toEqual(generatorFirst);
    });
});
