import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";

/**
 * Tests for SQL-on-FHIR package.
 * The SQL-on-FHIR package depends on hl7.fhir.r5.core.
 */
describe("SQL-on-FHIR", async () => {
    const packageUrl = "https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz";

    const treeShakeConfig = {
        "org.sql-on-fhir.ig": {
            "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
        },
    };

    describe("TypeScript Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .fromPackageRef(packageUrl)
            .typeSchema({ treeShake: treeShakeConfig })
            .typescript({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ViewDefinition type", () => {
            const viewDef = result.filesGenerated["generated/types/org-sql-on-fhir-ig/ViewDefinition.ts"];
            expect(viewDef).toBeDefined();
            expect(viewDef).toMatchSnapshot();
        });

        it("should resolve R5 dependencies (required by SQL-on-FHIR)", () => {
            const files = Object.keys(result.filesGenerated);
            const r5Files = files.filter((f) => f.includes("hl7-fhir-r5-core"));
            expect(r5Files.length).toBeGreaterThan(0);

            // Core R5 types should be included
            expect(result.filesGenerated["generated/types/hl7-fhir-r5-core/Element.ts"]).toBeDefined();
            expect(result.filesGenerated["generated/types/hl7-fhir-r5-core/DomainResource.ts"]).toBeDefined();
        });

        it("should generate package index files", () => {
            expect(result.filesGenerated["generated/types/org-sql-on-fhir-ig/index.ts"]).toBeDefined();
            expect(result.filesGenerated["generated/types/hl7-fhir-r5-core/index.ts"]).toBeDefined();
        });
    });

    describe("Python Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .fromPackageRef(packageUrl)
            .typeSchema({ treeShake: treeShakeConfig })
            .python({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        // Python generator does not support logical models (ViewDefinition is kind: "logical")
        it.todo("should generate ViewDefinition type", () => {});

        it("should generate R5 dependency package", () => {
            // Python generator creates R5 base types for dependencies
            expect(result.filesGenerated["generated/hl7_fhir_r5_core/__init__.py"]).toBeDefined();
            expect(result.filesGenerated["generated/hl7_fhir_r5_core/domain_resource.py"]).toBeDefined();
        });

        it("should generate domain_resource for R5", () => {
            const domainResource = result.filesGenerated["generated/hl7_fhir_r5_core/domain_resource.py"];
            expect(domainResource).toBeDefined();
            expect(domainResource).toMatchSnapshot();
        });
    });

    describe("C# Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .fromPackageRef(packageUrl)
            .typeSchema({ treeShake: treeShakeConfig })
            .csharp({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        // C# generator does not support logical models (ViewDefinition is kind: "logical")
        it.todo("should generate ViewDefinition type", () => {});

        it("should generate R5 dependency namespace", () => {
            // C# generator creates R5 types for dependencies
            const files = Object.keys(result.filesGenerated);
            const r5Files = files.filter((f) => f.includes("Hl7FhirR5Core"));
            expect(r5Files.length).toBeGreaterThan(0);
        });

        it("should generate DomainResource for R5", () => {
            const domainResource = result.filesGenerated["generated/types/Hl7FhirR5Core/DomainResource.cs"];
            expect(domainResource).toBeDefined();
            expect(domainResource).toMatchSnapshot();
        });
    });
});
