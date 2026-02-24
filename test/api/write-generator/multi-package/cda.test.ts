import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";

/**
 * Tests for CDA package generation.
 * Package: hl7.cda.uv.core@2.0.1-sd
 */
describe("CDA", async () => {
    const treeShakeConfig = {
        "hl7.cda.uv.core": {
            "http://hl7.org/cda/stds/core/StructureDefinition/ClinicalDocument": {},
        },
    };

    const promoteLogicalConfig = {
        "hl7.cda.uv.core": ["http://hl7.org/cda/stds/core/StructureDefinition/ClinicalDocument" as CanonicalUrl],
    };

    describe("TypeScript Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .fromPackage("hl7.cda.uv.core", "2.0.1-sd")
            .typeSchema({ treeShake: treeShakeConfig })
            .typescript({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ClinicalDocument type", () => {
            const clinicalDoc = result.filesGenerated["generated/types/hl7-cda-uv-core/ClinicalDocument.ts"];
            expect(clinicalDoc).toBeDefined();
            expect(clinicalDoc).toMatchSnapshot();
        });

        it("should generate CDA-specific types", () => {
            const files = Object.keys(result.filesGenerated);
            const cdaFiles = files.filter((f) => f.includes("hl7-cda-uv-core"));
            expect(cdaFiles.length).toBe(78);

            expect(files.some((f) => f.includes("/AD.ts") || f.includes("/CD.ts"))).toBeTrue();
        });
    });

    describe("Python Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .fromPackage("hl7.cda.uv.core", "2.0.1-sd")
            .typeSchema({ treeShake: treeShakeConfig, promoteLogical: promoteLogicalConfig })
            .python({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ClinicalDocument type (promoted logical)", () => {
            const clinicalDoc = result.filesGenerated["generated/hl7_cda_uv_core/clinical_document.py"];
            expect(clinicalDoc).toBeDefined();
            expect(clinicalDoc).toMatchSnapshot();
        });

        it("should generate base package structure", () => {
            expect(result.filesGenerated["generated/__init__.py"]).toBeDefined();
            expect(result.filesGenerated["generated/requirements.txt"]).toBeDefined();
        });
    });

    describe("C# Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .fromPackage("hl7.cda.uv.core", "2.0.1-sd")
            .typeSchema({ treeShake: treeShakeConfig, promoteLogical: promoteLogicalConfig })
            .csharp({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ClinicalDocument type (promoted logical)", () => {
            const clinicalDoc = result.filesGenerated["generated/types/Hl7CdaUvCore/ClinicalDocument.cs"];
            expect(clinicalDoc).toBeDefined();
            expect(clinicalDoc).toMatchSnapshot();
        });

        it("should generate base helper files", () => {
            expect(result.filesGenerated["generated/types/base.cs"]).toBeDefined();
            expect(result.filesGenerated["generated/types/Helper.cs"]).toBeDefined();
        });
    });
});
