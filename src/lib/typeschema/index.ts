/**
 * TypeSchema - FHIR Type Schema Generator
 *
 * Main entry point for the TypeSchema library
 */

export { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
// Re-export useful types from dependencies
export type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
export {
	buildEnum,
	collectBindingSchemas,
	extractValueSetConcepts,
	generateBindingSchema,
} from "./core/binding";
export {
	buildField,
	buildNestedField,
	getElementHierarchy,
	isExcluded,
	isNestedElement,
	isRequired,
	mergeElementHierarchy,
} from "./core/field-builder";
// Export core utilities
export {
	buildBindingIdentifier,
	buildNestedIdentifier,
	buildSchemaIdentifier,
	buildValueSetIdentifier,
	dropVersionFromUrl,
} from "./core/identifier";
export {
	buildNestedTypes,
	collectNestedElements,
	extractNestedDependencies,
} from "./core/nested-types";
// Export main transformer
export {
	transformFHIRSchema,
	transformFHIRSchemas,
} from "./core/transformer";
// Export profile processor
export {
	extractUSCoreConstraints,
	isUSCoreProfile,
	transformProfile,
} from "./profile/processor";
// Export all types
export * from "./types";
// Export value set processor
export { transformValueSet } from "./value-set/processor";
// Export validation utilities
export {
	validateTypeSchema,
	validateTypeSchemas,
	validateTypeSchemaOrThrow,
	isValidatorAvailable,
} from "../validation/typeschema-validator";
