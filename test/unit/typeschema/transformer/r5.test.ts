import { describe, expect, it } from "bun:test";
import type { CanonicalUrl, RegularTypeSchema } from "@root/typeschema/types";
import { mkR5Register, r5Package, registerFsAndMkTs } from "@typeschema-test/utils";

describe("TypeSchema R5 generation", async () => {
    const r5 = await mkR5Register();

    it("http://hl7.org/fhir/StructureDefinition/shareablecodesystem", async () => {
        const fs = r5.resolveFs(
            r5Package,
            "http://hl7.org/fhir/StructureDefinition/shareablecodesystem" as CanonicalUrl,
        );
        expect(fs).toBeDefined();
        if (!fs) throw new Error("fs is undefined");
        const ts = (await registerFsAndMkTs(r5, fs))[0] as RegularTypeSchema;

        expect(ts).toMatchObject({
            identifier: {
                kind: "profile",
                package: "hl7.fhir.r5.core",
                version: "5.0.0",
                name: "ShareableCodeSystem",
                url: "http://hl7.org/fhir/StructureDefinition/shareablecodesystem",
            },
            base: {
                kind: "resource",
                package: "hl7.fhir.r5.core",
                version: "5.0.0",
                name: "CodeSystem",
                url: "http://hl7.org/fhir/StructureDefinition/CodeSystem",
            },
            fields: {
                concept: {
                    type: {
                        kind: "nested",
                        package: "hl7.fhir.r5.core",
                        version: "5.0.0",
                        name: "concept",
                        url: "http://hl7.org/fhir/StructureDefinition/CodeSystem#concept",
                    },
                },
            },
            nested: [
                {
                    identifier: {
                        kind: "nested",
                        package: "hl7.fhir.r5.core",
                        version: "5.0.0",
                        name: "concept",
                        url: "http://hl7.org/fhir/StructureDefinition/CodeSystem#concept",
                    },
                    base: {
                        kind: "complex-type",
                        package: "hl7.fhir.r5.core",
                        version: "5.0.0",
                        name: "BackboneElement",
                        url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
                    },
                    fields: {
                        concept: {
                            type: {
                                kind: "nested",
                                package: "hl7.fhir.r5.core",
                                version: "5.0.0",
                                name: "org/fhir/StructureDefinition/CodeSystem#CodeSystem.concept",
                                url: "http://hl7.org/fhir/StructureDefinition/shareablecodesystem#org/fhir/StructureDefinition/CodeSystem#CodeSystem.concept",
                            },
                        },
                    },
                },
            ],
        });
    });

    it("Extension", async () => {
        const fs = r5.resolveFs(r5Package, "http://hl7.org/fhir/StructureDefinition/Extension" as CanonicalUrl);
        expect(fs).toBeDefined();
        if (!fs) throw new Error("Failed to resolve fs");
        const ts = (await registerFsAndMkTs(r5, fs))[0] as RegularTypeSchema;
        expect(ts).toMatchObject({
            identifier: {
                kind: "complex-type",
                package: "hl7.fhir.r5.core",
                version: "5.0.0",
                name: "Extension",
                url: "http://hl7.org/fhir/StructureDefinition/Extension",
            },
            base: {
                kind: "complex-type",
                package: "hl7.fhir.r5.core",
                version: "5.0.0",
                name: "DataType",
                url: "http://hl7.org/fhir/StructureDefinition/DataType",
            },
            description: "Extension Type: Optional Extension Element - found in all resources.",
            fields: {
                url: {},
                value: {},
                valueBase64Binary: {},
                valueBoolean: {},
                valueCanonical: {},
                valueCode: {},
                valueDate: {},
                valueDateTime: {},
                valueDecimal: {},
                valueId: {},
                valueInstant: {},
                valueInteger: {},
                valueInteger64: {},
                valueMarkdown: {},
                valueOid: {},
                valuePositiveInt: {},
                valueString: {},
                valueTime: {},
                valueUnsignedInt: {},
                valueUri: {},
                valueUrl: {},
                valueUuid: {},
                valueAddress: {},
                valueAge: {},
                valueAnnotation: {},
                valueAttachment: {},
                valueCodeableConcept: {},
                valueCodeableReference: {},
                valueCoding: {},
                valueContactPoint: {},
                valueCount: {},
                valueDistance: {},
                valueDuration: {},
                valueHumanName: {},
                valueIdentifier: {},
                valueMoney: {},
                valuePeriod: {},
                valueQuantity: {},
                valueRange: {},
                valueRatio: {},
                valueRatioRange: {},
                valueReference: {},
                valueSampledData: {},
                valueSignature: {},
                valueTiming: {},
                valueContactDetail: {},
                valueDataRequirement: {},
                valueExpression: {},
                valueParameterDefinition: {},
                valueRelatedArtifact: {},
                valueTriggerDefinition: {},
                valueUsageContext: {},
                valueAvailability: {},
                valueExtendedContactDetail: {},
                valueDosage: {},
                valueMeta: {},
            },
        });
    });
});
