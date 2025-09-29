import { describe, expect, it } from "bun:test";
import { transformFHIRSchema } from "@typeschema/core/transformer";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { enrichFHIRSchema } from "@typeschema/types";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import {
  type Register,
  registerFromPackageMetas,
  registerFromManager,
} from "../../../src/typeschema/register";

export type PFS = Partial<FHIRSchema>;

// TODO: multipackage mode and package info

describe("Register tests", async () => {
  const r4Package = { name: "hl7.fhir.r4.core", version: "4.0.1" };
  const r4 = await registerFromPackageMetas([
    { name: "hl7.fhir.r4.core", version: "4.0.1" },
  ]);

  it("ensureCanonicalUrl", () => {
    expect(r4.ensureCanonicalUrl("Patient")).toBe(
      "http://hl7.org/fhir/StructureDefinition/Patient",
    );
  });

  describe("Structure definition", () => {
    it("should return all StructureDefinitions", () => {
      const allSD = r4.allSD();
      expect(Array.isArray(allSD)).toBe(true);
      expect(allSD.length).toBe(655);

      const patientSD = r4.resolveSD(
        "http://hl7.org/fhir/StructureDefinition/Patient",
      )!;
      expect(patientSD).toBeDefined();
    });
  });

  describe("FHIR Schema", () => {
    it("should return all FHIRSchemas", () => {
      const allFS = r4.allFS();
      expect(Array.isArray(allFS)).toBe(true);
      expect(allFS.length).toBe(655);

      const patientFS = r4.resolveFS(
        "http://hl7.org/fhir/StructureDefinition/Patient",
      )!;
      expect(patientFS).toBeDefined();
      expect(patientFS.package_meta).toMatchObject(r4Package);
    });
  });
});
