import { describe, expect, it } from "bun:test";
import { builtinExclusions, type CanonicalExclusion, findExclusion, resolveExclusions } from "@typeschema/exclusions";
import type { CanonicalUrl, PackageMeta } from "@typeschema/types";

const url = (u: string) => u as CanonicalUrl;

describe("canonical exclusions", () => {
    it("matches by bare package name", () => {
        const pkg: PackageMeta = { name: "hl7.fhir.uv.extensions.r4", version: "1.0.0" };
        const found = findExclusion(
            builtinExclusions,
            pkg,
            url("http://hl7.org/fhir/StructureDefinition/extended-contact-availability"),
        );

        expect(found).toBeDefined();
        expect(found?.reason).toContain("Availability");
    });

    it("matches by name#version", () => {
        const pkg: PackageMeta = { name: "hl7.fhir.r5.core", version: "5.0.0" };
        const found = findExclusion(
            builtinExclusions,
            pkg,
            url("http://hl7.org/fhir/StructureDefinition/shareablecodesystem"),
        );

        expect(found).toBeDefined();
        expect(found?.reason).toContain("CodeSystem");
    });

    it("does not match a versioned exclusion under another version", () => {
        const pkg: PackageMeta = { name: "hl7.fhir.r5.core", version: "5.0.1" };
        const found = findExclusion(
            builtinExclusions,
            pkg,
            url("http://hl7.org/fhir/StructureDefinition/shareablecodesystem"),
        );

        expect(found).toBeUndefined();
    });

    it("returns undefined for canonicals not excluded", () => {
        const pkg: PackageMeta = { name: "hl7.fhir.r4.core", version: "4.0.1" };
        const found = findExclusion(builtinExclusions, pkg, url("http://hl7.org/fhir/StructureDefinition/Patient"));

        expect(found).toBeUndefined();
    });

    it("prefers a name#version entry over a bare-name entry", () => {
        const exclusions: CanonicalExclusion[] = [
            { package: "pkg.a", url: url("http://example.test/X"), reason: "by name" },
            { package: "pkg.a#1.0.0", url: url("http://example.test/X"), reason: "by id" },
        ];
        const found = findExclusion(exclusions, { name: "pkg.a", version: "1.0.0" }, url("http://example.test/X"));

        expect(found?.reason).toBe("by id");
    });

    it("resolves the builtin exclusions plus the project's own", () => {
        const mine: CanonicalExclusion = { package: "my.pkg", url: "http://example.test/X" as never, reason: "r" };

        expect(resolveExclusions({})).toEqual(builtinExclusions);
        expect(resolveExclusions({ excludedCanonicals: [mine] })).toEqual([...builtinExclusions, mine]);
        expect(resolveExclusions({ builtinExclusions: false })).toEqual([]);
        expect(resolveExclusions({ builtinExclusions: false, excludedCanonicals: [mine] })).toEqual([mine]);
    });

    it("keeps the known spec-defect entries", () => {
        const packages = new Set(builtinExclusions.map((e) => e.package));

        expect(packages).toEqual(new Set(["hl7.fhir.uv.extensions.r4", "hl7.fhir.r5.core#5.0.0"]));
        expect(builtinExclusions).toHaveLength(10);
    });
});
