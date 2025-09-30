import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { describe, expect, it } from "bun:test";
import { mkIdentifier } from "@typeschema/core/identifier";
import type { RichFHIRSchema } from "@typeschema/types";

type FS = Partial<FHIRSchema>;

describe("Identifier generation", () => {
    it.todo("Generate identifier for complex type constraint", async () => {
        const fs: FS = {
            derivation: "constraint",
            name: "systemRef",
            type: "Extension",
            kind: "complex-type",
            url: "http://hl7.org/fhir/StructureDefinition/valueset-systemRef",
            base: "http://hl7.org/fhir/StructureDefinition/Extension",
            package_meta: { name: "hl7.fhir.r4.core", version: "4.0.1" },
        };
        const id = mkIdentifier(fs as RichFHIRSchema);
        expect(id).toMatchObject({
            kind: "complex-type-constraint",
            package: "hl7.fhir.r4.core",
            version: "4.0.1",
            name: "systemRef",
            url: "http://hl7.org/fhir/StructureDefinition/valueset-systemRef",
        });
    });
});
