import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { ccdaManager, r4Manager } from "@typeschema-test/utils";

describe("TypeScript Writer Generator", async () => {
    const result = await new APIBuilder({ register: r4Manager })
        .setLogLevel("SILENT")
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    expect(Object.keys(result.filesGenerated).length).toEqual(607);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Patient.ts"]).toMatchSnapshot();
    });
});

describe("TypeScript CDA with Logical Model Promotion to Resource", async () => {
    const result = await new APIBuilder({ register: ccdaManager })
        .setLogLevel("SILENT")
        .typeSchema({
            promoteLogical: {
                "hl7.cda.uv.core": ["http://hl7.org/cda/stds/core/StructureDefinition/Material" as CanonicalUrl],
            },
        })
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    it("without resourceType", async () => {
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/Cv.ts"]).toMatchSnapshot();
    });
    it("with resourceType", async () => {
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/Material.ts"]).toMatchSnapshot();
    });
});
