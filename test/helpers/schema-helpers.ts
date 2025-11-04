/**
 * PythonHelper functions for creating test schemas
 */

import type { TypeSchema } from "@typeschema/index";

/**
 * Create a minimal valid schema for testing
 */
export function createMockSchema(overrides: Partial<TypeSchema> = {}): TypeSchema {
    const baseSchema: TypeSchema = {
        identifier: {
            name: "TestSchema",
            kind: "resource",
            package: "test.package",
            url: "http://test.com/StructureDefinition/TestSchema",
            version: "1.0.0",
            ...overrides.identifier,
        },
        description: "Test schema for unit tests",
        fields: {
            id: {
                type: {
                    name: "string",
                    kind: "primitive-type",
                    package: "hl7.fhir.r4.core",
                    version: "4.0.1",
                    url: "http://hl7.org/fhir/StructureDefinition/string",
                },
                required: false,
                array: false,
            },
            status: {
                type: {
                    name: "code",
                    kind: "primitive-type",
                    package: "hl7.fhir.r4.core",
                    version: "4.0.1",
                    url: "http://hl7.org/fhir/StructureDefinition/code",
                },
                required: true,
                array: false,
                enum: ["active", "inactive"],
            },
        },
        ...overrides,
    } as TypeSchema;

    return baseSchema;
}

/**
 * Create multiple schemas for batch testing
 */
export function createMockSchemas(names: string[]): TypeSchema[] {
    return names.map((name) =>
        createMockSchema({
            identifier: {
                name,
                kind: "resource",
                package: "test.package",
                url: `http://test.com/StructureDefinition/${name}`,
                version: "1.0.0",
            },
        }),
    );
}

/**
 * Create schema with complex nested structure
 */
export function createComplexNestedSchema(name: string): TypeSchema {
    return createMockSchema({
        identifier: {
            name,
            kind: "resource",
            package: "test.package",
            url: `http://test.com/StructureDefinition/${name}`,
            version: "1.0.0",
        },
        fields: {
            id: {
                type: {
                    name: "string",
                    kind: "primitive-type",
                    package: "hl7.fhir.r4.core",
                    version: "4.0.1",
                    url: "http://hl7.org/fhir/StructureDefinition/string",
                },
                required: true,
                array: false,
            },
            nested: {
                type: {
                    name: `${name}Nested`,
                    kind: "nested",
                    package: "test.package",
                    version: "1.0.0",
                    url: `http://test.com/StructureDefinition/${name}Nested`,
                },
                required: false,
                array: true,
            },
            reference: {
                type: {
                    name: "Reference",
                    kind: "complex-type",
                    package: "hl7.fhir.r4.core",
                    version: "4.0.1",
                    url: "http://hl7.org/fhir/StructureDefinition/Reference",
                },
                reference: [
                    {
                        name: "Patient",
                        kind: "resource",
                        package: "hl7.fhir.r4.core",
                        version: "4.0.1",
                        url: "http://hl7.org/fhir/StructureDefinition/Patient",
                    },
                    {
                        name: "Practitioner",
                        kind: "resource",
                        package: "hl7.fhir.r4.core",
                        version: "4.0.1",
                        url: "http://hl7.org/fhir/StructureDefinition/Practitioner",
                    },
                ],
                required: false,
                array: false,
            },
        },
        nested: [
            {
                identifier: {
                    name: `${name}Nested`,
                    kind: "nested",
                    package: "test.package",
                    version: "1.0.0",
                    url: `http://test.com/StructureDefinition/${name}Nested`,
                },
                base: {
                    name: "BackboneElement",
                    kind: "complex-type",
                    package: "hl7.fhir.r4.core",
                    version: "4.0.1",
                    url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
                },
                fields: {
                    value: {
                        type: {
                            name: "string",
                            kind: "primitive-type",
                            package: "hl7.fhir.r4.core",
                            version: "4.0.1",
                            url: "http://hl7.org/fhir/StructureDefinition/string",
                        },
                        required: true,
                        array: false,
                    },
                },
            },
        ],
    }) as TypeSchemaForResourceComplexTypeLogical;
}

/**
 * Generate schemas with various edge cases
 */
export function generateEdgeCaseSchemas(): TypeSchema[] {
    return [
        // Schema with empty fields
        createMockSchema({ fields: {} }),

        // Schema with very long name
        createMockSchema({
            identifier: {
                name: "A".repeat(100),
                kind: "resource",
                package: "test.package",
                url: `http://test.com/StructureDefinition/${"A".repeat(100)}`,
                version: "1.0.0",
            },
        }),

        // Schema with special characters in name
        createMockSchema({
            identifier: {
                name: "Test-Schema_With.Special@Chars",
                kind: "resource",
                package: "test.package",
                url: "http://test.com/StructureDefinition/Test-Schema_With.Special@Chars",
                version: "1.0.0",
            },
        }),

        // Profile schema
        {
            identifier: {
                name: "USCorePatient",
                kind: "profile",
                package: "us.core",
                version: "1.0.0",
                url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
            },
            base: {
                name: "Patient",
                kind: "resource",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                url: "http://hl7.org/fhir/StructureDefinition/Patient",
            },
            description: "US Core Patient Profile",
        } as TypeSchemaForProfile,
    ];
}

/**
 * Create malformed schemas for error testing
 */
export function generateMalformedSchemas(count: number): Partial<TypeSchema>[] {
    const malformed: Partial<TypeSchema>[] = [];

    for (let i = 0; i < count; i++) {
        switch (i % 5) {
            case 0:
                // Missing identifier
                malformed.push({ description: "Schema without identifier" });
                break;
            case 1:
                // Invalid identifier kind
                malformed.push({
                    identifier: {
                        name: "Test",
                        kind: "invalid-kind" as any,
                        package: "test.package",
                        version: "1.0.0",
                        url: "http://test.com/StructureDefinition/Test",
                    },
                });
                break;
            case 2:
                // Circular reference
                malformed.push({
                    identifier: {
                        name: "Circular",
                        kind: "resource",
                        package: "test.package",
                        version: "1.0.0",
                        url: "http://test.com/StructureDefinition/Circular",
                    },
                    fields: {
                        self: {
                            type: {
                                name: "Circular",
                                kind: "resource",
                                package: "test.package",
                                version: "1.0.0",
                                url: "http://test.com/StructureDefinition/Circular",
                            },
                            required: false,
                            array: false,
                        },
                    },
                });
                break;
            case 3:
                // Invalid field type
                malformed.push({
                    identifier: {
                        name: "InvalidField",
                        kind: "resource",
                        package: "test.package",
                        version: "1.0.0",
                        url: "http://test.com/StructureDefinition/InvalidField",
                    },
                    fields: {
                        badField: {
                            type: null as any,
                            required: true,
                            array: false,
                        },
                    },
                });
                break;
            case 4:
                // Missing required properties
                malformed.push({
                    identifier: {
                        name: "Incomplete",
                        package: "test.package",
                        version: "1.0.0",
                        url: "http://test.com/StructureDefinition/Incomplete",
                    } as any,
                });
                break;
        }
    }

    return malformed;
}

/**
 * Create a primitive type schema
 */
export function createPrimitiveTypeSchema(name: string): TypeSchemaForPrimitiveType {
    return {
        identifier: {
            name,
            kind: "primitive-type",
            package: "hl7.fhir.r4.core",
            version: "4.0.1",
            url: `http://hl7.org/fhir/StructureDefinition/${name}`,
        },
        description: `FHIR primitive type: ${name}`,
        base: {
            name: "Element",
            kind: "complex-type",
            package: "hl7.fhir.r4.core",
            version: "4.0.1",
            url: "http://hl7.org/fhir/StructureDefinition/Element",
        },
    };
}
