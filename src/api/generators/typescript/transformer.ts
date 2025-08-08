/**
 * TypeScript Transformer for TypeSchema
 *
 * Transforms TypeSchema documents into TypeScript interface definitions.
 * This file contains the TypeScript-specific transformation logic that was
 * moved from the TypeSchema module to keep TypeSchema focused on core functions.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type AnyTypeSchemaCompliant,
	isPolymorphicDeclarationField,
	isPolymorphicInstanceField,
	isRegularField,
	isTypeSchemaBinding,
	isTypeSchemaValueSet,
	type TypeSchemaBinding,
	type TypeSchemaField,
	type TypeSchemaFieldPolymorphicDeclaration,
	type TypeSchemaFieldPolymorphicInstance,
	type TypeSchemaFieldRegular,
	type TypeSchemaIdentifier,
	type TypeSchemaNestedType,
	type TypeSchemaValueSet,
} from "../../../typeschema/types";

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
};

/**
 * Convert a string into PascalCase.
 * Examples:
 *  - "patient-name" -> "PatientName"
 *  - "Patient name" -> "PatientName"
 *  - "patient_name" -> "PatientName"
 *  - "patientName" -> "PatientName"
 */
function toPascalCase(input: string): string {
	// Replace non-alphanumeric separators with spaces, split into parts,
	// capitalize each part, and join them together.
	const parts = input
		.replace(/[^A-Za-z0-9]+/g, " ")
		.split(" ")
		.map((p) => p.trim())
		.filter(Boolean);

	if (parts.length === 0) return "";

	return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

/**
 * TypeScript generation options
 */
export interface TypeScriptTransformerOptions {
	outputDir?: string;
	moduleFormat?: "esm" | "cjs";
	generateIndex?: boolean;
	includeDocuments?: boolean;
	namingConvention?: "PascalCase" | "camelCase";
	includeExtensions?: boolean;
	includeProfiles?: boolean;
}

/**
 * Generated TypeScript result
 */
export interface GeneratedTypeScript {
	content: string;
	imports: string[];
	exports: string[];
	filename: string;
}

/**
 * TypeScript Transformer
 *
 * Transforms TypeSchema documents into TypeScript interface definitions.
 */
export class TypeScriptTransformer {
	private options: Required<TypeScriptTransformerOptions>;
	private generatedTypes = new Set<string>();
	private imports = new Map<string, TypeSchemaIdentifier>();
	private currentSchemaName?: string;

	constructor(options: TypeScriptTransformerOptions = {}) {
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
	 * Transform a single TypeSchema to TypeScript
	 */
	async transformSchema(
		schema: AnyTypeSchemaCompliant,
	): Promise<GeneratedTypeScript> {
		// Skip valueset and binding file generation entirely
		if (this.isValueSetSchema(schema) || this.isBindingSchema(schema)) {
			return {
				content: "",
				imports: [],
				exports: [],
				filename: "",
			};
		}

		// Clear state for new transformation
		this.generatedTypes.clear();
		this.imports.clear();
		this.currentSchemaName = this.formatTypeName(schema.identifier.name);

		// Generate TypeScript content
		const content = this.generateTypeScriptForSchema(schema);
		const imports = Array.from(this.imports.keys());
		const filename = this.getFilename(schema.identifier);
		const exports = this.getExports(schema);

		return {
			content,
			imports,
			exports,
			filename,
		};
	}

	/**
	 * Transform multiple schemas
	 */
	async transformSchemas(
		schemas: AnyTypeSchemaCompliant[],
	): Promise<GeneratedTypeScript[]> {
		const results: GeneratedTypeScript[] = [];

		for (const schema of schemas) {
			const result = await this.transformSchema(schema);
			if (result.content) {
				// Only add non-empty results
				results.push(result);
			}
		}

		return results;
	}

	/**
	 * Generate TypeScript files to disk
	 */
	async generateToFiles(schemas: AnyTypeSchemaCompliant[]): Promise<void> {
		const results = await this.transformSchemas(schemas);

		for (const result of results) {
			const filePath = join(this.options.outputDir, result.filename);
			await writeFile(filePath, result.content, "utf-8");
		}
	}

	/**
	 * Generate TypeScript for a single schema
	 */
	private generateTypeScriptForSchema(schema: AnyTypeSchemaCompliant): string {
		const lines: string[] = [];

		// Add interface declaration
		const interfaceName = this.formatTypeName(schema.identifier.name);
		const baseInterface = this.getBaseInterface(schema);

		if (baseInterface) {
			lines.push(
				`export interface ${interfaceName} extends ${baseInterface} {`,
			);
		} else {
			lines.push(`export interface ${interfaceName} {`);
		}

		// Add fields
		if ("fields" in schema && schema.fields) {
			for (const [fieldName, field] of Object.entries(schema.fields)) {
				const fieldLine = this.generateFieldTypeScript(fieldName, field);
				if (fieldLine) {
					lines.push(`\t${fieldLine}`);
				}
			}
		}

		lines.push("}");

		// Add nested types if any
		if ("nested" in schema && schema.nested) {
			for (const nested of schema.nested) {
				lines.push("");
				lines.push(this.generateNestedTypeScript(nested));
			}
		}

		return lines.join("\n");
	}

	/**
	 * Generate TypeScript for a field
	 */
	private generateFieldTypeScript(
		fieldName: string,
		field: TypeSchemaField,
	): string {
		if (isRegularField(field)) {
			return this.generateRegularFieldTypeScript(fieldName, field);
		} else if (isPolymorphicDeclarationField(field)) {
			return this.generatePolymorphicDeclarationTypeScript(fieldName, field);
		} else if (isPolymorphicInstanceField(field)) {
			return this.generatePolymorphicInstanceTypeScript(fieldName, field);
		}

		return "";
	}

	/**
	 * Generate TypeScript for a regular field
	 */
	private generateRegularFieldTypeScript(
		fieldName: string,
		field: TypeSchemaFieldRegular,
	): string {
		let typeString = "any";

		if (field.type) {
			typeString = this.getTypeScriptType(field.type);
		}

		const optional = !field.required ? "?" : "";
		const array = field.array ? "[]" : "";

		return `${fieldName}${optional}: ${typeString}${array};`;
	}

	/**
	 * Generate TypeScript for polymorphic declaration
	 */
	private generatePolymorphicDeclarationTypeScript(
		fieldName: string,
		field: TypeSchemaFieldPolymorphicDeclaration,
	): string {
		// Polymorphic declarations typically don't generate direct fields
		return "";
	}

	/**
	 * Generate TypeScript for polymorphic instance
	 */
	private generatePolymorphicInstanceTypeScript(
		fieldName: string,
		field: TypeSchemaFieldPolymorphicInstance,
	): string {
		let typeString = "any";

		if (field.type) {
			typeString = this.getTypeScriptType(field.type);
		}

		const optional = !field.required ? "?" : "";
		const array = field.array ? "[]" : "";

		return `${fieldName}${optional}: ${typeString}${array};`;
	}

	/**
	 * Generate TypeScript for nested type
	 */
	private generateNestedTypeScript(nested: TypeSchemaNestedType): string {
		const lines: string[] = [];
		const interfaceName = this.formatTypeName(nested.identifier.name);
		const baseInterface = this.getTypeScriptType(nested.base);

		lines.push(`export interface ${interfaceName} extends ${baseInterface} {`);

		for (const [fieldName, field] of Object.entries(nested.fields)) {
			const fieldLine = this.generateFieldTypeScript(fieldName, field);
			if (fieldLine) {
				lines.push(`\t${fieldLine}`);
			}
		}

		lines.push("}");

		return lines.join("\n");
	}

	/**
	 * Get TypeScript type for a TypeSchema identifier
	 */
	private getTypeScriptType(identifier: TypeSchemaIdentifier): string {
		// Check if it's a primitive type
		const primitiveType = PRIMITIVE_TYPE_MAP[identifier.name];
		if (primitiveType) {
			return primitiveType;
		}

		// Return formatted type name
		return this.formatTypeName(identifier.name);
	}

	/**
	 * Get base interface for schema
	 */
	private getBaseInterface(schema: AnyTypeSchemaCompliant): string | null {
		if ("base" in schema && schema.base) {
			return this.getTypeScriptType(schema.base);
		}
		return null;
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
	 * Get filename for schema
	 */
	private getFilename(identifier: TypeSchemaIdentifier): string {
		const name = identifier.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
		return `${name}.ts`;
	}

	/**
	 * Get exports for schema
	 */
	private getExports(schema: AnyTypeSchemaCompliant): string[] {
		const exports = [this.formatTypeName(schema.identifier.name)];

		// Add nested type exports
		if ("nested" in schema && schema.nested) {
			for (const nested of schema.nested) {
				exports.push(this.formatTypeName(nested.identifier.name));
			}
		}

		return exports;
	}

	/**
	 * Check if schema is a value set
	 */
	private isValueSetSchema(
		schema: AnyTypeSchemaCompliant,
	): schema is TypeSchemaValueSet {
		return isTypeSchemaValueSet(schema);
	}

	/**
	 * Check if schema is a binding
	 */
	private isBindingSchema(
		schema: AnyTypeSchemaCompliant,
	): schema is TypeSchemaBinding {
		return isTypeSchemaBinding(schema);
	}

	/**
	 * Set options
	 */
	setOptions(options: Partial<TypeScriptTransformerOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Get current options
	 */
	getOptions(): Required<TypeScriptTransformerOptions> {
		return { ...this.options };
	}
}

/**
 * Convenience function to transform TypeSchema to TypeScript
 */
export async function transformTypeSchemaToTypeScript(
	schema: AnyTypeSchemaCompliant,
	options?: TypeScriptTransformerOptions,
): Promise<GeneratedTypeScript> {
	const transformer = new TypeScriptTransformer(options);
	return await transformer.transformSchema(schema);
}

/**
 * Convenience function to transform multiple TypeSchemas to TypeScript
 */
export async function transformTypeSchemasToTypeScript(
	schemas: AnyTypeSchemaCompliant[],
	options?: TypeScriptTransformerOptions,
): Promise<GeneratedTypeScript[]> {
	const transformer = new TypeScriptTransformer(options);
	return await transformer.transformSchemas(schemas);
}

/**
 * Convenience function to generate TypeScript files
 */
export async function generateTypeScriptFiles(
	schemas: AnyTypeSchemaCompliant[],
	options: TypeScriptTransformerOptions,
): Promise<void> {
	const transformer = new TypeScriptTransformer(options);
	await transformer.generateToFiles(schemas);
}
