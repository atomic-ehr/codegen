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
	restClient: {
		clientName: "FHIRClient",
		baseUrl: "https://api.example.com/fhir",
		apiVersion: "R4",
		generateMocks: false,
		authType: "none",
	},
	typeSchema: {
		enablePersistence: true,
		cacheDir: ".typeschema-cache",
		maxAge: 24 * 60 * 60 * 1000, // 24 hours
		validateCached: true,
		forceRegenerate: false,
		shareCache: true,
		cacheKeyPrefix: "",
	},
	packages: ["hl7.fhir.r4.core@4.0.1"],
	files: [],
};

export default config;
