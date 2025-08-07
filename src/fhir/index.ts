/**
 * FHIR Generator Module
 *
 * Comprehensive FHIR-specific generator with full FHIR specification support.
 * Provides specialized handling for resources, profiles, extensions, value sets,
 * code systems, and operations.
 */

export {
	getAllFHIRComplexTypes,
	getInterfaceNameForComplexType,
	hasChoiceElements,
	isCodedType,
	isQuantityType,
	isReferenceType,
	isTemporalType,
} from "./core/complex-types";
// Core utilities
export {
	getAllFHIRPrimitiveTypes,
	getTypeScriptTypeForPrimitive,
	isPrimitiveFHIRType,
	validatePrimitiveValue,
} from "./core/primitives";
// Resource generation
export {
	createResourceDependency,
	generateResourceType,
	generateResourceTypes,
} from "./core/resources";
// Core types and utilities
// Feature types
export type {
	BackboneElementInfo,
	ChoiceTypeInfo,
	CodeSystemConcept,
	CodeSystemInfo,
	ExtensionContext,
	ExtensionDefinitionInfo,
	FHIRGenerationContext,
	FHIRGeneratorOptions,
	FHIRResourceGenerationResult,
	GenerationWarning,
	OperationDefinitionInfo,
	OperationParameter,
	ProfileConstraintInfo,
	ProfileExtension,
	ResourceDependency,
	ResourceGenerationMetadata,
	ValueSetCompose,
	ValueSetConcept,
	ValueSetExpansion,
	ValueSetFilter,
	ValueSetInclude,
	ValueSetInfo,
} from "./core/types";
export {
	getFHIRComplexTypes,
	getFHIRPrimitiveTypes,
	getFHIRResourceTypes,
	getFHIRTypeKind,
	isFHIRComplexType,
	isFHIRPrimitiveType,
	isFHIRResourceType,
} from "./core/types";
export {
	ValidationErrorCodes,
	type ValidationResult,
} from "./core/validation";
// Feature modules
export {
	createCodeSystemConcept,
	findConceptByCode,
	generateCodeSystemType,
	generateCodeSystemTypes,
	generateConstantsFromCodeSystem,
	generateEnumFromCodeSystem,
	getAllConceptCodes,
	validateCodeSystemConcepts,
} from "./features/codesystems";
export {
	createExtensionDefinitionInfo,
	generateExtensionType,
	generateExtensionTypes,
} from "./features/extensions";
export {
	generateOperationType,
	generateOperationTypes,
} from "./features/operations";
export {
	createProfileConstraintInfo,
	generateProfileType,
	generateProfileTypes,
} from "./features/profiles";
// Search functionality
export {
	ChainedSearchBuilder,
	FHIRSearchBuilder,
	OperationBuilder,
} from "./features/search/builder";
export type {
	ProcessedSearchParameter,
	ResourceSearchParameters,
	SearchParameterModifier,
	SearchParameterPrefix,
	SearchParameterType,
} from "./features/search/parameters";
export {
	extractAllSearchParameters,
	extractSearchParametersForResource,
	generateSearchParameterTypes,
} from "./features/search/parameters";
export type {
	ChainedParam,
	CommonSearchParams,
	CompositeParam,
	DateParam,
	ModifiedParam,
	NumberParam,
	PrefixedParam,
	QuantityParam,
	ReferenceParam,
	SearchBundle,
	SearchBundleEntry,
	SearchParameterDefinition,
	SearchResponse,
	StringParam,
	TokenParam,
	UriParam,
} from "./features/search/types";
export {
	createValueSetConcept,
	createValueSetFilter,
	createValueSetInclude,
	generateEnumFromValueSet,
	generateValueSetType,
	generateValueSetTypes,
	validateValueSetCompose,
} from "./features/valuesets";
export {
	type GraphQLClientGenerationOptions,
	generateGraphQLClient,
} from "./generators/client/graphql";
// Client generators
export {
	generateRestClient,
	type RestClientGenerationOptions,
} from "./generators/client/rest";
export {
	generateEnhancedSearchClient,
	type EnhancedSearchClientGenerationOptions,
} from "./generators/client/search";
export {
	type BuilderGenerationOptions,
	generateBuilders,
} from "./generators/typescript/builders";
// TypeScript generators
export {
	DEFAULT_INTERFACE_OPTIONS,
	EnhancedInterfaceGenerator,
	type EnhancedInterfaceResult,
	generateEnhancedInterfaces,
	type InterfaceGeneratorOptions,
} from "./generators/typescript/enhanced-interfaces";
export type {
	CardinalityConstraint,
	ChoiceTypeDiscriminator,
	ChoiceTypeInfo as GuardChoiceTypeInfo,
	FieldTypeGuard,
	GuardGenerationOptions,
	PrimitiveTypeGuard,
	ResourceTypeGuard,
	TypeGuardError,
	TypeGuardMetadata,
	TypeGuardResult,
	ValidationResult as GuardValidationResult,
} from "./generators/typescript/guards";
// Type guards and validation
export {
	createChoiceTypeGuard,
	createFieldValidator,
	createReferenceValidator,
	FHIRGuardGenerator,
	generateAllTypeGuards,
	isChoiceTypeInstance,
	narrowChoiceType,
	validateCardinality,
} from "./generators/typescript/guards";
export {
	generateValidators,
	type ValidatorFunction,
	type ValidatorGenerationOptions,
} from "./generators/typescript/validators";
