/**
 * FHIR Choice Type Discriminators
 *
 * Handles discriminated unions for FHIR choice types (e.g., value[x], effective[x]).
 * Provides type narrowing utilities for polymorphic fields.
 */

import {
	type AnyTypeSchema,
	isPolymorphicDeclarationField,
	isPolymorphicInstanceField,
	TypeSchemaField,
	type TypeSchemaFieldPolymorphicDeclaration,
	TypeSchemaFieldPolymorphicInstance,
} from "../../typeschema/lib-types";
import type {
	ChoiceTypeDiscriminator,
	ChoiceTypeInfo,
	DiscriminatedUnion,
	GuardGenerationContext,
	NarrowByDiscriminant,
	TypeGuardResult,
} from "./types";

/**
 * Generate choice type discriminators for all polymorphic fields
 */
export function generateChoiceTypeDiscriminators(
	schemas: AnyTypeSchema[],
	context: GuardGenerationContext,
): TypeGuardResult {
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	// Find all polymorphic declaration fields across all schemas
	const choiceFields = new Map<string, ChoiceTypeInfo>();

	for (const schema of schemas) {
		if ("fields" in schema && schema.fields) {
			for (const [fieldName, field] of Object.entries(schema.fields)) {
				if (isPolymorphicDeclarationField(field)) {
					const choiceInfo = extractChoiceTypeInfo(fieldName, field);
					choiceFields.set(choiceInfo.baseName, choiceInfo);
				}
			}
		}
	}

	// Generate discriminators for each choice type
	for (const [baseName, choiceInfo] of choiceFields.entries()) {
		const discriminatorResult = generateSingleChoiceDiscriminator(
			choiceInfo,
			context,
		);
		guardCode.push(discriminatorResult.guardCode);
		typeDefinitions.push(discriminatorResult.typeDefinitions);
		discriminatorResult.imports.forEach((imp) => imports.add(imp));
		discriminatorResult.dependencies.forEach((dep) => dependencies.add(dep));
	}

	// Generate utility functions
	guardCode.push(generateChoiceUtilities());

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Create a type guard for a specific choice type
 */
export function createChoiceTypeGuard<T>(
	baseName: string,
	choices: string[],
): ChoiceTypeDiscriminator<T> {
	return (value: any): T | null => {
		if (!value || typeof value !== "object") return null;

		// Find the first matching choice field
		for (const choice of choices) {
			const fieldName = `${baseName}${capitalize(choice)}`;
			if (fieldName in value && value[fieldName] !== undefined) {
				return value as T;
			}
		}

		return null;
	};
}

/**
 * Check if a value is an instance of a choice type
 */
export function isChoiceTypeInstance(
	value: unknown,
	baseName: string,
	choices: string[],
): boolean {
	if (!value || typeof value !== "object") return false;

	const obj = value as Record<string, unknown>;
	let foundChoice = false;
	let choiceCount = 0;

	// Count how many choice fields are present
	for (const choice of choices) {
		const fieldName = `${baseName}${capitalize(choice)}`;
		if (fieldName in obj && obj[fieldName] !== undefined) {
			foundChoice = true;
			choiceCount++;
		}
	}

	// Valid choice type should have exactly one choice field
	return foundChoice && choiceCount === 1;
}

/**
 * Narrow a choice type to a specific variant
 */
export function narrowChoiceType<T, K extends keyof T, V>(
	value: T,
	discriminant: K,
	expectedValue: V,
): NarrowByDiscriminant<T, K, V> | null {
	if (!value || typeof value !== "object") return null;

	const obj = value as Record<string, unknown>;
	if (obj[discriminant as string] === expectedValue) {
		return value as NarrowByDiscriminant<T, K, V>;
	}

	return null;
}

/**
 * Generate a choice type discriminator for a specific polymorphic field
 */
function generateSingleChoiceDiscriminator(
	choiceInfo: ChoiceTypeInfo,
	context: GuardGenerationContext,
): TypeGuardResult {
	const { baseName, choices, fieldNames } = choiceInfo;
	const discriminatorName = `discriminate${capitalize(baseName)}Choice`;
	const typeName = `${capitalize(baseName)}Choice`;

	// Generate the discriminator function
	const choiceChecks = choices
		.map((choice) => {
			const fieldName = fieldNames[choice];
			return `\tif ('${fieldName}' in obj && obj.${fieldName} !== undefined) {
\t\treturn { type: '${choice}', value: obj.${fieldName}, fieldName: '${fieldName}' };
\t}`;
		})
		.join("\n");

	const guardCode = `/**
 * Discriminate ${baseName}[x] choice type
 */
export function ${discriminatorName}(value: unknown): ${typeName}Result | null {
	if (!value || typeof value !== 'object') return null;
	const obj = value as Record<string, unknown>;
	
${choiceChecks}
	
	return null;
}

/**
 * Type guard for ${baseName}[x] choice type validity
 */
export function is${capitalize(baseName)}ChoiceValid(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	const obj = value as Record<string, unknown>;
	
	let choiceCount = 0;
	const choiceFields = [${choices.map((c) => `'${fieldNames[c]}'`).join(", ")}];
	
	for (const fieldName of choiceFields) {
		if (fieldName in obj && obj[fieldName] !== undefined) {
			choiceCount++;
		}
	}
	
	// Valid choice type must have exactly one choice field
	return choiceCount === 1;
}`;

	// Generate type definitions
	const choiceUnion = choices
		.map(
			(choice) =>
				`{ type: '${choice}'; value: ${capitalize(choice)}; fieldName: '${fieldNames[choice]}' }`,
		)
		.join(" | ");
	const typeDefinitions = `/**
 * Result type for ${baseName}[x] choice discrimination
 */
export type ${typeName}Result = ${choiceUnion};

/**
 * Union type for ${baseName}[x] choice values
 */
export type ${capitalize(baseName)}ChoiceValue = ${choices.map((c) => capitalize(c)).join(" | ")};

/**
 * Discriminated union helper for ${baseName}[x]
 */
export type ${capitalize(baseName)}ChoiceUnion<T> = DiscriminatedUnion<T, '${fieldNames[choices[0]].replace(/[A-Z].*$/, "")}'>;`;

	return {
		guardCode,
		typeDefinitions,
		imports: [],
		dependencies: choices.map((choice) => capitalize(choice)),
	};
}

/**
 * Generate utility functions for choice type handling
 */
function generateChoiceUtilities(): string {
	return `/**
 * Generic choice type validator
 */
export function validateChoiceType(
	value: unknown,
	baseName: string,
	allowedChoices: string[],
): { valid: boolean; activeChoices: string[]; errors: string[] } {
	const errors: string[] = [];
	const activeChoices: string[] = [];
	
	if (!value || typeof value !== 'object') {
		errors.push('Value must be an object');
		return { valid: false, activeChoices, errors };
	}
	
	const obj = value as Record<string, unknown>;
	
	// Find active choice fields
	for (const choice of allowedChoices) {
		const fieldName = \`\${baseName}\${capitalize(choice)}\`;
		if (fieldName in obj && obj[fieldName] !== undefined) {
			activeChoices.push(choice);
		}
	}
	
	// Validate choice constraints
	if (activeChoices.length === 0) {
		errors.push(\`No choice field found for \${baseName}[x]. Expected one of: \${allowedChoices.map(c => \`\${baseName}\${capitalize(c)}\`).join(', ')}\`);
	} else if (activeChoices.length > 1) {
		errors.push(\`Multiple choice fields found for \${baseName}[x]: \${activeChoices.map(c => \`\${baseName}\${capitalize(c)}\`).join(', ')}. Only one is allowed.\`);
	}
	
	return {
		valid: errors.length === 0,
		activeChoices,
		errors,
	};
}

/**
 * Extract the choice type name from a polymorphic field name
 */
export function extractChoiceTypeName(fieldName: string, baseName: string): string | null {
	if (!fieldName.startsWith(baseName)) return null;
	
	const suffix = fieldName.substring(baseName.length);
	if (suffix.length === 0) return null;
	
	// Convert from PascalCase to lowercase
	return suffix.charAt(0).toLowerCase() + suffix.slice(1);
}

/**
 * Get all possible field names for a choice type
 */
export function getChoiceFieldNames(baseName: string, choices: string[]): string[] {
	return choices.map(choice => \`\${baseName}\${capitalize(choice)}\`);
}`;
}

/**
 * Extract choice type information from a polymorphic declaration field
 */
function extractChoiceTypeInfo(
	fieldName: string,
	field: TypeSchemaFieldPolymorphicDeclaration,
): ChoiceTypeInfo {
	// Remove [x] suffix to get base name
	const baseName = fieldName.replace(/\[x\]$/, "");
	const choices = field.choices;
	const fieldNames: Record<string, string> = {};

	// Generate field names for each choice
	for (const choice of choices) {
		fieldNames[choice] = `${baseName}${capitalize(choice)}`;
	}

	return {
		baseName,
		choices,
		fieldNames,
	};
}

/**
 * Utility function to capitalize strings
 */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
