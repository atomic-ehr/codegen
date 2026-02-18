import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { makeLogger } from "@root/utils/logger";
import { ccdaManager, r4Manager } from "@typeschema-test/utils";

describe("TypeScript Writer Generator", async () => {
    const result = await new APIBuilder({ register: r4Manager })
        .setLogLevel("error")
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    expect(Object.keys(result.filesGenerated).length).toEqual(638);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Patient.ts"]).toMatchSnapshot();
    });
    it("generates Coding with generic parameter", async () => {
        const codingTs = result.filesGenerated["generated/types/hl7-fhir-r4-core/Coding.ts"];
        expect(codingTs).toContain("export interface Coding<T extends string = string>");
        expect(codingTs).toContain("code?: T");
    });
    it("generates CodeableConcept with generic parameter", async () => {
        const ccTs = result.filesGenerated["generated/types/hl7-fhir-r4-core/CodeableConcept.ts"];
        expect(ccTs).toContain("export interface CodeableConcept<T extends string = string>");
        expect(ccTs).toContain("coding?: Coding<T>[]");
    });
});

describe("TypeScript CDA with Logical Model Promotion to Resource", async () => {
    const result = await new APIBuilder({ register: ccdaManager })
        .setLogLevel("error")
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
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/CV.ts"]).toMatchSnapshot();
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/index.ts"]).toMatchSnapshot();
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/profiles/index.ts"]).toMatchSnapshot();
    });
    it("with resourceType", async () => {
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/Material.ts"]).toMatchSnapshot();
    });
});

describe("TypeScript R4 Example (with generateProfile)", async () => {
    const logger = makeLogger({ level: "error" });

    const result = await new APIBuilder({ register: r4Manager, logger })
        .typescript({
            inMemoryOnly: true,
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .generate();

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("has no file rewrite warnings", () => {
        const rewriteWarnings = logger
            .buffer()
            .filter((e) => e.level === "warn" && e.message.includes("File will be rewritten"));
        expect(rewriteWarnings).toEqual([]);
    });
});
