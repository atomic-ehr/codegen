/**
 * A code generation friendly representation of FHIR StructureDefinition and FHIR Schema designed to simplify SDK resource classes/types generation.
 */

export type TypeSchemaIdentifierBase = {
	name: string;
	package: string;
	version: string;
	url: string;
};

export type TypeSchema =
	| TypeSchemaForPrimitiveType
	| TypeSchemaForResourceComplexTypeLogical
	| TypeSchemaForValueSet
	| TypeSchemaForBinding
	| TypeSchemaForProfile;

export type TypeSchemaIdentifier = TypeSchemaIdentifierBase &
	(
		| WithProfileKind
		| WithPrimitiveTypeKind
		| WithValuesetKind
		| WithComplexTypeKind
		| WithResourceKind
		| WithNestedKind
		| WithLogicalKind
		| WithBindingKind
	);

/**
 * Schema for basic FHIR data types like string, boolean, decimal
 */
export interface TypeSchemaForPrimitiveType {
	/**
	 * The unique identifier for this primitive type
	 */
	identifier: TypeSchemaIdentifier & WithPrimitiveTypeKind;
	/**
	 * Human-readable description of the primitive type
	 */
	description?: string;
	/**
	 * The base type this primitive type extends (typically Element)
	 */
	base:
		| WithPrimitiveTypeKind
		| WithValuesetKind
		| WithComplexTypeKind
		| WithResourceKind
		| WithNestedKind
		| WithLogicalKind
		| WithBindingKind;
	/**
	 * Other types that this primitive type depends on
	 */
	dependencies?: TypeSchemaIdentifier[];
}

/**
 * Constraint helper to ensure the kind profile
 */
export interface WithProfileKind {
	kind: "profile";
	[k: string]: unknown;
}

/**
 * Constraint helper to ensure the kind is primitive-type
 */
export interface WithPrimitiveTypeKind {
	kind: "primitive-type";
	[k: string]: unknown;
}
/**
 * Constraint helper to ensure the kind is value-set
 */
export interface WithValuesetKind {
	kind: "value-set";
	[k: string]: unknown;
}
/**
 * Constraint helper to ensure the kind is complex-type
 */
export interface WithComplexTypeKind {
	kind: "complex-type";
	[k: string]: unknown;
}
/**
 * Constraint helper to ensure the kind is resource
 */
export interface WithResourceKind {
	kind: "resource";
	[k: string]: unknown;
}
/**
 * Constraint helper to ensure the kind is nested
 */
export interface WithNestedKind {
	kind: "nested";
	[k: string]: unknown;
}
/**
 * Constraint helper to ensure the kind is logical
 */
export interface WithLogicalKind {
	kind: "logical";
	[k: string]: unknown;
}
/**
 * Constraint helper to ensure the kind is value-set
 */
export interface WithBindingKind {
	kind: "binding";
	[k: string]: unknown;
}

export interface TypeSchemaForProfile {
	identifier: TypeSchemaIdentifier & WithProfileKind;
	/**
	 * The base resource or type this profile constrains
	 */
	base: TypeSchemaIdentifier;
	/**
	 * Human-readable description of the profile
	 */
	description?: string;
	/**
	 * Fields defined or constrained by this profile
	 */
	fields?: Record<string, TypeSchemaField>;
	/**
	 * Profile-specific constraints on elements
	 */
	constraints?: Record<string, ProfileConstraint>;
	/**
	 * Extensions used by this profile
	 */
	extensions?: ProfileExtension[];
	/**
	 * Validation rules specific to this profile
	 */
	validation?: ValidationRule[];
	/**
	 * Other types that this profile depends on
	 */
	dependencies?: TypeSchemaIdentifier[];
	/**
	 * Additional profile metadata
	 */
	metadata?: ProfileMetadata;
	/**
	 * Nested types if any
	 */
	nested?: any[];
}

/**
 * Profile constraint on a field
 */
export interface ProfileConstraint {
	/**
	 * Minimum cardinality
	 */
	min?: number;
	/**
	 * Maximum cardinality
	 */
	max?: string;
	/**
	 * Must Support flag
	 */
	mustSupport?: boolean;
	/**
	 * Fixed value constraint
	 */
	fixedValue?: any;
	/**
	 * Pattern value constraint
	 */
	patternValue?: any;
	/**
	 * Value set binding constraint
	 */
	binding?: {
		strength: "required" | "extensible" | "preferred" | "example";
		valueSet: string;
	};
	/**
	 * Type constraints
	 */
	types?: Array<{
		code: string;
		profile?: string[];
		targetProfile?: string[];
	}>;
	/**
	 * Slicing information
	 */
	slicing?: {
		discriminator: any[];
		rules: string;
		ordered?: boolean;
	};
}

/**
 * Profile extension information
 */
export interface ProfileExtension {
	/**
	 * Element path where extension applies
	 */
	path: string;
	/**
	 * Extension profile URL
	 */
	profile: string | string[];
	/**
	 * Minimum cardinality
	 */
	min?: number;
	/**
	 * Maximum cardinality
	 */
	max?: string;
	/**
	 * Must Support flag
	 */
	mustSupport?: boolean;
}

/**
 * Profile validation rule
 */
export interface ValidationRule {
	/**
	 * Element path this rule applies to
	 */
	path: string;
	/**
	 * Rule key/identifier
	 */
	key: string;
	/**
	 * Severity level
	 */
	severity: "error" | "warning" | "information";
	/**
	 * Human readable description
	 */
	human: string;
	/**
	 * FHIRPath expression
	 */
	expression?: string;
}

/**
 * Profile metadata
 */
export interface ProfileMetadata {
	/**
	 * Publisher information
	 */
	publisher?: string;
	/**
	 * Contact information
	 */
	contact?: any[];
	/**
	 * Copyright notice
	 */
	copyright?: string;
	/**
	 * Purpose statement
	 */
	purpose?: string;
	/**
	 * Experimental flag
	 */
	experimental?: boolean;
	/**
	 * Publication date
	 */
	date?: string;
	/**
	 * Jurisdiction
	 */
	jurisdiction?: any[];
	/**
	 * Package information
	 */
	package?: string;
}

/**
 * Schema for FHIR resources, complex types, and logical types
 */
export interface TypeSchemaForResourceComplexTypeLogical {
	/**
	 * The unique identifier for this resource or type
	 */
	identifier: TypeSchemaIdentifier &
		(WithResourceKind | WithComplexTypeKind | WithLogicalKind);
	/**
	 * The base type this resource or type extends
	 */
	base?: TypeSchemaIdentifierBase &
		(
			| WithPrimitiveTypeKind
			| WithValuesetKind
			| WithComplexTypeKind
			| WithResourceKind
			| WithNestedKind
			| WithLogicalKind
			| WithBindingKind
		);
	/**
	 * Human-readable description of the resource or type
	 */
	description?: string;
	/**
	 * The fields contained in this resource or type
	 */
	fields?: {
		[k: string]:
			| RegularField
			| PolymorphicValueXFieldDeclaration
			| PolymorphicValueXFieldInstance;
	};
	/**
	 * BackboneElement types nested within this resource or type
	 */
	nested?: {
		/**
		 * The unique identifier for this nested type
		 */
		identifier: TypeSchemaIdentifier & WithNestedKind;
		/**
		 * The base type this nested type extends (typically BackboneElement)
		 */
		base:
			| WithPrimitiveTypeKind
			| WithValuesetKind
			| WithComplexTypeKind
			| WithResourceKind
			| WithNestedKind
			| WithLogicalKind
			| WithBindingKind;
		/**
		 * The fields contained in this nested type
		 */
		fields?: {
			[k: string]:
				| RegularField
				| PolymorphicValueXFieldDeclaration
				| PolymorphicValueXFieldInstance;
		};
	}[];
	/**
	 * Other types that this resource or type depends on
	 */
	dependencies?: TypeSchemaIdentifier[];
}
/**
 * A standard field with a single type
 */
export interface RegularField {
	/**
	 * The data type of this field
	 */
	type: TypeSchemaIdentifierBase &
		(
			| WithPrimitiveTypeKind
			| WithValuesetKind
			| WithComplexTypeKind
			| WithResourceKind
			| WithNestedKind
			| WithLogicalKind
			| WithBindingKind
		);
	/**
	 * Reference to other types that this field can point to
	 */
	reference?: TypeSchemaIdentifier[];
	/**
	 * Whether this field must be provided in valid instances
	 */
	required?: boolean;
	/**
	 * Whether this field is prohibited in valid instances
	 */
	excluded?: boolean;
	/**
	 * Whether this field can contain multiple values (cardinality > 1)
	 */
	array?: boolean;
	binding?: TypeSchemaIdentifier & WithBindingKind;
	/**
	 * For code fields, the set of valid values when bound to a required value set
	 */
	enum?: string[];
	/**
	 * Minimum limit of items for an array
	 */
	min?: number;
	/**
	 * Maximum limit of items for an array
	 */
	max?: number;
}
/**
 * The base declaration for a FHIR choice type (e.g., value[x])
 */
export interface PolymorphicValueXFieldDeclaration {
	/**
	 * The names of all concrete type options for this choice field
	 */
	choices: string[];
	/**
	 * Whether at least one choice must be provided
	 */
	required?: boolean;
	/**
	 * Whether all choices are prohibited
	 */
	excluded?: boolean;
	/**
	 * Whether the selected choice can contain multiple values
	 */
	array?: boolean;
	/**
	 * Minimum limit of items for an array
	 */
	min?: number;
	/**
	 * Maximum limit of items for an array
	 */
	max?: number;
}
/**
 * A specific type option for a FHIR choice type (e.g., valueString, valueInteger)
 */
export interface PolymorphicValueXFieldInstance {
	/**
	 * The name of the choice field this instance belongs to (e.g., 'value' for valueString)
	 */
	choiceOf: string;
	/**
	 * The data type of this choice option
	 */
	type: TypeSchemaIdentifierBase &
		(
			| WithPrimitiveTypeKind
			| WithValuesetKind
			| WithComplexTypeKind
			| WithResourceKind
			| WithNestedKind
			| WithLogicalKind
			| WithBindingKind
		);
	/**
	 * Whether this specific choice must be provided
	 */
	required?: boolean;
	/**
	 * Whether this specific choice is prohibited
	 */
	excluded?: boolean;
	/**
	 * Whether this choice can contain multiple values
	 */
	array?: boolean;
	/**
	 * Reference to other types that this field can point to
	 */
	reference?: TypeSchemaIdentifier[];
	/**
	 * For coded choices, information about the value set binding
	 */
	binding?: TypeSchemaIdentifier & WithBindingKind;
	/**
	 * For code fields, the set of valid values when bound to a required value set
	 */
	enum?: string[];
	/**
	 * Minimum limit of items for an array
	 */
	min?: number;
	/**
	 * Maximum limit of items for an array
	 */
	max?: number;
}
/**
 * Schema for FHIR value sets that define terminology bindings
 */
export interface TypeSchemaForValueSet {
	/**
	 * The unique identifier for this value set
	 */
	identifier: TypeSchemaIdentifier & WithValuesetKind;
	/**
	 * Human-readable description of the value set
	 */
	description?: string;
	/**
	 * The list of coded concepts contained in this value set
	 */
	concept?: {
		/**
		 * The code value
		 */
		code: string;
		/**
		 * The human-readable display text for this code
		 */
		display?: string;
		/**
		 * The code system URL that defines this code
		 */
		system?: string;
	}[];
	/**
	 * Complex value set composition rules when the value set is defined as a composition of other value sets
	 */
	compose?: {
		[k: string]: unknown;
	};
}
export interface TypeSchemaForBinding {
	/**
	 * The unique identifier for this value set
	 */
	identifier: TypeSchemaIdentifier & WithBindingKind;
	/**
	 * Human-readable description of the value set
	 */
	description?: string;
	type?: TypeSchemaIdentifier;
	/**
	 * The strength of the binding
	 */
	strength?: string;
	/**
	 * The enumeration of values for the binding
	 */
	enum?: string[];
	valueset?: TypeSchemaIdentifier & WithValuesetKind;
	/**
	 * Other types that this resource or type depends on
	 */
	dependencies?: TypeSchemaIdentifier[];
}

export type TypeSchemaField =
	| RegularField
	| PolymorphicValueXFieldDeclaration
	| PolymorphicValueXFieldInstance;

export interface TypeschemaGeneratorOptions {
	resourceTypes?: string[];
	verbose?: boolean;
	maxDepth?: number;
	logger?: import("../utils/codegen-logger").CodegenLogger;
}

export interface PackageInfo {
	name: string;
	version: string;
}

export type TypeschemaParserOptions = {
	format?: "auto" | "ndjson" | "json";
	validate?: boolean;
	strict?: boolean;
};
