/**
 * FHIR Resource Type Guards
 *
 * Generates type guards for FHIR resources, complex types, and nested elements.
 * Focuses on compile-time type safety with minimal runtime overhead.
 */

import {
	type AnyTypeSchema,
	isPolymorphicDeclarationField,
	isPolymorphicInstanceField,
	isRegularField,
	isResourceTypeSchema,
	type TypeSchemaField,
	type TypeSchemaNestedType,
	type TypeSchemaResourceType,
} from "../../typeschema/lib-types";
import type {
	FieldTypeGuard,
	GuardGenerationContext,
	ResourceTypeGuard,
	TypeGuardResult,
} from "./types";

/**
 * Generate type guards for all resource types
 */
export function generateResourceTypeGuards(
	schemas: AnyTypeSchema[],
	context: GuardGenerationContext,
): TypeGuardResult {
	const resourceSchemas = schemas.filter(isResourceTypeSchema);
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	for (const schema of resourceSchemas) {
		const resourceGuard = generateSingleResourceGuard(schema, context);
		guardCode.push(resourceGuard.guardCode);
		typeDefinitions.push(resourceGuard.typeDefinitions);
		resourceGuard.imports.forEach((imp) => imports.add(imp));
		resourceGuard.dependencies.forEach((dep) => dependencies.add(dep));
	}

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Generate type guards for complex types (non-resource structured types)
 */
export function generateComplexTypeGuards(
	schemas: AnyTypeSchema[],
	context: GuardGenerationContext,
): TypeGuardResult {
	const complexSchemas = schemas.filter(
		(schema) =>
			isResourceTypeSchema(schema) && schema.identifier.kind === "complex-type",
	);

	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	for (const schema of complexSchemas) {
		const complexGuard = generateSingleResourceGuard(schema, context);
		guardCode.push(complexGuard.guardCode);
		typeDefinitions.push(complexGuard.typeDefinitions);
		complexGuard.imports.forEach((imp) => imports.add(imp));
		complexGuard.dependencies.forEach((dep) => dependencies.add(dep));
	}

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Generate type guards for individual fields
 */
export function generateFieldTypeGuards(
	fields: Record<string, TypeSchemaField>,
	context: GuardGenerationContext,
): TypeGuardResult {
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	for (const [fieldName, field] of Object.entries(fields)) {
		const fieldGuard = generateSingleFieldGuard(fieldName, field, context);
		if (fieldGuard) {
			guardCode.push(fieldGuard.guardCode);
			typeDefinitions.push(fieldGuard.typeDefinitions);
			fieldGuard.imports.forEach((imp) => imports.add(imp));
			fieldGuard.dependencies.forEach((dep) => dependencies.add(dep));
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
 * Generate a type guard for a single resource or complex type
 */
function generateSingleResourceGuard(
	schema: TypeSchemaResourceType,
	context: GuardGenerationContext,
): TypeGuardResult {
	const typeName = schema.identifier.name;
	const cacheKey = `resource:${typeName}`;

	// Check cache to avoid circular dependencies
	if (context.guardCache.has(cacheKey)) {
		return {
			guardCode: `// ${typeName} guard already generated`,
			typeDefinitions: `// ${typeName} type already defined`,
			imports: [],
			dependencies: [typeName],
		};
	}

	// Mark as processing to detect cycles
	if (context.processing.has(cacheKey)) {
		return {
			guardCode: `// ${typeName} guard - circular dependency detected`,
			typeDefinitions: `// ${typeName} type - circular dependency`,
			imports: [],
			dependencies: [],
		};
	}

	context.processing.add(cacheKey);

	const guardFunctionName = `is${typeName}`;
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	// Generate field validations
	const fieldValidations: string[] = [];
	const requiredFields: string[] = [];
	const optionalFields: string[] = [];

	if (schema.fields) {
		for (const [fieldName, field] of Object.entries(schema.fields)) {
			const fieldValidation = generateFieldValidation(
				fieldName,
				field,
				context,
			);
			fieldValidations.push(fieldValidation.code);
			fieldValidation.imports.forEach((imp) => imports.add(imp));
			fieldValidation.dependencies.forEach((dep) => dependencies.add(dep));

			if (field.required) {
				requiredFields.push(fieldName);
			} else {
				optionalFields.push(fieldName);
			}
		}
	}

	// Generate resourceType validation if it's a resource
	const resourceTypeValidation =
		schema.identifier.kind === "resource"
			? `\tif (typeof obj.resourceType !== 'string' || obj.resourceType !== '${typeName}') return false;`
			: "";

	// Generate the guard function
	const guardCode = `/**
 * Type guard for ${typeName}
 */
export function ${guardFunctionName}(value: unknown): value is ${typeName} {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as Record<string, unknown>;
	
${resourceTypeValidation}
${fieldValidations.map((v) => `\t${v}`).join("\n")}
	
	return true;
}`;

	// Generate type definition
	const requiredFieldsType =
		requiredFields.length > 0
			? `type Required${typeName}Fields = ${requiredFields.map((f) => `'${f}'`).join(" | ")};`
			: `type Required${typeName}Fields = never;`;

	const optionalFieldsType =
		optionalFields.length > 0
			? `type Optional${typeName}Fields = ${optionalFields.map((f) => `'${f}'`).join(" | ")};`
			: `type Optional${typeName}Fields = never;`;

	const typeDefinitions = `${requiredFieldsType}
${optionalFieldsType}

export type ${typeName}TypeGuard = ResourceTypeGuard<${typeName}>;`;

	// Cache the result
	context.guardCache.set(cacheKey, guardCode);
	context.processing.delete(cacheKey);

	return {
		guardCode,
		typeDefinitions,
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Generate a type guard for a single field
 */
function generateSingleFieldGuard(
	fieldName: string,
	field: TypeSchemaField,
	context: GuardGenerationContext,
): TypeGuardResult | null {
	const guardFunctionName = `is${capitalize(fieldName)}Field`;
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	let validationCode = "";
	let typeDefinition = "";

	if (isRegularField(field)) {
		if (field.type) {
			const typeName = field.type.name;
			dependencies.add(typeName);

			if (field.array) {
				validationCode = `Array.isArray(value) && value.every(item => is${typeName}(item))`;
			} else {
				validationCode = `is${typeName}(value)`;
			}
		} else if (field.reference) {
			const referenceTypes = field.reference.map((ref) => ref.name).join(" | ");
			validationCode = field.array
				? `Array.isArray(value) && value.every(item => isReference(item))`
				: `isReference(value)`;
			dependencies.add("Reference");
		} else if (field.enum) {
			const enumValues = field.enum.map((v) => `'${v}'`).join(" | ");
			validationCode = field.array
				? `Array.isArray(value) && value.every(item => [${field.enum.map((v) => `'${v}'`).join(", ")}].includes(item as string))`
				: `[${field.enum.map((v) => `'${v}'`).join(", ")}].includes(value as string)`;
			typeDefinition = `type ${capitalize(fieldName)}Enum = ${enumValues};`;
		}
	} else if (isPolymorphicInstanceField(field)) {
		if (field.type) {
			const typeName = field.type.name;
			dependencies.add(typeName);
			validationCode = field.array
				? `Array.isArray(value) && value.every(item => is${typeName}(item))`
				: `is${typeName}(value)`;
		}
	} else if (isPolymorphicDeclarationField(field)) {
		// For polymorphic declarations, we can't generate a single guard
		return null;
	}

	if (!validationCode) {
		return null;
	}

	const guardCode = `/**
 * Type guard for ${fieldName} field
 */
export function ${guardFunctionName}(value: unknown): boolean {
	return ${validationCode};
}`;

	return {
		guardCode,
		typeDefinitions: typeDefinition,
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}

/**
 * Generate field validation code for use within resource guards
 */
function generateFieldValidation(
	fieldName: string,
	field: TypeSchemaField,
	context: GuardGenerationContext,
): { code: string; imports: Set<string>; dependencies: Set<string> } {
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	// Handle required/optional
	const isRequired = field.required === true;
	const fieldAccess = `obj.${fieldName}`;

	if (isRegularField(field)) {
		if (field.type) {
			const typeName = field.type.name;
			dependencies.add(typeName);

			if (field.array) {
				const validation = isRequired
					? `if (!Array.isArray(${fieldAccess}) || !${fieldAccess}.every(item => is${typeName}(item))) return false;`
					: `if (${fieldAccess} !== undefined && (!Array.isArray(${fieldAccess}) || !${fieldAccess}.every(item => is${typeName}(item)))) return false;`;
				return { code: validation, imports, dependencies };
			} else {
				const validation = isRequired
					? `if (!is${typeName}(${fieldAccess})) return false;`
					: `if (${fieldAccess} !== undefined && !is${typeName}(${fieldAccess})) return false;`;
				return { code: validation, imports, dependencies };
			}
		} else if (field.reference) {
			dependencies.add("Reference");
			const validation = isRequired
				? `if (!isReference(${fieldAccess})) return false;`
				: `if (${fieldAccess} !== undefined && !isReference(${fieldAccess})) return false;`;
			return { code: validation, imports, dependencies };
		} else if (field.enum) {
			const enumCheck = `[${field.enum.map((v) => `'${v}'`).join(", ")}].includes(${fieldAccess} as string)`;
			const validation = isRequired
				? `if (!${enumCheck}) return false;`
				: `if (${fieldAccess} !== undefined && !${enumCheck}) return false;`;
			return { code: validation, imports, dependencies };
		}
	}

	// Default case - just check existence for required fields
	const validation = isRequired
		? `if (${fieldAccess} === undefined) return false;`
		: `// ${fieldName} is optional`;

	return { code: validation, imports, dependencies };
}

/**
 * Utility function to capitalize strings
 */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate nested type guards for BackboneElements
 */
export function generateNestedTypeGuards(
	nested: TypeSchemaNestedType[],
	context: GuardGenerationContext,
): TypeGuardResult {
	const guardCode: string[] = [];
	const typeDefinitions: string[] = [];
	const imports = new Set<string>();
	const dependencies = new Set<string>();

	for (const nestedType of nested) {
		const nestedGuard = generateSingleResourceGuard(
			nestedType as TypeSchemaResourceType,
			context,
		);
		guardCode.push(nestedGuard.guardCode);
		typeDefinitions.push(nestedGuard.typeDefinitions);
		nestedGuard.imports.forEach((imp) => imports.add(imp));
		nestedGuard.dependencies.forEach((dep) => dependencies.add(dep));
	}

	return {
		guardCode: guardCode.join("\n\n"),
		typeDefinitions: typeDefinitions.join("\n\n"),
		imports: Array.from(imports),
		dependencies: Array.from(dependencies),
	};
}
