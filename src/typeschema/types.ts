/**
 * TypeSchema Core Types
 *
 * This module defines all TypeScript interfaces and types for the TypeSchema format,
 * which serves as the intermediate representation for FHIR SDK generation.
 * Based on the fhir-clj/type-schema specification.
 */

/**
 * Identifier for any TypeSchema entity
 */
export interface TypeSchemaIdentifier {
	kind:
		| "primitive-type"
		| "resource"
		| "complex-type"
		| "nested"
		| "logical"
		| "binding"
		| "value-set"
		| "profile";
	package: string;
	version: string;
	name: string;
	url: string;
}

/**
 * Regular field definition in a TypeSchema
 */
export interface TypeSchemaFieldRegular {
	type?: TypeSchemaIdentifier;
	reference?: TypeSchemaIdentifier[];
	required?: boolean;
	excluded?: boolean;
	array?: boolean;
	binding?: TypeSchemaIdentifier;
	enum?: string[];
	min?: number;
	max?: number;
	description?: string;
}

/**
 * Polymorphic declaration field (e.g., value[x])
 */
export interface TypeSchemaFieldPolymorphicDeclaration {
	choices: string[];
	required?: boolean;
	excluded?: boolean;
	array?: boolean;
	min?: number;
	max?: number;
	description?: string;
}

/**
 * Polymorphic instance field (e.g., valueString, valueInteger)
 */
export interface TypeSchemaFieldPolymorphicInstance {
	choiceOf: string;
	type?: TypeSchemaIdentifier;
	reference?: TypeSchemaIdentifier[];
	required?: boolean;
	excluded?: boolean;
	array?: boolean;
	binding?: TypeSchemaIdentifier;
	enum?: string[];
	min?: number;
	max?: number;
	description?: string;
}

/**
 * Union type for all field types
 */
export type TypeSchemaField =
	| TypeSchemaFieldRegular
	| TypeSchemaFieldPolymorphicDeclaration
	| TypeSchemaFieldPolymorphicInstance;

/**
 * Nested type (BackboneElement) definition
 */
export interface TypeSchemaNestedType {
	identifier: TypeSchemaIdentifier;
	base: TypeSchemaIdentifier;
	fields: Record<string, TypeSchemaField>;
}

/**
 * Profile constraint definition
 */
export interface ProfileConstraint {
	min?: number;
	max?: number;
	mustSupport?: boolean;
	fixedValue?: any;
	patternValue?: any;
	binding?: {
		strength: string;
		valueSet: string;
	};
	types?: Array<{
		code: string;
		profile?: string[];
		targetProfile?: string[];
	}>;
	slicing?: {
		discriminator?: Array<{
			type: string;
			path: string;
		}>;
		rules?: string;
		ordered?: boolean;
	};
}

/**
 * Profile extension definition
 */
export interface ProfileExtension {
	path: string;
	profile: string[];
	min?: number;
	max?: string;
	mustSupport?: boolean;
}

/**
 * Profile validation rule
 */
export interface ProfileValidationRule {
	path: string;
	key: string;
	severity: string;
	human: string;
	expression?: string;
}

/**
 * Primitive Type TypeSchema
 */
export interface TypeSchemaPrimitiveType {
	identifier: TypeSchemaIdentifier;
	description?: string;
}

/**
 * Resource/Complex Type TypeSchema
 */
export interface TypeSchemaResourceType {
	identifier: TypeSchemaIdentifier;
	base?: TypeSchemaIdentifier;
	description?: string;
	fields?: Record<string, TypeSchemaField>;
	nested?: TypeSchemaNestedType[];
}

/**
 * Profile TypeSchema
 */
export interface TypeSchemaProfile {
	identifier: TypeSchemaIdentifier;
	base: TypeSchemaIdentifier;
	description?: string;
	fields?: Record<string, TypeSchemaField>;
	nested?: TypeSchemaNestedType[];
	metadata?: Record<string, any>;
	constraints?: Record<string, ProfileConstraint>;
	extensions?: ProfileExtension[];
	validation?: ProfileValidationRule[];
}


/**
 * Binding TypeSchema for value set bindings
 */
export interface TypeSchemaBinding {
	identifier: TypeSchemaIdentifier;
	type?: TypeSchemaIdentifier;
	valueset: TypeSchemaIdentifier;
	strength: string;
	enum?: string[];
	dependencies: TypeSchemaIdentifier[];
}

/**
 * Value Set TypeSchema
 */
export interface TypeSchemaValueSet {
	identifier: TypeSchemaIdentifier;
	description?: string;
	concept?: Array<{
		code: string;
		display?: string;
		system?: string;
	}>;
	compose?: {
		include?: Array<{
			system?: string;
			concept?: Array<{
				code: string;
				display?: string;
			}>;
			filter?: Array<{
				property: string;
				op: string;
				value: string;
			}>;
			valueSet?: string[];
		}>;
		exclude?: Array<{
			system?: string;
			concept?: Array<{
				code: string;
				display?: string;
			}>;
			filter?: Array<{
				property: string;
				op: string;
				value: string;
			}>;
			valueSet?: string[];
		}>;
	};
}

/**
 * Union type for all TypeSchema variants (spec-compliant)
 */
export type AnyTypeSchemaCompliant =
	| TypeSchemaPrimitiveType
	| TypeSchemaResourceType
	| TypeSchemaProfile
	| TypeSchemaValueSet
	| TypeSchemaBinding;


/**
 * Package metadata from fhir-canonical-manager
 */
export interface PackageInfo {
	name: string;
	version: string;
	canonical?: string;
	fhirVersions?: string[];
}

/**
 * Context for transformation operations
 */
export interface TransformContext {
	packageInfo?: PackageInfo;
	verbose?: boolean;
}

/**
 * Generation options for TypeSchema creation
 */
export interface GeneratorOptions {
	packageName?: string;
	packageVersion?: string;
	outputFormat?: "ndjson" | "json";
	includeValueSets?: boolean;
	includeBindings?: boolean;
	includeProfiles?: boolean;
	includeExtensions?: boolean;
	includeCodeSystems?: boolean;
	includeOperations?: boolean;
	fhirVersion?: "R4" | "R5";
	resourceTypes?: string[];
	maxDepth?: number;
	verbose?: boolean;
}

/**
 * Parser options for reading TypeSchema files
 */
export interface ParserOptions {
	format?: "auto" | "ndjson" | "json";
	validate?: boolean;
	strict?: boolean;
}

/**
 * Validation result for TypeSchema documents
 */
export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
}

export interface ValidationError {
	message: string;
	path?: string;
	code?: string;
	severity: "error";
}

export interface ValidationWarning {
	message: string;
	path?: string;
	code?: string;
	severity: "warning";
}

/**
 * TypeScript generation options
 */
export interface TypeScriptGeneratorOptions {
	outputDir?: string;
	moduleFormat?: "esm" | "cjs";
	generateIndex?: boolean;
	includeDocuments?: boolean;
	namingConvention?: "PascalCase" | "camelCase";
	includeExtensions?: boolean;
	includeProfiles?: boolean;
}

// Type guards for field types
export function isRegularField(
	field: TypeSchemaField,
): field is TypeSchemaFieldRegular {
	return !("choices" in field) && !("choiceOf" in field);
}

export function isPolymorphicDeclarationField(
	field: TypeSchemaField,
): field is TypeSchemaFieldPolymorphicDeclaration {
	return "choices" in field;
}

export function isPolymorphicInstanceField(
	field: TypeSchemaField,
): field is TypeSchemaFieldPolymorphicInstance {
	return "choiceOf" in field;
}

// Type guards for schema types (spec-compliant)
export function isPrimitiveTypeSchema(
	schema: AnyTypeSchemaCompliant,
): schema is TypeSchemaPrimitiveType {
	return schema.identifier.kind === "primitive-type";
}

export function isResourceTypeSchema(
	schema: AnyTypeSchemaCompliant,
): schema is TypeSchemaResourceType {
	return ["resource", "complex-type", "logical", "nested"].includes(
		schema.identifier.kind,
	);
}

export function isProfileTypeSchema(
	schema: AnyTypeSchemaCompliant,
): schema is TypeSchemaProfile {
	return schema.identifier.kind === "profile";
}

export function isTypeSchemaBinding(
	schema: AnyTypeSchemaCompliant,
): schema is TypeSchemaBinding {
	return (
		schema.identifier.kind === "binding" &&
		"valueset" in schema &&
		"strength" in schema
	);
}

export function isTypeSchemaValueSet(
	schema: AnyTypeSchemaCompliant,
): schema is TypeSchemaValueSet {
	return (
		schema.identifier.kind === "value-set" &&
		("concept" in schema || "compose" in schema)
	);
}



// Type guard for valid kind values
export function isValidKind(kind: string): kind is TypeSchemaIdentifier["kind"] {
	return [
		"primitive-type",
		"resource",
		"complex-type",
		"nested",
		"logical",
		"binding",
		"value-set",
		"profile",
	].includes(kind as TypeSchemaIdentifier["kind"]);
}
