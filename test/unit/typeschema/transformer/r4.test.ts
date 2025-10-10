import { describe, expect, it } from "bun:test";
import type { CanonicalUrl } from "@root/typeschema";
import type { RegularTypeSchema } from "@root/typeschema/types";
import { mkR4Register, registerFsAndMkTs } from "@typeschema-test/utils";

describe("TypeSchema R4 generation", async () => {
    const r4 = await mkR4Register();

    it("Bundle and elementReference", async () => {
        const profile = r4.resolveFs("http://hl7.org/fhir/StructureDefinition/Bundle" as CanonicalUrl)!;
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
        const md = r4.resolveFs("http://hl7.org/fhir/StructureDefinition/markdown" as CanonicalUrl)!;
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
});
