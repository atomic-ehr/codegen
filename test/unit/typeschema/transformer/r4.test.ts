import { describe, expect, it } from "bun:test";
import { generateTypeSchemas } from "@root/typeschema";
import type { CanonicalUrl, Name, RegularTypeSchema } from "@typeschema/types";
import { mkR4Register, r4Package, registerFsAndMkTs } from "@typeschema-test/utils";

describe("TypeSchema R4 generation", async () => {
    const r4 = await mkR4Register();

    it("Bundle and elementReference", async () => {
        const profile = r4.resolveFs(r4Package, "http://hl7.org/fhir/StructureDefinition/Bundle" as CanonicalUrl)!;
        const ts = (await registerFsAndMkTs(r4, profile))[0] as RegularTypeSchema;
        expect(ts?.nested).toHaveLength(5);
        expect(ts).toMatchObject({
            identifier: { kind: "resource", url: "http://hl7.org/fhir/StructureDefinition/Bundle" },
            nested: [
                {
                    identifier: { url: "http://hl7.org/fhir/StructureDefinition/Bundle#entry" },
                    fields: {
                        link: {
                            type: { kind: "nested", url: "http://hl7.org/fhir/StructureDefinition/Bundle#link" },
                            required: false,
                            excluded: false,
                            array: true,
                        },
                    },
                },
                { identifier: { url: "http://hl7.org/fhir/StructureDefinition/Bundle#entry.request" } },
                { identifier: { url: "http://hl7.org/fhir/StructureDefinition/Bundle#entry.response" } },
                { identifier: { url: "http://hl7.org/fhir/StructureDefinition/Bundle#entry.search" } },
                { identifier: { url: "http://hl7.org/fhir/StructureDefinition/Bundle#link" } },
            ],
            fields: {
                entry: {
                    array: true,
                    excluded: false,
                    required: false,
                    type: {
                        kind: "nested",
                        name: "entry",
                        package: "hl7.fhir.r4.core",
                        url: "http://hl7.org/fhir/StructureDefinition/Bundle#entry",
                        version: "4.0.1",
                    },
                },
            },
        });
    });

    it("markdown", async () => {
        const md = r4.resolveFs(r4Package, "http://hl7.org/fhir/StructureDefinition/markdown" as CanonicalUrl)!;
        const ts = (await registerFsAndMkTs(r4, md))[0] as RegularTypeSchema;
        expect(ts).toMatchObject({
            identifier: {
                kind: "primitive-type",
                name: "markdown",
                url: "http://hl7.org/fhir/StructureDefinition/markdown",
            },
            base: { url: "http://hl7.org/fhir/StructureDefinition/string" },
            fields: undefined,
            nested: undefined,
            dependencies: [{ url: "http://hl7.org/fhir/StructureDefinition/string" }],
        });
    });

    it("Parameter & markdown type", async () => {
        await generateTypeSchemas(r4);
        const parameters = r4.resolveFs(
            r4Package,
            "http://hl7.org/fhir/StructureDefinition/Parameters" as CanonicalUrl,
        )!;
        const ts = (await registerFsAndMkTs(r4, parameters))[0] as RegularTypeSchema;
        expect(ts.dependencies!).toContainEqual({
            kind: "primitive-type",
            package: "hl7.fhir.r4.core",
            version: "4.0.1",
            name: "markdown" as Name,
            url: "http://hl7.org/fhir/StructureDefinition/markdown" as CanonicalUrl,
        });
        expect(ts).toMatchObject({
            base: {
                kind: "resource",
                name: "Resource",
                package: "hl7.fhir.r4.core",
                url: "http://hl7.org/fhir/StructureDefinition/Resource",
                version: "4.0.1",
            },
            identifier: {
                kind: "resource",
                name: "Parameters",
                package: "hl7.fhir.r4.core",
                url: "http://hl7.org/fhir/StructureDefinition/Parameters",
                version: "4.0.1",
            },
            fields: {
                parameter: {
                    type: { kind: "nested", url: "http://hl7.org/fhir/StructureDefinition/Parameters#parameter" },
                },
            },
            nested: [
                {
                    base: { kind: "complex-type", url: "http://hl7.org/fhir/StructureDefinition/BackboneElement" },
                    identifier: { kind: "nested", url: "http://hl7.org/fhir/StructureDefinition/Parameters#parameter" },
                    fields: {
                        name: { type: { url: "http://hl7.org/fhir/StructureDefinition/string" } },
                        part: {
                            type: {
                                kind: "nested",
                                url: "http://hl7.org/fhir/StructureDefinition/Parameters#parameter",
                            },
                        },
                        value: {
                            choices: [
                                "valueBase64Binary",
                                "valueBoolean",
                                "valueCanonical",
                                "valueCode",
                                "valueDate",
                                "valueDateTime",
                                "valueDecimal",
                                "valueId",
                                "valueInstant",
                                "valueInteger",
                                "valueMarkdown",
                                "valueOid",
                                "valuePositiveInt",
                                "valueString",
                                "valueTime",
                                "valueUnsignedInt",
                                "valueUri",
                                "valueUrl",
                                "valueUuid",
                                "valueAddress",
                                "valueAge",
                                "valueAnnotation",
                                "valueAttachment",
                                "valueCodeableConcept",
                                "valueCoding",
                                "valueContactPoint",
                                "valueCount",
                                "valueDistance",
                                "valueDuration",
                                "valueHumanName",
                                "valueIdentifier",
                                "valueMoney",
                                "valuePeriod",
                                "valueQuantity",
                                "valueRange",
                                "valueRatio",
                                "valueReference",
                                "valueSampledData",
                                "valueSignature",
                                "valueTiming",
                                "valueContactDetail",
                                "valueContributor",
                                "valueDataRequirement",
                                "valueExpression",
                                "valueParameterDefinition",
                                "valueRelatedArtifact",
                                "valueTriggerDefinition",
                                "valueUsageContext",
                                "valueDosage",
                                "valueMeta",
                            ],
                        },
                        valueMarkdown: {
                            type: {
                                kind: "primitive-type",
                                name: "markdown",
                                package: "hl7.fhir.r4.core",
                                url: "http://hl7.org/fhir/StructureDefinition/markdown",
                                version: "4.0.1",
                            },
                        },
                    },
                },
            ],
        });
    });
});
