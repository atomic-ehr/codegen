import { describe, expect, it } from "bun:test";
import type { PFS } from "@typeschema-test/utils";
import { mkR4Register, registerFs, registerFsAndMkTs } from "@typeschema-test/utils";

describe("Processing constraint generation", async () => {
    const r4 = await mkR4Register();
    const A: PFS = {
        url: "uri::A",
        derivation: "specialization",
        name: "a",
        elements: {
            foo: {
                type: "BackboneElement",
                elements: {
                    bar: { type: "string" },
                },
            },
        },
    };
    registerFs(r4, A);
    it("Generate nested type for resource", async () => {
        expect(await registerFsAndMkTs(r4, A)).toMatchObject([
            {
                identifier: { kind: "resource", name: "a", url: "uri::A" },
                fields: {
                    foo: { type: { kind: "nested", name: "foo", url: "uri::A#foo" } },
                },
                nested: [
                    {
                        identifier: { kind: "nested", name: "foo", url: "uri::A#foo" },
                        base: { url: "http://hl7.org/fhir/StructureDefinition/BackboneElement" },
                        fields: { bar: { type: { url: "http://hl7.org/fhir/StructureDefinition/string" } } },
                    },
                ],
                dependencies: [
                    { url: "http://hl7.org/fhir/StructureDefinition/BackboneElement" },
                    { url: "http://hl7.org/fhir/StructureDefinition/string" },
                ],
            },
        ]);
    });

    const B: PFS = {
        base: "uri::A",
        url: "uri::B",
        name: "b",
        derivation: "constraint",
        elements: { foo: { min: 1 } },
    };
    it.todo("Constraint nested type for resource in profile", async () => {
        expect(await registerFsAndMkTs(r4, B)).toMatchObject([
            {
                identifier: { kind: "constraint", name: "b", url: "uri::B" },
                base: { kind: "resource", name: "a", url: "uri::A" },
                fields: {
                    foo: { type: { kind: "nested", name: "foo", url: "uri::A#foo" } },
                },
                nested: undefined,
                dependencies: [
                    { kind: "resource", name: "a", url: "uri::A" },
                    { kind: "nested", name: "foo", url: "uri::A#foo" },
                ],
            },
        ]);
    });

    const C: PFS = {
        base: "B",
        url: "C",
        name: "c",
        derivation: "constraint",
        elements: { foo: { max: 1 } },
    };

    it.todo("Constraint nested type for resource in profile", async () => {
        expect(await registerFsAndMkTs(r4, C)).toMatchObject([
            {
                identifier: { kind: "constraint", name: "c", url: "C" },
                base: { kind: "constraint", name: "b", url: "B" },
                fields: {
                    foo: { type: { kind: "nested", name: "foo", url: "A#foo" } },
                },
                nested: "nil?",
                dependencies: [
                    { kind: "constraint", name: "b", url: "B" },
                    { kind: "nested", name: "foo", url: "A#foo" },
                    null,
                ],
            },
            null,
        ]);
    });
});
