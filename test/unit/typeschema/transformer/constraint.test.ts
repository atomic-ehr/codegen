import { describe, expect, it } from "bun:test";
import type { CanonicalUrl } from "@typeschema/types";
import { mkR4Register, type PFS, r4Package, registerFsAndMkTs } from "@typeschema-test/utils";

describe("TypeSchema Processing constraint generation", async () => {
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
    it("Constraint nested type for resource in profile", async () => {
        expect(await registerFsAndMkTs(r4, B)).toMatchObject([
            {
                identifier: { kind: "profile", name: "b", url: "uri::B" },
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
        base: "uri::B",
        url: "uri::C",
        name: "c",
        derivation: "constraint",
        elements: { foo: { max: 1 } },
    };

    it("Constraint nested type for resource in profile", async () => {
        expect(await registerFsAndMkTs(r4, C)).toMatchObject([
            {
                identifier: { kind: "profile", name: "c", url: "uri::C" },
                base: { kind: "profile", name: "b", url: "uri::B" },
                fields: {
                    foo: { type: { kind: "nested", name: "foo", url: "uri::A#foo" } },
                },
                nested: undefined,
                dependencies: [
                    { kind: "nested", name: "foo", url: "uri::A#foo" },
                    { kind: "profile", name: "b", url: "uri::B" },
                ],
            },
        ]);
    });

    it("Use nested type in profile.", async () => {
        const profile = r4.resolveFs(
            r4Package,
            "http://hl7.org/fhir/StructureDefinition/shareablecodesystem" as CanonicalUrl,
        );
        if (!profile) {
            throw new Error("shareablecodesystem profile not found");
        }
        expect(await registerFsAndMkTs(r4, profile)).toMatchObject([
            {
                base: { kind: "resource", url: "http://hl7.org/fhir/StructureDefinition/CodeSystem" },
                identifier: { kind: "profile", url: "http://hl7.org/fhir/StructureDefinition/shareablecodesystem" },
                fields: {
                    concept: {
                        type: { kind: "nested", url: "http://hl7.org/fhir/StructureDefinition/CodeSystem#concept" },
                    },
                },
                dependencies: [
                    { kind: "complex-type", url: "http://hl7.org/fhir/StructureDefinition/BackboneElement" },
                    { kind: "primitive-type", url: "http://hl7.org/fhir/StructureDefinition/boolean" },
                    { kind: "primitive-type", url: "http://hl7.org/fhir/StructureDefinition/code" },
                    { kind: "resource", url: "http://hl7.org/fhir/StructureDefinition/CodeSystem" },
                    { kind: "nested", url: "http://hl7.org/fhir/StructureDefinition/CodeSystem#concept" },
                    { kind: "primitive-type", url: "http://hl7.org/fhir/StructureDefinition/markdown" },
                    { kind: "primitive-type", url: "http://hl7.org/fhir/StructureDefinition/string" },
                    { kind: "primitive-type", url: "http://hl7.org/fhir/StructureDefinition/uri" },
                    { kind: "binding", url: "urn:fhir:binding:PublicationStatus" },
                ],
            },
            {
                identifier: { kind: "binding", url: "urn:fhir:binding:PublicationStatus" },
            },
        ]);
    });
});
