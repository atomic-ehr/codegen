import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger, r4Manager } from "@typeschema-test/utils";

/** For each import, the number of generated classes that never use it, and that import it more than once.
 *  An import counts as used when its simple name occurs as a word outside the import lines, unless it names
 *  the class the file declares. */
const importDefects = (files: Record<string, string>) => {
    const unused: Record<string, number> = {};
    const duplicate: Record<string, number> = {};
    for (const [path, content] of Object.entries(files)) {
        const className = path.split("/").pop()?.replace(/\.java$/, "");
        const lines = content.split("\n");
        const imports = lines.flatMap((line) => line.match(/^\s*import (?:static )?([\w.]+);/)?.[1] ?? []);
        const code = lines.filter((line) => !/^\s*import /.test(line)).join("\n");
        for (const name of new Set(imports.filter((name, i) => imports.indexOf(name) !== i)))
            duplicate[name] = (duplicate[name] ?? 0) + 1;
        for (const name of new Set(imports)) {
            const simpleName = name.split(".").pop();
            if (simpleName === className || !new RegExp(`\\b${simpleName}\\b`).test(code))
                unused[name] = (unused[name] ?? 0) + 1;
        }
    }
    const sorted = (counts: Record<string, number>) =>
        Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
    return { unused: sorted(unused), duplicate: sorted(duplicate) };
};

describe("Mustache Template Based Generation", async () => {
    const report = await new APIBuilder({ register: await r4Manager(), logger: mkErrorLogger() })
        .mustache("./examples/mustache/java", {
            debug: "COMPACT",
            inMemoryOnly: true,
            shouldRunHooks: false,
            meta: {
                timestamp: "2025-12-24T00:00:00.000Z",
            },
        })
        .throwException()
        .generate();
    const files = report.filesGenerated["mustache[./examples/mustache/java]"]!;

    it("generates 192 files successfully", () => {
        expect(report.success).toBeTrue();
        expect(Object.keys(files).length).toEqual(192);
    });

    it("Patient resource", async () => {
        expect(
            files["generated/model/src/main/java/de/solutio/fhir/models/resources/PatientDTO.java"],
        ).toMatchSnapshot();
    });

    it("unused and duplicate imports", () => {
        expect(importDefects(files)).toMatchSnapshot();
    });
});
