import { describe, expect, test } from "bun:test";
import { PythonTypeMapper } from "../../../../../src/api/generators/base/PythonTypeMapper";
import { TypeScriptTypeMapper } from "../../../../../src/api/generators/base/TypeScriptTypeMapper";

describe("TypeMapper System", () => {
    describe("TypeScript Type Mapper", () => {
        const mapper = new TypeScriptTypeMapper();

        test("maps FHIR primitives correctly", () => {
            expect(mapper.mapPrimitive("string")).toEqual({
                name: "string",
                isPrimitive: true,
                nullable: false,
            });

            expect(mapper.mapPrimitive("integer")).toEqual({
                name: "number",
                isPrimitive: true,
                nullable: false,
            });

            expect(mapper.mapPrimitive("boolean")).toEqual({
                name: "boolean",
                isPrimitive: true,
                nullable: false,
            });

            expect(mapper.mapPrimitive("dateTime")).toEqual({
                name: "string",
                isPrimitive: true,
                nullable: false,
            });
        });

        test("handles unknown primitives", () => {
            const result = mapper.mapPrimitive("unknownType");
            expect(result.name).toBe("unknown");
            expect(result.isPrimitive).toBe(true);
            expect(result.metadata?.warning).toBe("unmapped_primitive");
            expect(result.metadata?.originalType).toBe("unknownType");
        });

        test("maps references with type parameters", () => {
            const result = mapper.mapReference([{ name: "Patient", kind: "resource" }]);

            expect(result.name).toBe("Reference");
            expect(result.generics).toEqual(["'Patient'"]);
            expect(result.importPath).toBe("./Reference");
            expect(result.isPrimitive).toBe(false);
        });

        test("maps multiple target references as union", () => {
            const result = mapper.mapReference([
                { name: "Patient", kind: "resource" },
                { name: "Practitioner", kind: "resource" },
            ]);

            expect(result.name).toBe("Reference");
            expect(result.generics).toEqual(["'Patient' | 'Practitioner'"]);
        });

        test("maps generic reference when no targets", () => {
            const result = mapper.mapReference([]);

            expect(result.name).toBe("Reference");
            expect(result.generics).toEqual(["unknown"]);
        });

        test("maps arrays correctly with suffix syntax", () => {
            const elementType = mapper.mapPrimitive("string");
            const arrayType = mapper.mapArray(elementType);

            expect(arrayType.name).toBe("string[]");
            expect(arrayType.isArray).toBe(true);
            expect(arrayType.metadata?.arrayStyle).toBe("suffix");
        });

        test("maps arrays with generic syntax when configured", () => {
            const mapperWithGeneric = new TypeScriptTypeMapper({
                preferArraySyntax: false,
            });

            const elementType = mapperWithGeneric.mapPrimitive("string");
            const arrayType = mapperWithGeneric.mapArray(elementType);

            expect(arrayType.name).toBe("Array");
            expect(arrayType.generics).toEqual(["string"]);
            expect(arrayType.metadata?.arrayStyle).toBe("generic");
        });

        test("handles optional types correctly", () => {
            const baseType = mapper.mapPrimitive("string");
            const optionalType = mapper.mapOptional(baseType, false);

            expect(optionalType.name).toBe("string | undefined");
            expect(optionalType.nullable).toBe(true);
            expect(optionalType.metadata?.wasOptional).toBe(true);
        });

        test("keeps required types unchanged", () => {
            const baseType = mapper.mapPrimitive("string");
            const requiredType = mapper.mapOptional(baseType, true);

            expect(requiredType).toEqual(baseType);
        });

        test("maps enums as union types", () => {
            const result = mapper.mapEnum(["active", "inactive", "suspended"], "UserStatus");

            expect(result.name).toBe("'active' | 'inactive' | 'suspended'");
            expect(result.isPrimitive).toBe(false);
            expect(result.metadata?.enumName).toBe("UserStatus");
            expect(result.metadata?.values).toEqual(["active", "inactive", "suspended"]);
            expect(result.metadata?.isUnionType).toBe(true);
        });

        test("formats type names using PascalCase", () => {
            expect(mapper.formatTypeName("patient")).toBe("Patient");
            expect(mapper.formatTypeName("patient_resource")).toBe("PatientResource");
            expect(mapper.formatTypeName("patient-resource")).toBe("PatientResource");
        });

        test("formats field names using camelCase", () => {
            expect(mapper.formatFieldName("first_name")).toBe("firstName");
            expect(mapper.formatFieldName("last-name")).toBe("lastName");
            expect(mapper.formatFieldName("date_of_birth")).toBe("dateOfBirth");
        });

        test("generates interface fields correctly", () => {
            const type = mapper.mapPrimitive("string");

            const requiredField = mapper.generateInterfaceField("firstName", type, true);
            expect(requiredField).toBe("firstName: string;");

            const optionalField = mapper.generateInterfaceField("lastName", type, false);
            expect(optionalField).toBe("lastName?: string;");
        });

        test("generates import statements for non-primitive types", () => {
            const type = {
                name: "Reference",
                isPrimitive: false,
                importPath: "./Reference",
            };

            const importStatement = mapper.generateImportStatement(type);
            expect(importStatement).toBe("import type { Reference } from './Reference';");
        });

        test("skips import statements for primitive types", () => {
            const type = {
                name: "string",
                isPrimitive: true,
            };

            const importStatement = mapper.generateImportStatement(type);
            expect(importStatement).toBeUndefined();
        });

        test("uses custom mappings when provided", () => {
            const customMapper = new TypeScriptTypeMapper({
                customMappings: {
                    customType: "MyCustomType",
                },
            });

            const result = customMapper.mapPrimitive("customType");
            expect(result.name).toBe("MyCustomType");
        });

        test("respects null vs undefined preference", () => {
            const nullMapper = new TypeScriptTypeMapper({
                preferUndefined: false,
            });

            const baseType = nullMapper.mapPrimitive("string");
            const optionalType = nullMapper.mapOptional(baseType, false);

            expect(optionalType.name).toBe("string | null");
            expect(optionalType.metadata?.nullabilityType).toBe("null");
        });
    });

    describe("Multi-language Consistency", () => {
        test("different languages handle same types consistently", () => {
            const tsMapper = new TypeScriptTypeMapper();
            const pyMapper = new PythonTypeMapper();

            // Both should handle strings (even if mapped differently)
            const tsString = tsMapper.mapPrimitive("string");
            const pyString = pyMapper.mapPrimitive("string");

            expect(tsString.isPrimitive).toBe(true);
            expect(pyString.isPrimitive).toBe(true);
            expect(tsString.nullable).toBe(pyString.nullable);

            // TypeScript maps to 'string', Python to 'str'
            expect(tsString.name).toBe("string");
            expect(pyString.name).toBe("str");
        });

        test("both handle arrays correctly", () => {
            const tsMapper = new TypeScriptTypeMapper();
            const pyMapper = new PythonTypeMapper();

            const tsStringType = tsMapper.mapPrimitive("string");
            const pyStringType = pyMapper.mapPrimitive("string");

            const tsArrayType = tsMapper.mapArray(tsStringType);
            const pyArrayType = pyMapper.mapArray(pyStringType);

            expect(tsArrayType.isArray).toBe(true);
            expect(pyArrayType.isArray).toBe(true);

            // Different syntax but same concept
            expect(tsArrayType.name).toBe("string[]");
            expect(pyArrayType.name).toBe("List[str]");
        });

        test("both handle optional types", () => {
            const tsMapper = new TypeScriptTypeMapper();
            const pyMapper = new PythonTypeMapper();

            const tsType = tsMapper.mapPrimitive("string");
            const pyType = pyMapper.mapPrimitive("string");

            const tsOptional = tsMapper.mapOptional(tsType, false);
            const pyOptional = pyMapper.mapOptional(pyType, false);

            expect(tsOptional.nullable).toBe(true);
            expect(pyOptional.nullable).toBe(true);

            // Different syntax but same concept
            expect(tsOptional.name).toBe("string | undefined");
            expect(pyOptional.name).toBe("Optional[str]");
        });

        test("both respect naming conventions", () => {
            const tsMapper = new TypeScriptTypeMapper();
            const pyMapper = new PythonTypeMapper();

            // TypeScript uses PascalCase for types
            expect(tsMapper.formatTypeName("patient_resource")).toBe("PatientResource");
            expect(tsMapper.formatFieldName("first_name")).toBe("firstName");

            // Python uses snake_case
            expect(pyMapper.formatTypeName("PatientResource")).toBe("PatientResource"); // Uses PascalCase by default
            expect(pyMapper.formatFieldName("firstName")).toBe("first_name");
        });
    });

    describe("Complex Type Mapping", () => {
        test("maps complex schema types", () => {
            const mapper = new TypeScriptTypeMapper();

            const complexSchema = {
                kind: "complex-type",
                name: "Address",
                required: true,
            };

            const result = mapper.mapType(complexSchema);

            expect(result.name).toBe("Address");
            expect(result.isPrimitive).toBe(false);
            expect(result.importPath).toBe("./Address");
            expect(result.metadata?.kind).toBe("complex-type");
        });

        test("maps reference schemas", () => {
            const mapper = new TypeScriptTypeMapper();

            const refSchema = {
                kind: "reference",
                targets: [{ name: "Patient", kind: "resource" }],
            };

            const result = mapper.mapType(refSchema);

            expect(result.name).toBe("Reference");
            expect(result.generics).toEqual(["'Patient'"]);
        });

        test("maps array schemas", () => {
            const mapper = new TypeScriptTypeMapper();

            const arraySchema = {
                kind: "array",
                element: {
                    kind: "primitive-type",
                    name: "string",
                },
            };

            const result = mapper.mapType(arraySchema);

            expect(result.name).toBe("string[]");
            expect(result.isArray).toBe(true);
        });

        test("maps enum schemas", () => {
            const mapper = new TypeScriptTypeMapper();

            const enumSchema = {
                kind: "enum",
                name: "ContactPointStatus",
                values: ["active", "inactive", "entered-in-error"],
            };

            const result = mapper.mapType(enumSchema);

            expect(result.name).toBe("'active' | 'inactive' | 'entered-in-error'");
            expect(result.metadata?.enumName).toBe("ContactPointStatus");
        });

        test("handles unknown schema types gracefully", () => {
            const mapper = new TypeScriptTypeMapper();

            const unknownSchema = {
                kind: "mysterious-type",
                name: "Strange",
            };

            const result = mapper.mapType(unknownSchema);

            expect(result.name).toBe("unknown");
            expect(result.metadata?.warning).toBe("unmapped_type");
            expect(result.metadata?.originalType).toEqual(unknownSchema);
        });
    });

    describe("Configuration Options", () => {
        test("uses branded types when enabled", () => {
            const mapper = new TypeScriptTypeMapper({
                useBrandedTypes: true,
            });

            const result = mapper.mapPrimitive("id");

            expect(result.name).toBe("string & { readonly __brand: 'id' }");
            expect(result.isPrimitive).toBe(false);
            expect(result.importPath).toBe("./brands");
            expect(result.metadata?.isBranded).toBe(true);
        });

        test("respects strict type settings", () => {
            const strictMapper = new TypeScriptTypeMapper({
                strictTypes: true,
            });

            const looseMapper = new TypeScriptTypeMapper({
                strictTypes: false,
            });

            // Both should behave consistently for this test
            expect(strictMapper.getLanguageName()).toBe("TypeScript");
            expect(looseMapper.getLanguageName()).toBe("TypeScript");
        });

        test("uses different naming conventions", () => {
            const camelCaseMapper = new TypeScriptTypeMapper({
                namingConvention: "camelCase",
            });

            const snakeCaseMapper = new TypeScriptTypeMapper({
                namingConvention: "snake_case",
            });

            expect(camelCaseMapper.formatTypeName("patient_resource")).toBe("patientResource");
            expect(snakeCaseMapper.formatTypeName("PatientResource")).toBe("patient_resource");
        });
    });
});
