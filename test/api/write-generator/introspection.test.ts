import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("IntrospectionWriter - Separate Files Output", async () => {
    const result = await new APIBuilder({ manager: r4Manager })
        .setLogLevel("SILENT")
        .treeShake({
            "hl7.fhir.r4.core": {
                "http://hl7.org/fhir/StructureDefinition/OperationOutcome": {},
                "http://hl7.org/fhir/StructureDefinition/DomainResource": {
                    ignoreFields: ["extension", "modifierExtension"],
                },
                "http://hl7.org/fhir/StructureDefinition/BackboneElement": {
                    ignoreFields: ["modifierExtension"],
                },
                "http://hl7.org/fhir/StructureDefinition/Element": {
                    ignoreFields: ["extension"],
                },
            },
        })
        .introspection({ typeSchemas: "introspection" })
        .introspection({ typeSchemas: "introspection.ndjson" })
        .generate();

    expect(result.success).toBeTrue();

    const _schemaFiles = Object.keys(result.filesGenerated);
    expect(Object.keys(result.filesGenerated).length).toEqual(25);
    it("Generated file list", () => {
        expect(Object.keys(result.filesGenerated)).toMatchSnapshot();
    });
    it("Check OperationOutcome introspection schema", () => {
        const operationOutcome =
            result.filesGenerated[
                "generated/introspection/hl7.fhir.r4.core/OperationOutcome(OperationOutcome).introspection.json"
            ];
        expect(operationOutcome).toBeDefined();
        expect(operationOutcome).toMatchSnapshot();
    });
    it("Check all introspection data in a single ndjson file", () => {
        expect(result.filesGenerated["generated/introspection.ndjson"]).toMatchSnapshot();
    });
});

describe("IntrospectionWriter - typeTree", async () => {
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
        .introspection({ typeTree: "type-tree.json" })
        .generate();

    expect(result.success).toBeTrue();

    it("Type tree file should be generated", () => {
        expect(result.filesGenerated["generated/type-tree.json"]).toBeDefined();
    });
});
