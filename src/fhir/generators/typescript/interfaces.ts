/**
 * Enhanced TypeScript Interface Generator
 *
 * Generates rich TypeScript interfaces for FHIR resources with advanced features:
 * - Branded types for type-safe IDs
 * - Discriminated unions for choice types
 * - Literal types for fixed values
 * - Rich JSDoc with examples and FHIR paths
 * - Helper types for common patterns
 * - Type-safe references with autocomplete
 */

// Export enhanced interface generation functionality
export {
	DEFAULT_INTERFACE_OPTIONS,
	EnhancedInterfaceGenerator,
	type EnhancedInterfaceResult,
	generateEnhancedInterfaces,
	type InterfaceGeneratorOptions,
} from "./enhanced-interfaces";
