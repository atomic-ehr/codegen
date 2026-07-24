import { describe, expect, it } from "bun:test";
import { mkTypeSchemaIndex } from "@root/typeschema/utils";
import type { CanonicalUrl, TypeSchema } from "@typeschema/types";
import { mkErrorLogger, mkR4Register, r4Package, registerFs, resolveTs } from "@typeschema-test/utils";

const myPkg = { name: "mypackage", version: "0.0.0" };

/** Derived slice facts (effectiveRequired, constrainedChoice, autoStub,
 *  resourceType) are computed once at snapshot build by enrichSliceInfo. */
describe("slice enrichment on profile snapshots", async () => {
    const r4 = await mkR4Register();
    const logger = mkErrorLogger();

    registerFs(r4, {
        url: "http://example.org/StructureDefinition/TestVitals",
        name: "TestVitals",
        base: "http://hl7.org/fhir/StructureDefinition/Observation",
        derivation: "constraint",
        kind: "resource",
        elements: {
            category: {
                type: "CodeableConcept",
                array: true,
                slicing: {
                    discriminator: [{ type: "pattern", path: "$this" }],
                    rules: "open",
                    slices: {
                        VSCat: { min: 1, max: 1, match: { coding: [{ code: "vital-signs" }] } },
                    },
                },
            },
            component: {
                array: true,
                slicing: {
                    discriminator: [{ type: "pattern", path: "code" }],
                    rules: "open",
                    slices: {
                        Sys: {
                            min: 1,
                            max: 1,
                            match: { code: { coding: [{ code: "8480-6" }] } },
                            schema: {
                                required: ["value"],
                                elements: { code: {}, valueQuantity: {} },
                            },
                        },
                    },
                },
            },
        },
    });

    registerFs(r4, {
        url: "http://example.org/StructureDefinition/TestBundle",
        name: "TestBundle",
        base: "http://hl7.org/fhir/StructureDefinition/Bundle",
        derivation: "constraint",
        kind: "resource",
        elements: {
            entry: {
                array: true,
                slicing: {
                    discriminator: [{ type: "type", path: "resource" }],
                    rules: "open",
                    slices: {
                        Pat: {
                            min: 1,
                            max: 1,
                            match: { resource: { resourceType: "Patient" } } as Record<string, unknown>,
                        },
                    },
                },
            },
        },
    });

    const schemas: TypeSchema[] = [];
    for (const [pkg, url] of [
        [myPkg, "http://example.org/StructureDefinition/TestVitals"],
        [myPkg, "http://example.org/StructureDefinition/TestBundle"],
        [r4Package, "http://hl7.org/fhir/StructureDefinition/Observation"],
        [r4Package, "http://hl7.org/fhir/StructureDefinition/Bundle"],
        [r4Package, "http://hl7.org/fhir/StructureDefinition/DomainResource"],
        [r4Package, "http://hl7.org/fhir/StructureDefinition/Resource"],
    ] as const) {
        schemas.push(...(await resolveTs(r4, pkg, url as CanonicalUrl, logger)));
    }
    const tsIndex = mkTypeSchemaIndex(schemas, { register: r4, logger });

    const snapshot = (name: string) => {
        const snap = tsIndex.collectSnapshotProfiles().find((s) => s.identifier.name === name);
        if (!snap) throw new Error(`No snapshot for ${name}`);
        return snap;
    };

    it("marks match-only required slices as autoStub", () => {
        const slice = snapshot("TestVitals").slicing?.category?.slices?.VSCat;
        expect(slice?.autoStub).toBeTrue();
        expect(slice?.effectiveRequired).toBeUndefined();
        expect(slice?.constrainedChoice).toBeUndefined();
        expect(slice?.resourceType).toBeUndefined();
    });

    it("resolves constrained choices and keeps the autoStub/effectiveRequired asymmetry", () => {
        const slice = snapshot("TestVitals").slicing?.component?.slices?.Sys;
        // The slice narrows component.value[x] to valueQuantity.
        expect(slice?.constrainedChoice?.choiceBase).toBe("value");
        expect(slice?.constrainedChoice?.variant).toBe("valueQuantity");
        expect(String(slice?.constrainedChoice?.variantType.name)).toBe("Quantity");
        // "value" is a choice-declaration base name, never a real JSON key:
        // it is dropped from effectiveRequired (validation must not check it) …
        expect(slice?.effectiveRequired).toBeUndefined();
        // … but it still blocks auto-stubbing — the slice needs user data
        // (a valueQuantity), so a match-only stub would be invalid.
        expect(slice?.autoStub).toBeUndefined();
    });

    it("extracts the resource type for type-discriminated slices", () => {
        const slice = snapshot("TestBundle").slicing?.entry?.slices?.Pat;
        expect(slice?.resourceType).toBe("Patient");
        // Type-discriminated slices are never auto-stubbed: the stub would
        // only set resourceType, the user must provide the typed resource.
        expect(slice?.autoStub).toBeUndefined();
    });
});

describe("slicing merge across the profile chain", async () => {
    const r4 = await mkR4Register();
    const logger = mkErrorLogger();

    registerFs(r4, {
        url: "http://example.org/StructureDefinition/SlicedParent",
        name: "SlicedParent",
        base: "http://hl7.org/fhir/StructureDefinition/Observation",
        derivation: "constraint",
        kind: "resource",
        elements: {
            category: {
                type: "CodeableConcept",
                array: true,
                slicing: {
                    discriminator: [{ type: "pattern", path: "$this" }],
                    rules: "open",
                    slices: {
                        FromParent: { min: 1, max: 1, match: { coding: [{ code: "parent" }] } },
                    },
                },
            },
        },
    });

    registerFs(r4, {
        url: "http://example.org/StructureDefinition/SlicedChild",
        name: "SlicedChild",
        base: "http://example.org/StructureDefinition/SlicedParent",
        derivation: "constraint",
        kind: "resource",
        elements: {
            category: {
                type: "CodeableConcept",
                array: true,
                slicing: {
                    discriminator: [{ type: "pattern", path: "$this" }],
                    rules: "open",
                    slices: {
                        FromChild: { max: 1, match: { coding: [{ code: "child" }] } },
                        FromParent: { min: 0, max: 1, match: { coding: [{ code: "parent-refined" }] } },
                    },
                },
            },
        },
    });

    const schemas: TypeSchema[] = [];
    for (const [pkg, url] of [
        [myPkg, "http://example.org/StructureDefinition/SlicedParent"],
        [myPkg, "http://example.org/StructureDefinition/SlicedChild"],
        [r4Package, "http://hl7.org/fhir/StructureDefinition/Observation"],
        [r4Package, "http://hl7.org/fhir/StructureDefinition/DomainResource"],
        [r4Package, "http://hl7.org/fhir/StructureDefinition/Resource"],
    ] as const) {
        schemas.push(...(await resolveTs(r4, pkg, url as CanonicalUrl, logger)));
    }
    const tsIndex = mkTypeSchemaIndex(schemas, { register: r4, logger });

    const childSnapshot = () => {
        const snap = tsIndex.collectSnapshotProfiles().find((s) => s.identifier.name === "SlicedChild");
        if (!snap) throw new Error("No snapshot for SlicedChild");
        return snap;
    };

    it("re-slicing keeps inherited slices and adds new ones", () => {
        const slices = childSnapshot().slicing?.category?.slices ?? {};
        expect(Object.keys(slices).sort()).toEqual(["FromChild", "FromParent"]);
    });

    it("same-name slices from the leaf win", () => {
        const fromParent = childSnapshot().slicing?.category?.slices?.FromParent;
        expect(fromParent?.match?.value).toEqual({ coding: [{ code: "parent-refined" }] });
        expect(fromParent?.min).toBe(0);
    });
});
