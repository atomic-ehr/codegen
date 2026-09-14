import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger } from "@typeschema-test/utils";

// Real-closure test (downloads hl7.fhir.r5.core once, then served from the CM tarball cache):
// the shipped builtin patches drop R5's known-broken CodeSystem profiles at the package index,
// and builtinPatches: false is the explicit opt-out. Index patches apply at scan time, so each
// run drops the processed cache to make the configuration observable. That drop wipes the
// whole working directory, so this test keeps its own — otherwise it would evict every other
// test's and example's downloaded packages on each run.
const generate = async (opts: object) => {
    const result = await new APIBuilder({
        ...opts,
        logger: mkErrorLogger(),
        canonicalManager: { dropCache: true, workingDir: ".codegen-cache/builtin-patches-cache" },
    })
        .fromPackage("hl7.fhir.r5.core", "5.0.0")
        .introspection({ typeSchemas: "type-schemas", inMemoryOnly: true })
        .generate();
    if (!result.success) throw new Error(`generation failed: ${result.errors.join(", ")}`);
    const names = Object.keys(result.filesGenerated.introspection ?? {});
    return {
        has: (fragment: string) => names.some((n) => n.toLowerCase().includes(fragment)),
        exclusionsReported: (result.inputReport ?? []).filter((e) => e.kind === "exclusion").length,
    };
};

describe("builtin CanonicalManager patches on the real R5 closure", () => {
    it("drops the broken R5 profiles at the index by default and reports each exclusion", async () => {
        const run = await generate({});

        expect(run.has("shareablecodesystem")).toBeFalse();
        expect(run.has("publishablecodesystem")).toBeFalse();
        // Control: a healthy sibling profile generates.
        expect(run.has("shareablevalueset")).toBeTrue();
        expect(run.exclusionsReported).toBe(2);
    }, 120_000);

    it("builtinPatches: false is the explicit opt-out", async () => {
        const run = await generate({ builtinPatches: false });

        expect(run.has("shareablecodesystem")).toBeTrue();
        expect(run.has("publishablecodesystem")).toBeTrue();
        expect(run.exclusionsReported).toBe(0);
    }, 120_000);
});
