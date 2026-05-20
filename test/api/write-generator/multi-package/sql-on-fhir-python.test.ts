import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { mkSilentLogger } from "@typeschema-test/utils";

/**
 * Python generation for the SQL-on-FHIR package.
 * Split into its own file so peak memory stays bounded to one generator on CI.
 */
describe("SQL-on-FHIR Python Generation", async () => {
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
        .python({ inMemoryOnly: true })
        .generate();

    it("should succeed", () => {
        expect(result.success).toBeTrue();
    });

    it("should generate ViewDefinition type (promoted logical)", () => {
        const viewDef = result.filesGenerated.python!["generated/org_sql_on_fhir_ig/view_definition.py"];
        expect(viewDef).toBeDefined();
        expect(viewDef).toMatchSnapshot();
    });

    it("should generate R5 dependency package", () => {
        // Python generator creates R5 base types for dependencies
        expect(result.filesGenerated.python!["generated/hl7_fhir_r5_core/__init__.py"]).toBeDefined();
        expect(result.filesGenerated.python!["generated/hl7_fhir_r5_core/domain_resource.py"]).toBeDefined();
    });

    it("should generate domain_resource for R5", () => {
        const domainResource = result.filesGenerated.python!["generated/hl7_fhir_r5_core/domain_resource.py"];
        expect(domainResource).toBeDefined();
        expect(domainResource).toMatchSnapshot();
    });
});
