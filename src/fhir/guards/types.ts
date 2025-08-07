/**
 * FHIR Type Guard Types and Interfaces
 *
 * Core type definitions for FHIR type guards and constraint validation.
 */

import type {
	AnyTypeSchema,
	TypeSchemaField,
	TypeSchemaIdentifier,
} from "../../typeschema/lib-types";

/**
 * Type guard function for resources
 */
export type ResourceTypeGuard<T = any> = (value: unknown) => value is T;

/**
 * Type guard function for primitives
 */
export type PrimitiveTypeGuard<T = any> = (value: unknown) => value is T;

/**
 * Type guard function for fields
 */
export type FieldTypeGuard<T = any> = (value: unknown) => value is T;

/**
 * Choice type discriminator function
 */
export type ChoiceTypeDiscriminator<T = any> = (value: any) => T | null;

/**
 * Cardinality constraint types
 */
export interface CardinalityConstraint {
	min: number;
	max: number | "*";
	required: boolean;
	array: boolean;
}

/**
 * Extract required fields from a TypeSchema
 */
export type RequiredFields<T extends Record<string, TypeSchemaField>> = {
	readonly [K in keyof T]: T[K] extends { required: true } ? K : never;
}[keyof T];

/**
 * Extract optional fields from a TypeSchema
 */
export type OptionalFields<T extends Record<string, TypeSchemaField>> = {
	readonly [K in keyof T]: T[K] extends { required: true } ? never : K;
}[keyof T];

/**
 * Create a literal field type
 */
export type LiteralField<T extends TypeSchemaField> = T extends {
	enum: infer E;
}
	? E extends readonly (infer U)[]
		? U
		: never
	: unknown;

/**
 * Extract reference types from a field
 */
export type ReferenceField<T extends TypeSchemaField> = T extends {
	reference: infer R;
}
	? R extends TypeSchemaIdentifier[]
		? R[number]["name"]
		: never
	: never;

/**
 * Guard generation context
 */
export interface GuardGenerationContext {
	/** Available schemas for reference resolution */
	schemas: AnyTypeSchema[];
	/** Generation options */
	options: GuardGenerationOptions;
	/** Generated guard cache */
	guardCache: Map<string, string>;
	/** Processing stack to detect cycles */
	processing: Set<string>;
}

/**
 * Options for guard generation
 */
export interface GuardGenerationOptions {
	/** Generate runtime validation code */
	includeRuntimeValidation?: boolean;
	/** Include detailed error messages */
	includeErrorMessages?: boolean;
	/** Tree-shake unused guards */
	treeShakeable?: boolean;
	/** Target TypeScript version */
	targetTSVersion?: "3.8" | "4.0" | "4.5" | "5.0";
	/** Generate strict type guards */
	strict?: boolean;
	/** Include null/undefined checks */
	includeNullChecks?: boolean;
}

/**
 * Type guard result with metadata
 */
export interface TypeGuardResult {
	/** Generated type guard function code */
	guardCode: string;
	/** Generated TypeScript type definitions */
	typeDefinitions: string;
	/** Import statements needed */
	imports: string[];
	/** Dependencies on other guards */
	dependencies: string[];
}

/**
 * Validation error for type guards
 */
export interface TypeGuardError {
	/** Error message */
	message: string;
	/** Path to the invalid field */
	path: string[];
	/** Expected type/value */
	expected: unknown;
	/** Actual value */
	actual: unknown;
	/** Error code */
	code: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
	/** Whether validation passed */
	valid: boolean;
	/** Validation errors */
	errors: TypeGuardError[];
	/** Warnings (non-fatal issues) */
	warnings: TypeGuardError[];
}

/**
 * Predicate function for custom validation
 */
export type ValidationPredicate<T = any> = (
	value: T,
	context?: ValidationContext,
) => ValidationResult | boolean;

/**
 * Validation context passed to predicates
 */
export interface ValidationContext {
	/** Current path in the object */
	path: string[];
	/** Root object being validated */
	root: unknown;
	/** Available schemas */
	schemas: AnyTypeSchema[];
	/** Validation options */
	options: GuardGenerationOptions;
}

/**
 * Choice type information for discrimination
 */
export interface ChoiceTypeInfo {
	/** Base field name (e.g., "value" for value[x]) */
	baseName: string;
	/** Available choice types */
	choices: string[];
	/** Type-specific field names (e.g., "valueString", "valueInteger") */
	fieldNames: Record<string, string>;
}

/**
 * Generated type guard metadata
 */
export interface TypeGuardMetadata {
	/** Schema this guard was generated from */
	sourceSchema: AnyTypeSchema;
	/** Generation timestamp */
	generatedAt: Date;
	/** TypeScript version used */
	tsVersion: string;
	/** Guard performance characteristics */
	performance: {
		/** Estimated runtime complexity */
		complexity: "O(1)" | "O(n)" | "O(n²)";
		/** Tree-shakeable */
		treeShakeable: boolean;
		/** Size estimate in bytes */
		estimatedSize: number;
	};
}

/**
 * Discriminated union helper types
 */
export type DiscriminatedUnion<
	T extends Record<string, any>,
	K extends keyof T,
> = T[K] extends string | number
	? T extends { [P in K]: T[K] }
		? T
		: never
	: never;

/**
 * Extract discriminant values from a union
 */
export type DiscriminantValue<
	T extends Record<string, any>,
	K extends keyof T,
> = T extends { [P in K]: infer V } ? V : never;

/**
 * Narrow a union by discriminant
 */
export type NarrowByDiscriminant<
	T extends Record<string, any>,
	K extends keyof T,
	V,
> = T extends { [P in K]: V } ? T : never;
