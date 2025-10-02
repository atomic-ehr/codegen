import { describe, expect, it } from "bun:test";
import type { PFS } from "@typeschema-test/utils";
import { mkR4Register, registerFsAndMkTs } from "@typeschema-test/utils";

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
