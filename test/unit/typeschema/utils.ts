import { describe, expect, it } from "bun:test";
import { transformFHIRSchema } from "../../../src/typeschema/core/transformer";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { enrichFHIRSchema } from "../../../src/typeschema/types";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import {
  type Register,
  registerFromPackageMetas,
} from "../../../src/typeschema/register";
export type PFS = Partial<FHIRSchema>;

export const r4 = await registerFromPackageMetas([
  { name: "hl7.fhir.r4.core", version: "4.0.1" },
]);

export const fs2ts = async (manager: Register, fs: PFS) => {
  fs.package_meta = { name: "test.package", version: "1.0.0" };
  return await transformFHIRSchema(manager, enrichFHIRSchema(fs as FHIRSchema));
};
