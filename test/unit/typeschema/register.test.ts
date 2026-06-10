import { describe, expect, it } from "bun:test";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { type CanonicalUrl, enrichFHIRSchema, type Name } from "@root/typeschema/types";
import {
    mergeFsElementProps,
    registerFromManager,
    registerFromPackageMetas,
    resolveFsElementGenealogy,
} from "@typeschema/register";

type PFS = Partial<FHIRSchema>;

const testPkg = { name: "test", version: "0.0.0" };

const resolveFsElementGenealogyT = (pfss: PFS[], path: string[]) => {
    return resolveFsElementGenealogy(
        pfss.map((pfs) => enrichFHIRSchema(pfs as FHIRSchema, pfs.package_meta ?? testPkg)),
        path,
    );
};

describe("Register tests", async () => {
    const r4Package = { name: "hl7.fhir.r4.core", version: "4.0.1" };
    const r4 = await registerFromPackageMetas([r4Package], {});

    it("ensureCanonicalUrl", () => {
        expect(r4.ensureSpecializationCanonicalUrl("Patient" as Name)).toBe(
            "http://hl7.org/fhir/StructureDefinition/Patient" as CanonicalUrl,
        );
    });

    describe("Structure definition", () => {
        it("should return all StructureDefinitions", () => {
            const patientSD = r4.resolveSd(
                r4Package,
                "http://hl7.org/fhir/StructureDefinition/Patient" as CanonicalUrl,
            );
            expect(patientSD).toBeDefined();
        });
    });

    describe("FHIR Schema", () => {
        it("should return all FHIRSchemas", () => {
            const patientFS = r4.resolveFs(
                r4Package,
                "http://hl7.org/fhir/StructureDefinition/Patient" as CanonicalUrl,
            );
            if (!patientFS) {
                throw new Error("Patient FHIRSchema not found");
            }
            expect(patientFS).toBeDefined();
            expect(patientFS.package_meta).toMatchObject(r4Package);
        });
    });

    describe("Genealogy", () => {
        const pat = r4.resolveFsGenealogy(r4Package, "http://hl7.org/fhir/StructureDefinition/Patient" as CanonicalUrl);
        if (!pat) {
            throw new Error("Patient genealogy not found");
        }

        expect(pat.map((fs) => fs.url)).toMatchObject([
            "http://hl7.org/fhir/StructureDefinition/Patient",
            "http://hl7.org/fhir/StructureDefinition/DomainResource",
            "http://hl7.org/fhir/StructureDefinition/Resource",
        ]);

        expect(resolveFsElementGenealogy(pat, ["gender"])).toMatchObject([
            {
                binding: {
                    bindingName: "AdministrativeGender",
                    strength: "required",
                    valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1",
                },
                isSummary: true,
                short: "male | female | other | unknown",
                type: "code",
            },
        ]);
    });

    describe("resolve element genealogy", () => {
        const flatGenealogy = [
            {
                base: "A" as CanonicalUrl,
                url: "B" as CanonicalUrl,
                required: ["foo"],
                elements: {
                    foo: { min: 1 },
                    bar: { min: 12 },
                },
            },
            {
                url: "A" as CanonicalUrl,
                elements: {
                    foo: { type: "string", array: true },
                    bar: { type: "code", array: true, min: 0 },
                },
            },
        ];

        expect(resolveFsElementGenealogyT(flatGenealogy, ["foo"])).toMatchObject([
            { min: 1 },
            { array: true, type: "string" },
        ]);
        expect(mergeFsElementProps(resolveFsElementGenealogyT(flatGenealogy, ["foo"]))).toMatchObject({
            array: true,
            min: 1,
            type: "string",
        });

        expect(resolveFsElementGenealogyT(flatGenealogy, ["bar"])).toMatchObject([
            { min: 12 },
            { array: true, min: 0, type: "code" },
        ]);
        expect(mergeFsElementProps(resolveFsElementGenealogyT(flatGenealogy, ["bar"]))).toMatchObject({
            array: true,
            min: 12,
            type: "code",
        });

        const deepGenealogy = [
            {
                base: "A" as CanonicalUrl,
                url: "B" as CanonicalUrl,
                required: ["foo"],
                elements: {
                    foo: { elements: { bar: { type: "string", min: 1 } } },
                },
            },
            {
                url: "A" as CanonicalUrl,
                elements: {
                    foo: { type: "string", elements: { bar: { type: "string", array: true } } },
                },
            },
        ];

        expect(resolveFsElementGenealogyT(deepGenealogy, ["foo"])).toMatchObject([
            { elements: { bar: { min: 1, type: "string" } } },
            { elements: { bar: { array: true, type: "string" } }, type: "string" },
        ]);
        expect(mergeFsElementProps(resolveFsElementGenealogyT(deepGenealogy, ["foo"]))).toMatchObject({
            type: "string",
        });

        expect(resolveFsElementGenealogyT(deepGenealogy, ["foo", "bar"])).toMatchObject([
            { min: 1, type: "string" },
            { array: true, type: "string" },
        ]);
        expect(mergeFsElementProps(resolveFsElementGenealogyT(deepGenealogy, ["foo", "bar"]))).toMatchObject({
            array: true,
            min: 1,
            type: "string",
        });
    });
});

describe("cyclic package dependencies", () => {
    it("registerFromManager terminates on a dependency cycle", async () => {
        // a ↔ b mutually depend (like hl7.terminology.r5 ↔ hl7.fhir.uv.extensions.r5).
        // Without memoizing each package before recursing into its deps, the walk recurses
        // forever; each unique package should be visited exactly once. The search-call cap
        // makes a regression fail fast (red) instead of slowly exhausting memory.
        const deps: Record<string, string[]> = { a: ["b"], b: ["a"] };
        let searchCalls = 0;
        const manager = {
            packages: async () => Object.keys(deps).map((name) => ({ name, version: "1.0.0" })),
            packageJson: async (name: string) => ({
                name,
                version: "1.0.0",
                dependencies: Object.fromEntries((deps[name] ?? []).map((d) => [d, "1.0.0"])),
            }),
            search: async () => {
                if (++searchCalls > 10) throw new Error("dependency walk did not terminate on cycle");
                return [];
            },
        } as unknown as Parameters<typeof registerFromManager>[0];

        const reg = await registerFromManager(manager, { focusedPackages: [{ name: "a", version: "1.0.0" }] });

        expect(searchCalls).toBe(2); // each package scanned exactly once
        expect(reg.resolver["a#1.0.0"]).toBeDefined();
        expect(reg.resolver["b#1.0.0"]).toBeDefined();
    });
});
