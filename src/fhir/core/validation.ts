/**
 * FHIR Validation Core Module
 *
 * Shared types, utilities, and base functionality for FHIR validators and type guards.
 * This module provides the foundation for runtime validation and type safety.
 */

/**
 * Validation severity levels
 */
export type ValidationSeverity = "error" | "warning" | "info";

/**
 * Detailed validation error with context
 */
export interface ValidationError {
	/** Human-readable error message */
	message: string;
	/** Path to the invalid field using dot notation */
	path: string[];
	/** Machine-readable error code for programmatic handling */
	code: string;
	/** Severity level of the validation error */
	severity: ValidationSeverity;
	/** Expected value or type description */
	expected?: unknown;
	/** Actual value that caused the validation error */
	actual?: unknown;
	/** Additional context or debugging information */
	details?: Record<string, unknown>;
	/** Source rule that generated this error */
	rule?: string;
}

/**
 * Comprehensive validation result
 */
export interface ValidationResult<T = unknown> {
	/** Whether validation passed completely */
	valid: boolean;
	/** The validated and typed value (only present if valid) */
	value?: T;
	/** All validation errors encountered */
	errors: ValidationError[];
	/** Non-fatal warnings */
	warnings: ValidationError[];
	/** Performance metrics */
	metrics?: ValidationMetrics;
}

/**
 * Validation performance metrics
 */
export interface ValidationMetrics {
	/** Time taken for validation in milliseconds */
	duration: number;
	/** Number of fields validated */
	fieldsValidated: number;
	/** Memory usage during validation */
	memoryUsed?: number;
	/** Validation complexity score */
	complexity: number;
}

/**
 * Cardinality constraint definition
 */
export interface CardinalityConstraint {
	/** Minimum occurrences (0 for optional) */
	min: number;
	/** Maximum occurrences ("*" for unlimited) */
	max: number | "*";
	/** Whether this field is required */
	required: boolean;
	/** Whether this field should be an array */
	array: boolean;
}

/**
 * Reference validation configuration
 */
export interface ReferenceConstraint {
	/** Allowed resource types for this reference */
	allowedTypes: string[];
	/** Whether to validate the reference format */
	validateFormat?: boolean;
	/** Whether to validate that referenced resource exists */
	validateExistence?: boolean;
	/** Custom reference validation function */
	customValidator?: (reference: string) => ValidationResult<boolean>;
}

/**
 * Value set binding constraint
 */
export interface ValueSetConstraint {
	/** Value set URI or identifier */
	valueSet: string;
	/** Binding strength: required, extensible, preferred, example */
	strength: "required" | "extensible" | "preferred" | "example";
	/** Additional codes allowed beyond the value set */
	additionalCodes?: string[];
}

/**
 * Custom validation rule
 */
export interface ValidationRule {
	/** Unique identifier for this rule */
	id: string;
	/** Human-readable description */
	description: string;
	/** Rule severity level */
	severity: ValidationSeverity;
	/** Validation function */
	validate: (
		value: unknown,
		context: ValidationContext,
	) => ValidationResult<boolean>;
	/** Whether this rule applies to specific fields only */
	applicableFields?: string[];
	/** Whether this rule applies to specific resource types only */
	applicableResources?: string[];
}

/**
 * Validation context for custom rules
 */
export interface ValidationContext {
	/** Current field being validated */
	fieldName: string;
	/** Full path to current field */
	fieldPath: string[];
	/** Parent object being validated */
	parentObject: Record<string, unknown>;
	/** Root object being validated */
	rootObject: Record<string, unknown>;
	/** Resource type if applicable */
	resourceType?: string;
	/** Additional context data */
	metadata: Record<string, unknown>;
}

/**
 * Validator configuration options
 */
export interface ValidatorOptions {
	/** Include cardinality validation */
	includeCardinality?: boolean;
	/** Include type validation */
	includeTypes?: boolean;
	/** Include constraint validation */
	includeConstraints?: boolean;
	/** Include invariant validation */
	includeInvariants?: boolean;
	/** Validate required fields */
	validateRequired?: boolean;
	/** Allow additional properties not defined in schema */
	allowAdditional?: boolean;
	/** Strict mode (treat warnings as errors) */
	strict?: boolean;
	/** Enable performance metrics collection */
	collectMetrics?: boolean;
	/** Maximum validation depth to prevent infinite recursion */
	maxDepth?: number;
	/** Custom validation rules */
	customRules?: ValidationRule[];
	/** Reference validation settings */
	referenceValidation?: {
		enabled: boolean;
		allowedTypes?: Record<string, string[]>;
		validateFormat?: boolean;
	};
	/** Value set validation settings */
	valueSetValidation?: {
		enabled: boolean;
		strictBinding?: boolean;
		allowUnknownCodes?: boolean;
	};
}

/**
 * Type guard function type
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * Assertion function type
 */
export type AssertionFunction<T> = (
	value: unknown,
	message?: string,
) => asserts value is T;

/**
 * Validator function type
 */
export type ValidatorFunction<T> = (
	value: unknown,
	options?: Partial<ValidatorOptions>,
) => ValidationResult<T>;

/**
 * Partial validator function type (for updates/patches)
 */
export type PartialValidatorFunction<T> = (
	value: Partial<T>,
	options?: Partial<ValidatorOptions>,
) => ValidationResult<Partial<T>>;

/**
 * Common validation error codes
 */
export const ValidationErrorCodes = {
	// Type errors
	INVALID_TYPE: "INVALID_TYPE",
	MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
	UNEXPECTED_FIELD: "UNEXPECTED_FIELD",

	// Cardinality errors
	MIN_CARDINALITY: "MIN_CARDINALITY",
	MAX_CARDINALITY: "MAX_CARDINALITY",
	ARRAY_REQUIRED: "ARRAY_REQUIRED",
	ARRAY_NOT_ALLOWED: "ARRAY_NOT_ALLOWED",

	// Reference errors
	INVALID_REFERENCE: "INVALID_REFERENCE",
	INVALID_REFERENCE_TYPE: "INVALID_REFERENCE_TYPE",
	INVALID_REFERENCE_FORMAT: "INVALID_REFERENCE_FORMAT",
	REFERENCE_NOT_FOUND: "REFERENCE_NOT_FOUND",

	// Value set errors
	INVALID_CODE: "INVALID_CODE",
	UNKNOWN_CODE_SYSTEM: "UNKNOWN_CODE_SYSTEM",
	REQUIRED_BINDING_VIOLATION: "REQUIRED_BINDING_VIOLATION",

	// Choice type errors
	INVALID_CHOICE_TYPE: "INVALID_CHOICE_TYPE",
	MULTIPLE_CHOICE_VALUES: "MULTIPLE_CHOICE_VALUES",
	MISSING_CHOICE_VALUE: "MISSING_CHOICE_VALUE",

	// Constraint errors
	CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",
	INVARIANT_VIOLATION: "INVARIANT_VIOLATION",
	PATTERN_MISMATCH: "PATTERN_MISMATCH",

	// FHIR-specific errors
	INVALID_RESOURCE_TYPE: "INVALID_RESOURCE_TYPE",
	INVALID_ID_FORMAT: "INVALID_ID_FORMAT",
	INVALID_DATE_FORMAT: "INVALID_DATE_FORMAT",
	INVALID_URI_FORMAT: "INVALID_URI_FORMAT",
	INVALID_PRIMITIVE: "INVALID_PRIMITIVE",

	// Performance errors
	VALIDATION_TIMEOUT: "VALIDATION_TIMEOUT",
	MAX_DEPTH_EXCEEDED: "MAX_DEPTH_EXCEEDED",
} as const;

/**
 * Validation error code type
 */
export type ValidationErrorCode =
	(typeof ValidationErrorCodes)[keyof typeof ValidationErrorCodes];

/**
 * Base validator class with common functionality
 */
export abstract class BaseValidator<T> {
	protected options: ValidatorOptions;
	protected metrics: ValidationMetrics;
	private startTime: number = 0;

	constructor(options: Partial<ValidatorOptions> = {}) {
		this.options = {
			includeCardinality: true,
			includeTypes: true,
			includeConstraints: true,
			includeInvariants: false,
			validateRequired: true,
			allowAdditional: false,
			strict: false,
			collectMetrics: false,
			maxDepth: 10,
			customRules: [],
			referenceValidation: {
				enabled: true,
				validateFormat: true,
			},
			valueSetValidation: {
				enabled: true,
				strictBinding: false,
				allowUnknownCodes: true,
			},
			...options,
		};

		this.metrics = {
			duration: 0,
			fieldsValidated: 0,
			complexity: 0,
		};
	}

	/**
	 * Main validation method to be implemented by subclasses
	 */
	abstract validate(
		value: unknown,
		context?: ValidationContext,
	): ValidationResult<T>;

	/**
	 * Validate partial object (for updates)
	 */
	abstract validatePartial(
		value: Partial<T>,
		context?: ValidationContext,
	): ValidationResult<Partial<T>>;

	/**
	 * Start performance timing
	 */
	protected startTiming(): void {
		if (this.options.collectMetrics) {
			this.startTime = performance.now();
		}
	}

	/**
	 * End performance timing and update metrics
	 */
	protected endTiming(): void {
		if (this.options.collectMetrics && this.startTime > 0) {
			this.metrics.duration = performance.now() - this.startTime;
		}
	}

	/**
	 * Create a validation error
	 */
	protected createError(
		message: string,
		path: string[],
		code: ValidationErrorCode,
		severity: ValidationSeverity = "error",
		expected?: unknown,
		actual?: unknown,
		details?: Record<string, unknown>,
	): ValidationError {
		return {
			message,
			path: [...path],
			code,
			severity,
			expected,
			actual,
			details,
		};
	}

	/**
	 * Validate cardinality constraints
	 */
	protected validateCardinality(
		value: unknown,
		constraint: CardinalityConstraint,
		path: string[],
	): ValidationError[] {
		const errors: ValidationError[] = [];

		if (constraint.array) {
			if (!Array.isArray(value)) {
				if (constraint.required || value !== undefined) {
					errors.push(
						this.createError(
							`Expected array at ${path.join(".")}`,
							path,
							ValidationErrorCodes.ARRAY_REQUIRED,
							"error",
							"array",
							typeof value,
						),
					);
				}
				return errors;
			}

			const arr = value as unknown[];

			if (arr.length < constraint.min) {
				errors.push(
					this.createError(
						`Array too short at ${path.join(".")} (min: ${constraint.min}, actual: ${arr.length})`,
						path,
						ValidationErrorCodes.MIN_CARDINALITY,
						"error",
						`>= ${constraint.min}`,
						arr.length,
					),
				);
			}

			if (constraint.max !== "*" && arr.length > constraint.max) {
				errors.push(
					this.createError(
						`Array too long at ${path.join(".")} (max: ${constraint.max}, actual: ${arr.length})`,
						path,
						ValidationErrorCodes.MAX_CARDINALITY,
						"error",
						`<= ${constraint.max}`,
						arr.length,
					),
				);
			}
		} else {
			if (constraint.required && (value === null || value === undefined)) {
				errors.push(
					this.createError(
						`Required field missing at ${path.join(".")}`,
						path,
						ValidationErrorCodes.MISSING_REQUIRED_FIELD,
						"error",
						"defined value",
						value,
					),
				);
			}
		}

		return errors;
	}

	/**
	 * Validate reference format and type
	 */
	protected validateReference(
		value: unknown,
		constraint: ReferenceConstraint,
		path: string[],
	): ValidationError[] {
		const errors: ValidationError[] = [];

		if (!value || typeof value !== "object") {
			errors.push(
				this.createError(
					"Reference must be an object",
					path,
					ValidationErrorCodes.INVALID_REFERENCE,
					"error",
					"object",
					typeof value,
				),
			);
			return errors;
		}

		const ref = value as Record<string, unknown>;

		if ("reference" in ref && typeof ref.reference === "string") {
			if (constraint.validateFormat) {
				const refPattern =
					/^([A-Z][a-zA-Z]+)\/([A-Za-z0-9\-.]{1,64})(\/_history\/[A-Za-z0-9\-.]{1,64})?$/;
				const match = ref.reference.match(refPattern);

				if (!match) {
					errors.push(
						this.createError(
							`Invalid reference format: ${ref.reference}`,
							[...path, "reference"],
							ValidationErrorCodes.INVALID_REFERENCE_FORMAT,
							"error",
							"ResourceType/id format",
							ref.reference,
						),
					);
				} else if (!constraint.allowedTypes.includes(match[1])) {
					errors.push(
						this.createError(
							`Invalid reference type: ${match[1]}`,
							[...path, "reference"],
							ValidationErrorCodes.INVALID_REFERENCE_TYPE,
							"error",
							constraint.allowedTypes,
							match[1],
						),
					);
				}
			}
		}

		// Custom reference validation
		if (constraint.customValidator && "reference" in ref) {
			const result = constraint.customValidator(ref.reference as string);
			if (!result.valid) {
				errors.push(
					...result.errors.map((err) => ({
						...err,
						path: [...path, ...err.path],
					})),
				);
			}
		}

		return errors;
	}

	/**
	 * Apply custom validation rules
	 */
	protected applyCustomRules(
		value: unknown,
		context: ValidationContext,
	): ValidationError[] {
		const errors: ValidationError[] = [];

		for (const rule of this.options.customRules || []) {
			// Check if rule applies to this field/resource
			if (
				rule.applicableFields &&
				!rule.applicableFields.includes(context.fieldName)
			) {
				continue;
			}

			if (
				rule.applicableResources &&
				context.resourceType &&
				!rule.applicableResources.includes(context.resourceType)
			) {
				continue;
			}

			try {
				const result = rule.validate(value, context);
				if (!result.valid) {
					errors.push(
						...result.errors.map((err) => ({
							...err,
							rule: rule.id,
						})),
					);
				}
			} catch (error) {
				errors.push(
					this.createError(
						`Custom validation rule '${rule.id}' failed: ${error}`,
						context.fieldPath,
						ValidationErrorCodes.CONSTRAINT_VIOLATION,
						"error",
					),
				);
			}
		}

		return errors;
	}

	/**
	 * Merge multiple validation results
	 */
	protected mergeResults(...results: ValidationResult[]): ValidationResult {
		const allErrors = results.flatMap((r) => r.errors);
		const allWarnings = results.flatMap((r) => r.warnings);
		const valid =
			results.every((r) => r.valid) &&
			(this.options.strict ? allWarnings.length === 0 : true);

		// Combine metrics if available
		const combinedMetrics: ValidationMetrics = {
			duration: Math.max(...results.map((r) => r.metrics?.duration || 0)),
			fieldsValidated: results.reduce(
				(sum, r) => sum + (r.metrics?.fieldsValidated || 0),
				0,
			),
			complexity: results.reduce(
				(sum, r) => sum + (r.metrics?.complexity || 0),
				0,
			),
		};

		return {
			valid,
			errors: allErrors,
			warnings: allWarnings,
			metrics: this.options.collectMetrics ? combinedMetrics : undefined,
		};
	}
}

/**
 * Utility functions for validation
 */
export class ValidationUtils {
	/**
	 * Check if value is a valid FHIR ID
	 */
	static isValidId(value: unknown): boolean {
		return typeof value === "string" && /^[A-Za-z0-9\-.]{1,64}$/.test(value);
	}

	/**
	 * Check if value is a valid FHIR date
	 */
	static isValidDate(value: unknown): boolean {
		if (typeof value !== "string") return false;
		const dateRegex =
			/^([0-9]{4})(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$/;
		return (
			dateRegex.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
		);
	}

	/**
	 * Check if value is a valid FHIR dateTime
	 */
	static isValidDateTime(value: unknown): boolean {
		if (typeof value !== "string") return false;
		const dateTimeRegex =
			/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2}(\.[0-9]{1,3})?)(\+|-)?([0-9]{2}):?([0-9]{2})|Z$/;
		return dateTimeRegex.test(value) && !Number.isNaN(Date.parse(value));
	}

	/**
	 * Check if value is a valid URI
	 */
	static isValidUri(value: unknown): boolean {
		if (typeof value !== "string") return false;
		try {
			new URL(value);
			return true;
		} catch {
			// Allow relative URIs and URNs
			return /^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/|^[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(
				value,
			);
		}
	}

	/**
	 * Check if value matches a pattern
	 */
	static matchesPattern(value: unknown, pattern: string): boolean {
		if (typeof value !== "string") return false;
		try {
			const regex = new RegExp(pattern);
			return regex.test(value);
		} catch {
			return false;
		}
	}

	/**
	 * Get JavaScript type name
	 */
	static getTypeName(value: unknown): string {
		if (value === null) return "null";
		if (Array.isArray(value)) return "array";
		return typeof value;
	}

	/**
	 * Deep clone an object
	 */
	static deepClone<T>(obj: T): T {
		if (obj === null || typeof obj !== "object") return obj;
		if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
		if (Array.isArray(obj))
			return obj.map((item) => ValidationUtils.deepClone(item)) as unknown as T;

		const cloned = {} as T;
		for (const key in obj) {
			if (Object.hasOwn(obj, key)) {
				cloned[key] = ValidationUtils.deepClone(obj[key]);
			}
		}
		return cloned;
	}

	/**
	 * Format validation path for display
	 */
	static formatPath(path: string[]): string {
		return path.length === 0 ? "root" : path.join(".");
	}
}
