/**
 * FHIR Type Guards and Validation
 *
 * Consolidated FHIR type guard generator that provides compile-time type safety
 * for FHIR resources through type guards, discriminated union helpers,
 * cardinality constraints, and reference type helpers.
 *
 * Auto-generated from guards/ directory during reorganization.
 */

import type {
	AnyTypeSchema,
	PackageInfo,
	TypeSchemaField,
	TypeSchemaIdentifier,
} from "../../../typeschema/lib-types";

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
	/** Enable verbose logging */
	verbose?: boolean;
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
 * Main FHIR type guard generator
 */
export class FHIRGuardGenerator {
	private options: GuardGenerationOptions;

	constructor(options: GuardGenerationOptions = {}) {
		this.options = {
			includeRuntimeValidation: true,
			includeErrorMessages: true,
			treeShakeable: true,
			targetTSVersion: "5.0",
			strict: false,
			includeNullChecks: true,
			...options,
		};
	}

	/**
	 * Generate all type guards from TypeSchemas
	 */
	async generateFromTypeSchemas(
		schemas: AnyTypeSchema[],
		packageInfo?: PackageInfo,
	): Promise<TypeGuardResult> {
		const context: GuardGenerationContext = {
			schemas,
			options: this.options,
			guardCache: new Map(),
			processing: new Set(),
		};

		const results: TypeGuardResult[] = [];

		// Generate resource type guards
		if (this.options.verbose) {
			console.log("Generating resource type guards...");
		}
		const resourceResult = generateResourceTypeGuards(schemas, context);
		results.push(resourceResult);

		// Generate complex type guards
		if (this.options.verbose) {
			console.log("Generating complex type guards...");
		}
		const complexResult = generateComplexTypeGuards(schemas, context);
		results.push(complexResult);

		// Generate primitive type guards
		if (this.options.verbose) {
			console.log("Generating primitive type guards...");
		}
		const primitiveResult = generatePrimitiveTypeGuards(schemas, context);
		results.push(primitiveResult);

		// Generate choice type discriminators
		if (this.options.verbose) {
			console.log("Generating choice type discriminators...");
		}
		const choiceResult = generateChoiceTypeDiscriminators(schemas, context);
		results.push(choiceResult);

		// Generate custom predicates
		if (this.options.verbose) {
			console.log("Generating custom predicates...");
		}
		const predicateResult = generateCustomPredicates(schemas, context);
		results.push(predicateResult);

		// Combine all results
		const guardCode = results
			.map((r) => r.guardCode)
			.filter(Boolean)
			.join("\n\n");
		const typeDefinitions = results
			.map((r) => r.typeDefinitions)
			.filter(Boolean)
			.join("\n\n");

		// Collect all imports and dependencies
		const allImports = new Set<string>();
		const allDependencies = new Set<string>();
		results.forEach((result) => {
			result.imports.forEach((imp) => allImports.add(imp));
			result.dependencies.forEach((dep) => allDependencies.add(dep));
		});

		// Generate header with package info
		const header = this.generateHeader(packageInfo);
		const imports = this.generateImports(Array.from(allImports));

		const finalCode = [header, imports, typeDefinitions, guardCode]
			.filter(Boolean)
			.join("\n\n");

		return {
			guardCode: finalCode,
			typeDefinitions,
			imports: Array.from(allImports),
			dependencies: Array.from(allDependencies),
		};
	}

	/**
	 * Generate file header with package and generation info
	 */
	private generateHeader(packageInfo?: PackageInfo): string {
		const timestamp = new Date().toISOString();
		const packageLine = packageInfo
			? `\n * Generated from: ${packageInfo.name}@${packageInfo.version}`
			: "";

		return `/**
 * FHIR Type Guards and Validation${packageLine}
 * 
 * Auto-generated type guards for FHIR resources and types.
 * Generated at: ${timestamp}
 * 
 * WARNING: This file is auto-generated. Do not modify manually.
 */

/* eslint-disable */
// @ts-nocheck`;
	}

	/**
	 * Generate import statements
	 */
	private generateImports(imports: string[]): string {
		if (imports.length === 0) return "";

		const importLines = imports.map(
			(imp) => `import { ${imp} } from './types';`,
		);
		return importLines.join("\n");
	}
}

/**
 * Generate resource type guards with comprehensive validation
 */
export function generateResourceTypeGuards(
	schemas: AnyTypeSchema[],
	context: GuardGenerationContext,
): TypeGuardResult {
	const resourceSchemas = schemas.filter(
		(s) => s.identifier.kind === "resource",
	);
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	// Add common utility guards
	guardCode.push(`/**
 * Check if value is a valid FHIR resource
 */
export function isResource(value: unknown): value is { resourceType: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'resourceType' in value &&
    typeof (value as any).resourceType === 'string'
  );
}

/**
 * Type guard for specific resource type
 */
export function isResourceOfType<T extends { resourceType: string }>(
  value: unknown,
  resourceType: T['resourceType']
): value is T {
  return isResource(value) && (value as any).resourceType === resourceType;
}

/**
 * Bundle entry type guard
 */
export function isBundleEntry<T extends { resourceType: string }>(
  entry: unknown,
  resourceType?: T['resourceType']
): entry is { resource?: T } {
  if (!entry || typeof entry !== 'object') return false;
  const obj = entry as Record<string, unknown>;
  
  if (!('resource' in obj)) return true; // Entry without resource is valid
  
  const resource = obj.resource;
  if (resourceType) {
    return isResourceOfType(resource, resourceType);
  }
  return isResource(resource);
}`);

	for (const schema of resourceSchemas) {
		if ("fields" in schema && schema.fields) {
			const guardName = `is${schema.identifier.name}`;
			const resourceName = schema.identifier.name;
			const assertName = `assert${schema.identifier.name}`;

			// Generate basic type guard
			guardCode.push(`/**
 * Type guard for ${resourceName} resource
 * Performs basic structural validation
 */
export function ${guardName}(value: unknown): value is ${resourceName} {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  
  // Check resourceType
  if (obj.resourceType !== '${resourceName}') return false;
  
  ${generateFieldValidationCode(schema.fields, context.options)}
  
  return true;
}`);

			// Generate assertion function
			guardCode.push(`/**
 * Assertion function for ${resourceName} resource
 * Throws ValidationError if value is not a valid ${resourceName}
 */
export function ${assertName}(
  value: unknown,
  message?: string
): asserts value is ${resourceName} {
  if (!${guardName}(value)) {
    throw new ValidationError(
      message || \`Value is not a valid ${resourceName} resource\`,
      [],
      ValidationErrorCodes.INVALID_RESOURCE_TYPE,
      'error',
      '${resourceName}',
      typeof value
    );
  }
}`);

			imports.add(resourceName);
		}
	}

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Generate complex type guards with detailed field validation
 */
export function generateComplexTypeGuards(
	schemas: AnyTypeSchema[],
	context: GuardGenerationContext,
): TypeGuardResult {
	const complexSchemas = schemas.filter(
		(s) => s.identifier.kind === "complex-type",
	);
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	for (const schema of complexSchemas) {
		if ("fields" in schema && schema.fields) {
			const guardName = `is${schema.identifier.name}`;
			const typeName = schema.identifier.name;
			const assertName = `assert${schema.identifier.name}`;

			// Generate comprehensive type guard
			guardCode.push(`/**
 * Type guard for ${typeName} complex type
 * Validates structure and required fields
 */
export function ${guardName}(value: unknown): value is ${typeName} {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  
  ${generateFieldValidationCode(schema.fields, context.options)}
  
  return true;
}`);

			// Generate assertion function
			guardCode.push(`/**
 * Assertion function for ${typeName} complex type
 */
export function ${assertName}(
  value: unknown,
  message?: string
): asserts value is ${typeName} {
  if (!${guardName}(value)) {
    throw new ValidationError(
      message || \`Value is not a valid ${typeName}\`,
      [],
      ValidationErrorCodes.INVALID_TYPE,
      'error',
      '${typeName}',
      ValidationUtils.getTypeName(value)
    );
  }
}`);

			imports.add(typeName);
		}
	}

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Generate primitive type guards with proper FHIR validation
 */
export function generatePrimitiveTypeGuards(
	schemas: AnyTypeSchema[],
	_context: GuardGenerationContext,
): TypeGuardResult {
	const primitiveSchemas = schemas.filter(
		(s) => s.identifier.kind === "primitive-type",
	);
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	// Add common primitive validation functions
	guardCode.push(`/**
 * Common primitive type validation functions
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}`);

	for (const schema of primitiveSchemas) {
		const guardName = `is${schema.identifier.name}`;
		const typeName = schema.identifier.name;
		const assertName = `assert${schema.identifier.name}`;

		// Generate specific primitive validation based on FHIR type
		const validationCode = generatePrimitiveValidation(typeName);

		guardCode.push(`/**
 * Type guard for ${typeName} primitive type
 * Validates FHIR-specific format and constraints
 */
export function ${guardName}(value: unknown): value is ${typeName} {
  ${validationCode}
}`);

		// Generate assertion function
		guardCode.push(`/**
 * Assertion function for ${typeName} primitive type
 */
export function ${assertName}(
  value: unknown,
  message?: string
): asserts value is ${typeName} {
  if (!${guardName}(value)) {
    throw new ValidationError(
      message || \`Value is not a valid ${typeName}\`,
      [],
      ValidationErrorCodes.INVALID_TYPE,
      'error',
      '${typeName}',
      ValidationUtils.getTypeName(value)
    );
  }
}`);

		imports.add(typeName);
	}

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Generate comprehensive choice type discriminators and validators
 */
export function generateChoiceTypeDiscriminators(
	schemas: AnyTypeSchema[],
	_context: GuardGenerationContext,
): TypeGuardResult {
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	// Add general choice type utilities
	guardCode.push(`/**
 * General choice type validation utilities
 */
export function validateChoiceType<T>(
  value: unknown,
  baseName: string,
  allowedTypes: string[],
  validators: Record<string, (v: unknown) => boolean>
): { valid: boolean; type?: string; value?: T } {
  if (!value || typeof value !== 'object') {
    return { valid: false };
  }
  
  const obj = value as Record<string, unknown>;
  const presentChoices: string[] = [];
  
  // Find all present choice properties
  for (const type of allowedTypes) {
    const propertyName = baseName + type.charAt(0).toUpperCase() + type.slice(1);
    if (propertyName in obj && obj[propertyName] !== undefined) {
      presentChoices.push(type);
    }
  }
  
  // Validate exactly one choice is present
  if (presentChoices.length === 0) {
    return { valid: false };
  }
  
  if (presentChoices.length > 1) {
    return { valid: false }; // Multiple choices not allowed
  }
  
  const choiceType = presentChoices[0];
  const propertyName = baseName + choiceType.charAt(0).toUpperCase() + choiceType.slice(1);
  const choiceValue = obj[propertyName];
  
  // Validate the choice value using appropriate validator
  const validator = validators[choiceType];
  if (validator && !validator(choiceValue)) {
    return { valid: false };
  }
  
  return { valid: true, type: choiceType, value: choiceValue as T };
}

export function getChoiceType(value: unknown, baseName: string): string | null {
  if (!value || typeof value !== 'object') return null;
  
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  
  for (const key of keys) {
    if (key.startsWith(baseName) && key !== baseName) {
      const type = key.substring(baseName.length);
      return type.charAt(0).toLowerCase() + type.slice(1);
    }
  }
  
  return null;
}`);

	// Find schemas with choice fields
	for (const schema of schemas) {
		if ("fields" in schema && schema.fields) {
			for (const [fieldName, field] of Object.entries(schema.fields)) {
				if ("choices" in field && field.choices) {
					const baseName = fieldName.replace("[x]", "");
					const discriminatorName = `discriminate${schema.identifier.name}${baseName.charAt(0).toUpperCase() + baseName.slice(1)}`;
					const validatorName = `validate${schema.identifier.name}${baseName.charAt(0).toUpperCase() + baseName.slice(1)}Choice`;

					// Generate choice discriminator
					guardCode.push(`/**
 * Choice type discriminator for ${baseName} in ${schema.identifier.name}
 */
export function ${discriminatorName}(value: unknown): string | null {
  return getChoiceType(value, '${baseName}');
}`);

					// Generate choice validator
					const choiceValidators = field.choices
						.map(
							(choice) =>
								`    ${choice}: (v: unknown) => is${choice.charAt(0).toUpperCase() + choice.slice(1)}(v)`,
						)
						.join(",\n");

					guardCode.push(`/**
 * Validate choice type for ${baseName} in ${schema.identifier.name}
 */
export function ${validatorName}(value: unknown): ValidationResult<any> {
  const result = validateChoiceType(
    value,
    '${baseName}',
    [${field.choices.map((c) => `'${c}'`).join(", ")}],
    {
${choiceValidators}
    }
  );
  
  if (!result.valid) {
    return {
      valid: false,
      errors: [{
        message: \`Invalid choice type for ${baseName}\`,
        path: [],
        code: ValidationErrorCodes.INVALID_CHOICE_TYPE,
        severity: 'error' as const,
        expected: [${field.choices.map((c) => `'${c}'`).join(", ")}],
        actual: ${discriminatorName}(value)
      }],
      warnings: []
    };
  }
  
  return {
    valid: true,
    value: result.value,
    errors: [],
    warnings: []
  };
}`);
				}
			}
		}
	}

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Generate custom predicates
 */
export function generateCustomPredicates(
	_schemas: AnyTypeSchema[],
	_context: GuardGenerationContext,
): TypeGuardResult {
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	// Add common validation predicates
	guardCode.push(`/**
 * Validate cardinality constraints
 */
export function validateCardinality<T>(
	value: T[] | T | undefined,
	constraint: CardinalityConstraint,
	path: string[] = [],
): ValidationResult {
	const errors: TypeGuardError[] = [];
	
	if (constraint.array) {
		if (!Array.isArray(value)) {
			errors.push({
				message: \`Expected array at \${path.join('.')}\`,
				path,
				expected: 'array',
				actual: typeof value,
				code: 'ARRAY_REQUIRED',
			});
			return { valid: false, errors, warnings: [] };
		}
		
		if (value.length < constraint.min) {
			errors.push({
				message: \`Array too short at \${path.join('.')} (min: \${constraint.min}, actual: \${value.length})\`,
				path,
				expected: \`>= \${constraint.min}\`,
				actual: value.length,
				code: 'MIN_CARDINALITY',
			});
		}
		
		if (constraint.max !== "*" && value.length > constraint.max) {
			errors.push({
				message: \`Array too long at \${path.join('.')} (max: \${constraint.max}, actual: \${value.length})\`,
				path,
				expected: \`<= \${constraint.max}\`,
				actual: value.length,
				code: 'MAX_CARDINALITY',
			});
		}
	} else {
		if (constraint.required && (value === null || value === undefined)) {
			errors.push({
				message: \`Required field missing at \${path.join('.')}\`,
				path,
				expected: 'defined value',
				actual: value,
				code: 'REQUIRED_FIELD',
			});
		}
	}
	
	return { valid: errors.length === 0, errors, warnings: [] };
}

/**
 * Create field validator
 */
export function createFieldValidator<T>(
	fieldName: string,
	constraint: CardinalityConstraint,
): (obj: Record<string, unknown>) => ValidationResult {
	return (obj: Record<string, unknown>) => {
		const value = obj[fieldName];
		return validateCardinality(value, constraint, [fieldName]);
	};
}

/**
 * Create reference validator
 */
export function createReferenceValidator(
	allowedTypes: string[],
): (value: unknown) => ValidationResult {
	return (value: unknown) => {
		const errors: TypeGuardError[] = [];
		
		if (!value || typeof value !== 'object') {
			errors.push({
				message: 'Reference must be an object',
				path: [],
				expected: 'object',
				actual: typeof value,
				code: 'INVALID_REFERENCE',
			});
			return { valid: false, errors, warnings: [] };
		}
		
		const ref = value as Record<string, unknown>;
		if ('reference' in ref && typeof ref.reference === 'string') {
			const [resourceType] = ref.reference.split('/');
			if (!allowedTypes.includes(resourceType)) {
				errors.push({
					message: \`Invalid reference type: \${resourceType}\`,
					path: ['reference'],
					expected: allowedTypes,
					actual: resourceType,
					code: 'INVALID_REFERENCE_TYPE',
				});
			}
		}
		
		return { valid: errors.length === 0, errors, warnings: [] };
	};
}`);

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Choice type helper functions
 */

/**
 * Create choice type guard
 */
export function createChoiceTypeGuard<T>(
	baseName: string,
	choices: string[],
): ChoiceTypeDiscriminator<T> {
	return (value: any): T | null => {
		if (!value || typeof value !== "object") return null;

		for (const choice of choices) {
			const fieldName = `${baseName}${choice.charAt(0).toUpperCase() + choice.slice(1)}`;
			if (fieldName in value) {
				return value as T;
			}
		}

		return null;
	};
}

/**
 * Check if value is a choice type instance
 */
export function isChoiceTypeInstance(value: any, baseName: string): boolean {
	if (!value || typeof value !== "object") return false;

	return Object.keys(value).some((key) => key.startsWith(baseName));
}

/**
 * Narrow choice type
 */
export function narrowChoiceType<T>(
	value: any,
	type: string,
	baseName: string,
): T | null {
	if (!isChoiceTypeInstance(value, baseName)) return null;

	const fieldName = `${baseName}${type.charAt(0).toUpperCase() + type.slice(1)}`;
	return fieldName in value ? value : null;
}

/**
 * Generate field validation code for type guards
 */
function generateFieldValidationCode(
	fields: Record<string, TypeSchemaField>,
	options: GuardGenerationOptions,
): string {
	const validations: string[] = [];

	for (const [fieldName, field] of Object.entries(fields)) {
		if (field.required) {
			validations.push(`  // Required field: ${fieldName}`);
			validations.push(
				`  if (!(${JSON.stringify(fieldName)} in obj) || obj[${JSON.stringify(fieldName)}] == null) return false;`,
			);
		}

		// Add basic type checking if strict mode is enabled
		if (options.strict && 'type' in field && field.type) {
			// TODO: Implement type checking based on field.type.name
			const typeName = field.type.name;
			validations.push(`  // TODO: Add type check for ${typeName}`);
		}

		// Add cardinality checks for arrays
		if (field.array && options.includeRuntimeValidation) {
			validations.push(`  // Array cardinality check for ${fieldName}`);
			validations.push(
				`  if (${JSON.stringify(fieldName)} in obj && !Array.isArray(obj[${JSON.stringify(fieldName)}])) return false;`,
			);
		}
	}

	return validations.length > 0
		? validations.join("\n")
		: "  // No specific field validation required";
}

/**
 * Generate type checking code for a specific field type
 */
function generateTypeCheckCode(fieldName: string, type: string): string | null {
	const jsType = getJavaScriptType(type);
	if (!jsType) return null;

	if (jsType === "object") {
		return `if (${JSON.stringify(fieldName)} in obj && obj[${JSON.stringify(fieldName)}] != null && typeof obj[${JSON.stringify(fieldName)}] !== 'object') return false;`;
	}

	return `if (${JSON.stringify(fieldName)} in obj && obj[${JSON.stringify(fieldName)}] != null && typeof obj[${JSON.stringify(fieldName)}] !== '${jsType}') return false;`;
}

/**
 * Generate primitive type validation based on FHIR type
 */
function generatePrimitiveValidation(typeName: string): string {
	switch (typeName) {
		case "id":
			return "return ValidationUtils.isValidId(value);";
		case "date":
			return "return ValidationUtils.isValidDate(value);";
		case "dateTime":
		case "instant":
			return "return ValidationUtils.isValidDateTime(value);";
		case "uri":
		case "url":
		case "canonical":
			return "return ValidationUtils.isValidUri(value);";
		case "code":
		case "string":
		case "markdown":
		case "base64Binary":
			return 'return typeof value === "string";';
		case "boolean":
			return 'return typeof value === "boolean";';
		case "integer":
		case "positiveInt":
		case "unsignedInt":
		case "decimal":
			return 'return typeof value === "number" && !isNaN(value) && isFinite(value);';
		default:
			return 'return typeof value === "string"; // Generic string validation';
	}
}

/**
 * Get JavaScript type for FHIR type
 */
function getJavaScriptType(fhirType: string): string | null {
	const typeMapping: Record<string, string> = {
		string: "string",
		boolean: "boolean",
		integer: "number",
		decimal: "number",
		positiveInt: "number",
		unsignedInt: "number",
		date: "string",
		dateTime: "string",
		time: "string",
		instant: "string",
		uri: "string",
		url: "string",
		canonical: "string",
		id: "string",
		oid: "string",
		uuid: "string",
		markdown: "string",
		code: "string",
		base64Binary: "string",
		xhtml: "string",
	};

	return typeMapping[fhirType] || "object";
}

/**
 * Convenience function to generate all type guards
 */
export async function generateAllTypeGuards(
	schemas: AnyTypeSchema[],
	options: GuardGenerationOptions = {},
	packageInfo?: PackageInfo,
): Promise<TypeGuardResult> {
	const generator = new FHIRGuardGenerator(options);
	return generator.generateFromTypeSchemas(schemas, packageInfo);
}
