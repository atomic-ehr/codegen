/**
 * FHIR Custom Predicates and Validators
 *
 * Custom validation predicates for complex FHIR constraints that go beyond
 * basic type checking. Includes cardinality, reference, and business rule validation.
 */

import type {
	AnyTypeSchema,
	isRegularField,
	TypeSchemaField,
	TypeSchemaIdentifier,
} from "../../typeschema/lib-types";
import type {
	CardinalityConstraint,
	GuardGenerationContext,
	TypeGuardResult,
	ValidationContext,
	ValidationPredicate,
	ValidationResult,
} from "./types";

/**
 * Generate custom predicate functions for complex validation rules
 */
export function generateCustomPredicates(
	schemas: AnyTypeSchema[],
	context: GuardGenerationContext,
): TypeGuardResult {
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	// Generate field validators
	const fieldValidatorResult = generateFieldValidators(schemas, context);
	guardCode.push(fieldValidatorResult.guardCode);
	typeDefinitions.push(fieldValidatorResult.typeDefinitions);
	fieldValidatorResult.imports.forEach((imp) => imports.add(imp));
	fieldValidatorResult.dependencies.forEach((dep) => dependencies.add(dep));

	// Generate cardinality validators
	const cardinalityResult = generateCardinalityValidators(context);
	guardCode.push(cardinalityResult.guardCode);
	typeDefinitions.push(cardinalityResult.typeDefinitions);

	// Generate reference validators
	const referenceResult = generateReferenceValidators(context);
	guardCode.push(referenceResult.guardCode);
	typeDefinitions.push(referenceResult.typeDefinitions);

	// Generate utility predicates
	guardCode.push(generateUtilityPredicates());

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Create a field validator for specific field constraints
 */
export function createFieldValidator(
	fieldName: string,
	field: TypeSchemaField,
	context: GuardGenerationContext,
): ValidationPredicate {
	return (
		value: unknown,
		validationContext?: ValidationContext,
	): ValidationResult => {
		const errors = [];
		const warnings = [];
		const currentPath = [...(validationContext?.path || []), fieldName];

		// Required field check
		if (field.required && (value === undefined || value === null)) {
			errors.push({
				message: `Required field '${fieldName}' is missing`,
				path: currentPath,
				expected: "non-null value",
				actual: value,
				code: "REQUIRED_FIELD_MISSING",
			});
			return { valid: false, errors, warnings };
		}

		// Skip validation if field is not present and not required
		if (value === undefined || value === null) {
			return { valid: true, errors, warnings };
		}

		// Array cardinality validation
		if (field.array) {
			if (!Array.isArray(value)) {
				errors.push({
					message: `Field '${fieldName}' must be an array`,
					path: currentPath,
					expected: "array",
					actual: typeof value,
					code: "INVALID_ARRAY_TYPE",
				});
				return { valid: false, errors, warnings };
			}

			// Min/max array length validation
			if (field.min !== undefined && value.length < field.min) {
				errors.push({
					message: `Array '${fieldName}' has too few elements: ${value.length} < ${field.min}`,
					path: currentPath,
					expected: `>= ${field.min} elements`,
					actual: value.length,
					code: "ARRAY_TOO_SHORT",
				});
			}

			if (field.max !== undefined && value.length > field.max) {
				errors.push({
					message: `Array '${fieldName}' has too many elements: ${value.length} > ${field.max}`,
					path: currentPath,
					expected: `<= ${field.max} elements`,
					actual: value.length,
					code: "ARRAY_TOO_LONG",
				});
			}
		} else {
			// Non-array field should not be an array
			if (Array.isArray(value)) {
				errors.push({
					message: `Field '${fieldName}' should not be an array`,
					path: currentPath,
					expected: "single value",
					actual: "array",
					code: "UNEXPECTED_ARRAY",
				});
				return { valid: false, errors, warnings };
			}
		}

		// Enum validation
		if (isRegularField(field) && field.enum) {
			const valueToCheck = field.array ? value : [value];
			const arrayValue = Array.isArray(valueToCheck)
				? valueToCheck
				: [valueToCheck];

			for (const item of arrayValue) {
				if (!field.enum.includes(item as string)) {
					errors.push({
						message: `Invalid enum value '${item}' for field '${fieldName}'`,
						path: currentPath,
						expected: field.enum,
						actual: item,
						code: "INVALID_ENUM_VALUE",
					});
				}
			}
		}

		return { valid: errors.length === 0, errors, warnings };
	};
}

/**
 * Create a cardinality validator for field constraints
 */
export function createCardinalityValidator(
	constraint: CardinalityConstraint,
): ValidationPredicate {
	return (value: unknown, context?: ValidationContext): ValidationResult => {
		const errors = [];
		const warnings = [];
		const path = context?.path || [];

		// Handle required constraint
		if (constraint.required && (value === undefined || value === null)) {
			errors.push({
				message: "Required field is missing",
				path,
				expected: "non-null value",
				actual: value,
				code: "CARDINALITY_REQUIRED_MISSING",
			});
			return { valid: false, errors, warnings };
		}

		// Skip if value is not present and not required
		if (value === undefined || value === null) {
			return { valid: true, errors, warnings };
		}

		// Array cardinality validation
		if (constraint.array) {
			if (!Array.isArray(value)) {
				errors.push({
					message: "Expected array value",
					path,
					expected: "array",
					actual: typeof value,
					code: "CARDINALITY_NOT_ARRAY",
				});
				return { valid: false, errors, warnings };
			}

			if (value.length < constraint.min) {
				errors.push({
					message: `Array too short: ${value.length} < ${constraint.min}`,
					path,
					expected: `>= ${constraint.min} elements`,
					actual: value.length,
					code: "CARDINALITY_MIN_VIOLATION",
				});
			}

			if (constraint.max !== "*" && value.length > constraint.max) {
				errors.push({
					message: `Array too long: ${value.length} > ${constraint.max}`,
					path,
					expected: `<= ${constraint.max} elements`,
					actual: value.length,
					code: "CARDINALITY_MAX_VIOLATION",
				});
			}
		} else {
			// Single value constraints
			if (constraint.min > 1) {
				errors.push({
					message: `Single value cannot satisfy min cardinality ${constraint.min}`,
					path,
					expected: `>= ${constraint.min} values`,
					actual: 1,
					code: "CARDINALITY_SINGLE_VALUE_MIN",
				});
			}
		}

		return { valid: errors.length === 0, errors, warnings };
	};
}

/**
 * Create a reference validator for reference field constraints
 */
export function createReferenceValidator(
	allowedTargets: TypeSchemaIdentifier[],
): ValidationPredicate {
	return (value: unknown, context?: ValidationContext): ValidationResult => {
		const errors = [];
		const warnings = [];
		const path = context?.path || [];

		if (value === undefined || value === null) {
			return { valid: true, errors, warnings };
		}

		// Handle array of references
		const valuesToCheck = Array.isArray(value) ? value : [value];

		for (const [index, reference] of valuesToCheck.entries()) {
			const currentPath = Array.isArray(value) ? [...path, index] : path;

			if (!isReferenceObject(reference)) {
				errors.push({
					message: "Invalid reference format",
					path: currentPath,
					expected: "Reference object with reference property",
					actual: reference,
					code: "INVALID_REFERENCE_FORMAT",
				});
				continue;
			}

			const ref = reference as { reference?: string; type?: string };

			if (!ref.reference) {
				errors.push({
					message: "Reference missing reference property",
					path: currentPath,
					expected: "reference string",
					actual: undefined,
					code: "REFERENCE_MISSING_REFERENCE",
				});
				continue;
			}

			// Extract resource type from reference
			const resourceType = extractResourceTypeFromReference(ref.reference);
			if (resourceType) {
				const isAllowedTarget = allowedTargets.some(
					(target) =>
						target.name === resourceType || target.name === "Resource",
				);

				if (!isAllowedTarget) {
					const allowedTypes = allowedTargets.map((t) => t.name).join(", ");
					errors.push({
						message: `Reference to '${resourceType}' not allowed`,
						path: currentPath,
						expected: `Reference to one of: ${allowedTypes}`,
						actual: resourceType,
						code: "REFERENCE_INVALID_TARGET",
					});
				}
			} else {
				// Could be a relative reference, external reference, etc.
				warnings.push({
					message: `Cannot validate reference target from '${ref.reference}'`,
					path: currentPath,
					expected: "verifiable reference format",
					actual: ref.reference,
					code: "REFERENCE_UNVERIFIABLE",
				});
			}
		}

		return { valid: errors.length === 0, errors, warnings };
	};
}

/**
 * Generate field validators for all schemas
 */
function generateFieldValidators(
	schemas: AnyTypeSchema[],
	context: GuardGenerationContext,
): TypeGuardResult {
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];

	guardCode.push(`/**
 * Generic field validator factory
 */
export function createGenericFieldValidator(
	fieldName: string,
	constraints: FieldConstraints,
): ValidationPredicate {
	return (value: unknown, context?: ValidationContext): ValidationResult => {
		const errors = [];
		const warnings = [];
		const currentPath = [...(context?.path || []), fieldName];

		// Apply all constraints
		for (const constraint of constraints) {
			const result = constraint(value, { ...context, path: currentPath });
			errors.push(...result.errors);
			warnings.push(...result.warnings);
		}

		return { valid: errors.length === 0, errors, warnings };
	};
}`);

	typeDefinitions.push(`/**
 * Field constraint function type
 */
export type FieldConstraint = ValidationPredicate;

/**
 * Collection of field constraints
 */
export type FieldConstraints = FieldConstraint[];`);

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: [],
		dependencies: [],
	};
}

/**
 * Generate cardinality validators
 */
function generateCardinalityValidators(
	context: GuardGenerationContext,
): TypeGuardResult {
	const guardCode = `/**
 * Create cardinality constraint from field definition
 */
export function createCardinalityConstraint(
	field: TypeSchemaField,
): CardinalityConstraint {
	return {
		min: field.min || 0,
		max: field.max || (field.array ? "*" : 1),
		required: field.required === true,
		array: field.array === true,
	};
}

/**
 * Validate cardinality constraints for a value
 */
export function validateCardinality(
	value: unknown,
	constraint: CardinalityConstraint,
	context?: ValidationContext,
): ValidationResult {
	const validator = createCardinalityValidator(constraint);
	return validator(value, context);
}`;

	const typeDefinitions = `/**
 * Cardinality validation options
 */
export interface CardinalityValidationOptions {
	/** Allow empty arrays to satisfy min = 0 */
	allowEmptyArrays?: boolean;
	/** Strict mode - fail on warnings */
	strictMode?: boolean;
}`;

	return {
		guardCode,
		typeDefinitions,
		imports: [],
		dependencies: [],
	};
}

/**
 * Generate reference validators
 */
function generateReferenceValidators(
	context: GuardGenerationContext,
): TypeGuardResult {
	const guardCode = `/**
 * Validate a reference string format
 */
export function validateReferenceFormat(reference: string): boolean {
	// Basic reference format validation
	// ResourceType/id, #fragment, http://example.com/Resource/id, etc.
	return /^([A-Z][a-zA-Z]+\/[A-Za-z0-9\-\.]{1,64}|#[A-Za-z0-9\-\.]+|https?:\/\/.+)$/.test(reference);
}

/**
 * Extract resource type from reference string
 */
export function extractResourceType(reference: string): string | null {
	const match = reference.match(/^([A-Z][a-zA-Z]+)\//);
	return match ? match[1] : null;
}`;

	const typeDefinitions = `/**
 * Reference validation result
 */
export interface ReferenceValidationResult extends ValidationResult {
	/** Extracted resource type if available */
	resourceType?: string;
	/** Whether reference is relative */
	isRelative: boolean;
	/** Whether reference is external */
	isExternal: boolean;
}`;

	return {
		guardCode,
		typeDefinitions,
		imports: [],
		dependencies: [],
	};
}

/**
 * Generate utility predicate functions
 */
function generateUtilityPredicates(): string {
	return `/**
 * Check if value is a valid FHIR reference object
 */
function isReferenceObject(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		'reference' in value
	);
}

/**
 * Extract resource type from a reference string
 */
function extractResourceTypeFromReference(reference: string): string | null {
	// Handle different reference formats:
	// ResourceType/id
	// #fragment
	// http://example.com/fhir/ResourceType/id
	
	if (reference.startsWith('#')) {
		return null; // Fragment reference
	}
	
	if (reference.startsWith('http://') || reference.startsWith('https://')) {
		// External reference - try to extract from URL
		const match = reference.match(/\/([A-Z][a-zA-Z]+)\/[^\/]+$/);
		return match ? match[1] : null;
	}
	
	// Relative reference
	const match = reference.match(/^([A-Z][a-zA-Z]+)\//);
	return match ? match[1] : null;
}

/**
 * Compose multiple validation predicates
 */
export function composePredicates(
	...predicates: ValidationPredicate[]
): ValidationPredicate {
	return (value: unknown, context?: ValidationContext): ValidationResult => {
		const allErrors = [];
		const allWarnings = [];

		for (const predicate of predicates) {
			const result = predicate(value, context);
			allErrors.push(...result.errors);
			allWarnings.push(...result.warnings);
		}

		return {
			valid: allErrors.length === 0,
			errors: allErrors,
			warnings: allWarnings,
		};
	};
}`;
}
