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
	ProfileConstraint,
	ProfileExtension,
	TypeSchema,
	TypeSchemaField,
	TypeSchemaFieldPolymorphicDeclaration,
	TypeSchemaFieldPolymorphicInstance,
	TypeSchemaFieldRegular,
	TypeSchemaIdentifier,
	TypeSchemaNestedType,
	TypeSchemaValueSet,
} from "../../lib/typeschema";
import {
	isPolymorphicDeclarationField,
	isPolymorphicInstanceField,
	isRegularField,
} from "../../lib/typeschema/types";
import { toValidInterfaceName } from "../../lib/utils/naming";

interface ValueSetBinding {
	identifier: TypeSchemaIdentifier;
	description?: string;
	strength?: string;
	valueset?: {
		concept?: ValueSetConcept[];
	};
}

interface ValueSetConcept {
	code: string;
	display?: string;
}

export interface TypeScriptGeneratorOptions extends GeneratorOptions {
	packagePath?: string;
	baseTypesModule?: string;
	generateProfiles?: boolean;
}

export class TypeScriptGenerator extends BaseGenerator {
	readonly name = "typescript";
	readonly target = "TypeScript";

	private schemas: LoadedSchemas | null = null;
	private loader: SchemaLoader;
	private generatedTypes = new Set<string>();
	private generatedValuesets = new Set<string>();
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

		// Generate primitive types (Reference types only - primitive type aliases removed)
		this.log("Generating primitive types...");
		await this.generatePrimitiveTypes();

		// Generate complex types
		this.log("Generating complex types...");
		await this.generateComplexTypes();

		// Generate resources
		this.log("Generating resources...");
		await this.generateResources();

		// Skip generating dedicated value sets file - inline enum values in resources instead

		// Generate profiles (if enabled)
		if (this.options.generateProfiles !== false) {
			this.log("Generating profiles...");
			await this.generateProfiles();
		} else {
			this.log("Skipping profile generation (generateProfiles: false)");
		}

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

		this.file("types/primitive.ts");

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
	}

	private async generateComplexTypes(): Promise<void> {
		if (!this.schemas) return;

		// Sort by dependencies
		const sorted = this.topologicalSort(this.schemas.complexTypes);

		// Generate individual complex type files
		for (const type of sorted) {
			// Skip the FHIR "Reference" complex type since we use our generic Reference<T> instead
			if (type.identifier.name === "Reference") {
				continue;
			}
			this.generateComplexTypeFile(type);
		}

		// Generate complex types index file
		this.generateComplexTypesIndex(sorted);
	}

	private generateComplexTypeFile(type: TypeSchema): void {
		const fileName = `types/complex/${type.identifier.name}.ts`;
		this.file(fileName);

		// Import Reference type from primitives
		this.line("import type { Reference } from '../primitives';");

		// Import other complex types that this type depends on
		const dependencies = this.getComplexTypeDependencies(type);
		for (const dep of dependencies) {
			if (dep !== type.identifier.name && dep !== "Reference") {
				this.line(`import type { ${dep} } from './${dep}';`);
			}
		}
		this.blank();

		this.multiLineComment(
			[
				`FHIR ${type.identifier.name} Complex Type`,
				"",
				type.description || `${type.identifier.name} complex data type used in FHIR resources.`,
				"This type represents structured data elements that can contain multiple fields.",
			].join("\n"),
		);
		this.blank();

		this.generateComplexInterface(type);

		// Generate nested types if any
		if (type.nested) {
			this.blank();
			for (const nested of type.nested) {
				this.generateNestedInterface(nested, type.identifier.name);
				this.blank();
			}
		}
	}

	private generateComplexTypesIndex(sortedTypes: TypeSchema[]): void {
		this.file("types/complex/index.ts");

		this.multiLineComment(
			[
				"FHIR Complex Types Exports",
				"",
				"Barrel export for all FHIR complex types.",
				"Each complex type is defined in its own file for better organization.",
			].join("\n"),
		);
		this.blank();

		// Export all complex types
		for (const type of sortedTypes) {
			if (type.identifier.name === "Reference") {
				continue;
			}
			const name = type.identifier.name;
			this.line(`export type { ${name} } from './${name}';`);
		}
	}

	private getComplexTypeDependencies(type: TypeSchema): string[] {
		const dependencies = new Set<string>();

		if (type.fields) {
			for (const [, field] of Object.entries(type.fields)) {
				this.extractTypeDependencies(field, dependencies);
			}
		}

		return Array.from(dependencies);
	}

	private extractTypeDependencies(field: TypeSchemaField, dependencies: Set<string>): void {
		if (isRegularField(field)) {
			if (field.type?.kind === "complex-type") {
				dependencies.add(field.type.name);
			}
			if (field.elementType?.kind === "complex-type") {
				dependencies.add(field.elementType.name);
			}
		} else if (isPolymorphicDeclarationField(field)) {
			if (field.choiceOf && Array.isArray(field.choiceOf)) {
				for (const choice of field.choiceOf) {
					if (choice.type?.kind === "complex-type") {
						dependencies.add(choice.type.name);
					}
				}
			}
		} else if (isPolymorphicInstanceField(field)) {
			if (field.type?.kind === "complex-type") {
				dependencies.add(field.type.name);
			}
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

		// Merge valuesets and bindings to avoid duplicates
		const mergedTypes = this.mergeValueSetsAndBindings(valueSets, bindings);

		// Generate type aliases for merged valuesets
		for (const mergedType of mergedTypes) {
			if (mergedType.type === "binding") {
				const binding = mergedType.data as ValueSetBinding;
				this.generateBindingType(binding);
				// Track generated valueset
				const bindingName = this.getTypeName(binding.identifier, "binding");
				this.generatedValuesets.add(bindingName);
			} else {
				const valueSet = mergedType.data as TypeSchemaValueSet;
				this.generateValueSetType(valueSet);
				// Track generated valueset
				const valueSetName = this.getTypeName(valueSet.identifier, "value-set");
				this.generatedValuesets.add(valueSetName);
			}
			this.blank();
		}
	}

	private async generateProfiles(): Promise<void> {
		if (
			!this.schemas ||
			!this.schemas.profiles ||
			this.schemas.profiles.length === 0
		) {
			return;
		}

		// Group profiles by package
		const profilesByPackage = this.groupProfilesByPackage(this.schemas.profiles);

		// Generate individual profile files
		for (const profile of this.schemas.profiles) {
			this.generateProfileFile(profile);
		}

		// Generate package-specific index files
		for (const [packageName, profiles] of Object.entries(profilesByPackage)) {
			this.generatePackageProfilesIndex(packageName, profiles);
		}

		// Generate main profiles index file
		this.generateProfilesIndex(profilesByPackage);
	}

	private generateProfileFile(profile: TypeSchema): void {
		// Determine the directory structure based on profile package
		const packageName = this.getPackageNameFromProfile(profile);
		const directory = `resources/profiles/${packageName}`;

		const fileName = `${directory}/${profile.identifier.name}.ts`;
		this.file(fileName);

		// Calculate relative path depth for imports
		const relativeDepth = "../".repeat(packageName.split("/").length + 1);

		// Imports
		this.line(`import type { Reference } from '${relativeDepth}types/primitives';`);
		this.line(`import * as complex from '${relativeDepth}types/complex';`);

		// Import base resource/profile
		if (profile.base) {
			const baseName = this.getTypeName(profile.base, profile.base.kind);
			if (profile.base.kind === "resource") {
				this.line(`import { ${baseName} } from '${relativeDepth}resources/${profile.base.name}';`);
			} else if (profile.base.kind === "profile") {
				// Import from another profile
				const basePackageName = this.getPackageNameFromIdentifier(profile.base);
				const baseDirectory = basePackageName === packageName ? "." : `../${basePackageName}`;
				this.line(
					`import { ${baseName} } from '${baseDirectory}/${profile.base.name}';`,
				);
			}
		}

		this.blank();

		// Generate profile interface
		this.generateProfileInterface(profile);

		// Generate nested types if any
		if (profile.nested) {
			this.blank();
			for (const nested of profile.nested) {
				this.generateNestedInterface(nested, profile.identifier.name);
				this.blank();
			}
		}
	}

	private groupProfilesByPackage(profiles: TypeSchema[]): Record<string, TypeSchema[]> {
		const grouped: Record<string, TypeSchema[]> = {};

		for (const profile of profiles) {
			const packageName = this.getPackageNameFromProfile(profile);
			if (!grouped[packageName]) {
				grouped[packageName] = [];
			}
			grouped[packageName].push(profile);
		}

		return grouped;
	}

	private getPackageNameFromProfile(profile: TypeSchema): string {
		// Extract package name from profile metadata or identifier
		if (profile.metadata?.package) {
			return this.sanitizePackageName(profile.metadata.package);
		}

		// Try to extract from identifier URL
		if (profile.identifier.url) {
			if (profile.identifier.url.includes('/us/core/')) {
				return 'hl7-fhir-us-core';
			}
			if (profile.identifier.url.includes('hl7.org/fhir/')) {
				return 'hl7-fhir-r4-core';
			}
		}

		// Fallback to core
		return 'hl7-fhir-r4-core';
	}

	private getPackageNameFromIdentifier(identifier: TypeSchemaIdentifier): string {
		// Extract package name from identifier
		if (identifier.package) {
			return this.sanitizePackageName(identifier.package);
		}

		// Try to extract from URL
		if (identifier.url) {
			if (identifier.url.includes('/us/core/')) {
				return 'hl7-fhir-us-core';
			}
			if (identifier.url.includes('hl7.org/fhir/')) {
				return 'hl7-fhir-r4-core';
			}
		}

		// Fallback to core
		return 'hl7-fhir-r4-core';
	}

	private sanitizePackageName(packageName: string): string {
		// Convert package names like "hl7.fhir.us.core@6.1.0" to "hl7-fhir-us-core"
		return packageName
			.split('@')[0] // Remove version
			.replace(/\./g, '-') // Replace dots with dashes
			.toLowerCase();
	}

	private generatePackageProfilesIndex(packageName: string, profiles: TypeSchema[]): void {
		const fileName = `resources/profiles/${packageName}/index.ts`;
		this.file(fileName);

		// Calculate relative path depth for imports
		const relativeDepth = "../".repeat(packageName.split("-").length);

		this.multiLineComment(
			[
				`${packageName} Profile Exports`,
				"",
				`Profiles from the ${packageName} package.`,
				"Each profile extends base FHIR resources with additional constraints.",
			].join("\n"),
		);
		this.blank();

		// Export all profiles in this package
		this.comment("Profile Interfaces");
		for (const profile of profiles) {
			const name = this.getTypeName(profile.identifier, "profile");
			this.line(`export type { ${name} } from './${profile.identifier.name}';`);
		}
		this.blank();

		// Create package-specific registry
		this.comment("Profile Registry");
		this.line(`export const ${this.toPascalCase(packageName)}ProfileRegistry = {`);
		for (const profile of profiles) {
			const name = this.getTypeName(profile.identifier, "profile");
			this.line(`  "${profile.identifier.name}": "${name}",`);
		}
		this.line("} as const;");
		this.blank();

		// Export profile types union
		this.comment("Profile Union Type");
		const profileNames = profiles.map((p) =>
			this.getTypeName(p.identifier, "profile"),
		);
		this.line(`export type ${this.toPascalCase(packageName)}Profile = ${profileNames.join(" | ")};`);
	}

	private toPascalCase(str: string): string {
		return str
			.split('-')
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join('');
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
			if (profile.metadata.package) {
				jsdocLines.push(`@package ${profile.metadata.package}`);
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

	private generateConstraintField(
		path: string,
		constraint: ProfileConstraint,
	): void {
		// Extract field name from path (e.g., "Patient.name" -> "name")
		const fieldName = path.split(".").pop() || path;

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
			docLines.push(
				`Value set binding: ${constraint.binding.valueSet} (${constraint.binding.strength})`,
			);
		}

		this.line(`/** ${docLines.join(" | ")} */`);

		// Determine field type based on constraint
		let fieldType = "unknown";
		if (constraint.types && constraint.types.length > 0) {
			const typeNames = constraint.types.map((t) => t.code).join(" | ");
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

	private generateExtensionField(extension: ProfileExtension): void {
		// Extract extension name from path
		const extensionName = extension.path.split(".").pop() || extension.path;

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

	private generateProfilesIndex(profilesByPackage: Record<string, TypeSchema[]>): void {
		this.file("resources/profiles/index.ts");

		this.multiLineComment(
			[
				"FHIR Profile Exports",
				"",
				"Barrel export for all FHIR profiles organized by package.",
				"Each package contains profiles with specific constraints and extensions.",
			].join("\n"),
		);
		this.blank();

		// Export profiles from each package
		for (const [packageName, profiles] of Object.entries(profilesByPackage)) {
			this.comment(`${packageName} Profiles`);
			this.line(`export * from './${packageName}';`);
			this.blank();
		}

		// Export combined profile registry for runtime discovery
		this.comment("Combined Profile Registry");
		this.line("export const ProfileRegistry = {");
		for (const [packageName, profiles] of Object.entries(profilesByPackage)) {
			for (const profile of profiles) {
				const name = this.getTypeName(profile.identifier, "profile");
				this.line(
					`  "${profile.identifier.url || profile.identifier.name}": "${name}",`,
				);
			}
		}
		this.line("} as const;");
		this.blank();

		// Export profile metadata organized by package
		this.comment("Profile Metadata by Package");
		this.line("export const ProfileMetadata = {");
		for (const [packageName, profiles] of Object.entries(profilesByPackage)) {
			this.line(`  "${packageName}": {`);
			for (const profile of profiles) {
				const name = this.getTypeName(profile.identifier, "profile");
				this.line(`    "${name}": {`);
				this.line(`      url: "${profile.identifier.url || ""}",`);
				this.line(`      name: "${profile.identifier.name}",`);
				this.line(`      base: "${profile.base?.name || ""}",`);
				this.line(`      package: "${packageName}",`);
				if (profile.metadata?.publisher) {
					this.line(`      publisher: "${profile.metadata.publisher}",`);
				}
				this.line(`    },`);
			}
			this.line(`  },`);
		}
		this.line("} as const;");
		this.blank();

		// Export package names for easy access
		this.comment("Available Packages");
		const packageNames = Object.keys(profilesByPackage).map(name => `"${name}"`).join(" | ");
		this.line(`export type ProfilePackage = ${packageNames};`);
	}


	private generateValueSetType(valueSet: TypeSchemaValueSet): void {
		const name = this.getTypeName(valueSet.identifier, "value-set");

		// Check if we have concrete codes (using 'concept' field)
		const concepts = valueSet.concept || [];

		// Also check compose.include[].concept for inline codes
		const composeConcepts: Array<{ code: string; display?: string }> = [];
		if (valueSet.compose?.include) {
			for (const include of valueSet.compose.include) {
				if (include.concept) {
					composeConcepts.push(...include.concept);
				}
			}
		}

		// Combine all concepts
		const allConcepts = [...concepts, ...composeConcepts];

		if (allConcepts.length > 0) {
			// Generate union type with concrete codes
			const codeValues = allConcepts
				.map((concept) => `"${concept.code}"`)
				.join(" | ");

			// Generate comprehensive JSDoc with all codes and their displays
			const docLines = [valueSet.description || name];
			if (allConcepts.some((c) => c.display)) {
				docLines.push("");
				docLines.push("Possible values:");
				for (const concept of allConcepts) {
					if (concept.display) {
						docLines.push(`- \`${concept.code}\`: ${concept.display}`);
					} else {
						docLines.push(`- \`${concept.code}\``);
					}
				}
			}

			this.multiLineComment(docLines.join("\n"));
			this.line(`export type ${name} = ${codeValues};`);
		} else {
			// No codes available, but still create the type for consistency
			this.comment(
				`${valueSet.description || name} (codes not available - using string)`,
			);
			this.line(`export type ${name} = string;`);
		}
	}

	private generateBindingType(binding: ValueSetBinding): void {
		const name = this.getTypeName(binding.identifier, "binding");

		// Check if the binding has direct enum values
		if (binding.enum && binding.enum.length > 0) {
			// Generate union type from enum values
			const codeValues = binding.enum
				.map((code: string) => `"${code}"`)
				.join(" | ");

			const docLines = [
				binding.description || name,
				`Binding strength: ${binding.strength || "required"}`,
			];

			this.multiLineComment(docLines.join("\n"));
			this.line(`export type ${name} = ${codeValues};`);
			return;
		}

		// Check if the binding has a valueset with concepts
		const valueSet = binding.valueset;
		if (valueSet && valueSet.concept && valueSet.concept.length > 0) {
			// Generate union type with concrete codes
			const codeValues = valueSet.concept
				.map((concept: ValueSetConcept) => `"${concept.code}"`)
				.join(" | ");

			const docLines = [
				binding.description || name,
				`Binding strength: ${binding.strength || "required"}`,
				"",
				"Possible values:",
			];

			// Add code documentation
			for (const concept of valueSet.concept) {
				if (concept.display) {
					docLines.push(`- \`${concept.code}\`: ${concept.display}`);
				} else {
					docLines.push(`- \`${concept.code}\``);
				}
			}

			this.multiLineComment(docLines.join("\n"));
			this.line(`export type ${name} = ${codeValues};`);
		} else {
			// No codes available, but document the binding strength
			const docLines = [
				binding.description || name,
				`Binding strength: ${binding.strength || "required"}`,
				"(codes not available - using string)",
			];

			this.multiLineComment(docLines.join("\n"));
			this.line(`export type ${name} = string;`);
		}
	}

	private generateResourceFile(resource: TypeSchema): void {
		const fileName = `resources/${resource.identifier.name}.ts`;
		this.file(fileName);

		// Imports
		this.line("import * as primitives from '../types/primitives';");
		this.line("import * as complex from '../types/complex';");
		// No longer need Valuesets import - enum values are inlined
		this.line("import type { Reference } from '../types/primitives'");

		// Add base type imports
		if (resource.base) {
			const baseName = this.sanitizeIdentifier(resource.base.name);
			this.line(`import { ${baseName} } from './${baseName}';`);
		}

		// Add specific imports for dependencies
		const deps = this.getResourceDependencies(resource);
		if (deps.length > 0) {
			this.blank();
			for (const dep of deps) {
				const sanitizedDep = this.sanitizeIdentifier(dep);
				if (sanitizedDep !== resource.identifier.name) {
					this.line(`import { ${sanitizedDep} } from './${sanitizedDep}';`);
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
				this.generateNestedInterface(nested, resource.identifier.name);
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
					this.generateField(
						fieldName,
						field,
						schema.identifier.kind,
						schema.identifier.name,
					);
				}
			}
		});

		this.generatedTypes.add(name);
	}

	private generateComplexInterface(schema: TypeSchema): void {
		const name = this.getTypeName(schema.identifier, "complex-type");
		const base = schema.base
			? this.getTypeName(schema.base, "complex-type")
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
					this.generateField(
						fieldName,
						field,
						"complex-type",
						schema.identifier.name,
					);
				}
			}
		});

		this.generatedTypes.add(name);
	}

	private generateNestedInterface(
		nested: TypeSchemaNestedType,
		parentName?: string,
	): void {
		// Create prefixed name for nested interfaces
		const baseName = this.getTypeName(nested.identifier, "nested");
		const name = parentName ? `${parentName}${baseName}` : baseName;

		const base = nested.base
			? this.getTypeName(nested.base, "resource")
			: "complex.BackboneElement";

		this.curlyBlock(`export interface ${name} extends ${base}`, () => {
			for (const [fieldName, field] of Object.entries(nested.fields)) {
				this.generateField(fieldName, field, "resource", parentName);
			}
		});
	}

	private generateField(
		name: string,
		field: TypeSchemaField,
		currentContext?: string,
		parentResourceName?: string,
	): void {
		if (isRegularField(field) && field.excluded) return;
		if (isPolymorphicDeclarationField(field) && field.excluded) return;
		if (isPolymorphicInstanceField(field) && field.excluded) return;

		// Generate JSDoc comment for the field
		const docLines: string[] = [];

		if (isRegularField(field)) {
			if (field.type?.name) {
				docLines.push(`${name} field of type ${field.type.name}`);
			} else if (field.reference) {
				const refTypes = field.reference.map((ref) => ref.name).join(" | ");
				docLines.push(`Reference to ${refTypes}`);
			}

			if (field.min !== undefined || field.max !== undefined) {
				const cardinality = `${field.min ?? 0}..${field.max ?? "*"}`;
				docLines.push(`Cardinality: ${cardinality}`);
			}
		} else if (isPolymorphicDeclarationField(field)) {
			docLines.push(
				`Choice element - can be one of: ${field.choices.join(", ")}`,
			);

			if (field.min !== undefined || field.max !== undefined) {
				const cardinality = `${field.min ?? 0}..${field.max ?? "*"}`;
				docLines.push(`Cardinality: ${cardinality}`);
			}
		} else if (isPolymorphicInstanceField(field)) {
			docLines.push(`Polymorphic instance of ${field.choiceOf}`);

			if (field.type?.name) {
				docLines.push(`Type: ${field.type.name}`);
			} else if (field.reference) {
				const refTypes = field.reference.map((ref) => ref.name).join(" | ");
				docLines.push(`Reference to ${refTypes}`);
			}

			if (field.min !== undefined || field.max !== undefined) {
				const cardinality = `${field.min ?? 0}..${field.max ?? "*"}`;
				docLines.push(`Cardinality: ${cardinality}`);
			}
		}

		if (docLines.length > 0) {
			this.line(`/** ${docLines.join(" | ")} */`);
		}

		const isRequired = isRegularField(field)
			? field.required
			: isPolymorphicDeclarationField(field)
				? field.required
				: isPolymorphicInstanceField(field)
					? field.required
					: false;

		const fieldName = isRequired ? name : `${name}?`;
		const fieldType = this.getFieldType(
			field,
			currentContext,
			parentResourceName,
		);

		this.line(`${fieldName}: ${fieldType};`);
	}

	private getFieldType(
		field: TypeSchemaField,
		currentContext?: string,
		parentResourceName?: string,
	): string {
		let baseType = "unknown";

		if (isRegularField(field)) {
			// Check for enum values first (highest priority)
			if (field.enum && field.enum.length > 0) {
				// Direct enum values - create inline union type
				const enumValues = field.enum.map((value) => `"${value}"`).join(" | ");
				baseType = enumValues;
			}
			// Check for binding to valueset (second priority)
			else if (field.binding) {
				// Look up the binding to get its enum values
				const enumValues = this.getBindingEnumValues(field.binding);
				if (enumValues && enumValues.length > 0) {
					// Inline the enum values directly
					baseType = enumValues.map((value) => `"${value}"`).join(" | ");
				} else if (field.type) {
					// No enum values available, fall back to the field type
					const typeName = this.getTypeName(field.type, currentContext);

					// If we have a parent resource name and this appears to be a nested type,
					// prefix it with the resource name
					if (
						parentResourceName &&
						this.isNestedType(field.type, parentResourceName)
					) {
						baseType = `${parentResourceName}${typeName}`;
					} else {
						baseType = typeName;
					}
				} else {
					// No enum values or type, use string as fallback
					baseType = "string";
				}
			}
			// Prioritize reference arrays when they exist (typed references)
			else if (field.reference) {
				// Reference field - use generic Reference<'Type1' | 'Type2'> pattern
				if (field.reference.length === 1) {
					const refType = this.getTypeName(field.reference[0], currentContext);
					baseType = `Reference<'${refType}'>`;
				} else {
					// Multiple reference types - union of string literals within single Reference<T>
					const refTypes = field.reference
						.map((ref) => `'${this.getTypeName(ref, currentContext)}'`)
						.join(" | ");
					baseType = `Reference<${refTypes}>`;
				}
			} else if (field.type) {
				const typeName = this.getTypeName(field.type, currentContext);

				// If we have a parent resource name and this appears to be a nested type,
				// prefix it with the resource name
				if (
					parentResourceName &&
					this.isNestedType(field.type, parentResourceName)
				) {
					baseType = `${parentResourceName}${typeName}`;
				} else {
					baseType = typeName;
				}
			}

			// Handle arrays
			if (field.array) {
				return `${baseType}[]`;
			}
		} else if (isPolymorphicDeclarationField(field)) {
			// Choice type - handle value[x] patterns
			baseType = this.generateChoiceType(field.choices);

			// Handle arrays
			if (field.array) {
				return `${baseType}[]`;
			}
		} else if (isPolymorphicInstanceField(field)) {
			// This field is part of a choice element
			baseType = this.getChoiceElementType(
				field.choiceOf,
				field.type,
				currentContext,
			);

			// Handle arrays
			if (field.array) {
				return `${baseType}[]`;
			}
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
				const mappedType = this.typeMapping.get(typeName);
				if (mappedType) {
					return mappedType;
				}
				// Try to map common FHIR types
				switch (typeName) {
					case "datetime":
						return "string";
					case "period":
						return "complex.Period";
					case "timing":
						return "complex.Timing";
					case "reference":
						return "complex.Reference";
					case "codeableconcept":
						return "complex.CodeableConcept";
					case "quantity":
						return "complex.Quantity";
					case "attachment":
						return "complex.Attachment";
					case "coding":
						return "complex.Coding";
					case "contactpoint":
						return "complex.ContactPoint";
					case "humanname":
						return "complex.HumanName";
					case "address":
						return "complex.Address";
					case "identifier":
						return "complex.Identifier";
					default:
						return `complex.${typeName.charAt(0).toUpperCase() + typeName.slice(1)}`;
				}
			}
			// If no pattern match, assume it's a complex type
			return `complex.${choice.charAt(0).toUpperCase() + choice.slice(1)}`;
		});

		return choiceTypes.length > 0 ? choiceTypes.join(" | ") : "unknown";
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
			const mappedType = this.typeMapping.get(typeName);
			if (mappedType) {
				return mappedType;
			}
			// Try to map common FHIR types
			switch (typeName) {
				case "datetime":
					return "string";
				case "period":
					return "complex.Period";
				case "timing":
					return "complex.Timing";
				case "reference":
					return "complex.Reference";
				case "codeableconcept":
					return "complex.CodeableConcept";
				case "quantity":
					return "complex.Quantity";
				case "attachment":
					return "complex.Attachment";
				case "coding":
					return "complex.Coding";
				case "contactpoint":
					return "complex.ContactPoint";
				case "humanname":
					return "complex.HumanName";
				case "address":
					return "complex.Address";
				case "identifier":
					return "complex.Identifier";
				default:
					return `complex.${typeName.charAt(0).toUpperCase() + typeName.slice(1)}`;
			}
		}

		return "unknown";
	}

	private getTypeName(
		identifier: TypeSchemaIdentifier,
		currentContext?: string,
	): string {
		const rawName = identifier.name;

		// Check if it's a primitive type (use raw name for mapping check)
		if (this.typeMapping.has(rawName)) {
			return this.typeMapping.get(rawName) as string;
		}

		// Extract resource name from FHIR URLs if needed
		let extractedName = rawName;
		if (rawName.includes("http://hl7.org/fhir/StructureDefinition/")) {
			extractedName = rawName.split("/").pop() || rawName;
		}

		// Convert name to valid TypeScript identifier
		const name = toValidInterfaceName(extractedName);

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
			case "value-set":
			case "binding":
				// Use meaningful names for valuesets based on resource-field pattern
				return this.getMeaningfulValuesetName(identifier, name);
			default:
				return name;
		}
	}

	private mergeValueSetsAndBindings(
		valueSets: TypeSchemaValueSet[],
		bindings: ValueSetBinding[],
	): Array<{
		type: "valueset" | "binding";
		data: TypeSchemaValueSet | ValueSetBinding;
	}> {
		const result: Array<{
			type: "valueset" | "binding";
			data: TypeSchemaValueSet | ValueSetBinding;
		}> = [];
		const processedNames = new Set<string>();
		const processedUrls = new Set<string>();
		const urlToValueSet = new Map<string, TypeSchemaValueSet>();

		// First, build a map of URLs to valuesets, prioritizing those with codes
		for (const valueSet of valueSets) {
			const url = valueSet.identifier.url;
			const existingValueSet = urlToValueSet.get(url);

			const hasConcepts = valueSet.concept && valueSet.concept.length > 0;
			const hasComposeConcepts = valueSet.compose?.include?.some(
				(include) => include.concept && include.concept.length > 0,
			);

			// Only keep valuesets with actual codes, or if we don't have one yet
			if (!existingValueSet || hasConcepts || hasComposeConcepts) {
				urlToValueSet.set(url, valueSet);
			}
		}

		// Process bindings first (they have better names)
		for (const binding of bindings) {
			const name = this.getTypeName(binding.identifier, "binding");

			// Check if there's a valueset with codes for this binding
			const valueSetUrl = binding.valueset?.url;
			const valueSet = valueSetUrl ? urlToValueSet.get(valueSetUrl) : undefined;

			if (valueSet && valueSet.concept && valueSet.concept.length > 0) {
				// We have a valueset with codes - use it with the binding's name
				const mergedValueSet = {
					...valueSet,
					identifier: {
						...valueSet.identifier,
						name: binding.identifier.name, // Use binding's name for better Resource-field naming
					},
				};

				if (!processedNames.has(name)) {
					result.push({ type: "valueset", data: mergedValueSet });
					processedNames.add(name);
					processedUrls.add(valueSetUrl);
					// Mark this valueset as processed
					urlToValueSet.delete(valueSetUrl);
				}
			} else if (binding.enum && binding.enum.length > 0) {
				// Binding has enum values directly - use it
				if (!processedNames.has(name)) {
					result.push({ type: "binding", data: binding });
					processedNames.add(name);
					if (valueSetUrl) {
						processedUrls.add(valueSetUrl);
						urlToValueSet.delete(valueSetUrl);
					}
				}
			}
			// Skip bindings without codes - we don't want string fallbacks
		}

		// Add remaining valuesets that weren't matched to bindings
		// But ONLY if they have actual codes
		for (const valueSet of urlToValueSet.values()) {
			const hasConcepts = valueSet.concept && valueSet.concept.length > 0;
			const hasComposeConcepts = valueSet.compose?.include?.some(
				(include) => include.concept && include.concept.length > 0,
			);

			if (hasConcepts || hasComposeConcepts) {
				const name = this.getTypeName(valueSet.identifier, "value-set");
				if (
					!processedNames.has(name) &&
					!processedUrls.has(valueSet.identifier.url)
				) {
					result.push({ type: "valueset", data: valueSet });
					processedNames.add(name);
					processedUrls.add(valueSet.identifier.url);
				}
			}
			// Skip valuesets without codes - no string fallbacks
		}

		return result;
	}

	private isValuesetGenerated(valuesetName: string): boolean {
		return this.generatedValuesets.has(valuesetName);
	}

	/**
	 * Get enum values from a binding
	 */
	private getBindingEnumValues(binding: TypeSchemaIdentifier): string[] | null {
		if (!this.schemas) return null;

		// Find the binding schema
		const bindingSchema = this.schemas.bindings?.find(
			(b) =>
				b.identifier.name === binding.name && b.identifier.url === binding.url,
		);

		if (!bindingSchema) {
			return null;
		}

		// Check if binding has direct enum values
		if (bindingSchema.enum && bindingSchema.enum.length > 0) {
			return bindingSchema.enum;
		}

		// Check if binding has a valueset with concepts
		const valueset = this.schemas.valueSets?.find(
			(vs) =>
				vs.identifier.name === bindingSchema.valueset?.name ||
				vs.identifier.url === bindingSchema.valueset?.url,
		);

		if (valueset) {
			// Get concepts from direct concept array
			if (valueset.concept && valueset.concept.length > 0) {
				return valueset.concept.map((c) => c.code);
			}

			// Get concepts from compose structure
			if (valueset.compose?.include) {
				const codes: string[] = [];
				for (const include of valueset.compose.include) {
					if (include.concept) {
						codes.push(...include.concept.map((c) => c.code));
					}
				}
				if (codes.length > 0) {
					return codes;
				}
			}
		}

		return null;
	}

	private getMeaningfulValuesetName(
		identifier: TypeSchemaIdentifier,
		fallbackName: string,
	): string {
		// Check if the fallback name is a hash-like string (base64-like pattern)
		const isHashLikeName = /^[A-Za-z0-9_-]{40,}$/.test(fallbackName);

		// Try to extract meaningful name from binding identifier
		if (identifier.kind === "binding" && identifier.name.includes(".")) {
			// Format: ResourceName.fieldName_binding -> ResourceName-fieldName
			const parts = identifier.name.replace("_binding", "").split(".");
			if (parts.length >= 2) {
				const resourceName = parts[0];
				const fieldName = parts[parts.length - 1];
				return toValidInterfaceName(`${resourceName}-${fieldName}`);
			}
		}

		// For value-sets, try to extract from URL or description
		if (identifier.kind === "value-set") {
			const url = identifier.url || "";

			// If we have a hash-like name, try harder to extract meaningful name from URL
			if (isHashLikeName && url) {
				// Handle CapabilityStatement URLs
				if (url.includes("/CapabilityStatement/")) {
					const capabilityId = url.split("/CapabilityStatement/").pop()?.split("|")[0];
					if (capabilityId) {
						return toValidInterfaceName(`CapabilityStatement ${capabilityId}`);
					}
				}

				// Handle other FHIR resource URLs
				const urlParts = url.split("/");
				if (urlParts.length >= 2) {
					const resourceType = urlParts[urlParts.length - 2];
					const resourceId = urlParts[urlParts.length - 1].split("|")[0];

					// Generate meaningful name from resource type and ID
					if (resourceType && resourceId && resourceId !== "base" && resourceId !== "base2") {
						return toValidInterfaceName(`${resourceType} ${resourceId}`);
					} else if (resourceType) {
						return toValidInterfaceName(resourceType);
					}
				}

				// Handle URN-style URLs
				if (url.startsWith("urn:uuid:")) {
					const uuid = url.replace("urn:uuid:", "");
					return toValidInterfaceName(`Resource ${uuid.substring(0, 8).toLowerCase()}`);
				}

				// Extract domain-based names
				try {
					const urlObj = new URL(url);
					const pathParts = urlObj.pathname.split("/").filter(p => p);
					if (pathParts.length > 0) {
						const lastPart = pathParts[pathParts.length - 1];
						if (lastPart && lastPart !== "base" && lastPart !== "base2") {
							// Handle special cases like "knowledge-repository"
							if (lastPart === "knowledge-repository") {
								return "KnowledgeRepository";
							}
							return toValidInterfaceName(lastPart.replace(/-/g, " "));
						}
					}
					// Use hostname as fallback, but avoid "fhir" prefix
					const hostname = urlObj.hostname.replace(/^www\./, "").replace(/^fhir\./, "");
					return toValidInterfaceName(`${hostname} Resource`);
				} catch {
					// If URL parsing fails, use a generic name
					return toValidInterfaceName("Unknown Resource");
				}
			}

			// Handle standard FHIR valuesets (non-hash names)
			if (url.includes("/ValueSet/")) {
				const valueSetId = url.split("/ValueSet/").pop()?.split("|")[0];
				if (valueSetId) {
					// Convert kebab-case to PascalCase
					return toValidInterfaceName(valueSetId.replace(/-/g, " "));
				}
			}

			// Handle account-specific valuesets
			if (
				url.includes("account") ||
				identifier.name.toLowerCase().includes("account")
			) {
				if (
					url.includes("status") ||
					identifier.name.toLowerCase().includes("status")
				) {
					return "AccountStatus";
				}
				if (
					url.includes("type") ||
					identifier.name.toLowerCase().includes("type")
				) {
					return "AccountType";
				}
			}
		}

		// If it's a hash-like name and we couldn't extract from URL, use a generic name
		if (isHashLikeName) {
			return toValidInterfaceName("Generated Resource");
		}

		// Fallback to original name
		return fallbackName;
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
		this.curlyBlock(
			"export interface ProfileReference<T = any> extends Reference<T>",
			() => {
				this.line(
					"/** Profile URL that the referenced resource conforms to */",
				);
				this.line("profile?: string;");
				this.blank();
				this.line("/** Additional profile metadata */");
				this.line("_profile?: {");
				this.line("  /** Profile name for easier identification */");
				this.line("  name?: string;");
				this.line("  /** Package name that this profile belongs to */");
				this.line("  package?: string;");
				this.line("};");
			},
		);
		this.blank();

		// Generate utility types for references
		this.multiLineComment(
			[
				"Utility type for creating references to specific resource types",
				"",
				"@template T - The resource type name (e.g., 'Patient', 'Observation')",
			].join("\n"),
		);
		this.line(
			"export type ResourceReference<T extends string> = Reference & { type: T };",
		);
		this.blank();

		this.multiLineComment(
			[
				"Utility type for creating references to specific profiles",
				"",
				"@template T - The profile type",
				"@template P - The profile URL",
			].join("\n"),
		);
		this.line(
			"export type TypedProfileReference<T, P extends string> = ProfileReference<T> & { profile: P };",
		);
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
				"This module provides complete TypeScript definitions for FHIR R4 resources",
				"and complex types with proper inheritance and references.",
				"",
				"@packageDocumentation",
			].join("\n"),
		);
		this.blank();

		// Export complex types and Reference types (primitive type aliases removed)
		this.comment("Core type exports");
		// this.line("export * as primitives from './types/primitives';");
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

		// Export profiles if they exist and profile generation is enabled
		if (
			this.options.generateProfiles !== false &&
			this.schemas.profiles &&
			this.schemas.profiles.length > 0
		) {
			// Group profiles by package for organized exports
			const profilesByPackage = this.groupProfilesByPackage(this.schemas.profiles);

			this.comment("Individual profile exports by package");
			for (const [packageName, profiles] of Object.entries(profilesByPackage)) {
				this.comment(`${packageName} profiles`);
				for (const profile of profiles) {
					const name = this.getTypeName(profile.identifier, "profile");
					this.line(
						`export type { ${name} } from './resources/profiles/${packageName}/${profile.identifier.name}';`,
					);
				}
				this.blank();
			}

			// Create a barrel export for all profiles
			this.comment("Barrel export for all profiles");
			this.line("export * as profiles from './resources/profiles';");
			this.blank();

			// Export package-specific profile namespaces
			this.comment("Package-specific profile exports");
			for (const packageName of Object.keys(profilesByPackage)) {
				const namespaceName = this.toPascalCase(packageName).toLowerCase();
				this.line(`export * as ${namespaceName} from './resources/profiles/${packageName}';`);
			}
			this.blank();
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
		this.line("export const ResourceTypeMap = {");
		this.indent();
		for (const resource of this.schemas.resources) {
			const name = resource.identifier.name;
			this.line(`${name}: true,`);
		}
		this.dedent();
		this.line("} as const;");
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
			"export function isFHIRResource(obj: unknown): obj is AnyResource",
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

		// Check field references - but skip Reference fields since they only use string literals
		if (resource.fields) {
			for (const field of Object.values(resource.fields)) {
				// Skip reference fields - they only use string literals in Reference<'Type'>
				if (isRegularField(field) && field.reference) {
					continue;
				}

				// Check for actual type usage (non-reference fields that use resource types)
				if (
					isRegularField(field) &&
					field.type &&
					field.type.kind === "resource"
				) {
					deps.add(field.type.name);
				}
			}
		}

		// Check nested types for actual dependencies
		if (resource.nested) {
			for (const nested of resource.nested) {
				if (nested.fields) {
					for (const field of Object.values(nested.fields)) {
						// Skip reference fields
						if (isRegularField(field) && field.reference) {
							continue;
						}

						// Check for actual type usage
						if (
							isRegularField(field) &&
							field.type &&
							field.type.kind === "resource"
						) {
							deps.add(field.type.name);
						}
					}
				}
			}
		}

		return Array.from(deps);
	}

	private isNestedType(
		typeIdentifier: TypeSchemaIdentifier,
		parentResourceName: string,
	): boolean {
		// More comprehensive detection: check if it's a simple name (no URL)
		// that matches common nested interface patterns
		const typeName = typeIdentifier.name;

		// If it has a URL namespace, it's likely not a nested type
		if (typeName.includes("http://") || typeName.includes("/")) {
			return false;
		}

		// If it's a primitive type, it's not nested
		if (this.typeMapping.has(typeName)) {
			return false;
		}

		// If it's a well-known complex type, it's not nested
		const wellKnownComplexTypes = [
			"Element",
			"BackboneElement",
			"Extension",
			"Meta",
			"Narrative",
			"Identifier",
			"CodeableConcept",
			"Coding",
			"Quantity",
			"Range",
			"Ratio",
			"SampledData",
			"Period",
			"Attachment",
			"ContactPoint",
			"HumanName",
			"Address",
			"Timing",
			"Signature",
			"Annotation",
			"Reference",
			"Count",
			"Distance",
			"Duration",
			"Age",
			"Money",
		];

		if (wellKnownComplexTypes.includes(typeName)) {
			return false;
		}

		// If it's a simple name and not a known global type, assume it's nested
		return true;
	}

	/**
	 * Sanitize identifier to be a valid TypeScript identifier
	 * Converts URLs and invalid characters to valid identifiers
	 */
	private sanitizeIdentifier(identifier: string): string {
		// If it's a URL, extract the last part
		if (identifier.includes("://")) {
			const parts = identifier.split("/");
			identifier = parts[parts.length - 1] || identifier;
		}

		// Remove invalid characters and convert to PascalCase
		return identifier
			.replace(/[^a-zA-Z0-9]/g, "")
			.replace(/^[0-9]/, "_$&") // Prefix with underscore if starts with number
			.replace(/^./, (char) => char.toUpperCase()); // Ensure starts with uppercase
	}
}
