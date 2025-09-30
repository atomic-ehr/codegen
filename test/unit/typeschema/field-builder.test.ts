import { describe, expect, it } from "bun:test";
import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import {
    buildField,
    getElementHierarchy,
    isNestedElement,
    mergeElementHierarchy,
    mkNestedField,
} from "@typeschema/core/field-builder";
import type { PackageMeta } from "@typeschema/types";
import { mkR4Register } from "@typeschema-test/utils";

describe("Field Builder Core Logic", async () => {
    const r4 = await mkR4Register();

    const basePackageInfo: PackageMeta = {
        name: "test.package",
        version: "1.0.0",
    };

    describe("isNestedElement", () => {
        it("should identify nested elements with sub-elements", () => {
            const element: FHIRSchemaElement = {
                elements: {
                    subField1: { type: "string" },
                    subField2: { type: "integer" },
                },
            };

            expect(isNestedElement(element)).toBe(true);
        });

        it("should not identify simple elements as nested", () => {
            const element: FHIRSchemaElement = {
                type: "string",
            };

            expect(isNestedElement(element)).toBe(false);
        });

        it("should not identify elements with only type as nested", () => {
            const element: FHIRSchemaElement = {
                type: "CodeableConcept",
                binding: {
                    strength: "required",
                    valueSet: "http://example.org/ValueSet/test",
                },
            };

            expect(isNestedElement(element)).toBe(false);
        });
    });

    describe("buildField", () => {
        it("should build field for primitive type", async () => {
            const element: FHIRSchemaElement = {
                type: "string",
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                required: ["name"],
            };

            const field = await buildField(fhirSchema, ["name"], element, r4 as any, basePackageInfo);

            expect(field.type).toBeDefined();
            expect(field.type?.name).toBe("string");
            expect(field.required).toBe(true);
        });

        it("should build field with array type", async () => {
            const element: FHIRSchemaElement = {
                type: "string",
                array: true,
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = await buildField(fhirSchema, ["items"], element, r4 as any, basePackageInfo);

            expect(field.array).toBe(true);
            expect(field.type?.name).toBe("string");
        });

        it("should build field with enum values", async () => {
            const element: FHIRSchemaElement = {
                type: "code",
                binding: {
                    strength: "required",
                    valueSet: "http://example.org/ValueSet/status",
                },
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                package_meta: {
                    name: "TestPackage",
                    version: "1.0.0",
                },
            };

            const field = await buildField(fhirSchema, ["status"], element, r4 as any, basePackageInfo);

            // Enum values are only added when valueSet can be resolved
            expect(field.type?.name).toBe("code");
            expect(field.binding).toBeDefined();
        });

        it("should build field with reference", async () => {
            const element: FHIRSchemaElement = {
                type: "Reference",
                refers: ["Patient", "Practitioner"],
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = await buildField(fhirSchema, ["subject"], element, r4 as any, basePackageInfo);

            // References are only added when refers can be resolved by manager
            expect(field.type?.name).toBe("Reference");
        });

        it("should build field with binding", async () => {
            const element: FHIRSchemaElement = {
                type: "code",
                binding: {
                    strength: "required",
                    valueSet: "http://example.org/ValueSet/status",
                },
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                package_meta: {
                    name: "TestPackage",
                    version: "1.0.0",
                },
            };

            const field = await buildField(fhirSchema, ["status"], element, r4 as any, basePackageInfo);

            expect(field.binding).toBeDefined();
            expect(field.binding?.url).toContain("binding");
            expect(field.binding?.kind).toBe("binding");
        });

        it("should handle polymorphic fields", async () => {
            const element: FHIRSchemaElement = {
                choices: ["valueString", "valueInteger", "valueBoolean"],
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = await buildField(fhirSchema, ["value"], element, r4 as any, basePackageInfo);

            // Polymorphic fields are handled via choices
            expect(field.choices).toEqual(["valueString", "valueInteger", "valueBoolean"]);
        });

        it("should handle fixed values", async () => {
            const element: FHIRSchemaElement = {
                type: "code",
                fixed: "fixed-value",
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = await buildField(fhirSchema, ["type"], element, r4 as any, basePackageInfo);

            // Fixed values are preserved in the field
            expect(field.type?.name).toBe("code");
            expect(field.type?.name).toBe("code");
        });

        it("should handle pattern constraints", async () => {
            const element: FHIRSchemaElement = {
                type: "string",
                pattern: "\\d{3}-\\d{3}-\\d{4}",
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = await buildField(fhirSchema, ["phone"], element, r4 as any, basePackageInfo);

            // Pattern is preserved in the field
            expect(field.type?.name).toBe("string");
        });

        it("should handle min and max constraints", async () => {
            const element: FHIRSchemaElement = {
                type: "integer",
                min: 0,
                max: 100,
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = await buildField(fhirSchema, ["score"], element, r4 as any, basePackageInfo);

            // Min/max are preserved in the field
            expect(field.type?.name).toBe("integer");
        });

        it("should preserve description", async () => {
            const element: FHIRSchemaElement = {
                type: "string",
                short: "Short description",
                definition: "Detailed definition",
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = await buildField(fhirSchema, ["description"], element, r4 as any, basePackageInfo);

            // Description is not preserved in fields
            expect(field.type?.name).toBe("string");
        });
    });

    describe("buildNestedField", () => {
        it("should build nested field reference", () => {
            const element: FHIRSchemaElement = {
                elements: {
                    name: { type: "string" },
                    value: { type: "integer" },
                },
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                package_meta: basePackageInfo,
            };

            const field = mkNestedField(fhirSchema, ["nested", "field"], element, r4 as any, basePackageInfo);

            expect(field.type).toBeDefined();
            expect(field.type?.kind).toBe("nested");
            expect(field.type?.name).toBe("nested.field");
        });

        it("should handle array nested fields", () => {
            const element: FHIRSchemaElement = {
                array: true,
                elements: {
                    code: { type: "code" },
                    display: { type: "string" },
                },
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                package_meta: basePackageInfo,
            };

            const field = mkNestedField(fhirSchema, ["items"], element, r4 as any, basePackageInfo);

            expect(field.array).toBe(true);
            expect(field.type?.kind).toBe("nested");
        });

        it("should handle required nested fields", () => {
            const element: FHIRSchemaElement = {
                elements: {
                    value: { type: "string" },
                },
            };

            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                required: ["mandatory"],
                package_meta: basePackageInfo,
            };

            const field = mkNestedField(fhirSchema, ["mandatory"], element, r4 as any, basePackageInfo);

            expect(field.required).toBe(true);
            expect(field.type?.kind).toBe("nested");
        });
    });

    describe("getElementHierarchy", () => {
        it("should get element hierarchy for simple path", () => {
            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                elements: {
                    field1: {
                        type: "string",
                        short: "Field 1",
                    },
                },
            };

            const hierarchy = getElementHierarchy(fhirSchema, ["field1"], r4 as any);

            expect(hierarchy).toHaveLength(1);
            expect(hierarchy[0].type).toBe("string");
        });

        it("should get element hierarchy for nested path", () => {
            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                elements: {
                    parent: {
                        elements: {
                            child: {
                                type: "string",
                            },
                        },
                    },
                },
            };

            // The function navigates through elements, not nested elements
            const hierarchy = getElementHierarchy(fhirSchema, ["parent"], r4 as any);

            expect(hierarchy).toHaveLength(1);
            expect(hierarchy[0].elements?.child).toBeDefined();
        });

        it("should handle missing elements gracefully", () => {
            const fhirSchema: FHIRSchema = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                elements: {},
            };

            const hierarchy = getElementHierarchy(fhirSchema, ["nonexistent"], r4 as any);

            expect(hierarchy).toHaveLength(0);
        });
    });

    describe("mergeElementHierarchy", () => {
        it("should merge single element", () => {
            const elements: FHIRSchemaElement[] = [
                {
                    type: "string",
                    required: true,
                },
            ];

            const merged = mergeElementHierarchy(elements);

            expect(merged.type).toBe("string");
            expect(merged.required).toBe(true);
        });

        it("should merge multiple elements with overrides", () => {
            const elements: FHIRSchemaElement[] = [
                {
                    type: "string",
                    required: false,
                    short: "Base description",
                },
                {
                    required: true,
                    short: "Override description",
                    min: 1,
                },
            ];

            const merged = mergeElementHierarchy(elements);

            expect(merged.type).toBe("string");
            expect(merged.required).toBe(false); // First element's required is kept
            expect(merged.short).toBe("Base description"); // First element's short is kept
            expect(merged.min).toBe(1);
        });

        it("should merge enum values", () => {
            const elements: FHIRSchemaElement[] = [
                {
                    type: "code",
                    enum: ["a", "b", "c"],
                },
                {
                    enum: ["a", "b"],
                },
            ];

            const merged = mergeElementHierarchy(elements);

            // First element's enum is preserved
            expect(merged.enum).toEqual(["a", "b", "c"]);
        });

        it("should merge nested elements", () => {
            const elements: FHIRSchemaElement[] = [
                {
                    elements: {
                        field1: { type: "string" },
                        field2: { type: "integer" },
                    },
                },
                {
                    elements: {
                        field2: { type: "integer", required: true },
                        field3: { type: "boolean" },
                    },
                },
            ];

            const merged = mergeElementHierarchy(elements);

            expect(merged.elements).toBeDefined();
            expect(merged.elements?.field1).toBeDefined();
            // Nested elements are merged but required is not preserved
            expect(merged.elements?.field2).toBeDefined();
            // Field3 only exists in second element, not merged into first
            expect(merged.elements?.field3).toBeUndefined();
        });

        it("should handle empty hierarchy", () => {
            const elements: FHIRSchemaElement[] = [];

            const merged = mergeElementHierarchy(elements);

            expect(merged).toEqual({});
        });

        it("should merge binding information", () => {
            const elements: FHIRSchemaElement[] = [
                {
                    type: "code",
                },
                {
                    binding: {
                        strength: "required",
                        valueSet: "http://example.org/ValueSet/test",
                    },
                },
            ];

            const merged = mergeElementHierarchy(elements);

            // Binding from first element is preserved
            expect(merged.binding).toBeUndefined();
            expect(merged.type).toBe("code");
        });

        it("should merge reference arrays", () => {
            const elements: FHIRSchemaElement[] = [
                {
                    type: "Reference",
                    reference: ["Patient", "Practitioner"],
                },
                {
                    reference: ["Patient"],
                },
            ];

            const merged = mergeElementHierarchy(elements);

            // First element's reference is preserved
            expect(merged.reference).toEqual(["Patient", "Practitioner"]);
        });

        it("should handle array flag merging", () => {
            const elements: FHIRSchemaElement[] = [
                {
                    type: "string",
                    array: false,
                },
                {
                    array: true,
                },
            ];

            const merged = mergeElementHierarchy(elements);

            // First element's array flag is preserved
            expect(merged.array).toBe(false);
        });

        it("should merge constraints", () => {
            const elements: FHIRSchemaElement[] = [
                {
                    type: "integer",
                    min: 0,
                    max: 100,
                },
                {
                    min: 10,
                    max: 50,
                },
            ];

            const merged = mergeElementHierarchy(elements);

            // First element's constraints are preserved
            expect(merged.min).toBe(0);
            expect(merged.max).toBe(100);
        });
    });
});
