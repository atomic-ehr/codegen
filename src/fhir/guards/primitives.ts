/**
 * FHIR Primitive Type Guards
 *
 * Generates type guards for FHIR primitive types with validation constraints.
 * Includes regex patterns, length constraints, and value range validation.
 */

import {
	type AnyTypeSchema,
	isPrimitiveTypeSchema,
	type TypeSchemaPrimitiveType,
} from "../../typeschema/lib-types";
import type {
	GuardGenerationContext,
	PrimitiveTypeGuard,
	TypeGuardResult,
	ValidationContext,
	ValidationResult,
} from "./types";

/**
 * FHIR primitive type validation patterns and constraints
 */
const PRIMITIVE_PATTERNS: Record<string, RegExp> = {
	// String patterns
	id: /^[A-Za-z0-9\-.]{1,64}$/,
	string: /^[\s\S]*$/,
	uri: /^[^\s]+$/,
	url: /^[^\s]+$/,
	canonical: /^[^\s]+$/,
	oid: /^urn:oid:[0-2](\.(0|[1-9][0-9]*))*$/,
	uuid: /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	code: /^[^\s]+(\s[^\s]+)*$/,
	markdown: /^[\s\S]*$/,

	// Date and time patterns
	date: /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1]))?)?$/,
	dateTime:
		/^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?$/,
	instant:
		/^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$/,
	time: /^([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?$/,

	// Numeric patterns (handled separately with range validation)
	decimal: /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/,

	// Binary
	base64Binary: /^[A-Za-z0-9+/]*={0,2}$/,

	// Other
	xhtml: /^[\s\S]*$/,
};

/**
 * Primitive type constraints
 */
interface PrimitiveConstraints {
	minLength?: number;
	maxLength?: number;
	minValue?: number;
	maxValue?: number;
	pattern?: RegExp;
	allowEmpty?: boolean;
}

const PRIMITIVE_CONSTRAINTS: Record<string, PrimitiveConstraints> = {
	id: { minLength: 1, maxLength: 64, pattern: PRIMITIVE_PATTERNS.id },
	string: { maxLength: 1048576 },
	uri: { maxLength: 4096, pattern: PRIMITIVE_PATTERNS.uri },
	url: { maxLength: 4096, pattern: PRIMITIVE_PATTERNS.url },
	canonical: { maxLength: 4096, pattern: PRIMITIVE_PATTERNS.canonical },
	code: { minLength: 1, maxLength: 4096, pattern: PRIMITIVE_PATTERNS.code },
	oid: { pattern: PRIMITIVE_PATTERNS.oid },
	uuid: { pattern: PRIMITIVE_PATTERNS.uuid },
	markdown: { maxLength: 1048576 },

	date: { pattern: PRIMITIVE_PATTERNS.date },
	dateTime: { pattern: PRIMITIVE_PATTERNS.dateTime },
	instant: { pattern: PRIMITIVE_PATTERNS.instant },
	time: { pattern: PRIMITIVE_PATTERNS.time },

	integer: { minValue: -2147483648, maxValue: 2147483647 },
	integer64: {
		minValue: Number.MIN_SAFE_INTEGER,
		maxValue: Number.MAX_SAFE_INTEGER,
	},
	unsignedInt: { minValue: 0, maxValue: 4294967295 },
	positiveInt: { minValue: 1, maxValue: 2147483647 },

	decimal: { pattern: PRIMITIVE_PATTERNS.decimal },

	base64Binary: { pattern: PRIMITIVE_PATTERNS.base64Binary },
	xhtml: {},
};

/**
 * Generate type guards for all primitive types
 */
export function generatePrimitiveTypeGuards(
	schemas: AnyTypeSchema[],
	context: GuardGenerationContext,
): TypeGuardResult {
	const primitiveSchemas = schemas.filter(isPrimitiveTypeSchema);
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	// Generate individual primitive guards
	for (const schema of primitiveSchemas) {
		const primitiveGuard = generateSinglePrimitiveGuard(schema, context);
		guardCode.push(primitiveGuard.guardCode);
		typeDefinitions.push(primitiveGuard.typeDefinitions);
		primitiveGuard.imports.forEach((imp) => imports.add(imp));
		primitiveGuard.dependencies.forEach((dep) => dependencies.add(dep));
	}

	// Generate utility functions
	guardCode.push(generatePrimitiveUtilities());

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Generate a type guard for a single primitive type
 */
function generateSinglePrimitiveGuard(
	schema: TypeSchemaPrimitiveType,
	context: GuardGenerationContext,
): TypeGuardResult {
	const typeName = schema.identifier.name;
	const guardFunctionName = `is${capitalize(typeName)}`;
	const constraints = PRIMITIVE_CONSTRAINTS[typeName] || {};

	const validationChecks: string[] = [];

	// Base type validation
	const baseType = getBaseJavaScriptType(typeName);
	if (baseType) {
		validationChecks.push(`typeof value !== '${baseType}'`);
	}

	// Specific validations based on type
	if (typeName === "boolean") {
		validationChecks.push(`typeof value !== 'boolean'`);
	} else if (isIntegerType(typeName)) {
		validationChecks.push(
			`typeof value !== 'number'`,
			`!Number.isInteger(value)`,
			`!Number.isFinite(value)`,
		);

		if (constraints.minValue !== undefined) {
			validationChecks.push(`value < ${constraints.minValue}`);
		}
		if (constraints.maxValue !== undefined) {
			validationChecks.push(`value > ${constraints.maxValue}`);
		}
	} else if (isDecimalType(typeName)) {
		validationChecks.push(
			`typeof value !== 'number'`,
			`!Number.isFinite(value)`,
		);
	} else if (isStringType(typeName)) {
		validationChecks.push(`typeof value !== 'string'`);

		if (constraints.minLength !== undefined) {
			validationChecks.push(`value.length < ${constraints.minLength}`);
		}
		if (constraints.maxLength !== undefined) {
			validationChecks.push(`value.length > ${constraints.maxLength}`);
		}
		if (constraints.pattern) {
			validationChecks.push(`!${constraints.pattern.toString()}.test(value)`);
		}
	}

	const validationCode =
		validationChecks.length > 0
			? `\tif (${validationChecks.join(" || ")}) return false;`
			: "";

	const guardCode = `/**
 * Type guard for ${typeName} primitive type
 */
export function ${guardFunctionName}(value: unknown): value is ${typeName} {
	if (value === null || value === undefined) return false;
${validationCode}
	return true;
}`;

	const typeDefinition = `export type ${capitalize(typeName)}TypeGuard = PrimitiveTypeGuard<${typeName}>;`;

	return {
		guardCode,
		typeDefinitions: typeDefinition,
		imports: [],
		dependencies: [],
	};
}

/**
 * Generate utility functions for primitive validation
 */
function generatePrimitiveUtilities(): string {
	return `/**
 * Check if a value is a valid FHIR primitive value
 */
export function isPrimitiveValue(value: unknown): boolean {
	return (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	);
}

/**
 * Validate primitive constraints with detailed error reporting
 */
export function validatePrimitiveConstraints(
	value: unknown,
	type: string,
	context?: ValidationContext,
): ValidationResult {
	const errors = [];
	const warnings = [];
	
	if (!isPrimitiveValue(value)) {
		errors.push({
			message: \`Expected primitive value, got \${typeof value}\`,
			path: context?.path || [],
			expected: 'primitive',
			actual: value,
			code: 'INVALID_PRIMITIVE_TYPE',
		});
		return { valid: false, errors, warnings };
	}

	const constraints = PRIMITIVE_CONSTRAINTS[type];
	if (!constraints) {
		return { valid: true, errors, warnings };
	}

	// String-specific validations
	if (typeof value === 'string') {
		if (constraints.minLength !== undefined && value.length < constraints.minLength) {
			errors.push({
				message: \`String too short: \${value.length} < \${constraints.minLength}\`,
				path: context?.path || [],
				expected: \`length >= \${constraints.minLength}\`,
				actual: value.length,
				code: 'STRING_TOO_SHORT',
			});
		}
		
		if (constraints.maxLength !== undefined && value.length > constraints.maxLength) {
			errors.push({
				message: \`String too long: \${value.length} > \${constraints.maxLength}\`,
				path: context?.path || [],
				expected: \`length <= \${constraints.maxLength}\`,
				actual: value.length,
				code: 'STRING_TOO_LONG',
			});
		}
		
		if (constraints.pattern && !constraints.pattern.test(value)) {
			errors.push({
				message: \`String does not match pattern: \${constraints.pattern}\`,
				path: context?.path || [],
				expected: constraints.pattern.toString(),
				actual: value,
				code: 'PATTERN_MISMATCH',
			});
		}
	}

	// Number-specific validations
	if (typeof value === 'number') {
		if (constraints.minValue !== undefined && value < constraints.minValue) {
			errors.push({
				message: \`Value too small: \${value} < \${constraints.minValue}\`,
				path: context?.path || [],
				expected: \`>= \${constraints.minValue}\`,
				actual: value,
				code: 'VALUE_TOO_SMALL',
			});
		}
		
		if (constraints.maxValue !== undefined && value > constraints.maxValue) {
			errors.push({
				message: \`Value too large: \${value} > \${constraints.maxValue}\`,
				path: context?.path || [],
				expected: \`<= \${constraints.maxValue}\`,
				actual: value,
				code: 'VALUE_TOO_LARGE',
			});
		}
	}

	return { valid: errors.length === 0, errors, warnings };
}`;
}

/**
 * Get the base JavaScript type for a FHIR primitive
 */
function getBaseJavaScriptType(typeName: string): string | null {
	if (typeName === "boolean") return "boolean";
	if (isIntegerType(typeName) || isDecimalType(typeName)) return "number";
	if (isStringType(typeName)) return "string";
	return null;
}

/**
 * Check if a type is an integer type
 */
function isIntegerType(typeName: string): boolean {
	return ["integer", "integer64", "unsignedInt", "positiveInt"].includes(
		typeName,
	);
}

/**
 * Check if a type is a decimal type
 */
function isDecimalType(typeName: string): boolean {
	return typeName === "decimal";
}

/**
 * Check if a type is a string-based type
 */
function isStringType(typeName: string): boolean {
	return ![
		"boolean",
		"integer",
		"integer64",
		"unsignedInt",
		"positiveInt",
		"decimal",
	].includes(typeName);
}

/**
 * Utility function to capitalize strings
 */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
