import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { mkSilentLogger } from "@typeschema-test/utils";

/**
 * C# generation for the SQL-on-FHIR package.
 * Split into its own file so peak memory stays bounded to one generator on CI.
 */
describe("SQL-on-FHIR C# Generation", async () => {
    const packageUrl = "https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz";

    const treeShakeConfig = {
        "org.sql-on-fhir.ig": {
            "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
        },
    };

    const promoteLogicalConfig = {
        "org.sql-on-fhir.ig": ["https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition" as CanonicalUrl],
    };

    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .fromPackageRef(packageUrl)
        .typeSchema({ treeShake: treeShakeConfig, promoteLogical: promoteLogicalConfig })
        .csharp({ inMemoryOnly: true })
        .generate();

    it("should succeed", () => {
        expect(result.success).toBeTrue();
    });

    it("should generate ViewDefinition type (promoted logical)", () => {
        const viewDef = result.filesGenerated.csharp!["generated/types/OrgSqlOnFhirIg/ViewDefinition.cs"];
        expect(viewDef).toBeDefined();
        expect(viewDef).toMatchSnapshot();
    });

    it("should generate R5 dependency namespace", () => {
        // C# generator creates R5 types for dependencies
        const files = Object.keys(result.filesGenerated.csharp!);
        const r5Files = files.filter((f) => f.includes("Hl7FhirR5Core"));
        expect(r5Files.length).toBe(5);
    });

    it("should generate DomainResource for R5", () => {
        const domainResource = result.filesGenerated.csharp!["generated/types/Hl7FhirR5Core/DomainResource.cs"];
        expect(domainResource).toBeDefined();
        expect(domainResource).toMatchSnapshot();
    });
});
