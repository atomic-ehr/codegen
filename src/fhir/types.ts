/**
 * FHIR Generator Types
 *
 * Core type definitions for FHIR-specific generation functionality.
 * Extends the base TypeSchema types with FHIR-specific concepts.
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import type {
	AnyTypeSchema,
	PackageInfo,
	TypeSchemaIdentifier,
} from "../typeschema/lib-types";

/**
 * FHIR generation options
 */
export interface FHIRGeneratorOptions {
	/** Include profiles in generation */
	includeProfiles?: boolean;
	/** Include extensions in generation */
	includeExtensions?: boolean;
	/** Include value sets in generation */
	includeValueSets?: boolean;
	/** Include code systems in generation */
	includeCodeSystems?: boolean;
	/** Include operation definitions */
	includeOperations?: boolean;
	/** FHIR version to target */
	fhirVersion?: "R4" | "R5";
	/** Verbose logging */
	verbose?: boolean;
	/** Filter specific resource types */
	resourceTypes?: string[];
	/** Maximum recursion depth for nested types */
	maxDepth?: number;
}

/**
 * FHIR resource generation result
 */
export interface FHIRResourceGenerationResult {
	/** Generated TypeSchema */
	schema: AnyTypeSchema;
	/** Source FHIR schema */
	source: FHIRSchema;
	/** Generation metadata */
	metadata: ResourceGenerationMetadata;
}

/**
 * Resource generation metadata
 */
export interface ResourceGenerationMetadata {
	/** Resource type */
	resourceType: string;
	/** Generation timestamp */
	generatedAt: Date;
	/** Profile constraints applied */
	profilesApplied: string[];
	/** Extensions included */
	extensionsIncluded: string[];
	/** Warnings encountered */
	warnings: GenerationWarning[];
}

/**
 * Generation warning
 */
export interface GenerationWarning {
	/** Warning message */
	message: string;
	/** Path where warning occurred */
	path?: string;
	/** Warning code */
	code: string;
	/** Severity level */
	severity: "low" | "medium" | "high";
}

/**
 * Profile constraint information
 */
export interface ProfileConstraintInfo {
	/** Element path */
	path: string;
	/** Constraint type */
	type: "cardinality" | "type" | "binding" | "fixed" | "pattern" | "slicing";
	/** Original constraint */
	original?: any;
	/** Applied constraint */
	applied: any;
	/** Profile that applied this constraint */
	profileUrl: string;
}

/**
 * Extension definition information
 */
export interface ExtensionDefinitionInfo {
	/** Extension URL */
	url: string;
	/** Extension name */
	name: string;
	/** Value type(s) */
	valueTypes: string[];
	/** Cardinality */
	cardinality: { min: number; max: string };
	/** Context where extension can be used */
	context: ExtensionContext[];
}

/**
 * Extension context
 */
export interface ExtensionContext {
	/** Context type */
	type: "element" | "extension" | "fhirpath";
	/** Context expression */
	expression: string;
}

/**
 * ValueSet processing information
 */
export interface ValueSetInfo {
	/** ValueSet URL */
	url: string;
	/** ValueSet name */
	name: string;
	/** Status */
	status: "active" | "draft" | "retired";
	/** Expansion information */
	expansion?: ValueSetExpansion;
	/** Compose information */
	compose?: ValueSetCompose;
}

/**
 * ValueSet expansion
 */
export interface ValueSetExpansion {
	/** Total number of concepts */
	total?: number;
	/** Concepts in expansion */
	contains: ValueSetConcept[];
}

/**
 * ValueSet compose
 */
export interface ValueSetCompose {
	/** Include rules */
	include: ValueSetInclude[];
	/** Exclude rules */
	exclude?: ValueSetInclude[];
}

/**
 * ValueSet include/exclude
 */
export interface ValueSetInclude {
	/** System URI */
	system?: string;
	/** Version */
	version?: string;
	/** Concepts */
	concept?: ValueSetConcept[];
	/** Filters */
	filter?: ValueSetFilter[];
	/** Include other value sets */
	valueSet?: string[];
}

/**
 * ValueSet concept
 */
export interface ValueSetConcept {
	/** Concept code */
	code: string;
	/** Display text */
	display?: string;
	/** System URI */
	system?: string;
	/** Version */
	version?: string;
}

/**
 * ValueSet filter
 */
export interface ValueSetFilter {
	/** Property to filter on */
	property: string;
	/** Operation */
	op:
		| "="
		| "is-a"
		| "descendent-of"
		| "is-not-a"
		| "regex"
		| "in"
		| "not-in"
		| "generalizes"
		| "exists";
	/** Filter value */
	value: string;
}

/**
 * CodeSystem information
 */
export interface CodeSystemInfo {
	/** CodeSystem URL */
	url: string;
	/** CodeSystem name */
	name: string;
	/** Status */
	status: "active" | "draft" | "retired";
	/** Content type */
	content: "not-present" | "example" | "fragment" | "complete" | "supplement";
	/** Concepts */
	concept?: CodeSystemConcept[];
}

/**
 * CodeSystem concept
 */
export interface CodeSystemConcept {
	/** Concept code */
	code: string;
	/** Display text */
	display?: string;
	/** Definition */
	definition?: string;
	/** Child concepts */
	concept?: CodeSystemConcept[];
}

/**
 * Operation definition information
 */
export interface OperationDefinitionInfo {
	/** Operation URL */
	url: string;
	/** Operation name */
	name: string;
	/** Operation code */
	code: string;
	/** Resource types this operation applies to */
	resource?: string[];
	/** System level operation */
	system: boolean;
	/** Type level operation */
	type: boolean;
	/** Instance level operation */
	instance: boolean;
	/** Input parameters */
	parameter?: OperationParameter[];
}

/**
 * Operation parameter
 */
export interface OperationParameter {
	/** Parameter name */
	name: string;
	/** Usage (in/out) */
	use: "in" | "out";
	/** Minimum cardinality */
	min: number;
	/** Maximum cardinality */
	max: string;
	/** Documentation */
	documentation?: string;
	/** Parameter type */
	type?: string;
	/** Target profile */
	targetProfile?: string[];
	/** Search type for search parameters */
	searchType?: string;
	/** Nested parameters */
	part?: OperationParameter[];
}

/**
 * FHIR generation context
 */
export interface FHIRGenerationContext {
	/** Canonical manager for resolving references */
	manager: CanonicalManager;
	/** Package information */
	packageInfo?: PackageInfo;
	/** Generation options */
	options: FHIRGeneratorOptions;
	/** Current recursion depth */
	depth: number;
	/** Cache of generated identifiers */
	identifierCache: Map<string, TypeSchemaIdentifier>;
	/** Profiles being processed (to detect cycles) */
	processingProfiles: Set<string>;
	/** Extensions being processed (to detect cycles) */
	processingExtensions: Set<string>;
	/** Available TypeSchema collection for type resolution */
	availableSchemas: AnyTypeSchema[];
}

/**
 * Choice type information
 */
export interface ChoiceTypeInfo {
	/** Base element name (e.g., "value") */
	baseName: string;
	/** Available types */
	types: string[];
	/** Type constraints from profiles */
	constraints?: Record<string, any>;
}

/**
 * Backbone element information
 */
export interface BackboneElementInfo {
	/** Element path */
	path: string;
	/** Generated type name */
	typeName: string;
	/** Fields in this backbone element */
	fields: string[];
	/** Nested backbone elements */
	nested: BackboneElementInfo[];
}

/**
 * Resource dependency information
 */
export interface ResourceDependency {
	/** Dependency type */
	type:
		| "reference"
		| "include"
		| "extension"
		| "profile"
		| "valueset"
		| "codesystem";
	/** Target identifier */
	target: TypeSchemaIdentifier;
	/** Source path that created this dependency */
	sourcePath?: string;
	/** Whether this is a required dependency */
	required: boolean;
}

/**
 * Get FHIR primitive types from TypeSchema collection
 */
export function getFHIRPrimitiveTypes(schemas: AnyTypeSchema[]): string[] {
	return schemas
		.filter((schema) => schema.identifier.kind === "primitive-type")
		.map((schema) => schema.identifier.name);
}

/**
 * Get FHIR complex types from TypeSchema collection
 */
export function getFHIRComplexTypes(schemas: AnyTypeSchema[]): string[] {
	return schemas
		.filter((schema) => schema.identifier.kind === "complex-type")
		.map((schema) => schema.identifier.name);
}

/**
 * Get FHIR resource types from TypeSchema collection
 */
export function getFHIRResourceTypes(schemas: AnyTypeSchema[]): string[] {
	return schemas
		.filter((schema) => schema.identifier.kind === "resource")
		.map((schema) => schema.identifier.name);
}

/**
 * Type guard for FHIR primitive types using TypeSchema
 */
export function isFHIRPrimitiveType(
	type: string,
	schemas: AnyTypeSchema[],
): boolean {
	return getFHIRPrimitiveTypes(schemas).includes(type);
}

/**
 * Type guard for FHIR complex types using TypeSchema
 */
export function isFHIRComplexType(
	type: string,
	schemas: AnyTypeSchema[],
): boolean {
	return getFHIRComplexTypes(schemas).includes(type);
}

/**
 * Type guard for FHIR resource types using TypeSchema
 */
export function isFHIRResourceType(
	type: string,
	schemas: AnyTypeSchema[],
): boolean {
	return getFHIRResourceTypes(schemas).includes(type);
}

/**
 * Get the kind for a FHIR type from TypeSchema collection
 */
export function getFHIRTypeKind(
	type: string,
	schemas: AnyTypeSchema[],
): TypeSchemaIdentifier["kind"] {
	const schema = schemas.find((s) => s.identifier.name === type);
	if (schema) {
		return schema.identifier.kind;
	}

	// Fallback to basic inference if not found in schemas
	if (isFHIRPrimitiveType(type, schemas)) {
		return "primitive-type";
	}
	if (isFHIRResourceType(type, schemas)) {
		return "resource";
	}
	return "complex-type"; // default
}
