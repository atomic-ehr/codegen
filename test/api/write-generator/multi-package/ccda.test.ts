import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";

/**
 * Tests for CCDA package generation.
 * Package: hl7.cda.uv.core@2.0.1-sd
 */
describe("CCDA", async () => {
    const treeShakeConfig = {
        "hl7.cda.uv.core": {
            "http://hl7.org/cda/stds/core/StructureDefinition/ClinicalDocument": {},
        },
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
            expect(cdaFiles.length).toBeGreaterThan(0);

            expect(files.some((f) => f.includes("/AD.ts") || f.includes("/CD.ts"))).toBeTrue();
        });
    });

    describe("Python Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .fromPackage("hl7.cda.uv.core", "2.0.1-sd")
            .typeSchema({ treeShake: treeShakeConfig })
            .python({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        // Python generator does not support logical models (ClinicalDocument is kind: "logical")
        it.todo("should generate ClinicalDocument type", () => {});

        it("should generate base package structure", () => {
            expect(result.filesGenerated["generated/__init__.py"]).toBeDefined();
            expect(result.filesGenerated["generated/requirements.txt"]).toBeDefined();
        });
    });

    describe("C# Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .fromPackage("hl7.cda.uv.core", "2.0.1-sd")
            .typeSchema({ treeShake: treeShakeConfig })
            .csharp({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        // C# generator does not support logical models (ClinicalDocument is kind: "logical")
        it.todo("should generate ClinicalDocument type", () => {});

        it("should generate base helper files", () => {
            expect(result.filesGenerated["generated/types/base.cs"]).toBeDefined();
            expect(result.filesGenerated["generated/types/Helper.cs"]).toBeDefined();
        });
    });
});
