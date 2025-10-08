import { describe, expect, it } from "bun:test";
import type {
    CanonicalUrl,
    Identifier,
    Name,
    ProfileTypeSchema,
    RegularField,
    RegularTypeSchema,
} from "@typeschema/types";
import { mkTypeSchemaIndex } from "@typeschema/utils";

const stringType: Identifier = {
    name: "string" as Name,
    package: "test",
    kind: "primitive-type",
    version: "1.0.0",
    url: "http://example.org/StructureDefinition/string" as CanonicalUrl,
};

const numberType: Identifier = {
    name: "number" as Name,
    package: "test",
    kind: "primitive-type",
    version: "1.0.0",
    url: "http://example.org/StructureDefinition/number" as CanonicalUrl,
};

const booleanType: Identifier = {
    name: "boolean" as Name,
    package: "test",
    kind: "primitive-type",
    version: "1.0.0",
    url: "http://example.org/StructureDefinition/boolean" as CanonicalUrl,
};

describe("TypeSchema Index", () => {
    describe("hierarchy", () => {
        it("should return a single element hierarchy for a constraint resource", () => {
            const aSchema: RegularTypeSchema = {
                identifier: {
                    name: "A" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/A" as CanonicalUrl,
                },
            };

            const bSchema: RegularTypeSchema = {
                identifier: {
                    name: "B" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/B" as CanonicalUrl,
                },
                base: aSchema.identifier,
            };
            const index = mkTypeSchemaIndex([aSchema, bSchema]);

            const result = index.hierarchy(bSchema);
            expect(result).toEqual([bSchema, aSchema]);
        });

        it("should return single item for types without base", () => {
            const aSchema: RegularTypeSchema = {
                identifier: {
                    name: "A" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/A" as CanonicalUrl,
                },
            };

            const index = mkTypeSchemaIndex([aSchema]);
            const result = index.hierarchy(aSchema);

            expect(result).toEqual([aSchema]);
        });

        it("should handle a schema without a base reference", () => {
            const bSchema: RegularTypeSchema = {
                identifier: {
                    name: "B" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/B" as CanonicalUrl,
                },
                // No base provided
            };

            const index = mkTypeSchemaIndex([bSchema]);
            const result = index.hierarchy(bSchema);

            expect(result).toEqual([bSchema]);
        });

        it("should handle multi-level constraint hierarchy", () => {
            const aSchema: RegularTypeSchema = {
                identifier: {
                    name: "A" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/A" as CanonicalUrl,
                },
            };

            const bSchema: RegularTypeSchema = {
                identifier: {
                    name: "B" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/B" as CanonicalUrl,
                },
                base: aSchema.identifier,
            };

            const cSchema: RegularTypeSchema = {
                identifier: {
                    name: "C" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/C" as CanonicalUrl,
                },
                base: bSchema.identifier,
            };

            const index = mkTypeSchemaIndex([aSchema, bSchema, cSchema]);
            const result = index.hierarchy(cSchema);

            expect(result).toEqual([cSchema, bSchema, aSchema]);
        });

        it("should throw an error when base type cannot be resolved", () => {
            const bSchema: RegularTypeSchema = {
                identifier: {
                    name: "B" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/B" as CanonicalUrl,
                },
                base: {
                    name: "A" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/A" as CanonicalUrl,
                },
            };

            const index = mkTypeSchemaIndex([bSchema]);

            expect(() => index.hierarchy(bSchema)).toThrow(
                "Failed to resolve base type: http://example.org/StructureDefinition/B (profile)",
            );
        });

        it("should handle packages with different casing", () => {
            const aSchema: RegularTypeSchema = {
                identifier: {
                    name: "A" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/A" as CanonicalUrl,
                },
            };

            const bSchema: RegularTypeSchema = {
                identifier: {
                    name: "B" as Name,
                    package: "TEST",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/B" as CanonicalUrl,
                },
                base: aSchema.identifier,
            };

            const index = mkTypeSchemaIndex([aSchema, bSchema]);
            const result = index.hierarchy(bSchema);

            expect(result).toEqual([bSchema, aSchema]);
        });
    });

    describe("flatProfile", () => {
        it("should flatten a profile with a single constraint", () => {
            const baseSchema: RegularTypeSchema = {
                identifier: {
                    name: "Base" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/Base" as CanonicalUrl,
                },
                fields: {
                    baseField: { type: stringType, required: false, array: false },
                    constraintField: { type: numberType, required: false, array: false },
                },
            };

            const constraintSchema: ProfileTypeSchema = {
                identifier: {
                    name: "Constraint" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/Constraint" as CanonicalUrl,
                },
                base: baseSchema.identifier,
                fields: {
                    constraintField: { type: numberType, required: false, array: false, min: 1 },
                },
            };

            const index = mkTypeSchemaIndex([baseSchema, constraintSchema]);
            const result = index.flatProfile(constraintSchema);

            expect(result.identifier).toEqual(constraintSchema.identifier);
            expect(result.base).toEqual(baseSchema.identifier);

            expect(result.fields).toBeDefined();
            expect(result.fields?.constraintField).toBeDefined();
            expect((result.fields?.constraintField as RegularField).type).toEqual(numberType);
            expect((result.fields?.constraintField as RegularField).required).toBe(false);
            expect((result.fields?.constraintField as RegularField).array).toBe(false);
            expect((result.fields?.constraintField as RegularField).min).toBe(1);
        });

        it("should merge fields from multiple constraints", () => {
            const baseSchema: RegularTypeSchema = {
                identifier: {
                    name: "Base" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/Base" as CanonicalUrl,
                },
                fields: {
                    baseField: {
                        type: stringType,
                        required: false,
                        array: false,
                    },
                },
            };

            const constraintSchemaA: ProfileTypeSchema = {
                identifier: {
                    name: "ConstraintA" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/ConstraintA" as CanonicalUrl,
                },
                base: baseSchema.identifier,
                fields: {
                    fieldA: {
                        type: numberType,
                        required: false,
                        array: false,
                    },
                },
            };

            const constraintSchemaB: ProfileTypeSchema = {
                identifier: {
                    name: "ConstraintB" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/ConstraintB" as CanonicalUrl,
                },
                base: constraintSchemaA.identifier,
                fields: {
                    fieldB: {
                        type: booleanType,
                        required: false,
                        array: false,
                    },
                },
            };

            const index = mkTypeSchemaIndex([baseSchema, constraintSchemaA, constraintSchemaB]);
            const result = index.flatProfile(constraintSchemaB) as ProfileTypeSchema;

            expect(result.identifier).toEqual(constraintSchemaB.identifier);
            expect(result.base).toEqual(baseSchema.identifier);

            // Check specific properties rather than exact equality
            expect(result.fields).toBeDefined();
            expect(result.fields?.fieldA).toBeDefined();
            expect(result.fields?.fieldB).toBeDefined();
            expect((result.fields?.fieldA as RegularField).type).toEqual(numberType);
            expect((result.fields?.fieldB as RegularField).type).toEqual(booleanType);
        });

        it("should override fields when merged", () => {
            const baseSchema: RegularTypeSchema = {
                identifier: {
                    name: "Base" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/Base" as CanonicalUrl,
                },
                fields: {
                    common: {
                        type: stringType,
                        required: false,
                        array: false,
                    },
                },
            };

            const constraintSchemaA: ProfileTypeSchema = {
                identifier: {
                    name: "ConstraintA" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/ConstraintA" as CanonicalUrl,
                },
                base: baseSchema.identifier,
                fields: {
                    common: {
                        type: numberType,
                        required: false,
                        array: false,
                    },
                },
            };

            const constraintSchemaB: ProfileTypeSchema = {
                identifier: {
                    name: "ConstraintB" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/ConstraintB" as CanonicalUrl,
                },
                base: constraintSchemaA.identifier,
                fields: {
                    common: {
                        type: booleanType,
                        required: false,
                        array: false,
                    },
                },
            };

            const index = mkTypeSchemaIndex([baseSchema, constraintSchemaA, constraintSchemaB]);
            const result = index.flatProfile(constraintSchemaB);

            // Check specific properties rather than exact equality
            expect(result.fields).toBeDefined();
            expect(result.fields?.common).toBeDefined();
            expect((result.fields?.common as RegularField).type).toEqual(booleanType);
        });

        it("should handle constraints without fields", () => {
            const baseSchema: RegularTypeSchema = {
                identifier: {
                    name: "Base" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/Base" as CanonicalUrl,
                },
                fields: {
                    baseField: {
                        type: stringType,
                        required: false,
                        array: false,
                    },
                },
            };

            const constraintSchemaA: ProfileTypeSchema = {
                identifier: {
                    name: "ConstraintA" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/ConstraintA" as CanonicalUrl,
                },
                base: baseSchema.identifier,
                fields: {
                    fieldA: {
                        type: numberType,
                        required: false,
                        array: false,
                    },
                },
            };

            const constraintSchemaB: ProfileTypeSchema = {
                identifier: {
                    name: "ConstraintB" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/ConstraintB" as CanonicalUrl,
                },
                base: constraintSchemaA.identifier,
            };

            const index = mkTypeSchemaIndex([baseSchema, constraintSchemaA, constraintSchemaB]);
            const result = index.flatProfile(constraintSchemaB);

            // Check specific properties rather than exact equality
            expect(result.fields).toBeDefined();
            expect(result.fields?.fieldA).toBeDefined();
            expect((result.fields?.fieldA as RegularField).type).toEqual(numberType);
        });

        it("should throw error when no non-constraint schema is found", () => {
            const constraintSchema = {
                identifier: {
                    name: "Constraint" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/Constraint" as CanonicalUrl,
                },
            } as ProfileTypeSchema;

            const index = mkTypeSchemaIndex([constraintSchema]);

            expect(() => index.flatProfile(constraintSchema)).toThrow(
                "No non-constraint schema found in hierarchy for Constraint",
            );
        });

        it("should preserve identifier from original schema", () => {
            const baseSchema: RegularTypeSchema = {
                identifier: {
                    name: "Base" as Name,
                    package: "test",
                    kind: "resource",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/Base" as CanonicalUrl,
                },
                fields: {
                    baseField: {
                        type: stringType,
                        required: false,
                        array: false,
                    },
                },
            };

            const constraintSchema: ProfileTypeSchema = {
                identifier: {
                    name: "Constraint" as Name,
                    package: "test",
                    kind: "profile",
                    version: "1.0.0",
                    url: "http://example.org/StructureDefinition/Constraint" as CanonicalUrl,
                },
                base: baseSchema.identifier,
                fields: {
                    constraintField: {
                        type: numberType,
                        required: false,
                        array: false,
                    },
                },
            };

            const index = mkTypeSchemaIndex([baseSchema, constraintSchema]);
            const result = index.flatProfile(constraintSchema);

            expect(result.identifier).toEqual(constraintSchema.identifier);
        });
    });
});
