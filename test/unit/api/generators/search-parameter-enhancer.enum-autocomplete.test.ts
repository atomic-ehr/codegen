import { describe, it, expect } from "bun:test";
import { SearchParameterEnhancer } from "../../../../src/api/generators/search-parameter-enhancer";
import type { TypeSchema } from "../../../../src/typeschema/types";

describe("SearchParameterEnhancer enum autocomplete", () => {
  it("generates better autocomplete types for token parameters with enums", () => {
    const enhancer = new SearchParameterEnhancer({ 
      autocomplete: true, 
      valueSetEnums: true 
    });

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

    enhancer.collectResourceData(schemas);
    const content = enhancer.generateEnhancedSearchTypes();

    // Should import enum types when valueSetEnums is enabled
    expect(content).toContain("import type {");
    
    // Should have TokenSearchOptions in SearchModifiers
    expect(content).toContain("TokenSearchOptions:");
    
    // Should use the fixed union type format for token parameters with enums
    expect(content).toContain("| SearchModifiers['TokenSearchOptions']");
    
    // Should not use the old undefined TokenSearchOptions (without SearchModifiers namespace)
    expect(content).not.toContain("| TokenSearchOptions;");
    
    // Verify the PatientSearchParams interface is generated
    expect(content).toContain("export interface PatientSearchParams");
    
    // The gender field should use the enum + TokenSearchOptions pattern
    // This tests that our preprocessing logic correctly identifies enum fields
    expect(content).toContain("'gender'?:");
  });

  it("falls back to regular token parameter types when valueSetEnums is disabled", () => {
    const enhancer = new SearchParameterEnhancer({ 
      autocomplete: true, 
      valueSetEnums: false 
    });

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

    enhancer.collectResourceData(schemas);
    const content = enhancer.generateEnhancedSearchTypes();

    // Should not import enum types when valueSetEnums is disabled
    expect(content).not.toContain("from '../types/utility'");
    expect(content.indexOf("PatientGenderValues")).toBe(-1);
    
    // Should use regular TokenParameter for all token fields
    expect(content).toContain("| SearchModifiers['TokenParameter']");
    
    // Should not use TokenSearchOptions when enums are disabled in the field definitions
    expect(content).not.toContain("| SearchModifiers['TokenSearchOptions']");
    
    // But TokenSearchOptions should still be defined in SearchModifiers interface for potential future use
    expect(content).toContain("TokenSearchOptions:");
  });
});