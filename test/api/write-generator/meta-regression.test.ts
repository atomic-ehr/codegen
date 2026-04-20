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

    const PROFILE_KEY = "generated/types/example-meta-regression/profiles/Organization_OrgWithRequiredMeta.ts";

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("generates the OrgWithRequiredMeta profile", () => {
        expect(result.filesGenerated[PROFILE_KEY]).toBeDefined();
    });

    it("meta: key appears exactly once in createResource (no TS1117 duplicate key)", () => {
        const content = result.filesGenerated[PROFILE_KEY]!;
        // Extract the createResource method body
        const createResourceMatch = content.match(/static createResource[\s\S]*?\n {4}\}/);
        expect(createResourceMatch).not.toBeNull();
        const createResourceBody = createResourceMatch![0];
        // meta: should appear exactly once inside createResource — not twice (which was the bug)
        const metaInCreateResource = createResourceBody.match(/\bmeta:/g) ?? [];
        expect(metaInCreateResource.length).toBe(1);
    });

    it("createResource merges args.meta via spread (no silent overwrite)", () => {
        const content = result.filesGenerated[PROFILE_KEY]!;
        expect(content).toContain("...args.meta");
    });

    it("generated createResource has no duplicate property keys (no TS1117)", () => {
        const content = result.filesGenerated[PROFILE_KEY]!;
        // The bug produced `meta: args.meta,\n...\n    meta: { profile: [...] }` — two meta: keys.
        // TypeScript TS1117 fires on duplicate object literal keys.
        // Verify the duplicate pattern is absent: no two consecutive meta: lines in createResource.
        expect(content).not.toContain("meta: args.meta,");
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
