/**
 * TypeScript Builder Generator for FHIR Resources
 *
 * Generates fluent builder classes for FHIR resources and complex types.
 * Provides type-safe, chainable APIs for constructing FHIR objects with:
 * - Comprehensive fluent method chaining
 * - Validation at build time
 * - Factory functions for quick creation
 * - Nested builder support for complex structures
 * - Helper methods for common FHIR patterns
 * - Partial construction support
 * - Excellent autocomplete and type safety
 */

import type {
	AnyTypeSchema,
	TypeSchemaField,
} from "../../../typeschema/lib-types";

/**
 * Comprehensive builder generation options
 */
export interface BuilderGenerationOptions {
	/** Include validation in builders */
	includeValidation?: boolean;
	/** Generate immutable builders */
	immutable?: boolean;
	/** Include static factory methods */
	includeFactoryMethods?: boolean;
	/** Generate builder interfaces */
	includeInterfaces?: boolean;
	/** Use fluent API style */
	fluent?: boolean;
	/** Generate nested builders for complex types */
	generateNestedBuilders?: boolean;
	/** Include helper methods for common patterns */
	includeHelperMethods?: boolean;
	/** Support partial construction */
	supportPartialBuild?: boolean;
	/** Include JSDoc comments */
	includeJSDoc?: boolean;
	/** Generate factory functions */
	generateFactories?: boolean;
	/** Include type guards */
	includeTypeGuards?: boolean;
	/** Generate builder for choice types */
	handleChoiceTypes?: boolean;
	/** Generate array helper methods */
	generateArrayHelpers?: boolean;
}

/**
 * Default builder generation options
 */
export const DEFAULT_BUILDER_OPTIONS: Required<BuilderGenerationOptions> = {
	includeValidation: true,
	immutable: false,
	includeFactoryMethods: true,
	includeInterfaces: true,
	fluent: true,
	generateNestedBuilders: true,
	includeHelperMethods: true,
	supportPartialBuild: true,
	includeJSDoc: true,
	generateFactories: true,
	includeTypeGuards: true,
	handleChoiceTypes: true,
	generateArrayHelpers: true,
};

/**
 * Generate builders from schemas with comprehensive features
 */
export function generateBuilders(
	schemas: AnyTypeSchema[],
	options: BuilderGenerationOptions = {},
): string {
	const mergedOptions = { ...DEFAULT_BUILDER_OPTIONS, ...options };
	const builders: string[] = [];
	const interfaces: string[] = [];
	const factories: string[] = [];

	// Generate builders for each schema
	for (const schema of schemas) {
		if ("fields" in schema && schema.fields) {
			const builder = generateBuilder(schema, mergedOptions);
			if (builder) {
				builders.push(builder);
			}

			if (mergedOptions.includeInterfaces) {
				const builderInterface = generateBuilderInterface(
					schema,
					mergedOptions,
				);
				if (builderInterface) {
					interfaces.push(builderInterface);
				}
			}

			if (mergedOptions.generateFactories) {
				const factory = generateFactoryFunction(schema, mergedOptions);
				if (factory) {
					factories.push(factory);
				}
			}
		}
	}

	// Add header and helper types
	const header = generateBuilderHeader();
	const helperTypes = generateHelperTypes(mergedOptions);
	const utilityFunctions = generateUtilityFunctions(mergedOptions);

	return [
		header,
		helperTypes,
		utilityFunctions,
		...interfaces,
		...builders,
		...factories,
	]
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Generate comprehensive builder class for a schema
 */
function generateBuilder(
	schema: AnyTypeSchema,
	options: Required<BuilderGenerationOptions>,
): string {
	if (!("identifier" in schema) || !("fields" in schema) || !schema.fields) {
		return "";
	}

	const className = `${schema.identifier.name}Builder`;
	const typeName = schema.identifier.name;
	const fields = schema.fields;

	const privateFields = generatePrivateFields(fields, options);
	const constructor = generateBuilderConstructor(
		className,
		typeName,
		fields,
		options,
	);
	const methods = generateBuilderMethods(fields, options);
	const buildMethods = generateBuildMethods(typeName, fields, options);
	const factoryMethods = options.includeFactoryMethods
		? generateFactoryMethods(className, typeName, options)
		: "";
	const helperMethods = options.includeHelperMethods
		? generateHelperMethods(typeName, fields, options)
		: "";
	const validationMethods = options.includeValidation
		? generateValidationMethods(typeName, fields, options)
		: "";

	const jsDocComment = options.includeJSDoc
		? `/**
 * Fluent builder for ${typeName} FHIR resource
 * 
 * @example
 * \`\`\`typescript
 * const ${typeName.toLowerCase()} = new ${className}()
 *   .withResourceType('${typeName}')
 *   .build();
 * \`\`\`
 */`
		: `/**
 * Builder for ${typeName}
 */`;

	return `${jsDocComment}
export class ${className} {
${privateFields}

${constructor}

${methods}

${buildMethods}

${validationMethods}

${helperMethods}

${factoryMethods}
}`;
}

/**
 * Generate private fields for builder with enhanced typing
 */
function generatePrivateFields(
	fields: Record<string, TypeSchemaField>,
	options: Required<BuilderGenerationOptions>,
): string {
	const fieldDeclarations: string[] = [];

	for (const [fieldName, field] of Object.entries(fields)) {
		const tsType = getBuilderFieldType(field);
		const comment =
			options.includeJSDoc && field.description
				? `\n\t/** ${field.description} */`
				: "";
		fieldDeclarations.push(`${comment}\n\tprivate _${fieldName}?: ${tsType};`);
	}

	return fieldDeclarations.join("\n");
}

/**
 * Generate enhanced builder constructor
 */
function generateBuilderConstructor(
	_className: string,
	typeName: string,
	_fields: Record<string, TypeSchemaField>,
	options: Required<BuilderGenerationOptions>,
): string {
	const jsDoc = options.includeJSDoc
		? `\t/**
\t * Create a new ${typeName} builder
\t * @param initial - Initial values to set
\t */`
		: "";

	return `${jsDoc}
\tconstructor(initial?: Partial<${typeName}>) {
\t\tif (initial) {
\t\t\t// Set initial values through proper methods to ensure validation
\t\t\tObject.entries(initial).forEach(([key, value]) => {
\t\t\t\tif (value !== undefined) {
\t\t\t\t\t(this as any)[\`_\${key}\`] = value;
\t\t\t\t}
\t\t\t});
\t\t}
\t}`;
}

/**
 * Generate builder methods
 */
function generateBuilderMethods(
	fields: Record<string, TypeSchemaField>,
	options: Required<BuilderGenerationOptions>,
): string {
	const methods: string[] = [];

	for (const [fieldName, field] of Object.entries(fields)) {
		const method = generateBuilderMethod(fieldName, field, options);
		if (method) {
			methods.push(method);
		}
	}

	return methods.join("\n\n");
}

/**
 * Generate a single builder method
 */
function generateBuilderMethod(
	fieldName: string,
	field: TypeSchemaField,
	options: Required<BuilderGenerationOptions>,
): string {
	const methodName = `with${capitalize(fieldName)}`;
	const paramType = getBuilderFieldType(field);
	const returnType = options.fluent ? "this" : "void";
	const returnStatement = options.fluent ? "\n\t\treturn this;" : "";

	let methodBody = `this._${fieldName} = ${fieldName};${returnStatement}`;

	// Add validation if enabled
	if (options.includeValidation) {
		const validation = generateFieldValidation(fieldName, field);
		if (validation) {
			methodBody = `${validation}\n\t\t${methodBody}`;
		}
	}

	// Generate JSDoc comment
	const jsDoc = options.includeJSDoc
		? `\t/**
\t * Set ${fieldName}${field.description ? ` - ${field.description}` : ""}
\t * @param ${fieldName} - The value to set
\t * @returns This builder instance for method chaining
\t */`
		: `\t/**
\t * Set ${fieldName}
\t */`;

	// Handle array fields with helper methods
	if (field.array && options.generateArrayHelpers) {
		const singularName = getSingularName(fieldName);
		const elementType = getElementType(field);

		const addMethodJSDoc = options.includeJSDoc
			? `\t/**
\t * Add single ${singularName} to ${fieldName}
\t * @param ${singularName} - The item to add
\t * @returns This builder instance for method chaining
\t */`
			: `\t/**
\t * Add single ${singularName} to ${fieldName}
\t */`;

		const addMethod = `${addMethodJSDoc}
\tadd${capitalize(singularName)}(${singularName}: ${elementType}): ${returnType} {
\t\tif (!this._${fieldName}) {
\t\t\tthis._${fieldName} = [];
\t\t}
\t\tthis._${fieldName}.push(${singularName});${returnStatement}
\t}`;

		const clearMethodJSDoc = options.includeJSDoc
			? `\t/**
\t * Clear all ${fieldName}
\t * @returns This builder instance for method chaining
\t */`
			: `\t/**
\t * Clear all ${fieldName}
\t */`;

		const clearMethod = `${clearMethodJSDoc}
\tclear${capitalize(fieldName)}(): ${returnType} {
\t\tthis._${fieldName} = [];${returnStatement}
\t}`;

		return `${jsDoc}
\t${methodName}(${fieldName}: ${paramType}): ${returnType} {
\t\t${methodBody}
\t}

${addMethod}

${clearMethod}`;
	}

	// Handle choice types with specialized methods
	if ("choices" in field && field.choices && options.handleChoiceTypes) {
		const choiceMethods = field.choices
			.map((choice) => {
				const choiceMethodName = `${methodName}${capitalize(choice)}`;
				const choiceType = choice;
				const choiceJSDoc = options.includeJSDoc
					? `\t/**
\t * Set ${fieldName} as ${choice}
\t * @param value - The ${choice} value to set
\t * @returns This builder instance for method chaining
\t */`
					: `\t/**
\t * Set ${fieldName} as ${choice}
\t */`;

				return `${choiceJSDoc}
\t${choiceMethodName}(value: ${choiceType}): ${returnType} {
\t\tthis._${fieldName} = value;${returnStatement}
\t}`;
			})
			.join("\n\n");

		return `${jsDoc}
\t${methodName}(${fieldName}: ${paramType}): ${returnType} {
\t\t${methodBody}
\t}

${choiceMethods}`;
	}

	return `${jsDoc}
\t${methodName}(${fieldName}: ${paramType}): ${returnType} {
\t\t${methodBody}
\t}`;
}

/**
 * Generate enhanced build methods (both full and partial)
 */
function generateBuildMethods(
	typeName: string,
	fields: Record<string, TypeSchemaField>,
	options: Required<BuilderGenerationOptions>,
): string {
	const assignments = Object.keys(fields)
		.map((fieldName) => `\t\t\t${fieldName}: this._${fieldName},`)
		.join("\n");

	let buildBody = `const result: ${typeName} = {
${assignments}
		} as ${typeName};`;

	if (options.includeValidation) {
		buildBody += `\n\n\t\t// Validate the built object
		if (this.validate) {
			const validation = this.validate();
			if (!validation.isValid) {
				throw new Error(\`Invalid ${typeName}: \${validation.errors.join(', ')}\`);
			}
		}`;
	}

	buildBody += "\n\n\t\treturn result;";

	const buildMethodJSDoc = options.includeJSDoc
		? `\t/**
\t * Build the complete ${typeName} object with validation
\t * @returns The constructed ${typeName} object
\t * @throws Error if validation fails
\t */`
		: `\t/**
\t * Build the ${typeName} object
\t */`;

	const buildPartialJSDoc = options.includeJSDoc
		? `\t/**
\t * Build a partial ${typeName} object without validation
\t * @returns The partial ${typeName} object
\t */`
		: `\t/**
\t * Build partial ${typeName} object
\t */`;

	const buildMethod = `${buildMethodJSDoc}
\tbuild(): ${typeName} {
\t\t${buildBody}
\t}`;

	const buildPartialMethod = options.supportPartialBuild
		? `

${buildPartialJSDoc}
\tbuildPartial(): Partial<${typeName}> {
\t\treturn {
${assignments}
\t\t} as Partial<${typeName}>;
\t}`
		: "";

	return buildMethod + buildPartialMethod;
}

/**
 * Generate enhanced factory methods
 */
function generateFactoryMethods(
	className: string,
	typeName: string,
	options: Required<BuilderGenerationOptions>,
): string {
	const jsDocCreate = options.includeJSDoc
		? `\t/**
\t * Create a new ${className} instance
\t * @param initial - Optional initial values
\t * @returns A new ${className} instance
\t */`
		: `\t/**
\t * Create a new builder instance
\t */`;

	const jsDocFrom = options.includeJSDoc
		? `\t/**
\t * Create a builder from an existing ${typeName} object
\t * @param obj - The existing ${typeName} object
\t * @returns A new ${className} instance populated with the object's values
\t */`
		: `\t/**
\t * Create a builder from an existing object
\t */`;

	const jsDocEmpty = options.includeJSDoc
		? `\t/**
\t * Create an empty ${className} instance
\t * @returns A new empty ${className} instance
\t */`
		: `\t/**
\t * Create an empty builder instance
\t */`;

	return `${jsDocCreate}
\tstatic create(initial?: Partial<${typeName}>): ${className} {
\t\treturn new ${className}(initial);
\t}

${jsDocFrom}
\tstatic from(obj: ${typeName}): ${className} {
\t\treturn new ${className}(obj);
\t}

${jsDocEmpty}
\tstatic empty(): ${className} {
\t\treturn new ${className}();
\t}`;
}

/**
 * Generate builder interface
 */
function generateBuilderInterface(
	schema: AnyTypeSchema,
	options: Required<BuilderGenerationOptions>,
): string {
	if (!("identifier" in schema) || !("fields" in schema) || !schema.fields) {
		return "";
	}

	const interfaceName = `I${schema.identifier.name}Builder`;
	const typeName = schema.identifier.name;
	const methods = generateBuilderInterfaceMethods(schema.fields, options);

	return `/**
 * Interface for ${typeName} builder
 */
export interface ${interfaceName} {
${methods}
	
	/**
	 * Build the ${typeName} object
	 */
	build(): ${typeName};
}`;
}

/**
 * Generate builder interface methods
 */
function generateBuilderInterfaceMethods(
	fields: Record<string, TypeSchemaField>,
	options: Required<BuilderGenerationOptions>,
): string {
	const methods: string[] = [];

	for (const [fieldName, field] of Object.entries(fields)) {
		const paramType = getBuilderFieldType(field);
		const returnType = options.fluent ? "this" : "void";

		methods.push(`\t/**
\t * Set ${fieldName}
\t */
\t${fieldName}(${fieldName}: ${paramType}): ${returnType};`);
	}

	return methods.join("\n\n");
}

/**
 * Generate validation methods for builders
 */
function generateValidationMethods(
	_typeName: string,
	fields: Record<string, TypeSchemaField>,
	options: Required<BuilderGenerationOptions>,
): string {
	if (!options.includeValidation) return "";

	const jsDoc = options.includeJSDoc
		? `\t/**
\t * Validate the current state of the builder
\t * @returns Validation result with any errors
\t */`
		: `\t/**
\t * Validate builder state
\t */`;

	// Generate field validation checks
	const validationChecks = Object.entries(fields)
		.map(([fieldName, field]) => {
			if (field.required) {
				return `\t\tif (this._${fieldName} === undefined || this._${fieldName} === null) {\n\t\t\terrors.push('Field "${fieldName}" is required');\n\t\t}`;
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");

	return `${jsDoc}
\tvalidate(): { isValid: boolean; errors: string[] } {
\t\tconst errors: string[] = [];
\t\t
\t\t// Add field-specific validation
${validationChecks}
\t\t
\t\treturn { isValid: errors.length === 0, errors };
\t}`;
}

/**
 * Generate helper methods for common FHIR patterns
 */
function generateHelperMethods(
	typeName: string,
	fields: Record<string, TypeSchemaField>,
	options: Required<BuilderGenerationOptions>,
): string {
	if (!options.includeHelperMethods) return "";

	const methods: string[] = [];

	// Add clone method
	const cloneJSDoc = options.includeJSDoc
		? `\t/**
\t * Create a copy of this builder
\t * @returns A new builder instance with the same values
\t */`
		: `\t/**
\t * Clone this builder
\t */`;

	methods.push(`${cloneJSDoc}
\tclone(): ${typeName}Builder {
\t\treturn new ${typeName}Builder(this.buildPartial());
\t}`);

	// Add reset method
	const resetReturnType = options.fluent ? "this" : "void";
	const resetReturnStatement = options.fluent ? "\n\t\treturn this;" : "";
	const resetJSDoc = options.includeJSDoc
		? `\t/**
\t * Reset all fields to undefined
\t * ${options.fluent ? "@returns This builder instance for method chaining" : ""}
\t */`
		: `\t/**
\t * Reset all fields
\t */`;

	const resetBody = Object.keys(fields)
		.map((fieldName) => `\t\tthis._${fieldName} = undefined;`)
		.join("\n");

	methods.push(`${resetJSDoc}
\treset(): ${resetReturnType} {
${resetBody}${resetReturnStatement}
\t}`);

	// Add merge method
	const mergeReturnType = options.fluent ? "this" : "void";
	const mergeReturnStatement = options.fluent ? "\n\t\treturn this;" : "";
	const mergeJSDoc = options.includeJSDoc
		? `\t/**
\t * Merge values from another partial object
\t * @param other - The object to merge values from
\t * ${options.fluent ? "@returns This builder instance for method chaining" : ""}
\t */`
		: `\t/**
\t * Merge values from another object
\t */`;

	methods.push(`${mergeJSDoc}
\tmerge(other: Partial<${typeName}>): ${mergeReturnType} {
\t\tObject.entries(other).forEach(([key, value]) => {
\t\t\tif (value !== undefined) {
\t\t\t\t(this as any)[\`_\${key}\`] = value;
\t\t\t}
\t\t});${mergeReturnStatement}
\t}`);

	return methods.join("\n\n");
}

/**
 * Generate factory function for the schema
 */
function generateFactoryFunction(
	schema: AnyTypeSchema,
	options: Required<BuilderGenerationOptions>,
): string {
	if (!options.generateFactories || !("identifier" in schema)) return "";

	const typeName = schema.identifier.name;
	const functionName = `create${typeName}`;

	const jsDoc = options.includeJSDoc
		? `/**
 * Create a new ${typeName} builder instance
 * @param initial - Optional initial values
 * @returns A new ${typeName}Builder instance
 */`
		: `/**
 * Create ${typeName} builder
 */`;

	return `${jsDoc}
export function ${functionName}(initial?: Partial<${typeName}>): ${typeName}Builder {
\treturn new ${typeName}Builder(initial);
}`;
}

/**
 * Generate utility functions
 */
function generateUtilityFunctions(
	options: Required<BuilderGenerationOptions>,
): string {
	if (!options.includeTypeGuards) return "";

	return `/**
 * Utility functions for builder pattern
 */

/**
 * Type guard to check if an object is a builder
 */
export function isBuilder<T>(obj: unknown): obj is { build(): T } {
\treturn obj && typeof obj === 'object' && 'build' in obj && typeof (obj as any).build === 'function';
}`;
}

/**
 * Generate enhanced helper types
 */
function generateHelperTypes(
	options: Required<BuilderGenerationOptions>,
): string {
	const baseTypes = `/**
 * Enhanced helper types for builders
 */
export type BuilderOptions = {
\t/** Enable validation */
\tvalidate?: boolean;
\t/** Strict mode */
\tstrict?: boolean;
\t/** Include partial build support */
\tpartialBuild?: boolean;
};

/**
 * Base builder interface with enhanced features
 */
export interface IBuilder<T> {
\tbuild(): T;
\tbuildPartial(): Partial<T>;
\tvalidate?(): { isValid: boolean; errors: string[] };
\tclone?(): IBuilder<T>;
\treset?(): IBuilder<T>;
}`;

	const validationTypes = options.includeValidation
		? `

/**
 * Validation result interface
 */
export interface ValidationResult {
\tisValid: boolean;
\terrors: string[];
\twarnings?: string[];
}`
		: "";

	return baseTypes + validationTypes;
}

/**
 * Get TypeScript type for builder field
 */
function getBuilderFieldType(field: TypeSchemaField): string {
	// Handle choice types
	if ("choices" in field && field.choices) {
		const choiceTypes = field.choices.map((choice) =>
			mapTypeToTypeScript(choice),
		);
		return choiceTypes.join(" | ");
	}

	// Handle arrays
	if (field.array) {
		const baseType = getFieldType(field);
		return `${baseType}[]`;
	}

	// Handle references
	if ("reference" in field && field.reference) {
		return "Reference";
	}

	// Handle enums
	if ("enum" in field && field.enum) {
		return field.enum.map((value) => `"${value}"`).join(" | ");
	}

	return getFieldType(field);
}

/**
 * Get field type from TypeSchemaField
 */
function getFieldType(field: TypeSchemaField): string {
	if ("type" in field && field.type) {
		return mapTypeToTypeScript(field.type.name || "string");
	}
	return "string";
}

/**
 * Get element type for array fields
 */
function getElementType(field: TypeSchemaField): string {
	if ("choices" in field && field.choices) {
		return field.choices.join(" | ");
	}

	return getFieldType(field);
}

/**
 * Map FHIR type to TypeScript type
 */
function mapTypeToTypeScript(fhirType: string): string {
	const primitiveMapping: Record<string, string> = {
		string: "string",
		boolean: "boolean",
		integer: "number",
		decimal: "number",
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
		unsignedInt: "number",
		positiveInt: "number",
		xhtml: "string",
	};

	return primitiveMapping[fhirType] || fhirType;
}

/**
 * Generate field validation for builder method
 */
function generateFieldValidation(
	fieldName: string,
	field: TypeSchemaField,
): string {
	const validations: string[] = [];

	// Required field validation
	if (field.required) {
		validations.push(`if (${fieldName} == null) {
			throw new Error('Field "${fieldName}" is required');
		}`);
	}

	// Array validation
	if (field.array) {
		validations.push(`if (${fieldName} != null && !Array.isArray(${fieldName})) {
			throw new Error('Field "${fieldName}" must be an array');
		}`);

		if ("min" in field && field.min !== undefined) {
			validations.push(`if (${fieldName} && ${fieldName}.length < ${field.min}) {
			throw new Error('Field "${fieldName}" must have at least ${field.min} items');
		}`);
		}

		if ("max" in field && field.max !== undefined) {
			validations.push(`if (${fieldName} && ${fieldName}.length > ${field.max}) {
			throw new Error('Field "${fieldName}" must have at most ${field.max} items');
		}`);
		}
	}

	return validations.join("\n\t\t");
}

/**
 * Capitalize first letter of string
 */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Helper to get a better singular name from plural field names
 */
function getSingularName(fieldName: string): string {
	if (fieldName.endsWith("ies")) {
		return `${fieldName.slice(0, -3)}y`;
	}
	if (fieldName.endsWith("s")) {
		return fieldName.slice(0, -1);
	}
	return `${fieldName}Item`;
}

/**
 * Generate file header
 */
function generateBuilderHeader(): string {
	const timestamp = new Date().toISOString();

	return `/**
 * FHIR Builder Classes
 * 
 * Auto-generated fluent builder classes for FHIR resources and types.
 * Generated at: ${timestamp}
 * 
 * WARNING: This file is auto-generated. Do not modify manually.
 */

/* eslint-disable */`;
}
