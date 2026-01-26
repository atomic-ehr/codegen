import { describe, expect, it } from "bun:test";
import { shouldSkipCanonical, skipList } from "@typeschema/skip-hack";
import type { CanonicalUrl, PackageMeta } from "@typeschema/types";

describe("skip-hack", () => {
    describe("shouldSkipCanonical", () => {
        it("should return shouldSkip: true for canonical in skip list by package name", () => {
            const packageMeta: PackageMeta = {
                name: "hl7.fhir.uv.extensions.r4",
                version: "1.0.0",
            };
            const canonicalUrl =
                "http://hl7.org/fhir/StructureDefinition/extended-contact-availability" as CanonicalUrl;

            const result = shouldSkipCanonical(packageMeta, canonicalUrl);

            expect(result.shouldSkip).toBe(true);
            expect(result.reason).toBeDefined();
            expect(result.reason).toContain("Availability");
        });

        it("should return shouldSkip: true for canonical in skip list by full package reference", () => {
            const packageMeta: PackageMeta = {
                name: "hl7.fhir.r5.core",
                version: "5.0.0",
            };
            const canonicalUrl = "http://hl7.org/fhir/StructureDefinition/shareablecodesystem" as CanonicalUrl;

            const result = shouldSkipCanonical(packageMeta, canonicalUrl);

            expect(result.shouldSkip).toBe(true);
            expect(result.reason).toBeDefined();
            expect(result.reason).toContain("CodeSystem");
        });

        it("should return shouldSkip: false for canonical not in skip list", () => {
            const packageMeta: PackageMeta = {
                name: "hl7.fhir.r4.core",
                version: "4.0.1",
            };
            const canonicalUrl = "http://hl7.org/fhir/StructureDefinition/Patient" as CanonicalUrl;

            const result = shouldSkipCanonical(packageMeta, canonicalUrl);

            expect(result.shouldSkip).toBe(false);
            expect(result.reason).toBeUndefined();
        });

        it("should return shouldSkip: false for unknown package", () => {
            const packageMeta: PackageMeta = {
                name: "unknown.package",
                version: "1.0.0",
            };
            const canonicalUrl =
                "http://hl7.org/fhir/StructureDefinition/extended-contact-availability" as CanonicalUrl;

            const result = shouldSkipCanonical(packageMeta, canonicalUrl);

            expect(result.shouldSkip).toBe(false);
        });

        it("should match by package name regardless of version", () => {
            const packageMeta: PackageMeta = {
                name: "hl7.fhir.uv.extensions.r4",
                version: "2.0.0", // Different version
            };
            const canonicalUrl = "http://hl7.org/fhir/StructureDefinition/workflow-reason" as CanonicalUrl;

            const result = shouldSkipCanonical(packageMeta, canonicalUrl);

            expect(result.shouldSkip).toBe(true);
            expect(result.reason).toContain("CodeableReference");
        });

        it("should only match by full package reference when version matches", () => {
            const packageMeta: PackageMeta = {
                name: "hl7.fhir.r5.core",
                version: "5.0.1", // Different version than in skip list
            };
            const canonicalUrl = "http://hl7.org/fhir/StructureDefinition/shareablecodesystem" as CanonicalUrl;

            const result = shouldSkipCanonical(packageMeta, canonicalUrl);

            // Should not match because skip list has "hl7.fhir.r5.core#5.0.0"
            expect(result.shouldSkip).toBe(false);
        });
    });

    describe("skipList", () => {
        it("should contain expected packages", () => {
            expect(skipList["hl7.fhir.uv.extensions.r4"]).toBeDefined();
            expect(skipList["hl7.fhir.r5.core#5.0.0"]).toBeDefined();
        });

        it("should contain expected canonicals for extensions package", () => {
            const extensionsSkipList = skipList["hl7.fhir.uv.extensions.r4"];
            if (!extensionsSkipList) throw new Error("Expected extensionsSkipList to be defined");
            expect(Object.keys(extensionsSkipList)).toContain(
                "http://hl7.org/fhir/StructureDefinition/extended-contact-availability",
            );
            expect(Object.keys(extensionsSkipList)).toContain(
                "http://hl7.org/fhir/StructureDefinition/workflow-barrier",
            );
        });

        it("should contain expected canonicals for R5 package", () => {
            const r5SkipList = skipList["hl7.fhir.r5.core#5.0.0"];
            if (!r5SkipList) throw new Error("Expected r5SkipList to be defined");
            expect(Object.keys(r5SkipList)).toContain("http://hl7.org/fhir/StructureDefinition/shareablecodesystem");
            expect(Object.keys(r5SkipList)).toContain("http://hl7.org/fhir/StructureDefinition/publishablecodesystem");
        });
    });
});
