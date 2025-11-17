/**
 * Runtime Validation Helper Generation
 *
 * Generates helper functions that are emitted into each profile file
 * for runtime cardinality and constraint validation.
 */

import type { Writer } from "@root/api/writer-generator/writer";

/**
 * Generate runtime validation helper functions
 * These are emitted into each profile file that uses validation
 */
export function generateValidationHelpers(writer: Writer): void {
    writer.comment("=== Runtime Validation Helpers ===");
    writer.line();

    // Scalar field assignment with validation
    generateAssignScalarField(writer);
    writer.line();

    // Array field assignment with validation
    generateAssignArrayField(writer);
    writer.line();
}

/**
 * Generate assignScalarField helper
 * Validates cardinality for non-array fields
 */
function generateAssignScalarField(writer: Writer): void {
    writer.comment("Assign scalar field with cardinality validation");
    writer.curlyBlock(
        [
            "function",
            "assignScalarField<T>(",
            "resource: any,",
            "field: string,",
            "value: T | undefined,",
            "opts: { min: number; max?: string }",
            "): void",
        ],
        () => {
            // Check required constraint (min > 0)
            writer.curlyBlock(["if (value === undefined && opts.min > 0)"], () => {
                writer.lineSM('throw new Error("Field " + field + " is required (min=" + opts.min + ")")');
            });

            // Assign value
            writer.lineSM("resource[field] = value");
        },
    );
}

/**
 * Generate assignArrayField helper
 * Validates cardinality for array fields
 */
function generateAssignArrayField(writer: Writer): void {
    writer.comment("Assign array field with cardinality validation");
    writer.curlyBlock(
        [
            "function",
            "assignArrayField<T>(",
            "resource: any,",
            "field: string,",
            "values: T[] | undefined,",
            "opts: { min: number; max?: string }",
            "): void",
        ],
        () => {
            // Check if empty or undefined
            writer.curlyBlock(["if (!values || values.length === 0)"], () => {
                // Check min constraint
                writer.curlyBlock(["if (opts.min > 0)"], () => {
                    writer.lineSM('throw new Error("Field " + field + " requires at least " + opts.min + " items")');
                });
                writer.lineSM("resource[field] = undefined");
                writer.lineSM("return");
            });
            writer.line();

            // Check max constraint
            writer.comment("Check max constraint");
            writer.curlyBlock(
                ['if (opts.max !== undefined && opts.max !== "*" && values.length > parseInt(opts.max))'],
                () => {
                    writer.lineSM(
                        'throw new Error("Field " + field + " allows at most " + opts.max + " items, got " + values.length)',
                    );
                },
            );
            writer.line();

            // Assign values
            writer.lineSM("resource[field] = values");
        },
    );
}
