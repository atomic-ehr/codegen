/**
 * FHIR Type Guards and Constraints
 *
 * This module provides compile-time type safety for FHIR resources through:
 * - Type guards for runtime type checking
 * - Discriminated union helpers for choice types
 * - Cardinality constraint types
 * - Reference type helpers
 * - Literal types for fixed values
 *
 * Focus is on compile-time type safety with minimal runtime overhead.
 */

export {
	createChoiceTypeGuard,
	generateChoiceTypeDiscriminators,
	isChoiceTypeInstance,
	narrowChoiceType,
} from "./discriminators";
// Main guard generator
export {
	FHIRGuardGenerator,
	generateAllTypeGuards,
} from "./generator";
export {
	createCardinalityValidator,
	createFieldValidator,
	createReferenceValidator,
	generateCustomPredicates,
} from "./predicates";
export { generatePrimitiveTypeGuards } from "./primitives";
// Type guard generators
export {
	generateComplexTypeGuards,
	generateFieldTypeGuards,
	generateResourceTypeGuards,
} from "./resources";
// Type utilities (compile-time only)
// Guard generation context
export type {
	CardinalityConstraint,
	ChoiceTypeDiscriminator,
	FieldTypeGuard,
	GuardGenerationContext,
	GuardGenerationOptions,
	LiteralField,
	OptionalFields,
	PrimitiveTypeGuard,
	ReferenceField,
	RequiredFields,
	ResourceTypeGuard,
} from "./types";
