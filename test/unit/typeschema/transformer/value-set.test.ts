import { describe, expect, it } from "bun:test";
import { mkR4Register, type PVS, transformVS } from "@typeschema-test/utils";

describe("Type Schema generator > ValueSet", async () => {
    const r4 = await mkR4Register();
    const vs: PVS = {
        url: "http://hl7.org/fhir/ValueSet/administrative-gender",
        experimental: false,
        immutable: true,
        id: "administrative-gender",
        name: "AdministrativeGender",
        extension: [
            {
                url: "http://hl7.org/fhir/StructureDefinition/structuredefinition-wg",
                valueCode: "pa",
            },
            {
                url: "http://hl7.org/fhir/StructureDefinition/structuredefinition-standards-status",
                valueCode: "normative",
            },
            {
                url: "http://hl7.org/fhir/StructureDefinition/structuredefinition-fmm",
                valueInteger: 5,
            },
            {
                url: "http://hl7.org/fhir/StructureDefinition/structuredefinition-normative-version",
                valueCode: "4.0.0",
            },
        ],
        status: "active",
        identifier: [
            {
                value: "urn:oid:2.16.840.1.113883.4.642.3.1",
                system: "urn:ietf:rfc:3986",
            },
        ],
        compose: {
            include: [
                {
                    system: "http://hl7.org/fhir/administrative-gender",
                },
            ],
        },
        title: "AdministrativeGender",
        publisher: "HL7 (FHIR Project)",
        version: "4.0.1",
        meta: {
            profile: ["http://hl7.org/fhir/StructureDefinition/shareablevalueset"],
            lastUpdated: "2019-11-01T09:29:23.356+11:00",
        },
        date: "2019-11-01T09:29:23+11:00",
        resourceType: "ValueSet",
        contact: [
            {
                telecom: [
                    {
                        value: "http://hl7.org/fhir",
                        system: "url",
                    },
                    {
                        value: "fhir@lists.hl7.org",
                        system: "email",
                    },
                ],
            },
        ],
        description: "The gender of a person used for administrative purposes.",
    };
    it("Generate adminisrative-gender", async () => {
        expect(await transformVS(r4, vs)).toMatchObject({
            identifier: {
                kind: "value-set",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                name: "AdministrativeGender",
                url: "http://hl7.org/fhir/ValueSet/administrative-gender",
            },
            description: "The gender of a person used for administrative purposes.",
            concept: [
                {
                    system: "http://hl7.org/fhir/administrative-gender",
                    code: "male",
                    display: "Male",
                },
                {
                    system: "http://hl7.org/fhir/administrative-gender",
                    code: "female",
                    display: "Female",
                },
                {
                    system: "http://hl7.org/fhir/administrative-gender",
                    code: "other",
                    display: "Other",
                },
                {
                    system: "http://hl7.org/fhir/administrative-gender",
                    code: "unknown",
                    display: "Unknown",
                },
            ],
        });
    });
});
