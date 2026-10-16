import { describe, expect, it } from "bun:test";
import type { CanonicalUrl } from "@typeschema/types";
import { mkR4Register, mkTestLogger, type PFS, r4Package, registerFsAndMkTs } from "@typeschema-test/utils";

describe("TypeSchema Processing constraint generation", async () => {
    const r4 = await mkR4Register();
    const logger = mkTestLogger();
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
    it("Generate nested type for resource", async () => {
        expect(await registerFsAndMkTs(r4, A, logger)).toMatchObject([
            {
                identifier: { kind: "resource", name: "a", url: "uri::A" },
                fields: {
                    foo: { type: { kind: "nested", name: "foo", url: "uri::A#foo" } },
                },
            },
            {
                identifier: { kind: "nested", name: "foo", url: "uri::A#foo" },
                base: { url: "http://hl7.org/fhir/StructureDefinition/BackboneElement" },
                fields: { bar: { type: { url: "http://hl7.org/fhir/StructureDefinition/string" } } },
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
    it("Constraint nested type for resource in profile", async () => {
        expect(await registerFsAndMkTs(r4, B, logger)).toMatchObject([
            {
                identifier: { kind: "profile", name: "b", url: "uri::B" },
                base: { kind: "resource", name: "a", url: "uri::A" },
                fields: {
                    foo: { type: { kind: "nested", name: "foo", url: "uri::A#foo" } },
                },
                dependencies: [
                    { kind: "resource", name: "a", url: "uri::A" },
                    { kind: "nested", name: "foo", url: "uri::A#foo" },
                ],
            },
        ]);
    });

    const C: PFS = {
        base: "uri::B",
        url: "uri::C",
        name: "c",
        derivation: "constraint",
        elements: { foo: { max: 1 } },
    };

    it("Constraint nested type for resource in profile", async () => {
        expect(await registerFsAndMkTs(r4, C, logger)).toMatchObject([
            {
                identifier: { kind: "profile", name: "c", url: "uri::C" },
                base: { kind: "profile", name: "b", url: "uri::B" },
                fields: {
                    foo: { type: { kind: "nested", name: "foo", url: "uri::A#foo" } },
                },
                dependencies: [
                    { kind: "nested", name: "foo", url: "uri::A#foo" },
                    { kind: "profile", name: "b", url: "uri::B" },
                ],
            },
        ]);
    });

    const D: PFS = {
        url: "uri::D",
        derivation: "specialization",
        name: "d",
        elements: {
            foo: {
                type: "BackboneElement",
                elements: {
                    bar: { type: "string" },
                    baz: { type: "integer" },
                    qux: { type: "boolean" },
                },
            },
        },
    };
    const E: PFS = {
        base: "uri::D",
        url: "uri::E",
        name: "e",
        derivation: "constraint",
        elements: {
            foo: {
                elements: {
                    bar: { min: 1 },
                },
            },
        },
    };
    it("Constraint profile nested type includes all inherited sub-elements", async () => {
        await registerFsAndMkTs(r4, D, logger);
        expect(await registerFsAndMkTs(r4, E, logger)).toMatchObject([
            {
                identifier: { kind: "profile", name: "e", url: "uri::E" },
                base: { kind: "resource", name: "d", url: "uri::D" },
                fields: {
                    foo: { type: { kind: "nested", name: "foo", url: "uri::E#foo" } },
                },
            },
            {
                identifier: { kind: "nested", name: "foo", url: "uri::E#foo" },
                base: { url: "uri::D#foo" },
                fields: {
                    bar: {
                        type: { url: "http://hl7.org/fhir/StructureDefinition/string" },
                        min: 1,
                    },
                    baz: { type: { url: "http://hl7.org/fhir/StructureDefinition/integer" } },
                    qux: { type: { url: "http://hl7.org/fhir/StructureDefinition/boolean" } },
                },
            },
        ]);
    });

    it("Use nested type in profile.", async () => {
        const profile = r4.resolveFs(
            r4Package,
            "http://hl7.org/fhir/StructureDefinition/shareablecodesystem" as CanonicalUrl,
        )!;
        const schemas = await registerFsAndMkTs(r4, profile, logger);
        expect(schemas[0]).toMatchObject({
            identifier: { kind: "profile", url: profile.url },
            fields: { concept: { type: { kind: "nested", url: `${profile.url}#concept` } } },
        });
        expect(schemas.find((schema) => schema.identifier.url === `${profile.url}#concept`)).toMatchObject({
            base: { kind: "nested", url: "http://hl7.org/fhir/StructureDefinition/CodeSystem#concept" },
            owner: { kind: "profile", url: profile.url },
        });
        expect(schemas.some((schema) => schema.identifier.kind === "binding")).toBeTrue();
    });
});
