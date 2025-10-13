import { describe, expect, it } from "bun:test";
import type { CanonicalUrl } from "@root/typeschema";
import type { RegularTypeSchema } from "@root/typeschema/types";
import { mkCCDARegister, registerFsAndMkTs } from "@typeschema-test/utils";

describe("TypeSchema R4 generation", async () => {
    const ccda = await mkCCDARegister();

    it("http://hl7.org/cda/stds/core/StructureDefinition/ON", async () => {
        const resource = ccda.resolveFs("http://hl7.org/cda/stds/core/StructureDefinition/ON" as CanonicalUrl)!;
        const ts = (await registerFsAndMkTs(ccda, resource))[0] as RegularTypeSchema;
        expect(ts).toMatchObject({
            base: {
                kind: "resource",
                name: "EN",
                package: "hl7.cda.uv.core",
                url: "http://hl7.org/cda/stds/core/StructureDefinition/EN",
                version: "2.0.1-sd",
            },
            dependencies: [
                {
                    kind: "resource",
                    name: "EN",
                    package: "hl7.cda.uv.core",
                    url: "http://hl7.org/cda/stds/core/StructureDefinition/EN",
                    version: "2.0.1-sd",
                },
                {
                    kind: "complex-type",
                    name: "BackboneElement",
                    package: "hl7.cda.uv.core",
                    url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
                    version: "2.0.1-sd",
                },
                {
                    kind: "complex-type",
                    name: "Base",
                    package: "hl7.fhir.r5.core",
                    url: "http://hl7.org/fhir/StructureDefinition/Base",
                    version: "5.0.0",
                },
            ],
            fields: {
                item: {
                    array: true,
                    binding: undefined,
                    choiceOf: undefined,
                    choices: undefined,
                    enum: undefined,
                    excluded: false,
                    max: undefined,
                    min: undefined,
                    reference: undefined,
                    required: false,
                    type: {
                        kind: "complex-type",
                        name: "Base",
                        package: "hl7.fhir.r5.core",
                        url: "http://hl7.org/fhir/StructureDefinition/Base",
                        version: "5.0.0",
                    },
                },
            },
            identifier: {
                kind: "resource",
                name: "ON",
                package: "hl7.cda.uv.core",
                url: "http://hl7.org/cda/stds/core/StructureDefinition/ON",
                version: "2.0.1-sd",
            },
            nested: [
                {
                    base: {
                        kind: "complex-type",
                        name: "BackboneElement",
                        package: "hl7.cda.uv.core",
                        url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
                        version: "2.0.1-sd",
                    },
                    fields: {
                        family: {
                            array: false,
                            binding: undefined,
                            choiceOf: undefined,
                            choices: undefined,
                            enum: undefined,
                            excluded: false,
                            max: undefined,
                            min: undefined,
                            reference: undefined,
                            required: false,
                            type: undefined,
                        },
                        given: {
                            array: false,
                            binding: undefined,
                            choiceOf: undefined,
                            choices: undefined,
                            enum: undefined,
                            excluded: false,
                            max: undefined,
                            min: undefined,
                            reference: undefined,
                            required: false,
                            type: undefined,
                        },
                    },
                    identifier: {
                        kind: "nested",
                        name: "item",
                        package: "hl7.cda.uv.core",
                        url: "http://hl7.org/cda/stds/core/StructureDefinition/ON#item",
                        version: "2.0.1-sd",
                    },
                },
            ],
        });
    });
});
