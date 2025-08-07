/**
 * TypeSchema to TypeScript Transformer
 *
 * Transforms TypeSchema documents into TypeScript interface definitions.
 * Generates clean, type-safe TypeScript code from TypeSchema specifications.
 *
 * Key improvements:
 * - Better FHIR primitive type mapping
 * - Enhanced reference handling with union types
 * - Improved field processing leveraging TypeSchema structure
 * - Extension support with proper detection
 * - Optimized import management
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toPascalCase } from "../core/utils/naming";
import type {
	AnyTypeSchema,
	TypeSchema,
	TypeSchemaBinding,
	TypeSchemaField,
	TypeSchemaFieldPolymorphicDeclaration,
	TypeSchemaFieldPolymorphicInstance,
	TypeSchemaFieldRegular,
	TypeSchemaIdentifier,
	TypeSchemaNestedType,
	TypeSchemaProfile,
	TypeSchemaValueSet,
	TypeScriptGeneratorOptions,
} from "./types";

/**
 * Mapping of FHIR primitive types to TypeScript types
 */
const PRIMITIVE_TYPE_MAP: Record<string, string> = {
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

	// Complex primitive types that need wrapper types
	// These are typically handled as complex types in FHIR
};

/**
 * Extension field patterns for detection
 */
const EXTENSION_PATTERNS = {
	field: /^extension$/,
	modifierExtension: /^modifierExtension$/,
	primitive: /^_[a-zA-Z]/,
	custom: /Extension$/,
};

/**
 * TypeScript code generation result
 */
export interface GeneratedTypeScript {
	content: string;
	imports: string[];
	exports: string[];
	filename: string;
}

/**
 * TypeSchema to TypeScript Transformer class
 *
 * Converts TypeSchema documents to TypeScript interface definitions
 * with proper imports, exports, and type safety.
 */
export class TypeScriptTransformer {
	private options: Required<TypeScriptGeneratorOptions>;
	private generatedTypes = new Set<string>();
	private imports = new Map<string, TypeSchemaIdentifier>();
	private currentSchemaName?: string;

	constructor(options: TypeScriptGeneratorOptions = {}) {
		this.options = {
			outputDir: "./generated",
			moduleFormat: "esm",
			generateIndex: true,
			includeDocuments: true,
			namingConvention: "PascalCase",
			includeExtensions: false,
			includeProfiles: true,
			...options,
		};
	}

	/**
	 * Transform a single TypeSchema to TypeScript with validation
	 */
	async transformSchema(schema: AnyTypeSchema): Promise<GeneratedTypeScript> {
		// Skip valueset and binding file generation entirely
		if (this.isValueSetSchema(schema) || this.isBindingSchema(schema)) {
			return {
				content: "",
				imports: [],
				exports: [],
				filename: "",
			};
		}

		// Validate schema before processing
		this.validateSchema(schema);

		// Clear state for new transformation
		this.generatedTypes.clear();
		this.imports.clear();
		this.currentSchemaName = this.formatTypeName(schema.identifier.name);

		// Generate TypeScript content
		const content = this.generateTypeScriptForSchema(schema);
		const imports = Array.from(this.imports.keys());
		const filename = this.getFilename(schema.identifier);
		const exports = this.getExports(schema);

		const result: GeneratedTypeScript = {
			content,
			imports,
			exports,
			filename,
		};

		// Log stats in development
		this.logTransformationStats(schema, result);

		return result;
	}

	/**
	 * Get exports for a schema
	 */
	private getExports(schema: AnyTypeSchema): string[] {
		const exports = [this.formatTypeName(schema.identifier.name)];

		// Add nested type exports with resource prefixing
		if ("nested" in schema && schema.nested) {
			const resourceName = this.isTypeSchema(schema)
				? this.extractResourceNameFromSchema(schema)
				: null;
			for (const nested of schema.nested) {
				if (resourceName) {
					// Use the prefixed nested type name
					const prefixedName = this.generateNestedTypeName(
						nested,
						resourceName,
					);
					exports.push(prefixedName);
				} else {
					// Fallback to original naming
					exports.push(this.formatTypeName(nested.identifier.name));
				}
			}
		}

		// Add concept/value exports for value sets
		if (this.isValueSetSchema(schema) && schema.concept) {
			const typeName = this.formatTypeName(schema.identifier.name);
			exports.push(`${typeName}Concepts`, `${typeName}Code`);
		}

		// Add value exports for bindings
		if (this.isBindingSchema(schema) && schema.enum) {
			const typeName = this.formatTypeName(schema.identifier.name);
			exports.push(`${typeName}Values`);
		}

		return exports;
	}

	/**
	 * Check if schema is a TypeSchema (has fields and can have nested types)
	 */
	private isTypeSchema(schema: AnyTypeSchema): schema is TypeSchema {
		return "fields" in schema && "nested" in schema;
	}

	/**
	 * Transform multiple TypeSchemas to TypeScript files
	 */
	async transformSchemas(
		schemas: AnyTypeSchema[],
	): Promise<GeneratedTypeScript[]> {
		const results: GeneratedTypeScript[] = [];

		for (const schema of schemas) {
			// Check if profiles should be included
			if (
				schema.identifier.kind === "profile" &&
				!this.options.includeProfiles
			) {
				continue;
			}

			const result = await this.transformSchema(schema);

			// Skip empty results (from valuesets/bindings)
			if (result.filename === "" || result.content === "") {
				continue;
			}

			results.push(result);
		}

		return results;
	}

	/**
	 * Generate TypeScript and write to files
	 */
	async generateToFiles(schemas: AnyTypeSchema[]): Promise<void> {
		const results = await this.transformSchemas(schemas);

		// Ensure necessary directories exist
		await this.ensureDirectoryExists(this.options.outputDir);
		await this.ensureDirectoryExists(join(this.options.outputDir, "valuesets"));
		await this.ensureDirectoryExists(join(this.options.outputDir, "profiles"));
		await this.ensureDirectoryExists(
			join(this.options.outputDir, "extensions"),
		);

		// Write individual files
		for (const result of results) {
			const filePath = join(this.options.outputDir, result.filename);
			const fileDir = filePath.substring(0, filePath.lastIndexOf("/"));
			await this.ensureDirectoryExists(fileDir);
			await writeFile(filePath, result.content, "utf-8");
		}

		// Generate index file if requested
		if (this.options.generateIndex) {
			await this.generateIndexFile(results);
		}
	}

	/**
	 * Ensure directory exists
	 */
	private async ensureDirectoryExists(dirPath: string): Promise<void> {
		const { mkdir } = await import("node:fs/promises");
		try {
			await mkdir(dirPath, { recursive: true });
		} catch (error) {
			// Directory might already exist, ignore error
		}
	}

	/**
	 * Set transformer options
	 */
	setOptions(options: Partial<TypeScriptGeneratorOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Get current options
	 */
	getOptions(): Required<TypeScriptGeneratorOptions> {
		return { ...this.options };
	}

	/**
	 * Generate TypeScript code for a schema
	 */
	private generateTypeScriptForSchema(schema: AnyTypeSchema): string {
		const parts: string[] = [];

		// Get the current schema name to prevent self-imports
		const currentSchemaName = this.formatTypeName(schema.identifier.name);

		// First generate the interface to collect imports
		const interfaceContent: string[] = [];

		// Add documentation
		if (this.options.includeDocuments) {
			const description = this.getSchemaDescription(schema);
			if (description) {
				interfaceContent.push(this.generateDocComment(description, schema));
			}
		}

		// Generate the main interface
		if (this.isValueSetSchema(schema)) {
			interfaceContent.push(this.generateValueSetType(schema));
		} else if (this.isBindingSchema(schema)) {
			interfaceContent.push(this.generateBindingType(schema));
		} else {
			interfaceContent.push(this.generateInterfaceType(schema as TypeSchema));
		}

		// Now generate imports after collecting them during interface generation
		const imports = this.generateImports(schema);
		if (imports) {
			parts.push(imports);
			parts.push("");
		}

		// Add the interface content
		parts.push(...interfaceContent);

		return parts.join("\n");
	}

	/**
	 * Generate TypeScript interface for regular schemas
	 */
	private generateInterfaceType(schema: TypeSchema): string {
		const parts: string[] = [];
		const interfaceName = this.formatTypeName(schema.identifier.name);
		const resourceName = this.extractResourceNameFromSchema(schema);

		// Special handling for Reference type - make it generic
		if (interfaceName === "Reference") {
			return this.generateReferenceInterface(schema);
		}

		// Interface declaration
		const baseExtends = this.getBaseExtends(schema);
		const extendsClause = baseExtends ? ` extends ${baseExtends}` : "";

		parts.push(`export interface ${interfaceName}${extendsClause} {`);

		// Add fields
		if (schema.fields) {
			const fieldLines = this.generateFields(
				schema.fields,
				resourceName,
				interfaceName,
			);
			if (fieldLines.length > 0) {
				parts.push(...fieldLines.map((line) => `	${line}`));
			}
		}

		parts.push("}");

		// Add nested types
		if (schema.nested && schema.nested.length > 0) {
			parts.push("");
			for (const nested of schema.nested) {
				parts.push(this.generateNestedType(nested, resourceName));
				parts.push("");
			}
		}

		return parts.join("\n");
	}

	/**
	 * Generate generic Reference interface
	 */
	private generateReferenceInterface(schema: TypeSchema): string {
		const parts: string[] = [];

		// Add documentation
		parts.push("/**");
		parts.push(" * Generic Reference type with resource type constraint");
		parts.push(
			" * T represents the FHIR resource type (e.g., 'Patient', 'Organization')",
		);
		if (schema.description) {
			parts.push(` * ${schema.description}`);
		}
		if (schema.identifier.url) {
			parts.push(` * @see ${schema.identifier.url}`);
		}
		parts.push(" */");

		// Generate generic interface declaration
		parts.push("export interface Reference<T extends string = string> {");

		// Add fields with special handling for the 'type' field
		if (schema.fields) {
			for (const [fieldName, field] of Object.entries(schema.fields)) {
				const optional = !field.required ? "?" : "";
				let typeString: string;

				if (fieldName === "type") {
					// Special handling for type field - use the generic parameter
					typeString = "T";
				} else {
					// Regular field type generation
					typeString = this.generateFieldType(
						field as TypeSchemaFieldRegular,
						"Reference",
						"Reference",
					);
				}

				const comment = this.generateFieldComment(
					field as TypeSchemaFieldRegular,
					fieldName,
				);
				parts.push(`	${fieldName}${optional}: ${typeString};${comment}`);
			}
		}

		parts.push("}");
		return parts.join("\n");
	}

	/**
	 * Extract resource name from schema identifier for use in nested type prefixing
	 */
	private extractResourceNameFromSchema(schema: TypeSchema): string {
		// First try to get the clean name from the identifier
		let resourceName = schema.identifier.name;

		// If it's a full URL, extract the resource name from it
		if (resourceName.includes("/")) {
			const parts = resourceName.split("/");
			resourceName = parts[parts.length - 1];
		}

		// Remove any hash fragments (for base URLs)
		if (resourceName.includes("#")) {
			resourceName = resourceName.split("#")[0];
		}

		return resourceName;
	}

	/**
	 * Generate TypeScript for value set with enhanced features
	 */
	private generateValueSetType(schema: TypeSchemaValueSet): string {
		const parts: string[] = [];
		const typeName = this.formatTypeName(schema.identifier.name);

		// Add documentation
		if (this.options.includeDocuments) {
			const description = this.getSchemaDescription(schema);
			if (description) {
				parts.push(this.generateDocComment(description, schema));
			}
		}

		if (schema.concept && schema.concept.length > 0) {
			// Generate union type for concepts with proper escaping
			const values = schema.concept
				.map((c) => `'${c.code.replace(/'/g, "\\'")}'`)
				.join(" | ");
			parts.push(`export type ${typeName} = ${values};`);

			// Generate concept definitions with enhanced metadata
			parts.push("");
			parts.push(`/**`);
			parts.push(` * Concept definitions for ${typeName}`);
			parts.push(` */`);
			parts.push(`export const ${typeName}Concepts = {`);
			for (const concept of schema.concept) {
				const escapedCode = concept.code.replace(/'/g, "\\'");
				const comment = this.generateConceptComment(concept);
				parts.push(`	'${escapedCode}': '${escapedCode}' as const,${comment}`);
			}
			parts.push("} as const;");

			// Generate helper types
			parts.push("");
			parts.push(
				`export type ${typeName}Code = keyof typeof ${typeName}Concepts;`,
			);
		} else if (schema.compose) {
			// Handle composed value sets
			parts.push(
				`export type ${typeName} = string; // Composed value set - see ${schema.identifier.url}`,
			);
		} else {
			// Fallback to string type
			parts.push(`export type ${typeName} = string;`);
		}

		return parts.join("\n");
	}

	/**
	 * Generate comment for value set concept
	 */
	private generateConceptComment(concept: {
		code: string;
		display?: string;
		system?: string;
	}): string {
		const parts: string[] = [];

		if (concept.display) {
			parts.push(concept.display);
		}

		if (concept.system) {
			parts.push(`System: ${concept.system}`);
		}

		return parts.length > 0 ? ` // ${parts.join(" | ")}` : "";
	}

	/**
	 * Generate TypeScript for binding with enhanced metadata
	 */
	private generateBindingType(schema: TypeSchemaBinding): string {
		const parts: string[] = [];
		const typeName = this.formatTypeName(schema.identifier.name);

		// Add documentation with binding strength
		parts.push(`/**`);
		parts.push(` * Binding: ${schema.identifier.name}`);
		parts.push(` * Strength: ${schema.strength}`);
		parts.push(` * Value Set: ${schema.valueset.name}`);
		if (schema.type) {
			parts.push(` * Bound Type: ${schema.type.name}`);
		}
		parts.push(` * @see ${schema.identifier.url}`);
		parts.push(` */`);

		if (schema.enum && schema.enum.length > 0) {
			// Generate union type for enum values with proper escaping
			const values = schema.enum
				.map((v) => `'${v.replace(/'/g, "\\'")}'`)
				.join(" | ");
			parts.push(`export type ${typeName} = ${values};`);

			// Generate constants object
			parts.push("");
			parts.push(`export const ${typeName}Values = {`);
			for (const value of schema.enum) {
				const escapedValue = value.replace(/'/g, "\\'");
				parts.push(`	'${escapedValue}': '${escapedValue}' as const,`);
			}
			parts.push("} as const;");
		} else {
			// Reference the value set - but avoid self-reference
			const valueSetName = this.formatTypeName(schema.valueset.name);

			if (valueSetName === typeName) {
				// Avoid circular reference - use the bound type or string as fallback
				if (schema.type) {
					// Use the original type name for mapping, not the formatted one
					const mappedType = this.mapFhirTypeToTypeScript(schema.type.name);
					if (mappedType !== schema.type.name) {
						// Use mapped TypeScript type (like string, number, boolean)
						parts.push(`export type ${typeName} = ${mappedType};`);
					} else {
						// Use the FHIR type and add import
						const boundTypeName = this.formatTypeName(schema.type.name);
						this.addImportForType(schema.type);
						parts.push(`export type ${typeName} = ${boundTypeName};`);
					}
				} else {
					parts.push(`export type ${typeName} = string;`);
				}
			} else {
				// Different names - safe to reference
				this.addImportForType(schema.valueset);
				parts.push(`export type ${typeName} = ${valueSetName};`);
			}
		}

		return parts.join("\n");
	}

	/**
	 * Generate fields for an interface
	 */
	private generateFields(
		fields: Record<string, TypeSchemaField>,
		parentResourceName?: string,
		currentTypeName?: string,
	): string[] {
		const lines: string[] = [];

		for (const [fieldName, field] of Object.entries(fields)) {
			const fieldLines = this.generateField(
				fieldName,
				field,
				parentResourceName,
				currentTypeName,
			);
			lines.push(...fieldLines);
		}

		return lines;
	}

	/**
	 * Generate a single field
	 */
	private generateField(
		fieldName: string,
		field: TypeSchemaField,
		parentResourceName?: string,
		currentTypeName?: string,
	): string[] {
		if (this.isPolymorphicDeclaration(field)) {
			return this.generatePolymorphicDeclarationField(fieldName, field);
		} else if (this.isPolymorphicInstance(field)) {
			return this.generatePolymorphicInstanceField(
				fieldName,
				field,
				parentResourceName,
				currentTypeName,
			);
		} else {
			return this.generateRegularField(
				fieldName,
				field,
				parentResourceName,
				currentTypeName,
			);
		}
	}

	/**
	 * Generate regular field with extension handling
	 */
	private generateRegularField(
		fieldName: string,
		field: TypeSchemaFieldRegular,
		parentResourceName?: string,
		currentTypeName?: string,
	): string[] {
		// Check if this field should be skipped based on extension settings
		if (!this.options.includeExtensions && this.isExtensionField(fieldName)) {
			return [];
		}

		const optional = !field.required ? "?" : "";
		const typeString = this.generateFieldType(
			field,
			parentResourceName,
			currentTypeName,
		);
		const comment = this.generateFieldComment(field, fieldName);

		return [`${fieldName}${optional}: ${typeString};${comment}`];
	}

	/**
	 * Generate field comment with enhanced information
	 */
	private generateFieldComment(
		field: TypeSchemaFieldRegular | TypeSchemaFieldPolymorphicInstance,
		fieldName: string,
	): string {
		const parts: string[] = [];

		// Add description
		if (field.description) {
			parts.push(field.description);
		}

		// Add cardinality information
		if (field.min !== undefined || field.max !== undefined) {
			const min = field.min ?? 0;
			const max = field.max ?? (field.array ? "*" : "1");
			parts.push(`Cardinality: ${min}..${max}`);
		}

		// Add binding information
		if (field.binding) {
			parts.push(`Binding: ${field.binding.name}`);
		}

		return parts.length > 0 ? ` // ${parts.join(" | ")}` : "";
	}

	/**
	 * Check if a field is an extension field
	 */
	private isExtensionField(fieldName: string): boolean {
		return Object.values(EXTENSION_PATTERNS).some((pattern) =>
			pattern.test(fieldName),
		);
	}

	/**
	 * Generate polymorphic declaration field (choice[x]) with better handling
	 */
	private generatePolymorphicDeclarationField(
		fieldName: string,
		field: TypeSchemaFieldPolymorphicDeclaration,
	): string[] {
		// For choice fields, we generate the base field as never (it shouldn't be used directly)
		const comment = field.description
			? ` // ${field.description} - Use specific choice fields: ${field.choices.join(", ")}`
			: ` // Use specific choice fields: ${field.choices.join(", ")}`;
		return [`${fieldName}?: never;${comment}`];
	}

	/**
	 * Generate polymorphic instance field (choiceString, choiceInteger, etc.)
	 */
	private generatePolymorphicInstanceField(
		fieldName: string,
		field: TypeSchemaFieldPolymorphicInstance,
		parentResourceName?: string,
		currentTypeName?: string,
	): string[] {
		const optional = !field.required ? "?" : "";
		const typeString = this.generateFieldType(
			field,
			parentResourceName,
			currentTypeName,
		);
		const comment = this.generatePolymorphicFieldComment(field, fieldName);

		return [`${fieldName}${optional}: ${typeString};${comment}`];
	}

	/**
	 * Generate comment for polymorphic field
	 */
	private generatePolymorphicFieldComment(
		field: TypeSchemaFieldPolymorphicInstance,
		fieldName: string,
	): string {
		const parts: string[] = [];

		// Add description
		if (field.description) {
			parts.push(field.description);
		}

		// Add choice information
		if (field.choiceOf) {
			parts.push(`Choice variant of ${field.choiceOf}`);
		}

		// Add cardinality
		if (field.min !== undefined || field.max !== undefined) {
			const min = field.min ?? 0;
			const max = field.max ?? (field.array ? "*" : "1");
			parts.push(`Cardinality: ${min}..${max}`);
		}

		return parts.length > 0 ? ` // ${parts.join(" | ")}` : "";
	}

	/**
	 * Generate field type string with improved TypeSchema handling and nested type prefixing
	 */
	private generateFieldType(
		field: TypeSchemaFieldRegular | TypeSchemaFieldPolymorphicInstance,
		parentResourceName?: string,
		currentTypeName?: string,
	): string {
		let baseType: string;

		// Priority 1: Enum values (literal types)
		if (field.enum && field.enum.length > 0) {
			baseType = field.enum
				.map((v) => `'${v.replace(/'/g, "\\'")}'`)
				.join(" | ");
		}
		// Priority 2: Binding reference - handle inline instead of importing
		else if (field.binding) {
			// Check if binding has enum values, use them inline
			if (field.enum && field.enum.length > 0) {
				baseType = field.enum
					.map((v) => `'${v.replace(/'/g, "\\'")}'`)
					.join(" | ");
			} else {
				// No enum values, use appropriate base type
				if (field.binding.name.toLowerCase().includes("code")) {
					baseType = "string"; // Simple code values use string
				} else {
					// Complex code systems use CodeableConcept
					baseType = "CodeableConcept";
					this.addImportForType({
						kind: "complex-type",
						name: "CodeableConcept",
						url: "http://hl7.org/fhir/StructureDefinition/CodeableConcept",
					});
				}
			}
		}
		// Priority 3: References (create union types)
		else if (field.reference && field.reference.length > 0) {
			baseType = this.generateReferenceType(field.reference);
		}
		// Priority 4: Type definitions (fallback for non-bound types)
		else if (field.type) {
			baseType = this.mapTypeToTypeScript(field.type, parentResourceName);
		}
		// Fallback
		else {
			baseType = "any";
		}

		// Handle array type
		if (field.array) {
			baseType = `${baseType}[]`;
		}

		return baseType;
	}

	/**
	 * Map TypeSchema type to TypeScript type with nested type prefixing
	 */
	private mapTypeToTypeScript(
		type: TypeSchemaIdentifier,
		parentResourceName?: string,
	): string {
		// Handle primitive types
		if (type.kind === "primitive-type") {
			const primitiveType = PRIMITIVE_TYPE_MAP[type.name];
			if (primitiveType) {
				return primitiveType;
			}
		}

		// Check if this is a nested type that should be prefixed
		if (this.isNestedType(type) && parentResourceName) {
			return this.generateNestedTypeNameFromIdentifier(
				type,
				parentResourceName,
			);
		}

		// Handle complex types that should use simple names for FHIR complex types
		const typeName = this.getSimpleTypeName(type.name);
		const formattedTypeName = this.formatTypeName(typeName);
		this.addImportForType(type);
		return formattedTypeName;
	}

	/**
	 * Get simple type name for FHIR complex types (e.g., Account.identifier -> Identifier)
	 */
	private getSimpleTypeName(typeName: string): string {
		// Don't simplify profile names - they should keep their full names
		if (
			typeName.startsWith("Observation") ||
			typeName.includes("Profile") ||
			typeName.endsWith("Profile")
		) {
			return typeName;
		}

		// Common FHIR complex types that should be simplified
		const fhirComplexTypes = new Set([
			"Identifier",
			"CodeableConcept",
			"Coding",
			"ContactPoint",
			"HumanName",
			"Address",
			"Period",
			"Attachment",
			"Quantity",
			"Range",
			"Ratio",
			"SampledData",
			"Signature",
			"Timing",
			"Age",
			"Count",
			"Distance",
			"Duration",
			"Money",
			"SimpleQuantity",
		]);

		// If it's a dotted path like Account.identifier, extract the last part
		if (typeName.includes(".")) {
			const parts = typeName.split(".");
			const lastPart = parts[parts.length - 1];

			// Don't simplify if this looks like a profile name
			if (
				lastPart.startsWith("Observation") ||
				lastPart.includes("Profile") ||
				lastPart.endsWith("Profile")
			) {
				return lastPart;
			}

			// Capitalize the last part to match FHIR conventions
			const capitalizedLastPart =
				lastPart.charAt(0).toUpperCase() + lastPart.slice(1);

			// If the capitalized last part is a known FHIR complex type, use it directly
			if (fhirComplexTypes.has(capitalizedLastPart)) {
				return capitalizedLastPart;
			}

			// If the original last part is a known FHIR complex type, use it directly
			if (fhirComplexTypes.has(lastPart)) {
				return lastPart;
			}
		}

		// If the type name itself is a known FHIR complex type, use it directly
		if (fhirComplexTypes.has(typeName)) {
			return typeName;
		}

		// Return the original type name for other cases
		return typeName;
	}

	/**
	 * Check if a type identifier represents a nested type (not a standard FHIR complex type)
	 */
	private isNestedType(type: TypeSchemaIdentifier): boolean {
		// Common FHIR complex types that should NOT be treated as nested
		const standardFhirComplexTypes = new Set([
			"Identifier",
			"CodeableConcept",
			"Coding",
			"ContactPoint",
			"HumanName",
			"Address",
			"Period",
			"Attachment",
			"Quantity",
			"Range",
			"Ratio",
			"SampledData",
			"Signature",
			"Timing",
			"Age",
			"Count",
			"Distance",
			"Duration",
			"Money",
			"SimpleQuantity",
		]);

		// If it's a standard FHIR complex type, it's not a nested type
		if (standardFhirComplexTypes.has(type.name)) {
			return false;
		}

		// Nested types typically have URLs with fragments or are marked with specific kinds
		return type.url?.includes("#") || type.kind === "nested";
	}

	/**
	 * Generate nested type name from identifier with parent resource prefix
	 */
	private generateNestedTypeNameFromIdentifier(
		type: TypeSchemaIdentifier,
		parentResourceName: string,
	): string {
		let nestedPath = type.name;

		// Parse URL fragment for deep nesting
		if (type.url?.includes("#")) {
			const fragment = type.url.split("#")[1];
			if (fragment) {
				nestedPath = fragment;
			}
		}

		// Convert path segments to PascalCase and combine with parent resource name
		const pathSegments = nestedPath
			.split(".")
			.map((segment) => toPascalCase(segment));
		const nestedTypeName = pathSegments.join("");

		return `${toPascalCase(parentResourceName)}${nestedTypeName}`;
	}

	/**
	 * Generate reference type with enhanced autocomplete support
	 */
	private generateReferenceType(references: TypeSchemaIdentifier[]): string {
		if (references.length === 0) {
			return "Reference<any>";
		}

		// Extract resource types and create string literal union for better autocomplete
		const resourceTypes: string[] = [];
		const complexTypes: string[] = [];

		for (const ref of references) {
			if (
				ref.kind === "resource" ||
				ref.url?.startsWith("http://hl7.org/fhir/StructureDefinition/") ||
				ref.name.startsWith("http://hl7.org/fhir/StructureDefinition/")
			) {
				// Extract clean resource name for string literals
				let resourceName = ref.name;
				if (ref.name.startsWith("http://hl7.org/fhir/StructureDefinition/")) {
					resourceName = ref.name.split("/").pop() || ref.name;
				} else if (
					ref.url?.startsWith("http://hl7.org/fhir/StructureDefinition/")
				) {
					resourceName = ref.url.split("/").pop() || ref.name;
				}
				resourceTypes.push(resourceName);
			} else {
				const refType = this.formatTypeName(ref.name);
				this.addImportForType(ref);
				complexTypes.push(refType);
			}
		}

		// Build the reference type
		if (resourceTypes.length > 0 && complexTypes.length === 0) {
			// Pure resource references - use string literal union with Reference wrapper
			this.imports.set("Reference", {
				kind: "complex-type",
				name: "Reference",
				url: "http://hl7.org/fhir/StructureDefinition/Reference",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
			});
			const literalUnion = resourceTypes.map((name) => `'${name}'`).join(" | ");
			return `Reference<${literalUnion}>`;
		} else if (resourceTypes.length > 0 && complexTypes.length > 0) {
			// Mixed references - combine string literals and complex types
			this.imports.set("Reference", {
				kind: "complex-type",
				name: "Reference",
				url: "http://hl7.org/fhir/StructureDefinition/Reference",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
			});
			const literalUnion = resourceTypes.map((name) => `'${name}'`).join(" | ");
			const allTypes = [literalUnion, ...complexTypes].join(" | ");
			return `Reference<${allTypes}>`;
		} else {
			// Only complex types - use direct union
			return complexTypes.join(" | ");
		}
	}

	/**
	 * Extract clean resource name from FHIR URL or identifier
	 */
	private extractResourceNameFromUrl(urlOrName: string): string {
		// Handle FHIR structure definition URLs
		if (urlOrName.startsWith("http://hl7.org/fhir/StructureDefinition/")) {
			return urlOrName.replace("http://hl7.org/fhir/StructureDefinition/", "");
		}

		// Handle names that contain the full URL in the name field
		if (urlOrName.startsWith("http://hl7.org/fhir/StructureDefinition/")) {
			return urlOrName.split("/").pop() || urlOrName;
		}

		// Handle simple resource names
		return urlOrName;
	}

	/**
	 * Generate nested type definition with enhanced documentation and resource-prefixed naming
	 */
	private generateNestedType(
		nested: TypeSchemaNestedType,
		parentResourceName?: string,
	): string {
		const parts: string[] = [];
		const typeName = this.generateNestedTypeName(nested, parentResourceName);

		// Enhanced documentation
		parts.push(`/**`);
		parts.push(` * ${typeName} - Nested BackboneElement`);
		if (parentResourceName) {
			parts.push(` * @parent ${parentResourceName}`);
		}
		if (nested.base) {
			parts.push(` * @extends ${this.formatTypeName(nested.base.name)}`);
		}
		parts.push(` * @see ${nested.identifier.url}`);
		parts.push(` */`);

		// Interface declaration
		let extendsClause = "";
		if (nested.base) {
			const baseType = this.formatTypeName(nested.base.name);
			this.addImportForType(nested.base);
			extendsClause = ` extends ${baseType}`;
		}

		parts.push(`export interface ${typeName}${extendsClause} {`);

		// Add fields with proper indentation
		const fieldLines = this.generateFields(
			nested.fields,
			parentResourceName,
			typeName,
		);
		if (fieldLines.length > 0) {
			parts.push(...fieldLines.map((line) => `	${line}`));
		} else {
			// Add comment if no fields
			parts.push("	// No additional fields beyond base type");
		}

		parts.push("}");

		return parts.join("\n");
	}

	/**
	 * Generate prefixed nested type name based on parent resource and nested path
	 */
	private generateNestedTypeName(
		nested: TypeSchemaNestedType,
		parentResourceName?: string,
	): string {
		if (!parentResourceName) {
			// Fallback to original naming if no parent resource name provided
			return this.formatTypeName(nested.identifier.name);
		}

		// Extract nested path from URL fragment or identifier
		let nestedPath = nested.identifier.name;

		// Parse URL fragment for deep nesting (e.g., http://hl7.org/fhir/StructureDefinition/Patient#contact)
		if (nested.identifier.url?.includes("#")) {
			const fragment = nested.identifier.url.split("#")[1];
			if (fragment) {
				nestedPath = fragment;
			}
		}

		// Convert path segments to PascalCase and combine with parent resource name
		const pathSegments = nestedPath
			.split(".")
			.map((segment) => toPascalCase(segment));
		const nestedTypeName = pathSegments.join("");

		return `${toPascalCase(parentResourceName)}${nestedTypeName}`;
	}

	/**
	 * Generate imports section with enhanced categorization and proper path resolution
	 */
	private generateImports(schema: AnyTypeSchema): string {
		if (this.imports.size === 0) {
			return "";
		}

		const importLines: string[] = [];
		const allImports = Array.from(this.imports.keys());
		const currentFileCategory = this.getFileCategory(schema.identifier);

		// Categorize imports
		const baseTypes = [
			"Reference",
			"Extension",
			"BackboneElement",
			"DomainResource",
			"Resource",
		];
		const complexTypes = [
			"Identifier",
			"CodeableConcept",
			"Coding",
			"ContactPoint",
			"HumanName",
			"Address",
			"Period",
			"Attachment",
			"Quantity",
			"Range",
			"Ratio",
			"SampledData",
			"Signature",
			"Timing",
			"Age",
			"Count",
			"Distance",
			"Duration",
			"Money",
			"SimpleQuantity",
		];

		// Add base types import if needed (import individually)
		const neededBaseTypes = allImports.filter((t) => baseTypes.includes(t));
		for (const baseType of neededBaseTypes) {
			const basePath = this.getRelativeImportPath(currentFileCategory, "base");
			importLines.push(
				`import type { ${baseType} } from '${basePath}/${baseType}';`,
			);
		}

		// Add complex types import if needed (import individually)
		const neededComplexTypes = allImports.filter((t) =>
			complexTypes.includes(t),
		);
		for (const complexType of neededComplexTypes) {
			const complexPath = this.getRelativeImportPath(
				currentFileCategory,
				"base",
			);
			importLines.push(
				`import type { ${complexType} } from '${complexPath}/${complexType}';`,
			);
		}

		// Add other resource/profile imports with proper path resolution
		const otherImports = allImports.filter(
			(t) => !baseTypes.includes(t) && !complexTypes.includes(t),
		);

		if (otherImports.length > 0) {
			// Group by category using actual TypeSchemaIdentifier information
			const resourceImports: string[] = [];
			const profileImports: string[] = [];
			const extensionImports: string[] = [];
			const otherTypeImports: string[] = [];

			for (const importName of otherImports) {
				const identifier = this.imports.get(importName);
				if (!identifier) {
					otherTypeImports.push(importName);
					continue;
				}

				// Use the actual TypeSchemaIdentifier kind for accurate categorization
				switch (identifier.kind) {
					case "value-set":
					case "binding":
						// Skip valueset/binding imports since we don't generate those files
						break;
					case "profile":
						profileImports.push(importName);
						break;
					case "resource":
						resourceImports.push(importName);
						break;
					case "complex-type":
						if (this.isExtensionType(identifier)) {
							extensionImports.push(importName);
						} else {
							otherTypeImports.push(importName);
						}
						break;
					default:
						// Fallback to string-based detection for backwards compatibility
						if (this.isResourceType(importName)) {
							resourceImports.push(importName);
						} else if (this.isProfileType(importName)) {
							profileImports.push(importName);
						} else if (this.isValueSetType(importName)) {
							// Skip valueset imports since we don't generate those files
							break;
						} else if (this.isExtensionType(importName)) {
							extensionImports.push(importName);
						} else {
							otherTypeImports.push(importName);
						}
						break;
				}
			}

			// Resource imports - always at root level
			if (resourceImports.length > 0) {
				for (const resourceImport of resourceImports) {
					const resourcePath = this.getRelativeImportPath(
						currentFileCategory,
						"base",
					);
					importLines.push(
						`import type { ${resourceImport} } from '${resourcePath}/${resourceImport}';`,
					);
				}
			}

			// Profile imports - from profiles subfolder
			if (profileImports.length > 0) {
				for (const profileImport of profileImports) {
					const profilePath = this.getRelativeImportPath(
						currentFileCategory,
						"profiles",
					);
					importLines.push(
						`import type { ${profileImport} } from '${profilePath}/${profileImport}';`,
					);
				}
			}

			// ValueSet imports - skipped since we don't generate valueset files

			// Extension imports - from extensions subfolder
			if (extensionImports.length > 0) {
				for (const extensionImport of extensionImports) {
					const extensionPath = this.getRelativeImportPath(
						currentFileCategory,
						"extensions",
					);
					importLines.push(
						`import type { ${extensionImport} } from '${extensionPath}/${extensionImport}';`,
					);
				}
			}

			// Other type imports - default to root level
			if (otherTypeImports.length > 0) {
				for (const otherImport of otherTypeImports) {
					const otherPath = this.getRelativeImportPath(
						currentFileCategory,
						"base",
					);
					importLines.push(
						`import type { ${otherImport} } from '${otherPath}/${otherImport}';`,
					);
				}
			}
		}

		return importLines.join("\n");
	}

	/**
	 * Check if a type name represents a FHIR resource
	 */
	private isResourceType(typeName: string): boolean {
		// Common FHIR resource patterns
		return (
			/^[A-Z][a-z]+$/.test(typeName) &&
			!typeName.endsWith("Profile") &&
			!typeName.endsWith("ValueSet") &&
			![
				"Identifier",
				"CodeableConcept",
				"Coding",
				"ContactPoint",
				"HumanName",
				"Address",
				"Period",
				"Attachment",
				"Reference",
				"Extension",
			].includes(typeName)
		);
	}

	/**
	 * Check if a type name represents a FHIR profile
	 */
	private isProfileType(typeName: string): boolean {
		return typeName.endsWith("Profile") || typeName.includes("Profile");
	}

	/**
	 * Check if a type name represents a ValueSet or Binding
	 */
	private isValueSetType(typeName: string): boolean {
		return (
			typeName.endsWith("ValueSet") ||
			typeName.endsWith("Codes") ||
			typeName.includes("ValueSet") ||
			// Common binding patterns
			typeName.endsWith("Status") ||
			typeName.endsWith("Type") ||
			typeName.endsWith("Code") ||
			typeName.endsWith("Kind")
		);
	}

	/**
	 * Check if a type name represents an Extension
	 */
	private isExtensionType(typeName: string): boolean;
	private isExtensionType(identifier: TypeSchemaIdentifier): boolean;
	private isExtensionType(
		typeNameOrIdentifier: string | TypeSchemaIdentifier,
	): boolean {
		if (typeof typeNameOrIdentifier === "string") {
			return (
				typeNameOrIdentifier.includes("Extension") &&
				typeNameOrIdentifier !== "Extension"
			);
		}

		const identifier = typeNameOrIdentifier;
		// Check URL patterns for extensions
		if (
			identifier.url?.includes("extension") ||
			identifier.url?.endsWith("Extension")
		) {
			return true;
		}

		// Check name patterns
		if (
			identifier.name &&
			(identifier.name.includes("Extension") ||
				identifier.name.endsWith("-extension"))
		) {
			return true;
		}

		// Check if it's based on Extension
		if (
			identifier.url === "http://hl7.org/fhir/StructureDefinition/Extension"
		) {
			return true;
		}

		return false;
	}

	/**
	 * Get file category based on identifier
	 */
	private getFileCategory(
		identifier: TypeSchemaIdentifier,
	): "base" | "profiles" | "valuesets" | "extensions" {
		switch (identifier.kind) {
			case "value-set":
				return "valuesets";
			case "profile":
				return "profiles";
			case "binding":
			case "complex-type":
				if (this.isExtensionType(identifier)) {
					return "extensions";
				}
				return "base";
			default:
				return "base";
		}
	}

	/**
	 * Get relative import path based on current file category and target category
	 */
	private getRelativeImportPath(
		currentCategory: string,
		targetCategory: string,
	): string {
		if (currentCategory === targetCategory) {
			return ".";
		}

		// From base to subfolder
		if (currentCategory === "base") {
			if (targetCategory === "base") {
				return ".";
			}
			return `./${targetCategory}`;
		}

		// From subfolder to base
		if (targetCategory === "base") {
			return "..";
		}

		// From one subfolder to another
		return `../${targetCategory}`;
	}

	/**
	 * Group imports by package for better organization
	 */
	private groupImportsByPackage(schema: AnyTypeSchema): Map<string, string[]> {
		const groups = new Map<string, string[]>();
		const excludeFromGrouping = new Set(["Reference", "Extension"]);

		for (const importName of Array.from(this.imports.keys())) {
			if (excludeFromGrouping.has(importName)) {
				continue;
			}

			// Try to determine package from dependencies
			const packageName = this.findPackageForImport(importName, schema);
			if (!groups.has(packageName)) {
				groups.set(packageName, []);
			}
			groups.get(packageName)!.push(importName);
		}

		return groups;
	}

	/**
	 * Find package for an import based on schema dependencies
	 */
	private findPackageForImport(
		importName: string,
		schema: AnyTypeSchema,
	): string {
		if ("dependencies" in schema && schema.dependencies) {
			for (const dep of schema.dependencies) {
				if (this.formatTypeName(dep.name) === importName) {
					return dep.package;
				}
			}
		}
		return "unknown";
	}

	/**
	 * Resolve module reference for imports
	 */
	private resolveModuleReference(
		packageName: string,
		schema: AnyTypeSchema,
	): string {
		const currentPackage = schema.identifier.package;

		// Same package - use relative import
		if (packageName === currentPackage || packageName === "unknown") {
			return "./types";
		}

		// Different package - use package-based import
		return `@fhir/${packageName}`;
	}

	/**
	 * Generate enhanced documentation comment
	 */
	private generateDocComment(
		description: string,
		schema?: AnyTypeSchema,
	): string {
		const lines = description.split("\n");
		const docLines: string[] = ["/**"];

		// Add description lines
		docLines.push(...lines.map((line) => ` * ${line.trim()}`));

		// Add additional metadata if schema is provided
		if (schema) {
			docLines.push(" *");
			docLines.push(` * @see ${schema.identifier.url}`);
			if (schema.identifier.package) {
				docLines.push(` * @package ${schema.identifier.package}`);
			}
			if (schema.identifier.version) {
				docLines.push(` * @version ${schema.identifier.version}`);
			}
		}

		docLines.push(" */");
		return docLines.join("\n");
	}

	/**
	 * Get filename for schema with folder structure
	 */
	private getFilename(identifier: TypeSchemaIdentifier): string {
		const name = this.formatTypeName(identifier.name);
		const baseFilename = `${name}.ts`;

		// Organize files into subfolders based on type
		switch (identifier.kind) {
			case "value-set":
				return `valuesets/${baseFilename}`;
			case "profile":
				return `profiles/${baseFilename}`;
			case "binding":
				// Extensions are complex-types with special metadata, but bindings are separate
				if (this.isExtensionType(identifier)) {
					return `extensions/${baseFilename}`;
				}
				// Bindings are ValueSets, so put them in the valuesets folder
				return `valuesets/${baseFilename}`;
			case "complex-type":
				// Check if it's an extension based on name or URL patterns
				if (this.isExtensionType(identifier)) {
					return `extensions/${baseFilename}`;
				}
				return baseFilename;
			case "resource":
				return baseFilename;
			case "primitive-type":
				return baseFilename;
			default:
				return baseFilename;
		}
	}

	/**
	 * Format type name according to naming convention
	 */
	private formatTypeName(name: string): string {
		if (this.options.namingConvention === "PascalCase") {
			return toPascalCase(name);
		}
		return name;
	}

	/**
	 * Get base extends clause
	 */
	private getBaseExtends(schema: TypeSchema): string | null {
		if (schema.base) {
			const baseName = this.formatTypeName(schema.base.name);
			this.addImportForType(schema.base);
			return baseName;
		}
		return null;
	}

	/**
	 * Add import for a type with better package handling
	 */
	private addImportForType(type: TypeSchemaIdentifier): void {
		// Don't import primitive types
		if (type.kind === "primitive-type" && PRIMITIVE_TYPE_MAP[type.name]) {
			return;
		}

		// Don't import types from the same package unless explicitly needed
		if (type.package === "this") {
			return;
		}

		// Get the simplified type name for complex types
		const simplifiedTypeName = this.getSimpleTypeName(type.name);
		const formattedTypeName = this.formatTypeName(simplifiedTypeName);

		// Don't import self (prevent circular imports)
		if (
			this.currentSchemaName &&
			formattedTypeName === this.currentSchemaName
		) {
			return;
		}

		this.imports.set(formattedTypeName, type);
	}

	/**
	 * Generate index file
	 */
	private async generateIndexFile(
		results: GeneratedTypeScript[],
	): Promise<void> {
		const exports = results
			.map((result) => {
				const name = result.filename.replace(".ts", "");
				return `export * from './${name}';`;
			})
			.join("\n");

		const indexPath = join(this.options.outputDir, "index.ts");
		await writeFile(indexPath, exports, "utf-8");
	}

	/**
	 * Type guards
	 */
	private isValueSetSchema(
		schema: AnyTypeSchema,
	): schema is TypeSchemaValueSet {
		return "concept" in schema || "compose" in schema;
	}

	private isBindingSchema(schema: AnyTypeSchema): schema is TypeSchemaBinding {
		return "valueset" in schema && "strength" in schema;
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

	/**
	 * Get description from any schema type safely
	 */
	private getSchemaDescription(schema: AnyTypeSchema): string | undefined {
		if ("description" in schema) {
			return schema.description;
		}
		return undefined;
	}

	/**
	 * Map FHIR primitive types to TypeScript primitive types
	 */
	private mapFhirTypeToTypeScript(fhirType: string): string {
		switch (fhirType) {
			case "code":
			case "string":
			case "markdown":
			case "id":
			case "uri":
			case "url":
			case "canonical":
			case "oid":
			case "uuid":
			case "base64Binary":
				return "string";
			case "boolean":
				return "boolean";
			case "integer":
			case "unsignedInt":
			case "positiveInt":
			case "decimal":
				return "number";
			case "date":
			case "dateTime":
			case "instant":
			case "time":
				return "string"; // Date/time as ISO strings
			default:
				return fhirType; // Keep as-is for complex types
		}
	}

	/**
	 * Validate schema before transformation
	 */
	private validateSchema(schema: AnyTypeSchema): void {
		if (!schema.identifier) {
			throw new Error("Schema must have an identifier");
		}

		if (!schema.identifier.name) {
			throw new Error("Schema identifier must have a name");
		}

		// Validate TypeScript identifier compatibility
		const formattedName = this.formatTypeName(schema.identifier.name);
		if (!/^[A-Z][a-zA-Z0-9]*$/.test(formattedName)) {
			console.warn(
				`Generated type name '${formattedName}' may not be a valid TypeScript identifier`,
			);
		}
	}

	/**
	 * Get schema statistics for debugging
	 */
	private getSchemaStats(schema: AnyTypeSchema): {
		fieldCount: number;
		nestedCount: number;
		referenceCount: number;
		enumFieldCount: number;
	} {
		let fieldCount = 0;
		let nestedCount = 0;
		let referenceCount = 0;
		let enumFieldCount = 0;

		if ("fields" in schema && schema.fields) {
			fieldCount = Object.keys(schema.fields).length;

			for (const field of Object.values(schema.fields)) {
				if ("reference" in field && field.reference) {
					referenceCount += field.reference.length;
				}
				if ("enum" in field && field.enum) {
					enumFieldCount++;
				}
			}
		}

		if ("nested" in schema && schema.nested) {
			nestedCount = schema.nested.length;
		}

		return { fieldCount, nestedCount, referenceCount, enumFieldCount };
	}

	/**
	 * Log transformation statistics for debugging
	 */
	private logTransformationStats(
		schema: AnyTypeSchema,
		result: GeneratedTypeScript,
	): void {
		if (process.env.NODE_ENV === "development") {
			const stats = this.getSchemaStats(schema);
			console.debug(`Transformed ${schema.identifier.name}:`, {
				type: schema.identifier.kind,
				package: schema.identifier.package,
				stats,
				generatedLines: result.content.split("\n").length,
				imports: result.imports.length,
			});
		}
	}
}

/**
 * Convenience function to transform a single schema
 */
export async function transformTypeSchemaToTypeScript(
	schema: AnyTypeSchema,
	options?: TypeScriptGeneratorOptions,
): Promise<GeneratedTypeScript> {
	const transformer = new TypeScriptTransformer(options);
	return await transformer.transformSchema(schema);
}

/**
 * Convenience function to transform multiple schemas
 */
export async function transformTypeSchemasToTypeScript(
	schemas: AnyTypeSchema[],
	options?: TypeScriptGeneratorOptions,
): Promise<GeneratedTypeScript[]> {
	const transformer = new TypeScriptTransformer(options);
	return await transformer.transformSchemas(schemas);
}

/**
 * Convenience function to generate TypeScript files
 */
export async function generateTypeScriptFiles(
	schemas: AnyTypeSchema[],
	options?: TypeScriptGeneratorOptions,
): Promise<void> {
	const transformer = new TypeScriptTransformer(options);
	await transformer.generateToFiles(schemas);
}
