import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkR4Register, mkSilentLogger, type PFS, registerFs } from "@typeschema-test/utils";

const pkg = { name: "mypackage", version: "0.0.0" };
const EXT_URL = "http://example.org/StructureDefinition/alleleDatabase";

const alleleDatabaseExtension: PFS = {
    description: "Extension whose name camel-cases to AlleleDatabase",
    derivation: "constraint",
    type: "Extension",
    name: "alleleDatabase",
    kind: "complex-type",
    url: EXT_URL,
    base: "http://hl7.org/fhir/StructureDefinition/Extension",
    package_meta: pkg,
    elements: { valueCodeableConcept: { type: "CodeableConcept" } },
};

const collidingObservation: PFS = {
    description: "Observation carrying an extension and a slice whose names differ only in separator",
    derivation: "constraint",
    type: "Observation",
    name: "CollidingObservation",
    kind: "resource",
    url: "http://example.org/StructureDefinition/colliding",
    base: "http://hl7.org/fhir/StructureDefinition/Observation",
    package_meta: pkg,
    elements: {
        extension: {
            slicing: {
                slices: {
                    alleleDatabase: { min: 0, max: 1, match: { url: EXT_URL }, schema: { type: "Extension" } },
                },
            },
        },
        component: {
            slicing: {
                slices: {
                    allele_database: {
                        min: 0,
                        max: 1,
                        match: { code: { coding: [{ system: "http://example.org/cs", code: "ad" }] } },
                        schema: { elements: {} },
                    },
                },
            },
        },
    },
};

/**
 * Two accessors whose recommended names differ only by separator.
 *
 * The shared resolver keeps them apart because it works in Pascal space:
 * `AlleleDatabase` for the extension (its candidates are camel-normalized) and
 * `Allele_database` for the slice (slice candidates keep the separator). The
 * TypeScript writer emits both verbatim, so `setAlleleDatabase` and
 * `setAllele_database` are distinct methods.
 *
 * Python snake-cases them, and `snakeCase` splits on both lower→Upper and `_`,
 * so the two used to collapse onto one name and the module declared it twice —
 * Python keeps the last definition, so the extension accessor was shadowed by
 * the slice one. The slice now falls through to its next candidate, which is
 * field-qualified.
 *
 * Cannot be an example test: the colliding shape appears only in packages the
 * Python examples do not generate, and duplicate defs would fail the example's
 * mypy run for everyone.
 */
describe("Python profile accessor name collisions", async () => {
    const register = await mkR4Register();
    registerFs(register, alleleDatabaseExtension);
    registerFs(register, collidingObservation);

    const result = await new APIBuilder({ register, logger: mkSilentLogger() })
        .python({ inMemoryOnly: true, generateProfile: true, client: "none" })
        .generate();

    const profilePy =
        result.filesGenerated.python?.["generated/mypackage/profiles/observation_colliding_observation.py"];

    it("should succeed", () => {
        expect(result.success).toBeTrue();
        expect(profilePy).toBeDefined();
    });

    // Getters carry @overload signatures, so only setters are one `def` each.
    it("declares every setter exactly once", () => {
        const setters = [...(profilePy ?? "").matchAll(/^ {4}def (set_\w+)/gm)].map((m) => m[1] as string);
        expect(setters).toEqual([...new Set(setters)]);
    });

    it("keeps the extension on the preferred name and bumps the slice", () => {
        expect(profilePy).toContain("def set_allele_database(");
        expect(profilePy).toContain("def set_component_allele_database(");
    });

    it("matches snapshot", () => {
        expect(profilePy).toMatchSnapshot();
    });
});
