/**
 * FHIR Generator Module
 *
 * Comprehensive FHIR-specific generator with full FHIR specification support.
 * Provides specialized handling for resources, profiles, extensions, value sets,
 * code systems, and operations.
 */

// CodeSystem generation
export {
	createCodeSystemConcept,
	findConceptByCode,
	generateCodeSystemType,
	generateCodeSystemTypes,
	generateConstantsFromCodeSystem,
	generateEnumFromCodeSystem,
	getAllConceptCodes,
	validateCodeSystemConcepts,
} from "./codesystems";
// Extension generation
export {
	createExtensionDefinitionInfo,
	generateExtensionType,
	generateExtensionTypes,
} from "./extensions";
// Main generator
export {
	FHIRGenerator,
	generateFHIRFromPackage,
	generateFHIRFromTypeSchemas,
} from "./generator";
// Operation generation
export {
	generateOperationType,
	generateOperationTypes,
} from "./operations";
// Profile generation
export {
	createProfileConstraintInfo,
	generateProfileType,
	generateProfileTypes,
} from "./profiles";
// Resource generation
export {
	createResourceDependency,
	generateResourceType,
	generateResourceTypes,
} from "./resources";
// Types and interfaces
export type {
	BackboneElementInfo,
	// Utility types
	ChoiceTypeInfo,
	CodeSystemConcept,
	// CodeSystem types
	CodeSystemInfo,
	ExtensionContext,
	// Extension types
	ExtensionDefinitionInfo,
	FHIRGenerationContext,
	// Generator options and context
	FHIRGeneratorOptions,
	FHIRResourceGenerationResult,
	GenerationWarning,
	// Operation types
	OperationDefinitionInfo,
	OperationParameter,
	// Profile types
	ProfileConstraintInfo,
	ProfileExtension,
	ResourceDependency,
	ResourceGenerationMetadata,
	ValueSetCompose,
	ValueSetConcept,
	ValueSetExpansion,
	ValueSetFilter,
	ValueSetInclude,
	// ValueSet types
	ValueSetInfo,
} from "./types";
// Utility functions (TypeSchema-based, no hardcoded constants)
export {
	getFHIRComplexTypes,
	getFHIRPrimitiveTypes,
	getFHIRResourceTypes,
	getFHIRTypeKind,
	isFHIRComplexType,
	isFHIRPrimitiveType,
	isFHIRResourceType,
} from "./types";
// ValueSet generation
export {
	createValueSetConcept,
	createValueSetFilter,
	createValueSetInclude,
	generateEnumFromValueSet,
	generateValueSetType,
	generateValueSetTypes,
	validateValueSetCompose,
} from "./valuesets";
