/**
 * TypeScript type definitions for Type Schema
 *
 * Generated based on type-schema.schema.json
 * A code generation friendly representation of FHIR StructureDefinition
 * and FHIR Schema designed to simplify SDK resource classes/types generation.
 */

// Base identifier interface containing common properties
export interface TypeSchemaIdentifierBase {
	/** The FHIR package identifier (e.g., hl7.fhir.r4.core) */
	package: string;
	/** The version of the package */
	version: string;
	/** Computer friendly identifier for the element */
	name: string;
	/** A canonical URL identifying this resource uniquely in the FHIR ecosystem */
	url: string;
}

// Kind-specific constraint interfaces
export interface WithPrimitiveTypeKind {
	kind: "primitive-type";
}

export interface WithValueSetKind {
	kind: "value-set";
}

export interface WithBindingKind {
	kind: "binding";
}

export interface WithComplexTypeKind {
	kind: "complex-type";
}

export interface WithResourceKind {
	kind: "resource";
}

export interface WithNestedKind {
	kind: "nested";
}

export interface WithLogicalKind {
	kind: "logical";
}

// Combined type schema identifier union
export type TypeSchemaIdentifier =
	| (TypeSchemaIdentifierBase & WithPrimitiveTypeKind)
	| (TypeSchemaIdentifierBase & WithValueSetKind)
	| (TypeSchemaIdentifierBase & WithBindingKind)
	| (TypeSchemaIdentifierBase & WithComplexTypeKind)
	| (TypeSchemaIdentifierBase & WithResourceKind)
	| (TypeSchemaIdentifierBase & WithNestedKind)
	| (TypeSchemaIdentifierBase & WithLogicalKind);

// Field type definitions
export interface RegularField {
	/** The data type of this field */
	type: TypeSchemaIdentifier;
	/** Reference to other types that this field can point to */
	reference?: TypeSchemaIdentifier[];
	/** Whether this field must be provided in valid instances */
	required?: boolean;
	/** Whether this field is prohibited in valid instances */
	excluded?: boolean;
	/** Whether this field can contain multiple values (cardinality > 1) */
	array?: boolean;
	/** Binding information for coded fields */
	binding?: TypeSchemaIdentifierBase & WithBindingKind;
	/** For code fields, the set of valid values when bound to a required value set */
	enum?: string[];
	/** Minimum limit of items for an array */
	min?: number;
	/** Maximum limit of items for an array */
	max?: number;
}

export interface PolymorphicDeclarationField {
	/** The names of all concrete type options for this choice field */
	choices: string[];
	/** Whether at least one choice must be provided */
	required?: boolean;
	/** Whether all choices are prohibited */
	excluded?: boolean;
	/** Whether the selected choice can contain multiple values */
	array?: boolean;
	/** Minimum limit of items for an array */
	min?: number;
	/** Maximum limit of items for an array */
	max?: number;
}

export interface PolymorphicInstanceField {
	/** The name of the choice field this instance belongs to (e.g., 'value' for valueString) */
	choiceOf: string;
	/** The data type of this choice option */
	type: TypeSchemaIdentifier;
	/** Whether this specific choice must be provided */
	required?: boolean;
	/** Whether this specific choice is prohibited */
	excluded?: boolean;
	/** Whether this choice can contain multiple values */
	array?: boolean;
	/** Reference to other types that this field can point to */
	reference?: TypeSchemaIdentifier[];
	/** For coded choices, information about the value set binding */
	binding?: TypeSchemaIdentifierBase & WithBindingKind;
	/** For code fields, the set of valid values when bound to a required value set */
	enum?: string[];
	/** Minimum limit of items for an array */
	min?: number;
	/** Maximum limit of items for an array */
	max?: number;
}

// Union type for all field types
export type TypeSchemaField =
	| RegularField
	| PolymorphicDeclarationField
	| PolymorphicInstanceField;

// Nested type definition (for BackboneElement types)
export interface NestedType {
	/** The unique identifier for this nested type */
	identifier: TypeSchemaIdentifierBase & WithNestedKind;
	/** The base type this nested type extends (typically BackboneElement) */
	base: TypeSchemaIdentifier;
	/** The fields contained in this nested type */
	fields?: Record<string, TypeSchemaField>;
}

// Value set concept definition
export interface ValueSetConcept {
	/** The code value */
	code: string;
	/** The human-readable display text for this code */
	display?: string;
	/** The code system URL that defines this code */
	system?: string;
}

// Main type schema definitions for each kind

export interface TypeSchemaForPrimitiveType {
	/** The unique identifier for this primitive type */
	identifier: TypeSchemaIdentifierBase & WithPrimitiveTypeKind;
	/** The base type this primitive type extends (typically Element) */
	base: TypeSchemaIdentifier;
	/** Human-readable description of the primitive type */
	description?: string;
	/** Other types that this primitive type depends on */
	dependencies?: TypeSchemaIdentifier[];
}

export interface TypeSchemaForResourceComplexLogical {
	/** The unique identifier for this resource or type */
	identifier:
		| (TypeSchemaIdentifierBase & WithResourceKind)
		| (TypeSchemaIdentifierBase & WithComplexTypeKind)
		| (TypeSchemaIdentifierBase & WithLogicalKind);
	/** The base type this resource or type extends */
	base?: TypeSchemaIdentifier;
	/** Human-readable description of the resource or type */
	description?: string;
	/** The fields contained in this resource or type */
	fields?: Record<string, TypeSchemaField>;
	/** BackboneElement types nested within this resource or type */
	nested?: NestedType[];
	/** Other types that this resource or type depends on */
	dependencies?: TypeSchemaIdentifier[];
}

export interface TypeSchemaForValueSet {
	/** The unique identifier for this value set */
	identifier: TypeSchemaIdentifierBase & WithValueSetKind;
	/** Human-readable description of the value set */
	description?: string;
	/** The list of coded concepts contained in this value set */
	concept?: ValueSetConcept[];
	/** Complex value set composition rules when the value set is defined as a composition of other value sets */
	compose?: Record<string, unknown>;
}

export interface TypeSchemaForBinding {
	/** The unique identifier for this binding */
	identifier: TypeSchemaIdentifierBase & WithBindingKind;
	/** Human-readable description of the binding */
	description?: string;
	/** The type this binding applies to */
	type?: TypeSchemaIdentifier;
	/** The strength of the binding */
	strength?: string;
	/** The enumeration of values for the binding */
	enum?: string[];
	/** Reference to the value set for this binding */
	valueset?: TypeSchemaIdentifierBase & WithValueSetKind;
	/** Other types that this binding depends on */
	dependencies?: TypeSchemaIdentifier[];
}

// Union type for all type schemas
export type TypeSchema =
	| TypeSchemaForPrimitiveType
	| TypeSchemaForResourceComplexLogical
	| TypeSchemaForValueSet
	| TypeSchemaForBinding;

// Type guards for discriminating between different schema types
export function isPrimitiveTypeSchema(
	schema: TypeSchema,
): schema is TypeSchemaForPrimitiveType {
	return schema.identifier.kind === "primitive-type";
}

export function isResourceSchema(
	schema: TypeSchema,
): schema is TypeSchemaForResourceComplexLogical {
	return schema.identifier.kind === "resource";
}

export function isComplexTypeSchema(
	schema: TypeSchema,
): schema is TypeSchemaForResourceComplexLogical {
	return schema.identifier.kind === "complex-type";
}

export function isLogicalSchema(
	schema: TypeSchema,
): schema is TypeSchemaForResourceComplexLogical {
	return schema.identifier.kind === "logical";
}

export function isValueSetSchema(
	schema: TypeSchema,
): schema is TypeSchemaForValueSet {
	return schema.identifier.kind === "value-set";
}

export function isBindingSchema(
	schema: TypeSchema,
): schema is TypeSchemaForBinding {
	return schema.identifier.kind === "binding";
}

export function isNestedTypeSchema(
	identifier: TypeSchemaIdentifier,
): identifier is TypeSchemaIdentifierBase & WithNestedKind {
	return identifier.kind === "nested";
}

// Field type guards
export function isRegularField(field: TypeSchemaField): field is RegularField {
	return "type" in field && !("choiceOf" in field) && !("choices" in field);
}

export function isPolymorphicDeclarationField(
	field: TypeSchemaField,
): field is PolymorphicDeclarationField {
	return "choices" in field;
}

export function isPolymorphicInstanceField(
	field: TypeSchemaField,
): field is PolymorphicInstanceField {
	return "choiceOf" in field && "type" in field;
}

// Utility types for working with schemas
export type SchemaKind = TypeSchemaIdentifier["kind"];

export type SchemasByKind = {
	"primitive-type": TypeSchemaForPrimitiveType;
	resource: TypeSchemaForResourceComplexLogical;
	"complex-type": TypeSchemaForResourceComplexLogical;
	logical: TypeSchemaForResourceComplexLogical;
	"value-set": TypeSchemaForValueSet;
	binding: TypeSchemaForBinding;
	nested: never; // Nested types are embedded within other schemas
};

export type GetSchemaByKind<K extends SchemaKind> =
	K extends keyof SchemasByKind ? SchemasByKind[K] : never;

// Helper types for extracting information
export type ExtractFieldNames<T extends TypeSchema> =
	T extends TypeSchemaForResourceComplexLogical
		? T["fields"] extends Record<string, any>
			? keyof T["fields"]
			: never
		: never;

export type ExtractFieldType<
	T extends TypeSchema,
	F extends string,
> = T extends TypeSchemaForResourceComplexLogical
	? T["fields"] extends Record<string, any>
		? F extends keyof T["fields"]
			? T["fields"][F]
			: never
		: never
	: never;
