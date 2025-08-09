/**
 * Validation Generator
 *
 * Generates client-side validation for FHIR resources including validation types,
 * resource validators, and validation helpers for the REST client.
 */

import type { TypeSchema } from "../../typeschema";

/**
 * Validation options for resource validation
 */
export interface ValidationOptions {
	/** Validation profile to use (strict, lenient, etc.) */
	profile?: 'strict' | 'lenient' | 'minimal';
	/** Whether to throw on validation errors or return result */
	throwOnError?: boolean;
	/** Whether to validate required fields */
	validateRequired?: boolean;
	/** Whether to validate cardinality constraints */
	validateCardinality?: boolean;
	/** Whether to validate data types */
	validateTypes?: boolean;
	/** Whether to validate value constraints */
	validateConstraints?: boolean;
	/** Whether to collect performance metrics */
	collectMetrics?: boolean;
}

/**
 * Validation error details
 */
export interface ValidationError {
	/** Error severity */
	severity: 'error' | 'warning' | 'information';
	/** Error code */
	code: string;
	/** Human-readable error message */
	message: string;
	/** Path to the invalid element */
	path: string;
	/** Current value that failed validation */
	value?: unknown;
	/** Expected value or constraint */
	expected?: string;
	/** Suggestion for fixing the error */
	suggestion?: string;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
	/** Warning code */
	code: string;
	/** Human-readable warning message */
	message: string;
	/** Path to the element */
	path: string;
	/** Current value */
	value?: unknown;
	/** Suggestion for improvement */
	suggestion?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
	/** Whether validation passed */
	valid: boolean;
	/** List of validation errors */
	errors: ValidationError[];
	/** List of validation warnings */
	warnings: ValidationWarning[];
	/** Validation performance metrics */
	metrics?: {
		/** Time taken for validation in milliseconds */
		duration: number;
		/** Number of elements validated */
		elementsValidated: number;
		/** Number of constraints checked */
		constraintsChecked: number;
	};
}

/**
 * Validation Generator class
 * 
 * Generates client-side validation logic for FHIR resources including
 * validation types, validators, and integration helpers.
 */
export class ValidationGenerator {
	private resourceTypes = new Set<string>();
	private resourceSchemas = new Map<string, TypeSchema>();

	/**
	 * Collect resource types and schemas for validation generation
	 */
	collectResourceData(schemas: TypeSchema[]): void {
		this.resourceTypes.clear();
		this.resourceSchemas.clear();

		for (const schema of schemas) {
			if (
				schema.identifier.kind === "resource" &&
				schema.identifier.name !== "DomainResource" &&
				schema.identifier.name !== "Resource"
			) {
				this.resourceTypes.add(schema.identifier.name);
				this.resourceSchemas.set(schema.identifier.name, schema);
			}
		}
	}

	/**
	 * Generate validation types and interfaces
	 */
	generateValidationTypes(): string {
		return `/**
 * FHIR Resource Validation Types
 * 
 * Client-side validation types and interfaces for FHIR resources.
 * Generated automatically from FHIR schemas.
 */

import type { ResourceTypes } from '../types';

/**
 * Validation options for resource validation
 */
export interface ValidationOptions {
	/** Validation profile to use (strict, lenient, etc.) */
	profile?: 'strict' | 'lenient' | 'minimal';
	/** Whether to throw on validation errors or return result */
	throwOnError?: boolean;
	/** Whether to validate required fields */
	validateRequired?: boolean;
	/** Whether to validate cardinality constraints */
	validateCardinality?: boolean;
	/** Whether to validate data types */
	validateTypes?: boolean;
	/** Whether to validate value constraints */
	validateConstraints?: boolean;
	/** Whether to collect performance metrics */
	collectMetrics?: boolean;
}

/**
 * Validation error details
 */
export interface ValidationError {
	/** Error severity */
	severity: 'error' | 'warning' | 'information';
	/** Error code */
	code: string;
	/** Human-readable error message */
	message: string;
	/** Path to the invalid element */
	path: string;
	/** Current value that failed validation */
	value?: unknown;
	/** Expected value or constraint */
	expected?: string;
	/** Suggestion for fixing the error */
	suggestion?: string;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
	/** Warning code */
	code: string;
	/** Human-readable warning message */
	message: string;
	/** Path to the element */
	path: string;
	/** Current value */
	value?: unknown;
	/** Suggestion for improvement */
	suggestion?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
	/** Whether validation passed */
	valid: boolean;
	/** List of validation errors */
	errors: ValidationError[];
	/** List of validation warnings */
	warnings: ValidationWarning[];
	/** Validation performance metrics */
	metrics?: {
		/** Time taken for validation in milliseconds */
		duration: number;
		/** Number of elements validated */
		elementsValidated: number;
		/** Number of constraints checked */
		constraintsChecked: number;
	};
}

/**
 * Validation exception thrown when validation fails and throwOnError is true
 */
export class ValidationException extends Error {
	public errors: ValidationError[];
	public warnings: ValidationWarning[];
	public result: ValidationResult;

	constructor(result: ValidationResult) {
		const errorCount = result.errors.length;
		const warningCount = result.warnings.length;
		super(\`Validation failed: \${errorCount} error(s), \${warningCount} warning(s)\`);
		
		this.name = 'ValidationException';
		this.errors = result.errors;
		this.warnings = result.warnings;
		this.result = result;
	}
}`;
	}

	/**
	 * Generate resource validators for all resource types
	 */
	generateResourceValidators(): string {
		const resourceTypesArray = Array.from(this.resourceTypes).sort();

		return `/**
 * FHIR Resource Validators
 * 
 * Client-side validation logic for FHIR resources.
 * Generated automatically from FHIR schemas.
 */

import type { ResourceTypes, ${resourceTypesArray.join(', ')} } from '../types';
import type { ValidationOptions, ValidationResult, ValidationError, ValidationWarning, ValidationException } from './validation-types';

/**
 * Resource type mapping for validation
 */
type ResourceTypeMap = {
	${resourceTypesArray.map(type => `'${type}': ${type}`).join(';\n\t')};
};

/**
 * Main Resource Validator class
 * 
 * Provides validation methods for all FHIR resource types with configurable
 * validation profiles and detailed error reporting.
 */
export class ResourceValidator {
	private static defaultOptions: Required<ValidationOptions> = {
		profile: 'strict',
		throwOnError: false,
		validateRequired: true,
		validateCardinality: true,
		validateTypes: true,
		validateConstraints: true,
		collectMetrics: false
	};

	/**
	 * Validate any FHIR resource with type safety
	 */
	static validate<T extends ResourceTypes>(
		resource: ResourceTypeMap[T],
		options: ValidationOptions = {}
	): ValidationResult {
		const opts = { ...this.defaultOptions, ...options };
		const startTime = opts.collectMetrics ? performance.now() : 0;

		const result: ValidationResult = {
			valid: true,
			errors: [],
			warnings: []
		};

		try {
			// Basic resource type validation
			if (!resource || typeof resource !== 'object') {
				result.errors.push({
					severity: 'error',
					code: 'INVALID_RESOURCE',
					message: 'Resource must be a valid object',
					path: 'resource',
					value: resource,
					expected: 'object',
					suggestion: 'Provide a valid FHIR resource object'
				});
				result.valid = false;
			} else {
				// Validate resource type
				const resourceType = resource.resourceType as T;
				if (!resourceType) {
					result.errors.push({
						severity: 'error',
						code: 'MISSING_RESOURCE_TYPE',
						message: 'Resource must have a resourceType property',
						path: 'resourceType',
						value: undefined,
						expected: 'string',
						suggestion: 'Add a resourceType property to the resource'
					});
					result.valid = false;
				} else {
					// Call resource-specific validator
					this.validateResourceType(resourceType, resource, result, opts);
				}
			}

			// Add performance metrics if requested
			if (opts.collectMetrics) {
				const endTime = performance.now();
				result.metrics = {
					duration: endTime - startTime,
					elementsValidated: this.countElements(resource),
					constraintsChecked: result.errors.length + result.warnings.length
				};
			}

			// Throw exception if requested and validation failed
			if (opts.throwOnError && !result.valid) {
				const { ValidationException } = require('./validation-types');
				throw new ValidationException(result);
			}

			return result;

		} catch (error) {
			if (error instanceof Error && error.name === 'ValidationException') {
				throw error;
			}

			result.errors.push({
				severity: 'error',
				code: 'VALIDATION_ERROR',
				message: \`Validation failed: \${error instanceof Error ? error.message : String(error)}\`,
				path: 'resource',
				value: resource,
				suggestion: 'Check the resource structure and try again'
			});
			result.valid = false;

			if (opts.throwOnError) {
				const { ValidationException } = require('./validation-types');
				throw new ValidationException(result);
			}

			return result;
		}
	}

${this.generateResourceSpecificValidators()}

	/**
	 * Validate resource type and dispatch to specific validator
	 */
	private static validateResourceType<T extends ResourceTypes>(
		resourceType: T,
		resource: ResourceTypeMap[T],
		result: ValidationResult,
		options: Required<ValidationOptions>
	): void {
		switch (resourceType) {
${resourceTypesArray.map(type => `			case '${type}':
				this.validate${type}(resource as ${type}, result, options);
				break;`).join('\n')}
			default:
				result.warnings.push({
					code: 'UNKNOWN_RESOURCE_TYPE',
					message: \`Unknown resource type: \${resourceType}\`,
					path: 'resourceType',
					value: resourceType,
					suggestion: 'Check if the resource type is supported'
				});
		}
	}

	/**
	 * Count elements in resource for metrics
	 */
	private static countElements(resource: any, count = 0): number {
		if (!resource || typeof resource !== 'object') return count;
		
		for (const value of Object.values(resource)) {
			count++;
			if (Array.isArray(value)) {
				for (const item of value) {
					count = this.countElements(item, count);
				}
			} else if (typeof value === 'object') {
				count = this.countElements(value, count);
			}
		}
		
		return count;
	}

	/**
	 * Validate required fields
	 */
	private static validateRequired(
		resource: any,
		requiredFields: string[],
		result: ValidationResult,
		basePath = ''
	): void {
		for (const field of requiredFields) {
			const path = basePath ? \`\${basePath}.\${field}\` : field;
			if (resource[field] === undefined || resource[field] === null) {
				result.errors.push({
					severity: 'error',
					code: 'MISSING_REQUIRED_FIELD',
					message: \`Required field '\${field}' is missing\`,
					path,
					value: resource[field],
					expected: 'non-null value',
					suggestion: \`Add the required '\${field}' field to the resource\`
				});
				result.valid = false;
			}
		}
	}

	/**
	 * Validate field type
	 */
	private static validateFieldType(
		value: any,
		expectedType: string,
		fieldName: string,
		result: ValidationResult,
		basePath = ''
	): void {
		const path = basePath ? \`\${basePath}.\${fieldName}\` : fieldName;
		
		if (value === undefined || value === null) return;

		let isValid = false;
		switch (expectedType) {
			case 'string':
				isValid = typeof value === 'string';
				break;
			case 'number':
				isValid = typeof value === 'number' && !isNaN(value);
				break;
			case 'boolean':
				isValid = typeof value === 'boolean';
				break;
			case 'array':
				isValid = Array.isArray(value);
				break;
			case 'object':
				isValid = typeof value === 'object' && !Array.isArray(value);
				break;
			default:
				isValid = true; // Skip unknown types
		}

		if (!isValid) {
			result.errors.push({
				severity: 'error',
				code: 'INVALID_FIELD_TYPE',
				message: \`Field '\${fieldName}' has invalid type\`,
				path,
				value,
				expected: expectedType,
				suggestion: \`Ensure '\${fieldName}' is of type \${expectedType}\`
			});
			result.valid = false;
		}
	}
}`;
	}

	/**
	 * Generate resource-specific validators
	 */
	private generateResourceSpecificValidators(): string {
		const validators: string[] = [];

		// Generate validators for key resource types
		const keyResourceTypes = ['Patient', 'Observation', 'Organization', 'Practitioner', 'Bundle'];
		
		for (const resourceType of keyResourceTypes) {
			if (this.resourceTypes.has(resourceType)) {
				validators.push(this.generateResourceValidator(resourceType));
			}
		}

		// Generate generic validators for remaining resource types
		for (const resourceType of this.resourceTypes) {
			if (!keyResourceTypes.includes(resourceType)) {
				validators.push(this.generateGenericResourceValidator(resourceType));
			}
		}

		return validators.join('\n\n');
	}

	/**
	 * Generate a specific validator for a key resource type
	 */
	private generateResourceValidator(resourceType: string): string {
		const validationRules = this.getValidationRules(resourceType);

		return `	/**
	 * Validate ${resourceType} resource
	 */
	private static validate${resourceType}(
		resource: ${resourceType},
		result: ValidationResult,
		options: Required<ValidationOptions>
	): void {
		// Validate required fields
		if (options.validateRequired) {
			this.validateRequired(resource, [${validationRules.required.map(f => `'${f}'`).join(', ')}], result, '${resourceType.toLowerCase()}');
		}

		// Validate field types
		if (options.validateTypes) {
			${validationRules.fields.map(field => 
				`if (resource.${field.name} !== undefined) {
				this.validateFieldType(resource.${field.name}, '${field.type}', '${field.name}', result, '${resourceType.toLowerCase()}');
			}`
			).join('\n\t\t\t')}
		}

		// Validate specific constraints for ${resourceType}
		if (options.validateConstraints) {
			${this.generateResourceSpecificConstraints(resourceType)}
		}
	}`;
	}

	/**
	 * Generate a generic validator for less common resource types
	 */
	private generateGenericResourceValidator(resourceType: string): string {
		return `	/**
	 * Validate ${resourceType} resource (generic validation)
	 */
	private static validate${resourceType}(
		resource: ${resourceType},
		result: ValidationResult,
		options: Required<ValidationOptions>
	): void {
		// Basic validation for ${resourceType}
		if (options.validateRequired && resource.resourceType !== '${resourceType}') {
			result.errors.push({
				severity: 'error',
				code: 'INVALID_RESOURCE_TYPE',
				message: \`Expected resourceType '${resourceType}', got '\${resource.resourceType}'\`,
				path: 'resourceType',
				value: resource.resourceType,
				expected: '${resourceType}',
				suggestion: 'Ensure the resourceType matches the expected value'
			});
			result.valid = false;
		}

		// Generic field validation
		if (options.validateTypes) {
			// Validate common fields
			if (resource.id !== undefined) {
				this.validateFieldType(resource.id, 'string', 'id', result, '${resourceType.toLowerCase()}');
			}
			if ((resource as any).meta !== undefined) {
				this.validateFieldType((resource as any).meta, 'object', 'meta', result, '${resourceType.toLowerCase()}');
			}
		}
	}`;
	}

	/**
	 * Get validation rules for a specific resource type
	 */
	private getValidationRules(resourceType: string): {
		required: string[];
		fields: Array<{ name: string; type: string; }>;
	} {
		switch (resourceType) {
			case 'Patient':
				return {
					required: ['resourceType'],
					fields: [
						{ name: 'id', type: 'string' },
						{ name: 'meta', type: 'object' },
						{ name: 'identifier', type: 'array' },
						{ name: 'active', type: 'boolean' },
						{ name: 'name', type: 'array' },
						{ name: 'telecom', type: 'array' },
						{ name: 'gender', type: 'string' },
						{ name: 'birthDate', type: 'string' },
						{ name: 'address', type: 'array' }
					]
				};

			case 'Observation':
				return {
					required: ['resourceType', 'status', 'code'],
					fields: [
						{ name: 'id', type: 'string' },
						{ name: 'meta', type: 'object' },
						{ name: 'identifier', type: 'array' },
						{ name: 'status', type: 'string' },
						{ name: 'category', type: 'array' },
						{ name: 'code', type: 'object' },
						{ name: 'subject', type: 'object' },
						{ name: 'effectiveDateTime', type: 'string' },
						{ name: 'valueQuantity', type: 'object' },
						{ name: 'valueString', type: 'string' },
						{ name: 'valueBoolean', type: 'boolean' }
					]
				};

			case 'Organization':
				return {
					required: ['resourceType'],
					fields: [
						{ name: 'id', type: 'string' },
						{ name: 'meta', type: 'object' },
						{ name: 'identifier', type: 'array' },
						{ name: 'active', type: 'boolean' },
						{ name: 'type', type: 'array' },
						{ name: 'name', type: 'string' },
						{ name: 'telecom', type: 'array' },
						{ name: 'address', type: 'array' }
					]
				};

			case 'Practitioner':
				return {
					required: ['resourceType'],
					fields: [
						{ name: 'id', type: 'string' },
						{ name: 'meta', type: 'object' },
						{ name: 'identifier', type: 'array' },
						{ name: 'active', type: 'boolean' },
						{ name: 'name', type: 'array' },
						{ name: 'telecom', type: 'array' },
						{ name: 'address', type: 'array' },
						{ name: 'gender', type: 'string' },
						{ name: 'birthDate', type: 'string' }
					]
				};

			case 'Bundle':
				return {
					required: ['resourceType', 'type'],
					fields: [
						{ name: 'id', type: 'string' },
						{ name: 'meta', type: 'object' },
						{ name: 'identifier', type: 'object' },
						{ name: 'type', type: 'string' },
						{ name: 'timestamp', type: 'string' },
						{ name: 'total', type: 'number' },
						{ name: 'entry', type: 'array' }
					]
				};

			default:
				return {
					required: ['resourceType'],
					fields: [
						{ name: 'id', type: 'string' },
						{ name: 'meta', type: 'object' }
					]
				};
		}
	}

	/**
	 * Generate resource-specific constraint validation
	 */
	private generateResourceSpecificConstraints(resourceType: string): string {
		switch (resourceType) {
			case 'Patient':
				return `// Patient-specific constraints
			if (resource.gender && !['male', 'female', 'other', 'unknown'].includes(resource.gender)) {
				result.errors.push({
					severity: 'error',
					code: 'INVALID_GENDER_VALUE',
					message: 'Invalid gender value',
					path: 'patient.gender',
					value: resource.gender,
					expected: 'male, female, other, or unknown',
					suggestion: 'Use a valid gender code'
				});
				result.valid = false;
			}`;

			case 'Observation':
				return `// Observation-specific constraints
			if (resource.status && !['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'].includes(resource.status)) {
				result.errors.push({
					severity: 'error',
					code: 'INVALID_OBSERVATION_STATUS',
					message: 'Invalid observation status',
					path: 'observation.status',
					value: resource.status,
					expected: 'valid observation status code',
					suggestion: 'Use a valid observation status code'
				});
				result.valid = false;
			}`;

			case 'Bundle':
				return `// Bundle-specific constraints
			if (resource.type && !['document', 'message', 'transaction', 'transaction-response', 'batch', 'batch-response', 'history', 'searchset', 'collection'].includes(resource.type)) {
				result.errors.push({
					severity: 'error',
					code: 'INVALID_BUNDLE_TYPE',
					message: 'Invalid bundle type',
					path: 'bundle.type',
					value: resource.type,
					expected: 'valid bundle type code',
					suggestion: 'Use a valid bundle type code'
				});
				result.valid = false;
			}`;

			default:
				return `// Generic resource constraints
			// No specific constraints for ${resourceType}`;
		}
	}

	/**
	 * Get collected resource types
	 */
	getResourceTypes(): Set<string> {
		return this.resourceTypes;
	}
}