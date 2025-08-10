import { describe, it, expect } from "bun:test";
import { RestClientGenerator } from "../../../../src/api/generators/rest-client";
import type { TypeSchema } from "../../../../src/typeschema/types";

describe("RestClientGenerator search backward compatibility and autocomplete", () => {
  it("generates search overloads and fallback when enhancedSearch + autocomplete enabled", async () => {
    const gen = new RestClientGenerator({
      outputDir: "./tmp/gen-client-test",
      clientName: "FHIRClient",
      enhancedSearch: true,
      searchAutocomplete: true,
      includeValidation: false,
      includeErrorHandling: false,
      includeUtilities: false,
    } as any);

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
    ];

    const files = await gen.generate(schemas);
    const clientFile = files.find((f) => f.filename === "fhirclient.ts");
    expect(clientFile).toBeDefined();
    const content = clientFile!.content;

    // Overloads
    expect(content).toContain("params?: EnhancedSearchParams<T>");
    expect(content).toContain(
      "params?: Partial<Record<SearchParamName<T>, any>> & BaseEnhancedSearchParams"
    );
    expect(content).toContain("params?: SearchParams");

    // Fallback code
    expect(content).toContain(
      "const validation = SearchParameterValidator.validate(resourceType, params);"
    );
    expect(content).toContain("new URLSearchParams()");
  });
});
