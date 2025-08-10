import { describe, it, expect } from "bun:test";
import { SearchParameterEnhancer } from "../../../../src/api/generators/search-parameter-enhancer";
import type { TypeSchema } from "../../../../src/typeschema/types";

describe("SearchParameterEnhancer autocomplete unions", () => {
  it("generates SearchParamName unions for Patient and Observation when enabled", () => {
    const enhancer = new SearchParameterEnhancer({ autocomplete: true });

    const schemas: TypeSchema[] = [
      {
        identifier: {
          kind: "resource",
          name: "Patient",
          package: "test.pkg",
          version: "1.0.0",
          url: "http://example.org/StructureDefinition/Patient",
        },
      } as any,
      {
        identifier: {
          kind: "resource",
          name: "Observation",
          package: "test.pkg",
          version: "1.0.0",
          url: "http://example.org/StructureDefinition/Observation",
        },
      } as any,
    ];

    enhancer.collectResourceData(schemas);
    const content = enhancer.generateEnhancedSearchTypes();

    expect(content).toContain("export type PatientSearchParamName");
    expect(content).toContain("export type ObservationSearchParamName");
    expect(content).toContain("export type SearchParamName<");
    // base names should also be present
    expect(content).toContain("export type BaseSearchParamName");
  });
});
