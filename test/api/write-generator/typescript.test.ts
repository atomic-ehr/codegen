import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("TypeScript Writer Generator", async () => {
    const result = await new APIBuilder({ manager: r4Manager })
        .setLogLevel("SILENT")
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    expect(Object.keys(result.filesGenerated).length).toEqual(236);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Patient.ts"]).toMatchSnapshot();
    });
    it("no README without tree shaking", () => {
        expect(result.filesGenerated["generated/types/README.md"]).toBeUndefined();
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/README.md"]).toBeUndefined();
    });
});

describe("TypeScript Writer Generator with Tree Shaking", async () => {
    const result = await new APIBuilder({ manager: r4Manager })
        .setLogLevel("SILENT")
        .treeShake({
            "hl7.fhir.r4.core": {
                "http://hl7.org/fhir/StructureDefinition/Patient": {},
                "http://hl7.org/fhir/StructureDefinition/DomainResource": {
                    ignoreFields: ["extension", "modifierExtension"],
                },
                "http://hl7.org/fhir/StructureDefinition/Element": {
                    ignoreFields: ["extension"],
                },
            },
        })
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();

    it("generates root README.md with tree shake report", () => {
        expect(result.filesGenerated["generated/types/README.md"]).toBeDefined();
        expect(result.filesGenerated["generated/types/README.md"]).toMatchSnapshot();
    });

    it("generates package-level README.md with tree shake report", () => {
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/README.md"]).toBeDefined();
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/README.md"]).toMatchSnapshot();
    });
});
