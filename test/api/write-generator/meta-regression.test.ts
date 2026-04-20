/**
 * Regression test for the duplicate-meta-key bug (PR #138).
 *
 * When a profile pins meta.min=1 (making `meta` a required factory param,
 * mirroring KBV ITA FOR/ERP/EAU patterns), the TypeScript profile writer
 * previously emitted two `meta:` keys in createResource, causing TS1117
 * and silently dropping caller-supplied meta fields.
 *
 * This test asserts:
 *   1. Generation succeeds
 *   2. `meta:` appears exactly once in createResource (no TS1117, no key collision)
 *   3. The spread pattern is used: `{ ...args.meta, profile: [...] }`
 *   4. Profile.from() and apply() still validate canonicalUrl
 */

import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURES_PATH = Path.join(__dirname, "fixtures");

const localPackageConfig = {
    package: { name: "example.meta.regression", version: "0.0.1" },
    path: FIXTURES_PATH,
    dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
};

const treeShakeConfig = {
    "example.meta.regression": {
        "http://example.org/fhir/StructureDefinition/OrgWithRequiredMeta": {},
    },
    "hl7.fhir.r4.core": {
        "http://hl7.org/fhir/StructureDefinition/Organization": {},
    },
};

describe("Regression: profile with meta.min=1 generates single meta key", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions(localPackageConfig)
        .typeSchema({ treeShake: treeShakeConfig })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();

    const PROFILE_KEY =
        "generated/types/example-meta-regression/profiles/Organization_OrgWithRequiredMeta.ts";

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("generates the OrgWithRequiredMeta profile", () => {
        expect(result.filesGenerated[PROFILE_KEY]).toBeDefined();
    });

    it("meta: key appears exactly once in createResource (no TS1117 duplicate key)", () => {
        const content = result.filesGenerated[PROFILE_KEY]!;
        // Count all `meta:` property assignments in the file.
        // Expected: 2 — one in the ProfileRaw type declaration, one in createResource.
        // With the bug: 3 (an extra duplicate in createResource).
        const metaAssignments = content.match(/^\s+meta[?]?:/gm) ?? [];
        expect(metaAssignments.length).toBe(2);
    });

    it("createResource merges args.meta via spread (no silent overwrite)", () => {
        const content = result.filesGenerated[PROFILE_KEY]!;
        expect(content).toContain("...args.meta");
    });

    it("Profile.from() validates canonicalUrl (from/apply wiring intact)", () => {
        const content = result.filesGenerated[PROFILE_KEY]!;
        expect(content).toContain("canonicalUrl");
        expect(content).toContain("static from");
        expect(content).toContain("static apply");
    });

    it("full profile snapshot", () => {
        expect(result.filesGenerated[PROFILE_KEY]).toMatchSnapshot();
    });
});
