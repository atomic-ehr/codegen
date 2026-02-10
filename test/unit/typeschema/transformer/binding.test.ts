import { describe, expect, it } from "bun:test";
import type { PFS } from "@typeschema-test/utils";
import { mkR4Register, registerFsAndMkTs } from "@typeschema-test/utils";

describe("Type Schema generator > Binding", async () => {
    const r4 = await mkR4Register();
    const A: PFS = {
        description: "description",
        derivation: "specialization",
        type: "WithCode",
        name: "WithCode",
        kind: "resource",
        url: "http://example.io/fhir/WithCode",
        base: "http://hl7.org/fhir/StructureDefinition/DomainResource",
        elements: {
            gender: {
                short: "male | female | other | unknown",
                type: "code",
                binding: {
                    strength: "required",
                    valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1",
                    bindingName: "AdministrativeGender",
                },
                isSummary: true,
                index: 1,
            },
        },
        class: "resource",
        version: "4.0.1",
    };
    it("Generate nested type for resource", async () => {
        expect(await registerFsAndMkTs(r4, A)).toMatchObject([
            {
                identifier: { package: "mypackage", url: "http://example.io/fhir/WithCode" },
                base: { package: "hl7.fhir.r4.core", url: "http://hl7.org/fhir/StructureDefinition/DomainResource" },
                dependencies: [
                    { package: "hl7.fhir.r4.core", url: "http://hl7.org/fhir/StructureDefinition/code" },
                    { package: "hl7.fhir.r4.core", url: "http://hl7.org/fhir/StructureDefinition/DomainResource" },
                    {
                        kind: "binding",
                        name: "AdministrativeGender",
                        package: "shared",
                        url: "urn:fhir:binding:AdministrativeGender",
                    },
                ],
                fields: {
                    gender: {
                        binding: {
                            kind: "binding",
                            name: "AdministrativeGender",
                            package: "shared",
                            url: "urn:fhir:binding:AdministrativeGender",
                        },
                        enum: { values: ["male", "female", "other", "unknown"], isOpen: false },
                        type: { package: "hl7.fhir.r4.core", url: "http://hl7.org/fhir/StructureDefinition/code" },
                    },
                },
            },
            {
                identifier: {
                    kind: "binding",
                    name: "AdministrativeGender",
                    package: "shared",
                    url: "urn:fhir:binding:AdministrativeGender",
                },
                dependencies: [
                    {
                        kind: "value-set",
                        name: "AdministrativeGender",
                        package: "hl7.fhir.r4.core",
                        url: "http://hl7.org/fhir/ValueSet/administrative-gender",
                        version: "4.0.1",
                    },
                ],
                enum: { values: ["male", "female", "other", "unknown"], isOpen: false },

                strength: "required",
                valueset: {
                    kind: "value-set",
                    name: "AdministrativeGender",
                    package: "hl7.fhir.r4.core",
                    url: "http://hl7.org/fhir/ValueSet/administrative-gender",
                    version: "4.0.1",
                },
            },
        ]);
    });
});
