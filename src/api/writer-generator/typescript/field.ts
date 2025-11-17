import type { Field, Identifier, RegularField } from "@root/typeschema/types";
import { isChoiceDeclarationField, isNestedIdentifier, isPrimitiveIdentifier } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { resolvePrimitiveType, tsResourceName } from "./utils";

/**
 * Resolve TypeScript type for a field
 */
export function resolveFieldType(field: Field, tsIndex: TypeSchemaIndex): string {
    if (isChoiceDeclarationField(field)) {
        // Choice declarations don't have a single type
        // They are represented by their choice instances
        return "unknown"; // This shouldn't be used in practice
    }

    return resolveIdentifierType(field.type, tsIndex);
}

/**
 * Resolve TypeScript type from Identifier
 */
export function resolveIdentifierType(identifier: Identifier, tsIndex: TypeSchemaIndex): string {
    // Check if it's a primitive type
    if (isPrimitiveIdentifier(identifier)) {
        return resolvePrimitiveType(identifier.name);
    }

    // Nested or complex type
    if (isNestedIdentifier(identifier)) {
        return tsResourceName(identifier);
    }

    // Default: use name directly
    return identifier.name;
}

/**
 * Check if field should be optional
 */
export function isFieldOptional(field: Field): boolean {
    if (isChoiceDeclarationField(field)) {
        // Choice declarations are optional if no choice is required
        return !field.required;
    }
    return !field.required;
}

/**
 * Get field cardinality constraints
 */
export interface CardinalityConstraint {
    min: number;
    max: number | undefined;
}

export function getFieldCardinality(field: RegularField): CardinalityConstraint {
    return {
        min: field.min ?? 0,
        max: field.max,
    };
}

/**
 * Check if field has cardinality constraints
 */
export function hasCardinalityConstraints(field: RegularField): boolean {
    return (field.min !== undefined && field.min > 0) || field.max !== undefined;
}

/**
 * Check if field is excluded (max=0)
 */
export function isFieldExcluded(field: RegularField): boolean {
    return field.excluded === true || field.max === 0;
}
