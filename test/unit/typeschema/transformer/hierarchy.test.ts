import { describe, expect, it } from "bun:test";
import type { PFS } from "@typeschema-test/utils";
import { mkR4Register, mkR5Register, registerFsAndMkTs } from "@typeschema-test/utils";

describe("TypeSchema: Nested types", async () => {
    const r4 = await mkR4Register();
    describe("A with array field", () => {
        const A: PFS = {
            url: "uri::A",
            name: "A",
            elements: {
                foo: { type: "string", array: true },
            },
        };
        it("Base", async () => {
            expect(await registerFsAndMkTs(r4, A)).toMatchObject([
                {
                    identifier: { url: "uri::A" },
                    fields: {
                        foo: {
                            type: { name: "string" },
                            excluded: false,
                            array: true,
                            required: false,
                        },
                    },
                    dependencies: [{ name: "string" }],
                },
            ]);
        });
    });

    it("A + min cardinality + new field", async () => {
        const B: PFS = {
            base: "uri::A",
            url: "uri::B",
            name: "B",
            required: ["foo"],
            elements: {
                foo: { min: 1 },
                bar: { type: "code" },
            },
        };

        expect(await registerFsAndMkTs(r4, B)).toMatchObject([
            {
                identifier: { url: "uri::B" },
                base: { url: "uri::A" },
                fields: {
                    foo: {
                        type: { name: "string" },
                        required: true,
                        excluded: false,
                        array: true,
                        min: 1,
                    },
                    bar: {
                        type: { name: "code" },
                        excluded: false,
                        array: false,
                        required: false,
                    },
                },
                dependencies: [{ name: "code" }, { name: "string" }, { uri: "uri::A" }],
            },
        ]);
    });

    describe("Choice type translation", () => {
        const C: PFS = {
            base: "uri::B",
            url: "uri::C",
            name: "C",
            required: ["bar", "baz"],
            elements: {
                foo: { max: 2 },
                baz: { type: "string" },
            },
        };
        it("Check optional choice fields", async () => {
            expect(await registerFsAndMkTs(r4, C)).toMatchObject([
                {
                    identifier: { url: "uri::C" },
                    base: { url: "uri::B" },
                    fields: {
                        foo: {
                            type: { name: "string" },
                            excluded: false,
                            array: true,
                            min: 1,
                            max: 2,
                            required: true,
                        },
                        baz: {
                            type: { name: "string" },
                            excluded: false,
                            array: false,
                            required: true,
                        },
                    },
                    dependencies: [{ name: "string" }, { url: "uri::B" }],
                },
            ]);
        });
    });
});

const viewDefinitionSD = {
    name: "ViewDefinition",
    url: "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition",
    version: "2.1.0-pre",
    kind: "logical",
    derivation: "specialization",
    base: "http://hl7.org/fhir/StructureDefinition/CanonicalResource",
    class: "logical",
    elements: {
        select: {
            type: "BackboneElement",
            array: true,
            min: 1,
            elements: {
                select: {
                    short: "Nested select relative to a parent expression.",
                    elementReference: [
                        "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition",
                        "elements",
                        "select",
                    ],
                    array: true,
                },
                unionAll: {
                    short: "Creates a union of all rows in the given selection structures.",
                    elementReference: [
                        "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition",
                        "elements",
                        "select",
                    ],
                    array: true,
                },
            },
        },
    },
    package_meta: {
        name: "org.sql-on-fhir.ig",
        version: "2.1.0-pre",
    },
} as PFS;

describe("TypeSchema: Nested types", async () => {
    const r5 = await mkR5Register();
    it("Check recursive nested types", async () => {
        const tss = await registerFsAndMkTs(r5, viewDefinitionSD);
        expect(tss).toMatchObject([
            {
                nested: [
                    {
                        fields: {
                            select: {
                                type: {
                                    kind: "nested",
                                    package: "org.sql-on-fhir.ig",
                                    version: "2.1.0-pre",
                                    name: "select",
                                    url: "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition#select",
                                },
                                required: false,
                                excluded: false,
                                array: true,
                            },
                        },
                    },
                ],
            },
        ]);
        // expect(tss).toMatchObject([
        // ]);
    });
});
