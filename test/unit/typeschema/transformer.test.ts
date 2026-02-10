import { describe, expect, it } from "bun:test";
import type { Name, PackageMeta, RegularField, RegularTypeSchema } from "@typeschema/types";
import type { PFS } from "@typeschema-test/utils";
import { mkR4Register, registerFsAndMkTs } from "@typeschema-test/utils";

describe("TypeSchema Transformer Core Logic", async () => {
    const r4 = await mkR4Register();

    const _basePackageInfo: PackageMeta = {
        name: "test.package",
        version: "1.0.0",
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

            const result = await registerFsAndMkTs(r4, fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0]?.identifier.name).toBe("TestResource" as Name);
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

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.base).toBeDefined();
            expect(schema.base?.name).toBe("Patient" as Name);
        });

        it("should transform primitive type schema", async () => {
            const fhirSchema: PFS = {
                name: "string",
                type: "string",
                kind: "primitive-type",
                url: "http://hl7.org/fhir/StructureDefinition/string",
                class: "",
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);

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
                    type: { type: "code" },
                    text: { type: "string" },
                    line: { type: "string", array: true },
                    city: { type: "string" },
                },
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.identifier.kind).toBe("complex-type");
            expect(schema.fields).toBeDefined();
        });

        it("should handle extension schemas", async () => {
            const fhirSchema: PFS = {
                name: "PatientExtension",
                type: "Extension",
                kind: "complex-type",
                base: "Extension",
                url: "http://example.org/extensions/patient-extension",
                elements: {
                    url: { type: "uri" },
                    value: { type: "string" },
                },
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.base?.name).toBe("Extension" as Name);
        });

        it("should handle nested elements", async () => {
            const fhirSchema: PFS = {
                name: "ComplexResource",
                type: "ComplexResource",
                kind: "resource",
                url: "http://example.org/ComplexResource",
                elements: {
                    contact: {
                        type: "BackboneElement",
                        elements: {
                            name: { type: "string" },
                            phone: { type: "string" },
                        },
                    },
                },
                class: "",
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.fields?.contact).toBeDefined();
        });

        it("should extract and deduplicate dependencies", async () => {
            const fhirSchema: PFS = {
                name: "ResourceWithDeps",
                type: "ResourceWithDeps",
                kind: "resource",
                url: "http://example.org/ResourceWithDeps",
                elements: {
                    patient: { type: "Reference", refers: ["Patient"] },
                    practitioner: { type: "Reference", refers: ["Practitioner"] },
                    anotherPatient: { type: "Reference", refers: ["Patient"] },
                },
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.dependencies).toBeDefined();

            const depNames = schema.dependencies?.map((d) => d.name) || [];
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

            const result = await registerFsAndMkTs(r4, fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0]?.identifier.kind).toBe("profile");
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

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.fields?.names?.array).toBe(true);
            expect(schema.fields?.identifiers?.array).toBe(true);
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

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.fields?.mandatoryField?.required).toBe(true);
            expect(schema.fields?.optionalField?.required).toBe(false);
        });

        it("should handle polymorphic fields", async () => {
            const fhirSchema: PFS = {
                name: "PolymorphicResource",
                type: "PolymorphicResource",
                kind: "resource",
                url: "http://example.org/PolymorphicResource",
                elements: {
                    value: { choices: ["valueString", "valueInteger", "valueBoolean"] },
                    valueString: { type: "string", choiceOf: "value" },
                    valueInteger: { type: "integer", choiceOf: "value" },
                    valueBoolean: { type: "boolean", choiceOf: "value" },
                },
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.fields?.value).toBeDefined();
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

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result.length).toBeGreaterThanOrEqual(1);
            expect(schema.fields?.status).toBeDefined();
        });

        it("should handle reference fields", async () => {
            const fhirSchema: PFS = {
                name: "ReferencingResource",
                type: "ReferencingResource",
                kind: "resource",
                url: "http://example.org/ReferencingResource",
                elements: {
                    subject: {
                        type: "Reference",
                        refers: ["Patient"],
                    },
                },
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.fields?.subject).toBeDefined();
        });

        it("should handle schemas without elements", async () => {
            const fhirSchema: PFS = {
                name: "EmptyResource",
                type: "EmptyResource",
                kind: "resource",
                url: "http://example.org/EmptyResource",
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.identifier.name).toBe("EmptyResource" as Name);
            expect(schema.fields).toBeUndefined();
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

            const result = await registerFsAndMkTs(r4, fhirSchema);

            expect(result).toHaveLength(1);
            expect(result[0]?.identifier.package).toBe("custom.package");
            expect(result[0]?.identifier.version).toBe("2.0.0");
        });

        it("should handle fixed values in elements", async () => {
            const fhirSchema: PFS = {
                name: "FixedValueResource",
                type: "FixedValueResource",
                kind: "resource",
                url: "http://example.org/FixedValueResource",
                elements: {
                    type: { type: "code", pattern: { type: "code", value: "test-type" } },
                    version: { type: "string", pattern: { type: "string", value: "1.0.0" } },
                },
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.fields?.type).toBeDefined();
            expect(schema.fields?.version).toBeDefined();
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

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            // Binding schemas are also generated
            expect(result.length).toBeGreaterThanOrEqual(1);
            // Enum values are only added when binding can be resolved by manager
            expect(schema.fields?.status).toBeDefined();
            expect((schema.fields?.status as RegularField)?.type?.name).toBe("code" as Name);
        });

        it("should handle extension schemas with url pattern matching", async () => {
            const fhirSchema: PFS = {
                name: "CustomType",
                type: "CustomType",
                kind: "complex-type",
                url: "http://example.org/extension/custom-extension",
                elements: {},
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);

            expect(result).toHaveLength(1);
            // Extension detection may vary based on URL pattern
            expect(result[0]?.identifier.kind).toBe("complex-type");
        });

        it("should handle complex nested structures", async () => {
            const fhirSchema: PFS = {
                name: "DeeplyNestedResource",
                type: "DeeplyNestedResource",
                kind: "resource",
                url: "http://example.org/DeeplyNestedResource",
                elements: {
                    level1: {
                        type: "BackboneElement",
                        elements: {
                            level2: {
                                type: "BackboneElement",
                                elements: {
                                    level3: { type: "string" },
                                },
                            },
                        },
                    },
                },
            };

            const result = await registerFsAndMkTs(r4, fhirSchema);
            const schema = result[0] as RegularTypeSchema;

            expect(result).toHaveLength(1);
            expect(schema.fields?.level1).toBeDefined();
        });
    });
});
