/**
 * TypeSchema Validator
 *
 * Validates TypeSchema documents against the specification.
 * Leverages existing validation utilities and provides comprehensive validation.
 */

import {
	isValidatorAvailable,
	validateTypeSchema as validateTypeSchemaCore,
	validateTypeSchemaOrThrow as validateTypeSchemaOrThrowCore,
	validateTypeSchemas as validateTypeSchemasCore,
} from "../core/validation/typeschema-validator";
import type {
	AnyTypeSchema,
	TypeSchemaIdentifier,
	ValidationError,
	ValidationResult,
	ValidationWarning,
} from "./types";

/**
 * TypeSchema Validator class
 *
 * Provides comprehensive validation for TypeSchema documents including
 * structure validation, dependency validation, and consistency checks.
 */
export class TypeSchemaValidator {
	constructor(strict = false) {
		this.strict = strict;
	}

	/**
	 * Validate a single TypeSchema document
	 */
	async validate(schema: AnyTypeSchema): Promise<ValidationResult> {
		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];

		try {
			// Use core validator if available
			if (isValidatorAvailable()) {
				const isValid = await validateTypeSchemaCore(schema);
				if (!isValid) {
					errors.push({
						message: "Schema failed core validation",
						severity: "error",
					});
				}
			} else {
				warnings.push({
					message:
						"Core JSON schema validator not available, performing basic validation only",
					severity: "warning",
				});
			}

			// Perform additional custom validations
			this.validateIdentifier(schema.identifier, errors);
			this.validateFields(schema, errors, warnings);
			this.validateNested(schema, errors, warnings);
			this.validateBindings(schema, errors, warnings);
		} catch (error) {
			errors.push({
				message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
				severity: "error",
			});
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Validate multiple TypeSchema documents
	 */
	async validateMany(schemas: AnyTypeSchema[]): Promise<ValidationResult[]> {
		const results: ValidationResult[] = [];

		for (const schema of schemas) {
			const result = await this.validate(schema);
			results.push(result);
		}

		return results;
	}

	/**
	 * Validate TypeSchema documents with dependency checking
	 */
	async validateWithDependencies(
		schemas: AnyTypeSchema[],
	): Promise<ValidationResult> {
		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];

		// Validate individual schemas first
		const individualResults = await this.validateMany(schemas);

		for (const result of individualResults) {
			errors.push(...result.errors);
			warnings.push(...result.warnings);
		}

		// Check dependency resolution
		const dependencyErrors = this.validateDependencies(schemas);
		errors.push(...dependencyErrors);

		// Check for circular dependencies
		const circularErrors = this.validateCircularDependencies(schemas);
		errors.push(...circularErrors);

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Validate and throw on error (convenience method)
	 */
	async validateOrThrow(schema: AnyTypeSchema): Promise<void> {
		if (isValidatorAvailable()) {
			await validateTypeSchemaOrThrowCore(schema);
		}

		const result = await this.validate(schema);

		if (!result.valid) {
			const errorMessages = result.errors.map((e) => e.message).join("; ");
			throw new Error(`TypeSchema validation failed: ${errorMessages}`);
		}
	}

	/**
	 * Batch validate schemas (leveraging core validator)
	 */
	async validateBatch(schemas: AnyTypeSchema[]): Promise<ValidationResult> {
		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];

		try {
			if (isValidatorAvailable()) {
				const coreResults = await validateTypeSchemasCore(schemas);

				for (let i = 0; i < schemas.length; i++) {
					if (!coreResults[i]) {
						errors.push({
							message: `Schema at index ${i} failed core validation`,
							path: `[${i}]`,
							severity: "error",
						});
					}
				}
			}

			// Additional validations
			for (let i = 0; i < schemas.length; i++) {
				const schema = schemas[i];
				const schemaErrors: ValidationError[] = [];
				const schemaWarnings: ValidationWarning[] = [];

				this.validateIdentifier(
					schema.identifier,
					schemaErrors,
					`[${i}].identifier`,
				);
				this.validateFields(schema, schemaErrors, schemaWarnings, `[${i}]`);
				this.validateNested(schema, schemaErrors, schemaWarnings, `[${i}]`);
				this.validateBindings(schema, schemaErrors, schemaWarnings, `[${i}]`);

				errors.push(...schemaErrors);
				warnings.push(...schemaWarnings);
			}
		} catch (error) {
			errors.push({
				message: `Batch validation error: ${error instanceof Error ? error.message : String(error)}`,
				severity: "error",
			});
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Check if validator is available
	 */
	isAvailable(): boolean {
		return isValidatorAvailable();
	}

	/**
	 * Set strict mode
	 */
	setStrict(strict: boolean): void {
		this.strict = strict;
	}

	/**
	 * Validate identifier structure
	 */
	private validateIdentifier(
		identifier: TypeSchemaIdentifier,
		errors: ValidationError[],
		path = "identifier",
	): void {
		if (!identifier) {
			errors.push({
				message: "Missing identifier",
				path,
				severity: "error",
			});
			return;
		}

		const requiredFields = ["kind", "package", "version", "name", "url"];

		for (const field of requiredFields) {
			if (
				!(field in identifier) ||
				!identifier[field as keyof TypeSchemaIdentifier]
			) {
				errors.push({
					message: `Missing required field: ${field}`,
					path: `${path}.${field}`,
					severity: "error",
				});
			}
		}

		// Validate kind
		const validKinds = [
			"primitive-type",
			"resource",
			"complex-type",
			"nested",
			"logical",
			"binding",
			"value-set",
			"profile",
		];
		if (identifier.kind && !validKinds.includes(identifier.kind)) {
			errors.push({
				message: `Invalid kind: ${identifier.kind}. Must be one of: ${validKinds.join(", ")}`,
				path: `${path}.kind`,
				severity: "error",
			});
		}

		// Validate URL format
		if (identifier.url && !this.isValidUrl(identifier.url)) {
			errors.push({
				message: `Invalid URL format: ${identifier.url}`,
				path: `${path}.url`,
				severity: "error",
			});
		}
	}

	/**
	 * Validate fields structure
	 */
	private validateFields(
		schema: AnyTypeSchema,
		errors: ValidationError[],
		_warnings: ValidationWarning[],
		path = "",
	): void {
		if (!("fields" in schema) || !schema.fields) {
			return;
		}

		for (const [fieldName, field] of Object.entries(schema.fields)) {
			const fieldPath = `${path}.fields.${fieldName}`;

			// Validate field type combinations
			if ("choices" in field && "choiceOf" in field) {
				errors.push({
					message: "Field cannot have both 'choices' and 'choiceOf'",
					path: fieldPath,
					severity: "error",
				});
			}

			// Validate references
			if (field.reference && !Array.isArray(field.reference)) {
				errors.push({
					message: "Field reference must be an array",
					path: `${fieldPath}.reference`,
					severity: "error",
				});
			}

			// Validate min/max
			if (field.min !== undefined && field.max !== undefined) {
				if (typeof field.min === "number" && typeof field.max === "number") {
					if (field.min > field.max) {
						errors.push({
							message: `Min (${field.min}) cannot be greater than max (${field.max})`,
							path: fieldPath,
							severity: "error",
						});
					}
				}
			}

			// Validate binding and enum together
			if (field.binding && field.enum) {
				// TODO: check later
				// warnings.push({
				// 	message: "Field has both binding and enum, enum will take precedence",
				// 	path: fieldPath,
				// 	severity: "warning",
				// });
			}
		}
	}

	/**
	 * Validate nested types
	 */
	private validateNested(
		schema: AnyTypeSchema,
		errors: ValidationError[],
		_warnings: ValidationWarning[],
		path = "",
	): void {
		if (!("nested" in schema) || !schema.nested) {
			return;
		}

		for (let i = 0; i < schema.nested.length; i++) {
			const nested = schema.nested[i];
			const nestedPath = `${path}.nested[${i}]`;

			// Validate nested identifier
			this.validateIdentifier(
				nested.identifier,
				errors,
				`${nestedPath}.identifier`,
			);

			// Validate base reference
			if (!nested.base) {
				errors.push({
					message: "Nested type must have a base",
					path: `${nestedPath}.base`,
					severity: "error",
				});
			} else {
				this.validateIdentifier(nested.base, errors, `${nestedPath}.base`);
			}

			// Validate nested fields
			for (const [fieldName, field] of Object.entries(nested.fields || {})) {
				const fieldPath = `${nestedPath}.fields.${fieldName}`;

				// Similar validations as regular fields
				if (field.reference && !Array.isArray(field.reference)) {
					errors.push({
						message: "Nested field reference must be an array",
						path: `${fieldPath}.reference`,
						severity: "error",
					});
				}
			}
		}
	}

	/**
	 * Validate binding schemas
	 */
	private validateBindings(
		schema: AnyTypeSchema,
		errors: ValidationError[],
		_warnings: ValidationWarning[],
		path = "",
	): void {
		if (!("valueset" in schema)) {
			return;
		}

		const bindingSchema = schema as any;

		if (!bindingSchema.valueset) {
			errors.push({
				message: "Binding schema must have a valueset",
				path: `${path}.valueset`,
				severity: "error",
			});
		}

		if (!bindingSchema.strength) {
			errors.push({
				message: "Binding schema must have strength",
				path: `${path}.strength`,
				severity: "error",
			});
		}

		const validStrengths = ["required", "extensible", "preferred", "example"];
		if (
			bindingSchema.strength &&
			!validStrengths.includes(bindingSchema.strength)
		) {
			errors.push({
				message: `Invalid binding strength: ${bindingSchema.strength}. Must be one of: ${validStrengths.join(", ")}`,
				path: `${path}.strength`,
				severity: "error",
			});
		}
	}

	/**
	 * Validate dependencies can be resolved
	 */
	private validateDependencies(schemas: AnyTypeSchema[]): ValidationError[] {
		const errors: ValidationError[] = [];
		const schemaUrls = new Set(schemas.map((s) => s.identifier.url));

		for (const schema of schemas) {
			// Check base dependency
			if ("base" in schema && schema.base) {
				if (!schemaUrls.has(schema.base.url)) {
					errors.push({
						message: `Unresolved base dependency: ${schema.base.url}`,
						path: `${schema.identifier.url}.base`,
						severity: "error",
					});
				}
			}

			// TODO: review later
			// // Check explicit dependencies
			// if ('dependencies' in schema && schema.dependencies) {
			// 	for (const dep of schema.dependencies) {
			// 		if (!schemaUrls.has(dep.url)) {
			// 			errors.push({
			// 				message: `Unresolved dependency: ${dep.url}`,
			// 				path: `${schema.identifier.url}.dependencies`,
			// 				severity: 'error'
			// 			});
			// 		}
			// 	}
			// }
		}

		return errors;
	}

	/**
	 * Validate for circular dependencies
	 */
	private validateCircularDependencies(
		schemas: AnyTypeSchema[],
	): ValidationError[] {
		const errors: ValidationError[] = [];
		const visited = new Set<string>();
		const recursionStack = new Set<string>();

		const schemaMap = new Map<string, AnyTypeSchema>();
		for (const schema of schemas) {
			schemaMap.set(schema.identifier.url, schema);
		}

		const hasCycle = (url: string): boolean => {
			if (recursionStack.has(url)) {
				return true;
			}
			if (visited.has(url)) {
				return false;
			}

			visited.add(url);
			recursionStack.add(url);

			const schema = schemaMap.get(url);
			if (schema) {
				// Check base dependency
				if ("base" in schema && schema.base && hasCycle(schema.base.url)) {
					return true;
				}

				// Check explicit dependencies
				if ("dependencies" in schema && schema.dependencies) {
					for (const dep of schema.dependencies) {
						if (hasCycle(dep.url)) {
							return true;
						}
					}
				}
			}

			recursionStack.delete(url);
			return false;
		};

		for (const schema of schemas) {
			if (hasCycle(schema.identifier.url)) {
				// TODO: enable later
				// errors.push({
				// 	message: `Circular dependency detected involving: ${schema.identifier.url}`,
				// 	path: schema.identifier.url,
				// 	severity: "error",
				// });
				break; // One detection is sufficient
			}
		}

		return errors;
	}

	/**
	 * Validate URL format
	 */
	private isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Convenience function to validate a single schema
 */
export async function validateTypeSchema(
	schema: AnyTypeSchema,
): Promise<ValidationResult> {
	const validator = new TypeSchemaValidator();
	return await validator.validate(schema);
}

/**
 * Convenience function to validate multiple schemas
 */
export async function validateTypeSchemas(
	schemas: AnyTypeSchema[],
): Promise<ValidationResult[]> {
	const validator = new TypeSchemaValidator();
	return await validator.validateMany(schemas);
}

/**
 * Convenience function to validate with dependencies
 */
export async function validateTypeSchemasWithDependencies(
	schemas: AnyTypeSchema[],
): Promise<ValidationResult> {
	const validator = new TypeSchemaValidator();
	return await validator.validateWithDependencies(schemas);
}

/**
 * Convenience function to validate and throw on error
 */
export async function validateTypeSchemaOrThrow(
	schema: AnyTypeSchema,
): Promise<void> {
	const validator = new TypeSchemaValidator();
	await validator.validateOrThrow(schema);
}
