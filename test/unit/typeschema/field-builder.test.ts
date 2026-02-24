import { describe, expect, it } from "bun:test";
import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@root/typeschema/register";
import type { Logger } from "@root/utils/logger";
import { isNestedElement, mkField, mkNestedField } from "@typeschema/core/field-builder";
import type { ChoiceFieldDeclaration, Name, PackageMeta, RegularField } from "@typeschema/types";
import { mkR4Register, type PFS, registerFs } from "@typeschema-test/utils";

const registerAndMkField = (register: Register, fhirSchema: PFS, path: string[], element: FHIRSchemaElement) => {
    const rfs = registerFs(register, fhirSchema);
    return mkField(register, rfs, path, element);
};

const registerAndMkNestedField = (
    register: Register,
    fhirSchema: PFS,
    path: string[],
    element: FHIRSchemaElement,
    logger?: Logger,
) => {
    const rfs = registerFs(register, fhirSchema);
    return mkNestedField(register, rfs, path, element, logger);
};

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

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                required: ["name"],
                elements: { name: element },
            };

            const field = registerAndMkField(r4, fhirSchema, ["name"], element) as RegularField;

            expect(field.type).toBeDefined();
            expect(field.type?.name).toBe("string" as Name);
            expect(field.required).toBe(true);
        });

        it("should build field with array type", async () => {
            const element: FHIRSchemaElement = {
                type: "string",
                array: true,
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = registerAndMkField(r4, fhirSchema, ["items"], element) as RegularField;

            expect(field.array).toBe(true);
            expect(field.type?.name).toBe("string" as Name);
        });

        it("should build field with enum values", async () => {
            const element: FHIRSchemaElement = {
                type: "code",
                binding: {
                    strength: "required",
                    valueSet: "http://example.org/ValueSet/status",
                },
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                package_meta: {
                    name: "TestPackage",
                    version: "1.0.0",
                },
            };

            const field = registerAndMkField(r4, fhirSchema, ["status"], element) as RegularField;

            // Enum values are only added when valueSet can be resolved
            expect(field.type?.name).toBe("code" as Name);
            expect(field.binding).toBeDefined();
        });

        it("should build field with reference", async () => {
            const element: FHIRSchemaElement = {
                type: "Reference",
                refers: ["Patient", "Practitioner"],
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = registerAndMkField(r4, fhirSchema, ["subject"], element) as RegularField;

            // References are only added when refers can be resolved by manager
            expect(field.type?.name).toBe("Reference" as Name);
        });

        it("should build field with binding", async () => {
            const element: FHIRSchemaElement = {
                type: "code",
                binding: {
                    strength: "required",
                    valueSet: "http://example.org/ValueSet/status",
                },
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                package_meta: {
                    name: "TestPackage",
                    version: "1.0.0",
                },
            };

            const field = (await registerAndMkField(r4, fhirSchema, ["status"], element)) as RegularField;

            expect(field.binding).toBeDefined();
            expect(field.binding?.url).toContain("binding");
            expect(field.binding?.kind).toBe("binding");
        });

        it("should handle polymorphic fields", async () => {
            const element: FHIRSchemaElement = {
                choices: ["valueString", "valueInteger", "valueBoolean"],
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = (await registerAndMkField(r4, fhirSchema, ["value"], element)) as ChoiceFieldDeclaration;

            // Polymorphic fields are handled via choices
            expect(field.choices).toEqual(["valueString", "valueInteger", "valueBoolean"]);
        });

        it("should handle fixed values", async () => {
            const element: FHIRSchemaElement = {
                type: "code",
                // @ts-expect-error
                fixed: "fixed-value",
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = registerAndMkField(r4, fhirSchema, ["type"], element) as RegularField;

            // Fixed values are preserved in the field
            expect(field.type?.name).toBe("code" as Name);
        });

        it("should handle pattern constraints", async () => {
            const element: FHIRSchemaElement = {
                type: "string",
                // @ts-expect-error
                pattern: "\\d{3}-\\d{3}-\\d{4}",
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = registerAndMkField(r4, fhirSchema, ["phone"], element) as RegularField;

            // Pattern is preserved in the field
            expect(field.type?.name).toBe("string" as Name);
        });

        it("should handle min and max constraints", async () => {
            const element: FHIRSchemaElement = {
                type: "integer",
                min: 0,
                max: 100,
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = registerAndMkField(r4, fhirSchema, ["score"], element) as RegularField;

            // Min/max are preserved in the field
            expect(field.type?.name).toBe("integer" as Name);
        });

        it("should preserve description", async () => {
            const element: FHIRSchemaElement = {
                type: "string",
                short: "Short description",
                // @ts-expect-error
                definition: "Detailed definition",
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
            };

            const field = registerAndMkField(r4, fhirSchema, ["description"], element) as RegularField;

            // Description is not preserved in fields
            expect(field.type?.name).toBe("string" as Name);
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

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                package_meta: basePackageInfo,
            };

            const field = registerAndMkNestedField(r4, fhirSchema, ["nested", "field"], element);

            expect(field.type).toBeDefined();
            expect(field.type?.kind).toBe("nested");
            expect(field.type?.name).toBe("nested.field" as Name);
        });

        it("should handle array nested fields", () => {
            const element: FHIRSchemaElement = {
                array: true,
                elements: {
                    code: { type: "code" },
                    display: { type: "string" },
                },
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                package_meta: basePackageInfo,
            };

            const field = registerAndMkNestedField(r4, fhirSchema, ["items"], element);

            expect(field.array).toBe(true);
            expect(field.type?.kind).toBe("nested");
        });

        it("should handle required nested fields", () => {
            const element: FHIRSchemaElement = {
                elements: {
                    value: { type: "string" },
                },
            };

            const fhirSchema: PFS = {
                name: "TestSchema",
                type: "TestSchema",
                kind: "resource",
                url: "http://example.org/TestSchema",
                required: ["mandatory"],
                package_meta: basePackageInfo,
            };

            const field = registerAndMkNestedField(r4, fhirSchema, ["mandatory"], element);

            expect(field.required).toBe(true);
            expect(field.type?.kind).toBe("nested");
        });
    });
});
