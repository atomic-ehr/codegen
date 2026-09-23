import { describe, expect, it } from "bun:test";
import type { FieldReference, RegularField, ResourceTypeSchema, TypeIdentifier } from "@typeschema/types";
import { mkErrorLogger, mkIndex, mkR4Register, r4Package } from "@typeschema-test/utils";

/** `Provenance.target` is `Reference(Any)` — the only R4 core field whose target
 *  is the abstract `Resource` root, so it exercises the whole expansion. */
describe("effectiveResource", async () => {
    const r4 = await mkR4Register();
    const logger = mkErrorLogger();
    const index = await mkIndex(r4, logger);

    /** Populated by the index for every schema it holds; absent would mean not computed. */
    const effectiveOf = (reference: FieldReference): TypeIdentifier[] => {
        if (!reference.effectiveResource) throw new Error("effectiveResource was not populated");
        return reference.effectiveResource;
    };

    const referenceOf = (resourceName: string, fieldName: string): FieldReference => {
        const schema = index.resolveByUrl(
            r4Package.name,
            `http://hl7.org/fhir/StructureDefinition/${resourceName}` as never,
        ) as ResourceTypeSchema;
        const field = schema.fields?.[fieldName] as RegularField;
        if (!field?.reference) throw new Error(`No reference on ${resourceName}.${fieldName}`);
        return field.reference;
    };

    it("expands an abstract target into its concrete members", () => {
        const reference = referenceOf("Provenance", "target");

        expect(reference.resource.map((ref): string => ref.name)).toEqual(["Resource"]);
        expect(effectiveOf(reference).length).toBeGreaterThan(100);
        expect(effectiveOf(reference).map((ref): string => ref.name)).toContain("Patient");
        expect(effectiveOf(reference).map((ref): string => ref.name)).toContain("Observation");
    });

    it("leaves out abstract members of the family, which no instance can carry", () => {
        const names = effectiveOf(referenceOf("Provenance", "target")).map((ref): string => ref.name);

        expect(names).not.toContain("Resource");
        expect(names).not.toContain("DomainResource");
    });

    it("orders the expansion independently of schema load order", () => {
        const names = effectiveOf(referenceOf("Provenance", "target")).map((ref): string => ref.name);

        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it("copies a concrete target through untouched", () => {
        const reference = referenceOf("Observation", "subject");

        expect(effectiveOf(reference).map((ref): string => ref.name)).toEqual(
            reference.resource.map((ref): string => ref.name),
        );
        expect(effectiveOf(reference).map((ref): string => ref.name)).toContain("Patient");
    });

    it("feeds referenceAllowedTypes with concrete types only", () => {
        const concrete: string[] = index.referenceAllowedTypes(referenceOf("Observation", "subject"));
        expect(concrete).toContain("Patient");
        expect(concrete).not.toContain("Resource");

        const abstract: string[] = index.referenceAllowedTypes(referenceOf("Provenance", "target"));
        expect(abstract).toContain("Patient");
        expect(abstract).not.toContain("Resource");
        expect(abstract).not.toContain("DomainResource");
    });

    it("covers a profile target through the base resource it resolved to", () => {
        // Composition.author targets Practitioner among others; every target a profile
        // resolved to is already in `resource`, so the expansion needs no profile lookup.
        const reference = referenceOf("Composition", "author");

        expect(effectiveOf(reference).map((ref): string => ref.name)).toEqual(
            reference.resource.map((ref): string => ref.name),
        );
        const allowed: string[] = index.referenceAllowedTypes(reference);
        expect(allowed).toContain("Practitioner");
    });
});
