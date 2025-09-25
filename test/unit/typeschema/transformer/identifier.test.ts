import { describe, expect, it, beforeEach } from "bun:test";
import { transformFHIRSchema } from "../../../../src/typeschema/core/transformer";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import type { TypeSchema, PackageInfo } from "../../../../src/typeschema/types";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import { buildSchemaIdentifier } from "../../../../src/typeschema/core/identifier";

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
    };
    const id = buildSchemaIdentifier(fs as FHIRSchema);
    expect(id).toMatchObject({
      kind: "complex-type-constraint",
      package: "hl7.fhir.r4.core",
      version: "4.0.1",
      name: "systemRef",
      url: "http://hl7.org/fhir/StructureDefinition/valueset-systemRef",
    });
  });
});
