/**
 * TypeScript Generator
 *
 * Generates TypeScript interfaces from TypeSchema format
 */

import {
	BaseGenerator,
	type GeneratorOptions,
} from "../../lib/generators/base";
import { type LoadedSchemas, SchemaLoader } from "../../lib/generators/loader";
import type {
	TypeSchema,
	TypeSchemaField,
	TypeSchemaIdentifier,
	TypeSchemaNestedType,
	TypeSchemaValueSet,
} from "../../lib/typeschema";

export interface TypeScriptGeneratorOptions extends GeneratorOptions {
	packagePath?: string;
	baseTypesModule?: string;
}

export class TypeScriptGenerator extends BaseGenerator {
	readonly name = "typescript";
	readonly target = "TypeScript";

	private schemas: LoadedSchemas | null = null;
	private loader: SchemaLoader;
	private generatedTypes = new Set<string>();
	private typeMapping = new Map<string, string>([
		["boolean", "boolean"],
		["integer", "number"],
		["string", "string"],
		["decimal", "number"],
		["uri", "string"],
		["url", "string"],
		["canonical", "string"],
		["uuid", "string"],
		["id", "string"],
		["oid", "string"],
		["unsignedInt", "number"],
		["positiveInt", "number"],
		["markdown", "string"],
		["time", "string"],
		["date", "string"],
		["dateTime", "string"],
		["instant", "string"],
		["base64Binary", "string"],
		["code", "string"],
		["xhtml", "string"],
	]);

	constructor(options: TypeScriptGeneratorOptions) {
		super(options);
		this.loader = new SchemaLoader({
			packagePath: options.packagePath,
			verbose: options.verbose,
		});
	}

	async generate(): Promise<void> {
		// Load schemas if not already provided
		if (!this.schemas) {
			this.log("Loading FHIR schemas...");
			this.schemas = await this.loader.load();
		}

		// Generate primitive types
		this.log("Generating primitive types...");
		await this.generatePrimitiveTypes();

		// Generate complex types
		this.log("Generating complex types...");
		await this.generateComplexTypes();

		// Generate resources
		this.log("Generating resources...");
		await this.generateResources();

		// Generate value sets
		this.log("Generating value sets...");
		await this.generateValueSets();

		// Generate profiles
		this.log("Generating profiles...");
		await this.generateProfiles();

		// Generate index file
		this.log("Generating index file...");
		await this.generateIndexFile();

		// Write all files
		await this.writeFiles();

		// Clean up resources
		await this.loader.cleanup();
	}

	private async generatePrimitiveTypes(): Promise<void> {
		if (!this.schemas) return;

		this.file("types/primitives.ts");

		this.multiLineComment(
			[
				"FHIR Primitive Types",
				"",
				"Base primitive types used throughout FHIR resources.",
				"These correspond to FHIR primitive data types.",
			].join("\n"),
		);
		this.blank();

		// Generate base reference type first
		this.generateReferenceType();
		this.blank();

		for (const primitive of this.schemas.primitiveTypes) {
			this.generateTypeAlias(primitive);
			this.blank();
		}
	}

	private async generateComplexTypes(): Promise<void> {
		if (!this.schemas) return;

		this.file("types/complex.ts");

		this.line("import * as primitives from './primitives';");
		this.line("import type { Reference } from './primitives';");
		this.blank();

		this.multiLineComment(
			[
				"FHIR Complex Types",
				"",
				"Complex data types used in FHIR resources.",
				"These types represent structured data elements that can contain multiple fields.",
			].join("\n"),
		);
		this.blank();

		// Sort by dependencies
		const sorted = this.topologicalSort(this.schemas.complexTypes);

		for (const type of sorted) {
			this.generateInterface(type);
			this.blank();
		}
	}

	private async generateResources(): Promise<void> {
		if (!this.schemas) return;

		// Generate individual resource files
		for (const resource of this.schemas.resources) {
			this.generateResourceFile(resource);
		}

		// Generate resources index file
		this.generateResourcesIndex();
	}

	private generateResourcesIndex(): void {
		if (!this.schemas) return;

		this.file("resources/index.ts");

		this.multiLineComment(
			[
				"FHIR Resource Exports",
				"",
				"Barrel export for all FHIR resources.",
			].join("\n"),
		);
		this.blank();

		// Export all resources
		for (const resource of this.schemas.resources) {
			const name = resource.identifier.name;
			this.line(`export type { ${name} } from './${name}';`);
		}
	}

	private async generateValueSets(): Promise<void> {
		if (!this.schemas) return;

		// Check if we have valueSets and bindings in the schemas
		const valueSets = this.schemas.valueSets || [];
		const bindings = this.schemas.bindings || [];

		if (valueSets.length === 0 && bindings.length === 0) {
			return;
		}

		this.file("types/valuesets.ts");

		this.multiLineComment(
			[
				"FHIR ValueSets",
				"",
				"Union types for FHIR value sets and bindings.",
				"Falls back to string when concrete codes are not available.",
			].join("\n"),
		);
		this.blank();

		// Generate type aliases for each ValueSet
		for (const valueSet of valueSets) {
			this.generateValueSetType(valueSet);
			this.blank();
		}
		// // Generate type aliases for each binding
		// for (const binding of bindings) {
		// 	this.generateBindingType(binding);
		// 	this.blank();
		// }
	}

	private async generateProfiles(): Promise<void> {
		if (!this.schemas || !this.schemas.profiles || this.schemas.profiles.length === 0) {
			return;
		}

		// Generate individual profile files
		for (const profile of this.schemas.profiles) {
			this.generateProfileFile(profile);
		}

		// Generate profiles index file
		this.generateProfilesIndex();

		// Generate US Core specific index if we have US Core profiles
		const usCoreProfiles = this.schemas.profiles.filter(p =>
			p.metadata?.isUSCore || p.identifier.name.toLowerCase().includes('uscore')
		);
		if (usCoreProfiles.length > 0) {
			this.generateUSCoreIndex(usCoreProfiles);
		}
	}

	private generateProfileFile(profile: TypeSchema): void {
		// Determine the directory structure based on profile type
		let directory = "resources/profiles";
		if (profile.metadata?.isUSCore) {
			directory = "resources/profiles/uscore";
		}

		const fileName = `${directory}/${profile.identifier.name}.ts`;
		this.file(fileName);

		// Imports
		this.line("import * as primitives from '../../types/primitives';");
		this.line("import * as complex from '../../types/complex';");

		// Import base resource/profile
		if (profile.base) {
			const baseName = this.getTypeName(profile.base, profile.base.kind);
			if (profile.base.kind === "resource") {
				this.line(`import { ${baseName} } from '../${profile.base.name}';`);
			} else if (profile.base.kind === "profile") {
				// Import from another profile
				const baseDirectory = profile.base.package?.includes("us.core") ? "uscore" : ".";
				this.line(`import { ${baseName} } from './${baseDirectory}/${profile.base.name}';`);
			}
		}

		this.blank();

		// Generate profile interface
		this.generateProfileInterface(profile);

		// Generate nested types if any
		if (profile.nested) {
			this.blank();
			for (const nested of profile.nested) {
				this.generateNestedInterface(nested);
				this.blank();
			}
		}
	}

	private generateProfileInterface(profile: TypeSchema): void {
		const name = this.getTypeName(profile.identifier, "profile");
		const base = profile.base
			? this.getTypeName(profile.base, profile.base.kind)
			: null;

		// Generate comprehensive JSDoc comment
		const jsdocLines = [profile.description || `${name} profile`];

		if (profile.identifier.url) {
			jsdocLines.push("", `@see ${profile.identifier.url}`);
		}

		if (base) {
			jsdocLines.push(`@extends ${base}`);
		}

		// Add profile metadata to JSDoc
		if (profile.metadata) {
			if (profile.metadata.publisher) {
				jsdocLines.push(`@publisher ${profile.metadata.publisher}`);
			}
			if (profile.metadata.isUSCore) {
				jsdocLines.push("@profile US Core Profile");
			}
			if (profile.metadata.date) {
				jsdocLines.push(`@date ${profile.metadata.date}`);
			}
		}

		this.multiLineComment(jsdocLines.join("\n"));

		const header = base
			? `export interface ${name} extends ${base}`
			: `export interface ${name}`;

		this.curlyBlock(header, () => {
			// Generate profile-specific fields from constraints and extensions
			this.generateProfileFields(profile);
		});

		this.generatedTypes.add(name);
	}

	private generateProfileFields(profile: TypeSchema): void {
		// Handle profile constraints as typed fields
		if (profile.constraints) {
			for (const [path, constraint] of Object.entries(profile.constraints)) {
				this.generateConstraintField(path, constraint);
			}
		}

		// Handle profile extensions as typed fields
		if (profile.extensions) {
			for (const extension of profile.extensions) {
				this.generateExtensionField(extension);
			}
		}

		// If no specific constraints or extensions, inherit from base
		if (!profile.constraints && !profile.extensions && profile.fields) {
			// Generate regular fields if present
			const sortedFields = Object.entries(profile.fields).sort(
				([, a], [, b]) => {
					if (a.required !== b.required) {
						return a.required ? -1 : 1;
					}
					return 0;
				},
			);

			for (const [fieldName, field] of sortedFields) {
				this.generateField(fieldName, field, "profile");
			}
		}
	}

	private generateConstraintField(path: string, constraint: any): void {
		// Extract field name from path (e.g., "Patient.name" -> "name")
		const fieldName = path.split('.').pop() || path;

		// Generate JSDoc with constraint information
		const docLines: string[] = [];
		docLines.push(`${fieldName} field with profile constraints`);

		if (constraint.mustSupport) {
			docLines.push("Must Support: true");
		}
		if (constraint.min !== undefined) {
			docLines.push(`Minimum cardinality: ${constraint.min}`);
		}
		if (constraint.max !== undefined) {
			docLines.push(`Maximum cardinality: ${constraint.max}`);
		}
		if (constraint.fixedValue !== undefined) {
			docLines.push(`Fixed value: ${JSON.stringify(constraint.fixedValue)}`);
		}
		if (constraint.binding) {
			docLines.push(`Value set binding: ${constraint.binding.valueSet} (${constraint.binding.strength})`);
		}

		this.line(`/** ${docLines.join(" | ")} */`);

		// Determine field type based on constraint
		let fieldType = "any";
		if (constraint.types && constraint.types.length > 0) {
			const typeNames = constraint.types.map((t: any) => t.code).join(" | ");
			fieldType = typeNames;
		}
		if (constraint.binding && constraint.binding.valueSet) {
			// Use value set type if available
			fieldType = "string"; // Could be enhanced to use actual value set types
		}

		// Determine if field is required
		const isRequired = constraint.min && constraint.min > 0;
		const fieldDeclaration = isRequired ? fieldName : `${fieldName}?`;

		this.line(`${fieldDeclaration}: ${fieldType};`);
	}

	private generateExtensionField(extension: any): void {
		// Extract extension name from path
		const extensionName = extension.path.split('.').pop() || extension.path;

		// Generate JSDoc for extension
		const docLines: string[] = [];
		docLines.push(`Extension: ${extension.profile.join(", ")}`);
		if (extension.mustSupport) {
			docLines.push("Must Support: true");
		}
		if (extension.min !== undefined) {
			docLines.push(`Minimum cardinality: ${extension.min}`);
		}
		if (extension.max !== undefined) {
			docLines.push(`Maximum cardinality: ${extension.max}`);
		}

		this.line(`/** ${docLines.join(" | ")} */`);

		// Extension fields are typically optional
		const isRequired = extension.min && extension.min > 0;
		const fieldDeclaration = isRequired ? extensionName : `${extensionName}?`;

		// Extensions are typically complex types or primitives
		this.line(`${fieldDeclaration}: complex.Extension | complex.Extension[];`);
	}

	private generateProfilesIndex(): void {
		if (!this.schemas || !this.schemas.profiles || this.schemas.profiles.length === 0) {
			return;
		}

		this.file("resources/profiles/index.ts");

		this.multiLineComment(
			[
				"FHIR Profile Exports",
				"",
				"Barrel export for all FHIR profiles.",
				"Profiles extend base FHIR resources with additional constraints and extensions.",
			].join("\n"),
		);
		this.blank();

		// Group profiles by type for better organization
		const profilesByType = new Map<string, TypeSchema[]>();
		for (const profile of this.schemas.profiles) {
			const profileType = profile.metadata?.isUSCore ? "uscore" : "general";
			if (!profilesByType.has(profileType)) {
				profilesByType.set(profileType, []);
			}
			profilesByType.get(profileType)!.push(profile);
		}

		// Export US Core profiles
		if (profilesByType.has("uscore")) {
			this.comment("US Core Profiles");
			const usCoreProfiles = profilesByType.get("uscore")!;
			for (const profile of usCoreProfiles) {
				const name = this.getTypeName(profile.identifier, "profile");
				this.line(`export { ${name} } from './uscore/${profile.identifier.name}';`);
			}
			this.blank();
		}

		// Export general profiles
		if (profilesByType.has("general")) {
			this.comment("General Profiles");
			const generalProfiles = profilesByType.get("general")!;
			for (const profile of generalProfiles) {
				const name = this.getTypeName(profile.identifier, "profile");
				this.line(`export { ${name} } from './${profile.identifier.name}';`);
			}
			this.blank();
		}

		// Export profile registry for runtime discovery
		this.comment("Profile Registry");
		this.line("export const ProfileRegistry = {");
		for (const profile of this.schemas.profiles) {
			const name = this.getTypeName(profile.identifier, "profile");
			this.line(`  "${profile.identifier.url || profile.identifier.name}": "${name}",`);
		}
		this.line("} as const;");
		this.blank();

		// Export profile metadata
		this.comment("Profile Metadata");
		this.line("export const ProfileMetadata = {");
		for (const profile of this.schemas.profiles) {
			const name = this.getTypeName(profile.identifier, "profile");
			this.line(`  "${name}": {`);
			this.line(`    url: "${profile.identifier.url || ''}",`);
			this.line(`    name: "${profile.identifier.name}",`);
			this.line(`    base: "${profile.base?.name || ''}",`);
			if (profile.metadata?.isUSCore) {
				this.line(`    isUSCore: true,`);
			}
			if (profile.metadata?.publisher) {
				this.line(`    publisher: "${profile.metadata.publisher}",`);
			}
			this.line(`  },`);
		}
		this.line("} as const;");
	}

	private generateUSCoreIndex(usCoreProfiles: TypeSchema[]): void {
		this.file("resources/profiles/uscore/index.ts");

		this.multiLineComment(
			[
				"US Core Profile Exports",
				"",
				"US Core profiles provide a foundation for building FHIR implementations",
				"that support the most common clinical data elements.",
				"",
				"@see http://hl7.org/fhir/us/core/",
			].join("\n"),
		);
		this.blank();

		// Export all US Core profiles
		this.comment("US Core Profile Interfaces");
		for (const profile of usCoreProfiles) {
			const name = this.getTypeName(profile.identifier, "profile");
			this.line(`export { ${name} } from './${profile.identifier.name}';`);
		}
		this.blank();

		// Create US Core specific registry
		this.comment("US Core Profile Registry");
		this.line("export const USCoreProfileRegistry = {");
		for (const profile of usCoreProfiles) {
			const name = this.getTypeName(profile.identifier, "profile");
			this.line(`  "${profile.identifier.name}": "${name}",`);
		}
		this.line("} as const;");
		this.blank();

		// Export US Core profile types union
		this.comment("US Core Profile Union Type");
		const profileNames = usCoreProfiles.map(p => this.getTypeName(p.identifier, "profile"));
		this.line(`export type USCoreProfile = ${profileNames.join(" | ")};`);
		this.blank();

		// Export US Core specific utilities
		this.comment("US Core Utilities");
		this.line("export function isUSCoreProfile(profileUrl: string): boolean {");
		this.line("  return profileUrl.includes('/us/core/') || profileUrl.includes('us-core-');");
		this.line("}");
		this.blank();

		this.line("export function getUSCoreProfileName(profileUrl: string): string | undefined {");
		this.line("  const entries = Object.entries(USCoreProfileRegistry);");
		this.line("  const found = entries.find(([key]) => profileUrl.includes(key));");
		this.line("  return found?.[1];");
		this.line("}");
	}

	private generateValueSetType(valueSet: TypeSchemaValueSet): void {
		const name = this.getTypeName(valueSet.identifier, "value-set");
		// Check if we have concrete codes (using 'concept' field)
		const concepts = valueSet.concept || [];
		if (concepts.length > 0) {
			console.log(name, valueSet.identifier, concepts.length);
			// Generate union type with concrete codes
			const codeValues = concepts
				.map((concept) => `"${concept.code}"`)
				.join(" | ");
			this.comment(`${valueSet.description || name}`);
			this.line(`export type ${name} = ${codeValues};`);
		} else {
			// Fallback to string type
			this.comment(`${valueSet.description || name} (codes not available)`);
			this.line(`export type ${name} = string;`);
		}
	}

	private generateBindingType(binding: any): void {
		const name = this.getTypeName(binding.identifier, "binding");

		// Check if the binding has a valueset with concepts
		const valueSet = binding.valueset;
		if (valueSet && valueSet.concept && valueSet.concept.length > 0) {
			// Generate union type with concrete codes
			const codeValues = valueSet.concept
				.map((concept: any) => `"${concept.code}"`)
				.join(" | ");
			this.comment(
				`${binding.description || name} - ${binding.strength || "required"} binding`,
			);
			this.line(`export type ${name} = ${codeValues};`);
		} else {
			// Fallback to string type
			this.comment(
				`${binding.description || name} - ${binding.strength || "required"} binding (codes not available)`,
			);
			this.line(`export type ${name} = string;`);
		}
	}

	private generateResourceFile(resource: TypeSchema): void {
		const fileName = `resources/${resource.identifier.name}.ts`;
		this.file(fileName);

		// Imports
		this.line("import * as primitives from '../types/primitives';");
		this.line("import * as complex from '../types/complex';");

		// Add specific imports for dependencies
		const deps = this.getResourceDependencies(resource);
		if (deps.length > 0) {
			this.blank();
			for (const dep of deps) {
				if (dep !== resource.identifier.name) {
					this.line(`import { ${dep} } from './${dep}';`);
				}
			}
		}

		this.blank();

		// Generate main interface
		this.generateInterface(resource);

		// Generate nested types
		if (resource.nested) {
			this.blank();
			for (const nested of resource.nested) {
				this.generateNestedInterface(nested);
				this.blank();
			}
		}
	}

	private generateInterface(schema: TypeSchema): void {
		const name = this.getTypeName(schema.identifier, schema.identifier.kind);
		const base = schema.base
			? this.getTypeName(schema.base, schema.identifier.kind)
			: null;

		// Generate JSDoc comment with description and metadata
		const jsdocLines = [schema.description || `${name} interface`];

		if (schema.identifier.url) {
			jsdocLines.push("", `@see ${schema.identifier.url}`);
		}

		if (base) {
			jsdocLines.push(`@extends ${base}`);
		}

		this.multiLineComment(jsdocLines.join("\n"));

		const header = base
			? `export interface ${name} extends ${base}`
			: `export interface ${name}`;

		this.curlyBlock(header, () => {
			if (schema.fields) {
				// Sort fields: required first, then optional
				const sortedFields = Object.entries(schema.fields).sort(
					([, a], [, b]) => {
						if (a.required !== b.required) {
							return a.required ? -1 : 1;
						}
						return 0;
					},
				);

				for (const [fieldName, field] of sortedFields) {
					this.generateField(fieldName, field, schema.identifier.kind);
				}
			}
		});

		this.generatedTypes.add(name);
	}

	private generateNestedInterface(nested: TypeSchemaNestedType): void {
		const name = this.getTypeName(nested.identifier, "nested");
		const base = nested.base
			? this.getTypeName(nested.base, "resource")
			: "complex.BackboneElement";

		this.curlyBlock(`export interface ${name} extends ${base}`, () => {
			for (const [fieldName, field] of Object.entries(nested.fields)) {
				this.generateField(fieldName, field, "resource");
			}
		});
	}

	private generateField(
		name: string,
		field: TypeSchemaField,
		currentContext?: string,
	): void {
		if (field.excluded) return;

		// Generate JSDoc comment for the field
		if (field.type?.name || field.reference || field.choices) {
			const docLines: string[] = [];

			if (field.type?.name) {
				docLines.push(`${name} field of type ${field.type.name}`);
			} else if (field.reference) {
				const refTypes = field.reference.map((ref) => ref.name).join(" | ");
				docLines.push(`Reference to ${refTypes}`);
			} else if (field.choices) {
				docLines.push(
					`Choice element - can be one of: ${field.choices.join(", ")}`,
				);
			}

			if (field.min !== undefined || field.max !== undefined) {
				const cardinality = `${field.min ?? 0}..${field.max ?? "*"}`;
				docLines.push(`Cardinality: ${cardinality}`);
			}

			if (docLines.length > 0) {
				this.line(`/** ${docLines.join(" | ")} */`);
			}
		}

		const fieldName = field.required ? name : `${name}?`;
		const fieldType = this.getFieldType(field, currentContext);

		this.line(`${fieldName}: ${fieldType};`);
	}

	private getFieldType(
		field: TypeSchemaField,
		currentContext?: string,
	): string {
		let baseType = "any";

		if (field.type) {
			baseType = this.getTypeName(field.type, currentContext);
		} else if (field.reference) {
			// Reference field - use generic Reference<T> types
			if (field.reference.length === 1) {
				const refType = this.getTypeName(field.reference[0], currentContext);
				baseType = `Reference<${refType}>`;
			} else {
				// Multiple reference types - union of Reference<T>
				const refTypes = field.reference
					.map((ref) => `Reference<${this.getTypeName(ref, currentContext)}>`)
					.join(" | ");
				baseType = refTypes;
			}
		} else if (field.choices && field.choices.length > 0) {
			// Choice type - handle value[x] patterns
			baseType = this.generateChoiceType(field.choices);
		} else if (field.choiceOf) {
			// This field is part of a choice element
			baseType = this.getChoiceElementType(
				field.choiceOf,
				field.type,
				currentContext,
			);
		}

		// Handle arrays
		if (field.array) {
			return `${baseType}[]`;
		}

		return baseType;
	}

	private generateChoiceType(choices: string[]): string {
		// Transform choice elements like ["valueString", "valueInteger", "valueBoolean"]
		// into union type like "string | number | boolean"
		const choiceTypes = choices.map((choice) => {
			// Extract the type from choice element name (e.g., "valueString" -> "string")
			const typeMatch = choice.match(/^value([A-Z].*)$/);
			if (typeMatch?.[1]) {
				const typeName = typeMatch[1].toLowerCase();
				return this.typeMapping.get(typeName) || "any";
			}
			return "any";
		});

		return choiceTypes.length > 0 ? choiceTypes.join(" | ") : "any";
	}

	private getChoiceElementType(
		choiceOf: string,
		type: TypeSchemaIdentifier | undefined,
		currentContext?: string,
	): string {
		if (type) {
			return this.getTypeName(type, currentContext);
		}

		// Fallback to extracting type from choice element name
		const typeMatch = choiceOf.match(/^value([A-Z].*)$/);
		if (typeMatch?.[1]) {
			const typeName = typeMatch[1].toLowerCase();
			return this.typeMapping.get(typeName) || "any";
		}

		return "any";
	}

	private getTypeName(
		identifier: TypeSchemaIdentifier,
		currentContext?: string,
	): string {
		const name = identifier.name;

		// Check if it's a primitive type
		if (this.typeMapping.has(name)) {
			return this.typeMapping.get(name) as string;
		}

		// Add namespace prefix based on kind and context
		switch (identifier.kind) {
			case "primitive-type":
				return `primitives.${name}`;
			case "complex-type":
				// If we're already in complex type context, don't add prefix
				return currentContext === "complex-type" ? name : `complex.${name}`;
			case "resource":
				return name;
			case "profile":
				// Profiles use their name directly as they're exported at the top level
				return name;
			default:
				return name;
		}
	}

	private generateReferenceType(): void {
		this.multiLineComment(
			[
				"Generic Reference type for FHIR references",
				"",
				"@template T - The type of resource being referenced",
			].join("\n"),
		);
		this.curlyBlock("export interface Reference<T = any>", () => {
			this.line("/** Literal reference, Relative, internal or absolute URL */");
			this.line("reference?: string;");
			this.blank();
			this.line('/** Type the reference refers to (e.g. "Patient") */');
			this.line("type?: string;");
			this.blank();
			this.line(
				"/** Logical reference, when literal reference is not known */",
			);
			this.line("identifier?: Identifier;");
			this.blank();
			this.line("/** Text alternative for the resource */");
			this.line("display?: string;");
		});
		this.blank();

		// Generate profile-aware reference types
		this.multiLineComment(
			[
				"Profile-aware Reference type for FHIR profile references",
				"",
				"This type extends the base Reference to include profile information",
				"for better type safety when working with profiles.",
				"",
				"@template T - The type of resource or profile being referenced",
			].join("\n"),
		);
		this.curlyBlock("export interface ProfileReference<T = any> extends Reference<T>", () => {
			this.line("/** Profile URL that the referenced resource conforms to */");
			this.line("profile?: string;");
			this.blank();
			this.line("/** Additional profile metadata */");
			this.line("_profile?: {");
			this.line("  /** Profile name for easier identification */");
			this.line("  name?: string;");
			this.line("  /** Whether this is a US Core profile */");
			this.line("  isUSCore?: boolean;");
			this.line("};");
		});
		this.blank();

		// Generate utility types for references
		this.multiLineComment(
			[
				"Utility type for creating references to specific resource types",
				"",
				"@template T - The resource type name (e.g., 'Patient', 'Observation')",
			].join("\n"),
		);
		this.line("export type ResourceReference<T extends string> = Reference & { type: T };");
		this.blank();

		this.multiLineComment(
			[
				"Utility type for creating references to specific profiles",
				"",
				"@template T - The profile type",
				"@template P - The profile URL",
			].join("\n"),
		);
		this.line("export type TypedProfileReference<T, P extends string> = ProfileReference<T> & { profile: P };");
	}

	private generateTypeAlias(primitive: TypeSchema): void {
		const name = primitive.identifier.name;
		const tsType = this.typeMapping.get(name) || "string";

		this.multiLineComment(primitive.description || `${name} primitive type`);
		this.line(`export type ${name} = ${tsType};`);
	}

	private async generateIndexFile(): Promise<void> {
		if (!this.schemas) return;

		this.file("index.ts");

		this.multiLineComment(
			[
				"FHIR TypeScript Type Definitions",
				"",
				"Auto-generated from FHIR schemas using atomic-codegen.",
				"",
				"This module provides complete TypeScript definitions for FHIR R4 resources,",
				"complex types, and primitive types with proper inheritance and references.",
				"",
				"@packageDocumentation",
			].join("\n"),
		);
		this.blank();

		// Export primitives and complex types
		this.comment("Core type exports");
		this.line("export * as primitives from './types/primitives';");
		this.line("export * as complex from './types/complex';");
		this.line("export type { Reference } from './types/primitives';");

		// Export valuesets if they exist
		const valueSets = this.schemas.valueSets || [];
		const bindings = this.schemas.bindings || [];
		if (valueSets.length > 0 || bindings.length > 0) {
			this.line("export * as valuesets from './types/valuesets';");
		}

		this.blank();

		// Export all resources individually
		this.comment("Individual resource exports");
		for (const resource of this.schemas.resources) {
			const name = resource.identifier.name;
			this.line(`export type { ${name} } from './resources/${name}';`);
		}
		this.blank();

		// Create a barrel export for all resources
		this.comment("Barrel export for all resources");
		this.line("export * as resources from './resources';");
		this.blank();

		// Export profiles if they exist
		if (this.schemas.profiles && this.schemas.profiles.length > 0) {
			this.comment("Individual profile exports");
			for (const profile of this.schemas.profiles) {
				const name = this.getTypeName(profile.identifier, "profile");
				const directory = profile.metadata?.isUSCore ? "uscore/" : "";
				this.line(`export type { ${name} } from './resources/profiles/${directory}${profile.identifier.name}';`);
			}
			this.blank();

			// Create a barrel export for all profiles
			this.comment("Barrel export for all profiles");
			this.line("export * as profiles from './resources/profiles';");
			this.blank();

			// Export US Core profiles specifically if they exist
			const usCoreProfiles = this.schemas.profiles.filter(p =>
				p.metadata?.isUSCore || p.identifier.name.toLowerCase().includes('uscore')
			);
			if (usCoreProfiles.length > 0) {
				this.comment("US Core profile exports");
				this.line("export * as uscore from './resources/profiles/uscore';");
				this.blank();
			}
		}

		// Generate ResourceTypeMap for runtime type checking
		this.multiLineComment(
			[
				"Runtime type map for FHIR resources",
				"",
				"Use this to check if a string is a valid FHIR resource type:",
				"```typescript",
				"if (resourceType in ResourceTypeMap) {",
				"  // resourceType is a valid FHIR resource",
				"}",
				"```",
			].join("\n"),
		);
		this.curlyBlock("export const ResourceTypeMap = {", () => {
			for (const resource of this.schemas.resources) {
				const name = resource.identifier.name;
				this.line(`${name}: true,`);
			}
		});
		this.line(" as const;");
		this.blank();

		// Generate ResourceType union
		this.multiLineComment("Union type of all FHIR resource type names");
		this.line("export type ResourceType = keyof typeof ResourceTypeMap;");
		this.blank();

		// Generate AnyResource union
		this.multiLineComment("Union type of all FHIR resource interfaces");
		const resourceImports = this.schemas.resources
			.map((r) => r.identifier.name)
			.join(" | ");
		this.line(`export type AnyResource = ${resourceImports};`);
		this.blank();

		// Generate utility types
		this.comment("Utility types for working with FHIR resources");
		this.multiLineComment(
			[
				"Extract the resource type from a resource object",
				"",
				"@template T - The resource type",
			].join("\n"),
		);
		this.line(
			"export type ResourceTypeOf<T extends AnyResource> = T['resourceType'];",
		);
		this.blank();

		this.multiLineComment(
			[
				"Type guard to check if an object is a FHIR resource",
				"",
				"@param obj - Object to check",
				"@returns True if the object has a valid resourceType",
			].join("\n"),
		);
		this.curlyBlock(
			"export function isFHIRResource(obj: any): obj is AnyResource",
			() => {
				this.line(
					"return obj && typeof obj === 'object' && obj.resourceType in ResourceTypeMap;",
				);
			},
		);
	}

	private topologicalSort(schemas: TypeSchema[]): TypeSchema[] {
		const sorted: TypeSchema[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const schemaMap = new Map<string, TypeSchema>();
		for (const schema of schemas) {
			schemaMap.set(schema.identifier.name, schema);
		}

		const visit = (schema: TypeSchema) => {
			const name = schema.identifier.name;

			if (visited.has(name)) return;
			if (visiting.has(name)) {
				// Circular dependency - just skip
				return;
			}

			visiting.add(name);

			// Visit dependencies first
			for (const dep of schema.dependencies) {
				const depSchema = schemaMap.get(dep.name);
				if (depSchema) {
					visit(depSchema);
				}
			}

			visiting.delete(name);
			visited.add(name);
			sorted.push(schema);
		};

		for (const schema of schemas) {
			visit(schema);
		}

		return sorted;
	}

	private getResourceDependencies(resource: TypeSchema): string[] {
		const deps = new Set<string>();

		// Check field references
		if (resource.fields) {
			for (const field of Object.values(resource.fields)) {
				if (field.reference) {
					for (const ref of field.reference) {
						if (ref.kind === "resource") {
							deps.add(ref.name);
						}
					}
				}
			}
		}

		return Array.from(deps);
	}
}
