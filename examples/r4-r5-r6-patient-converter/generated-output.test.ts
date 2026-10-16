import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

// The generated tree is gitignored, so these snapshots are its only committed record.
const typesDir = `${import.meta.dir}/fhir-types`;

const releaseDirs = (): string[] => [...new Glob("*/").scanSync({ cwd: typesDir, onlyFiles: false })].sort();

describe("generated output", () => {
    test("every emitted module, by release", () => {
        expect([...new Glob("*/*.ts").scanSync(typesDir)].sort()).toMatchSnapshot();
    });

    test("the maritalStatus binding, by release", async () => {
        const lines: Record<string, string | undefined> = {};
        for (const dir of releaseDirs()) {
            const src = await Bun.file(`${typesDir}/${dir}/Patient.ts`).text();
            lines[dir] = src
                .split("\n")
                .find((l) => l.includes("maritalStatus"))
                ?.trim();
        }
        expect(lines).toMatchSnapshot();
    });
});
