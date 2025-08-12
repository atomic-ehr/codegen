import type { Config } from "./src/config";

/**
 * Atomic Codegen Configuration
 *
 * Example configurations:
 *
 * 1. Basic FHIR R4 types only (current):
 *    - packages: ["hl7.fhir.r4.core@4.0.1"]
 *    - includeProfiles: true (with empty profile packages)
 *
 * 2. With US Core profiles:
 *    - packages: ["hl7.fhir.r4.core@4.0.1", "hl7.fhir.us.core@5.0.1"]
 *    - typeSchema.profiles.packages: ["hl7.fhir.us.core@5.0.1"]
 *
 * 3. Multiple implementation guides:
 *    - Add multiple packages to both packages and typeSchema.profiles.packages arrays
 */
const config: Config = {
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
		includeProfiles: true, // ✅ Enable FHIR profile generation
		includeExtensions: true,

		// Profile generation configuration
		profileOptions: {
			generateKind: "interface", // Generate TypeScript interfaces for profiles
			includeConstraints: true, // Include profile constraints in generated types
			includeDocumentation: true, // Generate JSDoc for profiles
			strictMode: false, // Relaxed mode for profile constraints
			subfolder: "profiles", // Generate profiles in ./generated/profiles/
		},
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
		searchAutocomplete: true, // Enable IDE autocompletion for search parameter names
		includeValidation: true, // Client-side resource validation
		generateValidators: true, // Generate validation methods per resource
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

		// Profile package configuration
		profiles: {
			packages: [
				// Uncomment to include US Core profiles
				"hl7.fhir.us.core@5.0.1",

				// Uncomment to include other implementation guide profiles
				// "hl7.fhir.au.base@4.0.0", // AU Base profiles
				// "hl7.fhir.uv.ips@1.0.0",  // International Patient Summary
			],
			autoDetect: true, // Automatically detect profiles in packages
		},
	},

	// Input sources
	packages: ["hl7.fhir.r4.core@4.0.1"],
	files: [],
};

export default config;

/*
 * ========================================
 * EXAMPLE: US Core Profile Generation
 * ========================================
 *
 * To enable US Core profile generation, uncomment and modify the configuration below:
 *
 * 1. Add US Core package to the packages array:
 *    packages: ["hl7.fhir.r4.core@4.0.1", "hl7.fhir.us.core@5.0.1"]
 *
 * 2. Add US Core to profile packages:
 *    typeSchema: {
 *      profiles: {
 *        packages: ["hl7.fhir.us.core@5.0.1"]
 *      }
 *    }
 *
 * This will generate:
 * - ./generated/profiles/USCorePatient.ts
 * - ./generated/profiles/USCorePractitioner.ts
 * - ./generated/profiles/USCoreOrganization.ts
 * - ./generated/profiles/index.ts
 * - Enhanced main index.ts with Profiles namespace
 *
 * Each profile will include:
 * - TypeScript interface extending base resource
 * - Runtime validator function (validateUSCorePatient)
 * - Type guard function (isUSCorePatient)
 * - Profile-specific constraint validation
 * - Extension handling (race, ethnicity, birthsex, etc.)
 *
 * Usage example:
 * ```typescript
 * import { USCorePatient, validateUSCorePatient } from './generated/profiles/USCorePatient';
 *
 * const patient: USCorePatient = {
 *   resourceType: 'Patient',
 *   identifier: [{ system: 'http://example.org', value: '123' }],
 *   name: [{ given: ['John'], family: 'Doe' }],
 *   gender: 'male'
 * };
 *
 * const validation = validateUSCorePatient(patient);
 * if (!validation.valid) {
 *   console.error('Validation errors:', validation.errors);
 * }
 * ```
 */
