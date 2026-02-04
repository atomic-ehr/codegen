import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("IntrospectionWriter - Fhir Schema Output", async () => {
    const result = await new APIBuilder({ register: r4Manager })
        .setLogLevel("SILENT")
        .introspection({ fhirSchemas: "introspection" })
        .introspection({ fhirSchemas: "introspection.ndjson" })
        .generate();

    expect(result.success).toBeTrue();

    expect(Object.keys(result.filesGenerated).length).toEqual(656);
    it("Generated file list", () => {
        expect(Object.keys(result.filesGenerated)).toMatchSnapshot();
    });
    it("Check OperationOutcome introspection schema", () => {
        const operationOutcome =
            result.filesGenerated["generated/introspection/hl7.fhir.r4.core/OperationOutcome(OperationOutcome).json"];
        expect(operationOutcome).toBeDefined();
        expect(operationOutcome).toMatchSnapshot();
    });
    it("Check all introspection data in a single ndjson file", () => {
        expect(result.filesGenerated["generated/introspection.ndjson"]).toMatchSnapshot();
    });
});

describe("IntrospectionWriter - TypeSchema output", async () => {
    const result = await new APIBuilder({ register: r4Manager })
        .setLogLevel("SILENT")
        .typeSchema({
            treeShake: {
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
            },
        })
        .introspection({ typeSchemas: "introspection" })
        .introspection({ typeSchemas: "introspection.ndjson" })
        .generate();

    expect(result.success).toBeTrue();

    expect(Object.keys(result.filesGenerated).length).toEqual(26);
    it("Generated file list", () => {
        expect(Object.keys(result.filesGenerated)).toMatchSnapshot();
    });
    it("Check OperationOutcome introspection schema", () => {
        const operationOutcome =
            result.filesGenerated["generated/introspection/hl7.fhir.r4.core/OperationOutcome(OperationOutcome).json"];
        expect(operationOutcome).toBeDefined();
        expect(operationOutcome).toMatchSnapshot();
    });
    it("Check all introspection data in a single ndjson file", () => {
        expect(result.filesGenerated["generated/introspection.ndjson"]).toMatchSnapshot();
    });
});

describe("IntrospectionWriter - typeTree", async () => {
    const result = await new APIBuilder({ register: r4Manager })
        .setLogLevel("SILENT")
        .typeSchema({
            treeShake: {
                "hl7.fhir.r4.core": {
                    "http://hl7.org/fhir/StructureDefinition/Patient": {},
                    "http://hl7.org/fhir/StructureDefinition/DomainResource": {
                        ignoreFields: ["extension", "modifierExtension"],
                    },
                    "http://hl7.org/fhir/StructureDefinition/Element": {
                        ignoreFields: ["extension"],
                    },
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

describe("IntrospectionWriter - StructureDefinition output", async () => {
    const result = await new APIBuilder({ register: r4Manager })
        .setLogLevel("SILENT")
        .typeSchema({
            treeShake: {
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
            },
        })
        .introspection({ structureDefinitions: "structure-definitions" })
        .introspection({ structureDefinitions: "structure-definitions.ndjson" })
        .generate();

    expect(result.success).toBeTrue();

    it("Generated file list", () => {
        expect(Object.keys(result.filesGenerated)).toMatchSnapshot();
    });
    it("Check OperationOutcome StructureDefinition", () => {
        const operationOutcome =
            result.filesGenerated[
                "generated/structure-definitions/hl7.fhir.r4.core/OperationOutcome(OperationOutcome).json"
            ];
        expect(operationOutcome).toBeDefined();
        expect(operationOutcome).toMatchSnapshot();
    });
    it("Check all StructureDefinitions in a single ndjson file", () => {
        expect(result.filesGenerated["generated/structure-definitions.ndjson"]).toMatchSnapshot();
    });
});
