import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

/**
 * TypeScript generation for the SQL-on-FHIR package.
 * Split into its own file so peak memory stays bounded to one generator on CI.
 */
describe("SQL-on-FHIR TypeScript Generation", async () => {
    const packageUrl = "https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz";

    const treeShakeConfig = {
        "org.sql-on-fhir.ig": {
            "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
        },
    };

    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .fromPackageRef(packageUrl)
        .typeSchema({ treeShake: treeShakeConfig })
        .typescript({ inMemoryOnly: true })
        .generate();

    it("should succeed", () => {
        expect(result.success).toBeTrue();
    });

    it("should generate ViewDefinition type", () => {
        const viewDef = result.filesGenerated.typescript!["generated/types/org-sql-on-fhir-ig/ViewDefinition.ts"];
        expect(viewDef).toBeDefined();
        expect(viewDef).toMatchSnapshot();
    });

    it("should resolve R5 dependencies (required by SQL-on-FHIR)", () => {
        const files = Object.keys(result.filesGenerated.typescript!);
        const r5Files = files.filter((f) => f.includes("hl7-fhir-r5-core"));
        expect(r5Files.length).toBe(45);

        // Core R5 types should be included
        expect(result.filesGenerated.typescript!["generated/types/hl7-fhir-r5-core/Element.ts"]).toBeDefined();
        expect(result.filesGenerated.typescript!["generated/types/hl7-fhir-r5-core/DomainResource.ts"]).toBeDefined();
    });

    it("should generate package index files", () => {
        expect(result.filesGenerated.typescript!["generated/types/org-sql-on-fhir-ig/index.ts"]).toBeDefined();
        expect(result.filesGenerated.typescript!["generated/types/hl7-fhir-r5-core/index.ts"]).toBeDefined();
    });
});
