import { describe, expect, it } from "bun:test";
import { transformFHIRSchema } from "@typeschema/core/transformer";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { mkR4Register } from "@typeschema-test/utils";
import { type PackageMeta, enrichFHIRSchema } from "@typeschema/types";
import type { PFS } from "@typeschema-test/utils";

describe("TypeSchema Transformer Core Logic", async () => {
    const r4 = await mkR4Register();

    const basePackageInfo: PackageMeta = {
        name: "test.package",
        version: "1.0.0",
    };

    const fs2ts = async (fs: PFS) => {
        if (!fs.package_meta) fs.package_meta = basePackageInfo;
        return await transformFHIRSchema(r4, enrichFHIRSchema(fs as FHIRSchema));
    };

    describe("transformFHIRSchema", () => {
        it("should transform a basic resource schema", async () => {
            const fhirSchema: PFS = {
                name: "TestResource",
                type: "TestResource",
                kind: "resource",
                url: "http://example.org/TestResource",
                required: ["id", "name"],
                elements: {
                    id: { type: "id" },
                    name: { type: "string" },
                },
                class: "",
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0]?.identifier.name).toBe("TestResource");
            expect(result[0]?.identifier.kind).toBe("resource");
        });

        it("should handle schema with base type", async () => {
            const fhirSchema: PFS = {
                name: "CustomPatient",
                type: "Patient",
                kind: "resource",
                base: "Patient",
                url: "http://example.org/CustomPatient",
                elements: {},
                class: "",
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0]?.base).toBeDefined();
            expect(result[0]?.base?.name).toBe("Patient");
        });

        it("should transform primitive type schema", async () => {
            const fhirSchema: PFS = {
                name: "string",
                type: "string",
                kind: "primitive-type",
                url: "http://hl7.org/fhir/StructureDefinition/string",
                class: "",
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0]?.identifier.kind).toBe("primitive-type");
        });

        it("should transform complex type schema", async () => {
            const fhirSchema: PFS = {
                name: "Address",
                type: "Address",
                kind: "complex-type",
                url: "http://hl7.org/fhir/StructureDefinition/Address",
                elements: {
                    use: { type: "code", enum: ["home", "work", "temp", "old"] },
                    type: { type: "code" },
                    text: { type: "string" },
                    line: { type: "string", array: true },
                    city: { type: "string" },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0]?.identifier.kind).toBe("complex-type");
            expect(result[0]?.fields).toBeDefined();
        });

        it("should handle extension schemas", async () => {
            const fhirSchema: PFS = {
                name: "PatientExtension",
                type: "Extension",
                kind: "complex-type",
                base: "Extension",
                url: "http://example.org/extensions/patient-extension",
                elements: {
                    url: {
                        type: "uri",
                        fixed: "http://example.org/extensions/patient-extension",
                    },
                    value: { type: "string" },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0]?.metadata?.isExtension).toBe(true);
            expect(result[0]?.base?.name).toBe("Extension");
        });

        it("should transform value set schema", async () => {
            const fhirSchema: PFS = {
                name: "TestValueSet",
                type: "ValueSet",
                kind: "value-set",
                url: "http://example.org/ValueSet/test",
                description: "Test value set",
                elements: {
                    active: { code: "active", short: "Active status" },
                    inactive: { code: "inactive", short: "Inactive status" },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0]?.identifier.kind).toBe("value-set");
            expect(result[0]?.concept).toBeDefined();
        });

        it("should handle nested elements", async () => {
            const fhirSchema: PFS = {
                name: "ComplexResource",
                type: "ComplexResource",
                kind: "resource",
                url: "http://example.org/ComplexResource",
                elements: {
                    contact: {
                        elements: {
                            name: { type: "string" },
                            phone: { type: "string" },
                        },
                    },
                },
                class: "",
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].fields?.contact).toBeDefined();
        });

        it("should extract and deduplicate dependencies", async () => {
            const fhirSchema: PFS = {
                name: "ResourceWithDeps",
                type: "ResourceWithDeps",
                kind: "resource",
                url: "http://example.org/ResourceWithDeps",
                elements: {
                    patient: { type: "Reference", reference: ["Patient"] },
                    practitioner: { type: "Reference", reference: ["Practitioner"] },
                    anotherPatient: { type: "Reference", reference: ["Patient"] },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].dependencies).toBeDefined();

            const depNames = result[0].dependencies?.map((d) => d.name) || [];
            const uniqueDepNames = [...new Set(depNames)];
            expect(depNames.length).toBe(uniqueDepNames.length);
        });

        it("should handle profile schemas", async () => {
            const fhirSchema: PFS = {
                name: "USCorePatient",
                type: "Patient",
                kind: "resource",
                url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
                base: "http://hl7.org/fhir/StructureDefinition/Patient",
                derivation: "constraint",
                elements: {},
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].identifier.kind).toBe("profile");
        });

        it("should handle array fields correctly", async () => {
            const fhirSchema: PFS = {
                name: "ArrayResource",
                type: "ArrayResource",
                kind: "resource",
                url: "http://example.org/ArrayResource",
                elements: {
                    names: { type: "string", array: true },
                    identifiers: { type: "Identifier", array: true },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].fields?.names?.array).toBe(true);
            expect(result[0].fields?.identifiers?.array).toBe(true);
        });

        it("should handle required fields", async () => {
            const fhirSchema: PFS = {
                name: "RequiredFieldsResource",
                type: "RequiredFieldsResource",
                kind: "resource",
                url: "http://example.org/RequiredFieldsResource",
                required: ["mandatoryField"],
                elements: {
                    mandatoryField: { type: "string" },
                    optionalField: { type: "string" },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].fields?.mandatoryField?.required).toBe(true);
            expect(result[0].fields?.optionalField?.required).toBe(false);
        });

        it("should handle polymorphic fields", async () => {
            const fhirSchema: PFS = {
                name: "PolymorphicResource",
                type: "PolymorphicResource",
                kind: "resource",
                url: "http://example.org/PolymorphicResource",
                elements: {
                    value: {
                        choices: ["valueString", "valueInteger", "valueBoolean"],
                    },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].fields?.value).toBeDefined();
        });

        it("should handle binding to value sets", async () => {
            const fhirSchema: PFS = {
                name: "BoundResource",
                type: "BoundResource",
                kind: "resource",
                url: "http://example.org/BoundResource",
                elements: {
                    status: {
                        type: "code",
                        binding: {
                            strength: "required",
                            valueSet: "http://example.org/ValueSet/status",
                        },
                    },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result.length).toBeGreaterThanOrEqual(1);
            expect(result[0].fields?.status).toBeDefined();
        });

        it("should filter self-references from dependencies", async () => {
            const fhirSchema: PFS = {
                name: "SelfReferencingResource",
                type: "SelfReferencingResource",
                kind: "resource",
                url: "http://example.org/SelfReferencingResource",
                elements: {
                    parent: {
                        type: "Reference",
                        reference: ["SelfReferencingResource"],
                    },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            const deps = result[0].dependencies || [];
            const selfRef = deps.find((d) => d.url === fhirSchema.url);
            expect(selfRef).toBeUndefined();
        });

        it("should handle schemas without elements", async () => {
            const fhirSchema: PFS = {
                name: "EmptyResource",
                type: "EmptyResource",
                kind: "resource",
                url: "http://example.org/EmptyResource",
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].identifier.name).toBe("EmptyResource");
            expect(result[0].fields).toBeUndefined();
        });

        it("should preserve package information", async () => {
            const customPackageInfo: PackageMeta = {
                name: "custom.package",
                version: "2.0.0",
            };

            const fhirSchema: PFS = {
                name: "PackagedResource",
                type: "PackagedResource",
                kind: "resource",
                url: "http://example.org/PackagedResource",
                package_meta: customPackageInfo,
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].identifier.package).toBe("custom.package");
            expect(result[0].identifier.version).toBe("2.0.0");
        });

        it("should handle fixed values in elements", async () => {
            const fhirSchema: PFS = {
                name: "FixedValueResource",
                type: "FixedValueResource",
                kind: "resource",
                url: "http://example.org/FixedValueResource",
                elements: {
                    type: { type: "code", fixed: "test-type" },
                    version: { type: "string", pattern: "\\d+\\.\\d+\\.\\d+" },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].fields?.type).toBeDefined();
            expect(result[0].fields?.version).toBeDefined();
        });

        it("should handle schemas with enum values", async () => {
            const fhirSchema: PFS = {
                name: "EnumResource",
                type: "EnumResource",
                kind: "resource",
                url: "http://example.org/EnumResource",
                elements: {
                    status: {
                        type: "code",
                        binding: {
                            strength: "required",
                            valueSet: "http://example.org/ValueSet/status",
                        },
                    },
                },
            };

            const result = await fs2ts(fhirSchema);

            // Binding schemas are also generated
            expect(result.length).toBeGreaterThanOrEqual(1);
            // Enum values are only added when binding can be resolved by manager
            expect(result[0].fields?.status).toBeDefined();
            expect(result[0].fields?.status?.type?.name).toBe("code");
        });

        it("should handle extension schemas with url pattern matching", async () => {
            const fhirSchema: PFS = {
                name: "CustomType",
                type: "CustomType",
                kind: "complex-type",
                url: "http://example.org/extension/custom-extension",
                elements: {},
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].metadata?.isExtension).toBe(true);
        });

        it("should handle complex nested structures", async () => {
            const fhirSchema: PFS = {
                name: "DeeplyNestedResource",
                type: "DeeplyNestedResource",
                kind: "resource",
                url: "http://example.org/DeeplyNestedResource",
                elements: {
                    level1: {
                        elements: {
                            level2: {
                                elements: {
                                    level3: { type: "string" },
                                },
                            },
                        },
                    },
                },
            };

            const result = await fs2ts(fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0].fields?.level1).toBeDefined();
        });
    });
});
