import type { Config } from "./src/config";

/**
 * Atomic Codegen Configuration
 */
const config: Config = {
	$schema: "https://atomic-ehr.github.io/codegen/config-schema.json",
	outputDir: "./generated",
	verbose: false,
	overwrite: true,
	validate: true,
	cache: true,

	// TypeScript type generation configuration
	typescript: {
		moduleFormat: "esm",
		generateIndex: true,
		includeDocuments: true,
		namingConvention: "PascalCase",
		strictMode: true,
		generateValidators: true,
		generateGuards: true,
		includeProfiles: false,
		includeExtensions: false,
	},

	// REST Client generation configuration
	restClient: {
		// Basic client configuration
		clientName: "FHIRClient", // Name of the generated client class
		includeErrorHandling: true, // Include enhanced error handling
		includeUtilities: true, // Include utility methods
		includeDocumentation: true, // Generate comprehensive documentation

		// Enhanced features (Phase 2 capabilities)
		enhancedSearch: true, // Enhanced search parameter types with modifiers
		includeValidation: true, // Client-side resource validation
		generateValidators: false, // Generate validation methods per resource
		useCanonicalManager: true, // Use FHIR canonical manager for search parameters and operations

		// Client behavior configuration
		defaultTimeout: 30000, // Default request timeout (30 seconds)
		defaultRetries: 0, // Default number of retries

		// Development and testing features
		generateExamples: false, // Generate usage examples
		includeRequestInterceptors: false, // Include request interceptor support
		baseUrlOverride: "", // Override base URL (for testing)
	},

	// TypeSchema caching configuration
	typeSchema: {
		enablePersistence: true,
		cacheDir: ".typeschema-cache",
		maxAge: 24 * 60 * 60 * 1000, // 24 hours
		validateCached: true,
		forceRegenerate: false,
		shareCache: true,
		cacheKeyPrefix: "",
	},

	// Input sources
	packages: ["hl7.fhir.r4.core@4.0.1"],
	files: [],
};

export default config;
