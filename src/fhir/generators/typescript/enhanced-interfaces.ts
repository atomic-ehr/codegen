/**
 * Enhanced TypeScript Interface Generator
 *
 * Generates rich TypeScript interfaces for FHIR resources with advanced features:
 * - Branded types for type-safe IDs
 * - Discriminated unions for choice types
 * - Literal types for fixed values
 * - Rich JSDoc with examples and FHIR paths
 * - Helper types for common patterns
 * - Type-safe references with autocomplete
 */

import type {
	AnyTypeSchema,
	TypeSchemaField,
	TypeSchemaFieldPolymorphicDeclaration,
	TypeSchemaFieldPolymorphicInstance,
	TypeSchemaFieldRegular,
	TypeSchemaIdentifier,
} from "../../../typeschema/types";

/**
 * Enhanced interface generator options
 */
export interface InterfaceGeneratorOptions {
	// Documentation
	includeJSDoc: boolean;
	includeExamples: boolean;
	includeFHIRPath: boolean;

	// Type features
	useBrandedTypes: boolean;
	useNominalTypes: boolean;
	useDiscriminatedUnions: boolean;
	useLiteralTypes: boolean;

	// Utility types
	generatePartialTypes: boolean;
	generateRequiredTypes: boolean;
	generatePickTypes: boolean;

	// Output options
	strictReferences: boolean;
	readonly: boolean;
	targetVersion: "4.1" | "4.5" | "5.0";
}

/**
 * Default options for enhanced interface generation
 */
export const DEFAULT_INTERFACE_OPTIONS: InterfaceGeneratorOptions = {
	// Documentation
	includeJSDoc: true,
	includeExamples: true,
	includeFHIRPath: true,

	// Type features
	useBrandedTypes: true,
	useNominalTypes: false,
	useDiscriminatedUnions: true,
	useLiteralTypes: true,

	// Utility types
	generatePartialTypes: true,
	generateRequiredTypes: true,
	generatePickTypes: false,

	// Output options
	strictReferences: true,
	readonly: false,
	targetVersion: "5.0",
};

/**
 * Enhanced TypeScript interface generation result
 */
export interface EnhancedInterfaceResult {
	content: string;
	imports: string[];
	exports: string[];
	helperTypes: string[];
	brandedTypes: string[];
}

/**
 * Enhanced TypeScript Interface Generator
 */
export class EnhancedInterfaceGenerator {
	private options: InterfaceGeneratorOptions;
	private imports = new Set<string>();
	private exports = new Set<string>();
	private helperTypes = new Set<string>();
	private brandedTypes = new Set<string>();

	constructor(options: Partial<InterfaceGeneratorOptions> = {}) {
		this.options = { ...DEFAULT_INTERFACE_OPTIONS, ...options };
	}

	/**
	 * Generate enhanced TypeScript interfaces from schemas
	 */
	generateInterfaces(schemas: AnyTypeSchema[]): EnhancedInterfaceResult {
		this.reset();

		const interfaces: string[] = [];
		const sortedSchemas = this.sortSchemasByDependency(schemas);

		// Generate branded types first if enabled
		if (this.options.useBrandedTypes) {
			const brandedTypesContent =
				this.generateBrandedTypesForSchemas(sortedSchemas);
			if (brandedTypesContent) {
				interfaces.push(brandedTypesContent);
			}
		}

		// Generate main interfaces
		for (const schema of sortedSchemas) {
			const interfaceContent = this.generateInterface(schema);
			if (interfaceContent) {
				interfaces.push(interfaceContent);
			}
		}

		// Generate helper types if enabled
		if (
			this.options.generatePartialTypes ||
			this.options.generateRequiredTypes
		) {
			const helperTypesContent =
				this.generateHelperTypesForSchemas(sortedSchemas);
			if (helperTypesContent) {
				interfaces.push(helperTypesContent);
			}
		}

		const content = interfaces.join("\n\n");

		return {
			content,
			imports: Array.from(this.imports),
			exports: Array.from(this.exports),
			helperTypes: Array.from(this.helperTypes),
			brandedTypes: Array.from(this.brandedTypes),
		};
	}

	/**
	 * Generate a single enhanced TypeScript interface
	 */
	private generateInterface(schema: AnyTypeSchema): string {
		if (!this.hasValidIdentifier(schema)) return "";

		const interfaceName = this.formatTypeName(schema.identifier.name);
		this.exports.add(interfaceName);

		// Generate JSDoc documentation
		const documentation = this.options.includeJSDoc
			? this.generateJSDocForSchema(schema)
			: "";

		if (this.isResourceOrComplexType(schema)) {
			return this.generateResourceInterface(
				schema,
				interfaceName,
				documentation,
			);
		}

		if (schema.identifier.kind === "primitive-type") {
			return this.generatePrimitiveType(schema, interfaceName, documentation);
		}

		return "";
	}

	/**
	 * Generate interface for resource or complex type
	 */
	private generateResourceInterface(
		schema: AnyTypeSchema,
		interfaceName: string,
		documentation: string,
	): string {
		const parts: string[] = [];

		// Add documentation
		if (documentation) {
			parts.push(documentation);
		}

		// Special handling for Reference type - make it generic
		if (interfaceName === "Reference") {
			return this.generateGenericReferenceInterface(schema, documentation);
		}

		// Generate interface declaration
		const extendsClause = this.generateExtendsClause(schema);
		parts.push(`export interface ${interfaceName}${extendsClause} {`);

		// Add resourceType for resources with literal type
		if (schema.identifier.kind === "resource" && this.options.useLiteralTypes) {
			parts.push(`  resourceType: '${interfaceName}';`);
		}

		// Generate fields
		if (this.hasFields(schema)) {
			const fields = this.generateFields(schema.fields, interfaceName);
			if (fields.length > 0) {
				parts.push(...fields.map((field) => `  ${field}`));
			}
		}

		parts.push("}");

		return parts.join("\n");
	}

	/**
	 * Generate generic Reference interface with type constraints
	 */
	private generateGenericReferenceInterface(
		schema: AnyTypeSchema,
		documentation: string,
	): string {
		const parts: string[] = [];

		if (documentation) {
			parts.push(documentation);
		} else {
			parts.push(`/**`);
			parts.push(` * Generic Reference type with resource type constraint`);
			parts.push(
				` * T represents the FHIR resource type (e.g., 'Patient', 'Organization')`,
			);
			parts.push(` * @see https://hl7.org/fhir/R4/references.html`);
			parts.push(` */`);
		}

		parts.push("export interface Reference<T extends string = string> {");

		if (this.hasFields(schema)) {
			for (const [fieldName, field] of Object.entries(schema.fields)) {
				const optional = !this.isRequired(field) ? "?" : "";
				let typeString: string;

				if (fieldName === "reference" && this.options.strictReferences) {
					// Type-safe reference with template literal type
					typeString = "`${T}/${string}`";
				} else if (fieldName === "type") {
					// Use the generic parameter for type field
					typeString = "T";
				} else {
					// Regular field type generation
					typeString = this.generateFieldType(field, "Reference");
				}

				const fieldDoc = this.generateFieldDocumentation(field, fieldName);
				if (fieldDoc) {
					parts.push(`  ${fieldDoc}`);
				}
				parts.push(`  ${fieldName}${optional}: ${typeString};`);
			}
		}

		parts.push("}");
		return parts.join("\n");
	}

	/**
	 * Generate interface fields with enhanced features
	 */
	private generateFields(
		fields: Record<string, TypeSchemaField>,
		parentTypeName: string,
	): string[] {
		const fieldLines: string[] = [];

		for (const [fieldName, field] of Object.entries(fields)) {
			// Handle polymorphic (choice) fields
			if (this.isPolymorphicDeclaration(field)) {
				const choiceFields = this.generatePolymorphicFields(
					fieldName,
					field,
					parentTypeName,
				);
				fieldLines.push(...choiceFields);
			} else if (this.isPolymorphicInstance(field)) {
				const instanceField = this.generatePolymorphicInstanceField(
					fieldName,
					field,
					parentTypeName,
				);
				fieldLines.push(...instanceField);
			} else {
				const regularField = this.generateRegularField(
					fieldName,
					field,
					parentTypeName,
				);
				fieldLines.push(...regularField);
			}
		}

		return fieldLines;
	}

	/**
	 * Generate polymorphic (choice) fields with discriminated unions
	 */
	private generatePolymorphicFields(
		fieldName: string,
		field: TypeSchemaFieldPolymorphicDeclaration,
		_parentTypeName: string,
	): string[] {
		if (!this.options.useDiscriminatedUnions) {
			// Fallback to individual choice fields
			return field.choices.map((choice) => {
				const choiceFieldName = `${fieldName}${this.capitalize(choice)}`;
				const choiceType = this.mapTypeToTypeScript(choice);
				const optional = !this.isRequired(field) ? "?" : "";
				return `${choiceFieldName}${optional}: ${choiceType};`;
			});
		}

		// Generate discriminated union
		const unionTypes = field.choices.map((choice) => {
			const choiceType = this.mapTypeToTypeScript(choice);
			return `{ type: '${choice}'; ${fieldName}${this.capitalize(choice)}: ${choiceType} }`;
		});

		const optional = !this.isRequired(field) ? "?" : "";
		const fieldDoc = this.generateFieldDocumentation(field, fieldName);
		const lines: string[] = [];

		if (fieldDoc) {
			lines.push(fieldDoc);
		}

		lines.push(`${fieldName}${optional}: ${unionTypes.join(" | ")};`);
		return lines;
	}

	/**
	 * Generate polymorphic instance field
	 */
	private generatePolymorphicInstanceField(
		fieldName: string,
		field: TypeSchemaFieldPolymorphicInstance,
		parentTypeName: string,
	): string[] {
		const lines: string[] = [];
		const optional = !this.isRequired(field) ? "?" : "";
		const fieldType = this.generateFieldType(field, parentTypeName);
		const fieldDoc = this.generateFieldDocumentation(field, fieldName);

		if (fieldDoc) {
			lines.push(fieldDoc);
		}

		lines.push(`${fieldName}${optional}: ${fieldType};`);
		return lines;
	}

	/**
	 * Generate regular field with enhanced type safety
	 */
	private generateRegularField(
		fieldName: string,
		field: TypeSchemaFieldRegular,
		parentTypeName: string,
	): string[] {
		const lines: string[] = [];
		const optional = !this.isRequired(field) ? "?" : "";
		const readonly = this.options.readonly ? "readonly " : "";
		const fieldType = this.generateFieldType(field, parentTypeName);
		const fieldDoc = this.generateFieldDocumentation(field, fieldName);

		if (fieldDoc) {
			lines.push(fieldDoc);
		}

		lines.push(`${readonly}${fieldName}${optional}: ${fieldType};`);
		return lines;
	}

	/**
	 * Generate enhanced field type with branded types and literal types
	 */
	private generateFieldType(
		field: TypeSchemaField,
		parentTypeName: string,
	): string {
		// Handle literal enum values
		if (this.hasEnum(field) && this.options.useLiteralTypes) {
			return field.enum
				?.map((value) => `'${this.escapeString(value)}'`)
				.join(" | ");
		}

		// Handle references with type safety
		if (this.hasReference(field)) {
			return this.generateReferenceType(field.reference!, parentTypeName);
		}

		// Handle arrays
		if (field.array) {
			const baseType = this.getFieldBaseType(field, parentTypeName);
			return `${baseType}[]`;
		}

		return this.getFieldBaseType(field, parentTypeName);
	}

	/**
	 * Get base type for a field
	 */
	private getFieldBaseType(
		field: TypeSchemaField,
		parentTypeName: string,
	): string {
		if (this.hasType(field)) {
			const typeName = field.type?.name;

			// Use branded types for ID fields
			if (
				this.options.useBrandedTypes &&
				this.isIdField(typeName, parentTypeName)
			) {
				const brandedType = `${parentTypeName}Id`;
				this.brandedTypes.add(brandedType);
				return brandedType;
			}

			return this.mapTypeToTypeScript(typeName);
		}

		return "any";
	}

	/**
	 * Generate type-safe reference types
	 */
	private generateReferenceType(
		references: TypeSchemaIdentifier[],
		_parentTypeName: string,
	): string {
		if (!this.options.strictReferences) {
			return "Reference";
		}

		this.imports.add("Reference");

		if (references.length === 1 && references[0]?.name) {
			const refTypeName = references[0].name;
			return `Reference<'${refTypeName}'>`;
		}

		// Multiple reference types - create union
		const refTypes = references.map((ref) => `'${ref.name}'`).join(" | ");
		return `Reference<${refTypes}>`;
	}

	/**
	 * Generate field documentation with FHIR paths and enhanced info
	 */
	private generateFieldDocumentation(
		field: TypeSchemaField,
		_fieldName: string,
	): string {
		if (!this.options.includeJSDoc) return "";

		const parts: string[] = [];

		// Add description
		if (field.description) {
			parts.push(field.description);
		}

		// Add FHIR path if enabled
		if (this.options.includeFHIRPath) {
			// For polymorphic instances, include choice information
			if (this.isPolymorphicInstance(field) && field.choiceOf) {
				parts.push(`@fhirpath ${field.choiceOf}[x]`);
			}
		}

		// Add cardinality information
		if (field.min !== undefined || field.max !== undefined) {
			const min = field.min ?? 0;
			const max = field.max ?? (field.array ? "*" : "1");
			parts.push(`@cardinality ${min}..${max}`);
		}

		// Add binding information
		if (this.hasBinding(field)) {
			parts.push(`@binding ${field.binding?.name}`);
		}

		if (parts.length === 0) return "";

		if (parts.length === 1) {
			return `/** ${parts[0]} */`;
		}

		const docLines = ["/**", ...parts.map((part) => ` * ${part}`), " */"];

		return docLines.join("\n");
	}

	/**
	 * Generate JSDoc for schema
	 */
	private generateJSDocForSchema(schema: AnyTypeSchema): string {
		const parts: string[] = [];
		const description = this.getSchemaDescription(schema);

		if (description) {
			parts.push(`/**`);
			parts.push(` * ${description}`);

			if (this.options.includeExamples) {
				const example = this.generateExample(schema);
				if (example) {
					parts.push(` *`);
					parts.push(` * @example`);
					parts.push(` * \`\`\`typescript`);
					parts.push(...example.split("\n").map((line) => ` * ${line}`));
					parts.push(` * \`\`\``);
				}
			}

			parts.push(` * @see ${schema.identifier.url}`);
			parts.push(` */`);
		}

		return parts.join("\n");
	}

	/**
	 * Generate example for schema
	 */
	private generateExample(schema: AnyTypeSchema): string {
		if (!this.hasValidIdentifier(schema)) return "";

		const typeName = this.formatTypeName(schema.identifier.name);

		if (schema.identifier.kind === "resource") {
			return `const ${typeName.toLowerCase()}: ${typeName} = {\n  resourceType: '${typeName}',\n  // ... other properties\n};`;
		}

		return `const ${typeName.toLowerCase()}: ${typeName} = {\n  // ... properties\n};`;
	}

	/**
	 * Generate branded types for schemas
	 */
	private generateBrandedTypesForSchemas(schemas: AnyTypeSchema[]): string {
		const brandedTypes: string[] = [];

		for (const schema of schemas) {
			if (
				this.hasValidIdentifier(schema) &&
				schema.identifier.kind === "resource"
			) {
				const typeName = this.formatTypeName(schema.identifier.name);
				brandedTypes.push(
					`export type ${typeName}Id = string & { readonly __brand: '${typeName}Id' };`,
				);
				this.brandedTypes.add(`${typeName}Id`);
			}
		}

		if (brandedTypes.length === 0) return "";

		const parts = ["// Branded ID types for type safety", ...brandedTypes];

		return parts.join("\n");
	}

	/**
	 * Generate helper types for schemas
	 */
	private generateHelperTypesForSchemas(schemas: AnyTypeSchema[]): string {
		const helperTypes: string[] = [];

		for (const schema of schemas) {
			if (
				this.hasValidIdentifier(schema) &&
				schema.identifier.kind === "resource"
			) {
				const typeName = this.formatTypeName(schema.identifier.name);

				if (this.options.generatePartialTypes) {
					helperTypes.push(
						`export type Create${typeName} = Omit<${typeName}, 'id' | 'meta'>;`,
					);
					this.helperTypes.add(`Create${typeName}`);
				}

				if (this.options.generateRequiredTypes) {
					helperTypes.push(
						`export type Update${typeName} = Partial<${typeName}> & Pick<${typeName}, 'id'>;`,
					);
					this.helperTypes.add(`Update${typeName}`);
				}
			}
		}

		if (helperTypes.length === 0) return "";

		const parts = ["// Helper types for common patterns", ...helperTypes];

		return parts.join("\n");
	}

	/**
	 * Generate primitive type definition
	 */
	private generatePrimitiveType(
		_schema: AnyTypeSchema,
		typeName: string,
		documentation: string,
	): string {
		const parts: string[] = [];

		if (documentation) {
			parts.push(documentation);
		}

		const tsType = this.mapTypeToTypeScript(typeName);
		parts.push(`export type ${typeName} = ${tsType};`);

		return parts.join("\n");
	}

	/**
	 * Generate extends clause for interface inheritance
	 */
	private generateExtendsClause(schema: AnyTypeSchema): string {
		if (this.hasBase(schema)) {
			const baseTypeName = this.formatTypeName(schema.base?.name);
			this.imports.add(baseTypeName);
			return ` extends ${baseTypeName}`;
		}

		// Default base types for FHIR resources
		if (schema.identifier.kind === "resource") {
			this.imports.add("DomainResource");
			return " extends DomainResource";
		}

		if (schema.identifier.kind === "complex-type") {
			this.imports.add("Element");
			return " extends Element";
		}

		return "";
	}

	/**
	 * Map FHIR type to TypeScript type with enhanced mappings
	 */
	private mapTypeToTypeScript(fhirType: string): string {
		const primitiveMapping: Record<string, string> = {
			// String types
			string: "string",
			code: "string",
			uri: "string",
			url: "string",
			canonical: "string",
			oid: "string",
			uuid: "string",
			id: "string",
			markdown: "string",
			xhtml: "string",
			base64Binary: "string",

			// Numeric types
			integer: "number",
			unsignedInt: "number",
			positiveInt: "number",
			decimal: "number",

			// Boolean type
			boolean: "boolean",

			// Date/time types (as strings for JSON compatibility)
			date: "string",
			dateTime: "string",
			instant: "string",
			time: "string",
		};

		return primitiveMapping[fhirType] || this.formatTypeName(fhirType);
	}

	/**
	 * Sort schemas by dependency order to ensure proper interface generation
	 */
	private sortSchemasByDependency(schemas: AnyTypeSchema[]): AnyTypeSchema[] {
		const sorted: AnyTypeSchema[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const visit = (schema: AnyTypeSchema) => {
			if (!this.hasValidIdentifier(schema)) return;

			const key = schema.identifier.name;
			if (visited.has(key) || visiting.has(key)) return;

			visiting.add(key);

			// Visit base type first if it exists
			if (this.hasBase(schema)) {
				const baseSchema = schemas.find(
					(s) =>
						this.hasValidIdentifier(s) &&
						s.identifier.name === schema.base?.name,
				);
				if (baseSchema) {
					visit(baseSchema);
				}
			}

			visiting.delete(key);
			visited.add(key);
			sorted.push(schema);
		};

		schemas.forEach(visit);
		return sorted;
	}

	/**
	 * Get description from schema safely
	 */
	private getSchemaDescription(schema: AnyTypeSchema): string | undefined {
		if ("description" in schema) {
			return schema.description;
		}
		return `FHIR ${schema.identifier.name}`;
	}

	/**
	 * Reset internal state for new generation
	 */
	private reset(): void {
		this.imports.clear();
		this.exports.clear();
		this.helperTypes.clear();
		this.brandedTypes.clear();
	}

	// Utility methods and type guards

	private hasValidIdentifier(
		schema: AnyTypeSchema,
	): schema is AnyTypeSchema & { identifier: TypeSchemaIdentifier } {
		return "identifier" in schema && !!schema.identifier;
	}

	private isResourceOrComplexType(schema: AnyTypeSchema): boolean {
		return (
			this.hasValidIdentifier(schema) &&
			["resource", "complex-type", "nested"].includes(schema.identifier.kind)
		);
	}

	private hasFields(
		schema: AnyTypeSchema,
	): schema is AnyTypeSchema & { fields: Record<string, TypeSchemaField> } {
		return "fields" in schema && !!schema.fields;
	}

	private hasBase(
		schema: AnyTypeSchema,
	): schema is AnyTypeSchema & { base: TypeSchemaIdentifier } {
		return "base" in schema && !!schema.base;
	}

	private isPolymorphicDeclaration(
		field: TypeSchemaField,
	): field is TypeSchemaFieldPolymorphicDeclaration {
		return "choices" in field;
	}

	private isPolymorphicInstance(
		field: TypeSchemaField,
	): field is TypeSchemaFieldPolymorphicInstance {
		return "choiceOf" in field;
	}

	private isRequired(field: TypeSchemaField): boolean {
		return field.required === true;
	}

	private hasEnum(
		field: TypeSchemaField,
	): field is TypeSchemaField & { enum: string[] } {
		return (
			"enum" in field && Array.isArray(field.enum) && field.enum.length > 0
		);
	}

	private hasReference(
		field: TypeSchemaField,
	): field is TypeSchemaField & { reference: TypeSchemaIdentifier[] } {
		return (
			"reference" in field &&
			Array.isArray(field.reference) &&
			field.reference.length > 0
		);
	}

	private hasType(
		field: TypeSchemaField,
	): field is TypeSchemaField & { type: TypeSchemaIdentifier } {
		return "type" in field && !!field.type;
	}

	private hasBinding(
		field: TypeSchemaField,
	): field is TypeSchemaField & { binding: TypeSchemaIdentifier } {
		return "binding" in field && !!field.binding;
	}

	private isIdField(typeName: string, _parentTypeName: string): boolean {
		return typeName === "id" || typeName.toLowerCase().endsWith("id");
	}

	private formatTypeName(name: string): string {
		// Convert to PascalCase
		return name.charAt(0).toUpperCase() + name.slice(1);
	}

	private capitalize(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	private escapeString(str: string): string {
		return str.replace(/'/g, "\\'");
	}
}

/**
 * Convenience function to generate enhanced TypeScript interfaces
 */
export function generateEnhancedInterfaces(
	schemas: AnyTypeSchema[],
	options: Partial<InterfaceGeneratorOptions> = {},
): EnhancedInterfaceResult {
	const generator = new EnhancedInterfaceGenerator(options);
	return generator.generateInterfaces(schemas);
}
