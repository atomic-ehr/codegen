import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("Python Writer Generator", async () => {
    const result = await new APIBuilder({ manager: r4Manager })
        .setLogLevel("SILENT")
        .python({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    expect(Object.keys(result.filesGenerated).length).toEqual(153);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/hl7_fhir_r4_core/patient.py"]).toMatchSnapshot();
    });
    it("static files", async () => {
        expect(result.filesGenerated["generated/requirements.txt"]).toMatchSnapshot();
    });
    it("no README without tree shaking", () => {
        expect(result.filesGenerated["generated/README.md"]).toBeUndefined();
        expect(result.filesGenerated["generated/hl7_fhir_r4_core/README.md"]).toBeUndefined();
    });
});

describe("Python Writer Generator with Tree Shaking", async () => {
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
        .python({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();

    it("generates root README.md with tree shake report", () => {
        expect(result.filesGenerated["generated/README.md"]).toBeDefined();
        expect(result.filesGenerated["generated/README.md"]).toMatchSnapshot();
    });

    it("generates package-level README.md with tree shake report", () => {
        expect(result.filesGenerated["generated/hl7_fhir_r4_core/README.md"]).toBeDefined();
        expect(result.filesGenerated["generated/hl7_fhir_r4_core/README.md"]).toMatchSnapshot();
    });
});
