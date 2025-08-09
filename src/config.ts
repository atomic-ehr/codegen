/**
 * New Config Schema for High-Level API
 *
 * Simple configuration system compatible ONLY with the new high-level APIBuilder.
 * All legacy config functionality has been removed.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * REST Client generator configuration options
 */
export interface RestClientConfig {
	/** Name of the generated client class */
	clientName?: string;
	/** Include client-side resource validation */
	includeValidation?: boolean;
	/** Include enhanced error handling */
	includeErrorHandling?: boolean;
	/** Include request interceptors */
	includeRequestInterceptors?: boolean;
	/** Override base URL in client (for testing) */
	baseUrlOverride?: string;
	/** Generate enhanced search parameter types */
	enhancedSearch?: boolean;
	/** Generate utility methods */
	includeUtilities?: boolean;
	/** Generate resource validators */
	generateValidators?: boolean;
	/** Use FHIR canonical manager for search parameters */
	useCanonicalManager?: boolean;
	/** Timeout for HTTP requests */
	defaultTimeout?: number;
	/** Default retry count */
	defaultRetries?: number;
	/** Include documentation in generated client */
	includeDocumentation?: boolean;
	/** Generate examples and usage patterns */
	generateExamples?: boolean;
}

/**
 * TypeScript generator configuration options
 */
export interface TypeScriptGeneratorConfig {
	moduleFormat?: "esm" | "cjs";
	generateIndex?: boolean;
	includeDocuments?: boolean;
	namingConvention?: "PascalCase" | "camelCase";
	strictMode?: boolean;
	generateValidators?: boolean;
	generateGuards?: boolean;
	includeProfiles?: boolean;
	includeExtensions?: boolean;
	includeValueSets?: boolean;
	includeCodeSystems?: boolean;
	includeOperations?: boolean;
	fhirVersion?: "R4" | "R5";
	resourceTypes?: string[];
	maxDepth?: number;

	// Builder generation options
	generateBuilders?: boolean;
	builderOptions?: {
		includeValidation?: boolean;
		includeFactoryMethods?: boolean;
		includeInterfaces?: boolean;
		generateNestedBuilders?: boolean;
		includeHelperMethods?: boolean;
		supportPartialBuild?: boolean;
		includeJSDoc?: boolean;
		generateFactories?: boolean;
		includeTypeGuards?: boolean;
		handleChoiceTypes?: boolean;
		generateArrayHelpers?: boolean;
	};

	// Validator generation options
	validatorOptions?: {
		includeCardinality?: boolean;
		includeTypes?: boolean;
		includeConstraints?: boolean;
		includeInvariants?: boolean;
		validateRequired?: boolean;
		allowAdditional?: boolean;
		strictValidation?: boolean;
		collectMetrics?: boolean;
		generateAssertions?: boolean;
		generatePartialValidators?: boolean;
		optimizePerformance?: boolean;
		includeJSDoc?: boolean;
		generateCompositeValidators?: boolean;
	};

	// Type guard generation options
	guardOptions?: {
		includeRuntimeValidation?: boolean;
		includeErrorMessages?: boolean;
		treeShakeable?: boolean;
		targetTSVersion?: "3.8" | "4.0" | "4.5" | "5.0";
		strictGuards?: boolean;
		includeNullChecks?: boolean;
		verbose?: boolean;
	};
}

/**
 * TypeSchema Configuration
 * Controls TypeSchema generation and caching behavior
 */
export interface TypeSchemaConfig {
	/** Enable persistent caching of generated TypeSchemas */
	enablePersistence?: boolean;
	/** Directory to store cached TypeSchemas (relative to outputDir) */
	cacheDir?: string;
	/** Maximum age of cached schemas in milliseconds before regeneration */
	maxAge?: number;
	/** Whether to validate cached schemas before reuse */
	validateCached?: boolean;
	/** Force regeneration of schemas even if cached */
	forceRegenerate?: boolean;
	/** Share cache across multiple codegen runs */
	shareCache?: boolean;
	/** Cache key prefix for namespacing */
	cacheKeyPrefix?: string;
}

/**
 * Main configuration schema for the new high-level API
 */
export interface Config {
	// Core APIBuilder options
	outputDir?: string;
	verbose?: boolean;
	overwrite?: boolean;
	validate?: boolean;
	cache?: boolean;

	// Generator configurations
	typescript?: TypeScriptGeneratorConfig;
	restClient?: RestClientConfig;
	typeSchema?: TypeSchemaConfig;

	// Input sources
	packages?: string[];
	files?: string[];

	// Schema validation
	$schema?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Config> = {
	outputDir: "./generated",
	verbose: false,
	overwrite: true,
	validate: true,
	cache: true,
	restClient: {
		clientName: "FHIRClient",
		includeValidation: false,
		includeErrorHandling: true,
		includeRequestInterceptors: false,
		baseUrlOverride: "",
		enhancedSearch: false,
		includeUtilities: true,
		generateValidators: false,
		useCanonicalManager: true,
		defaultTimeout: 30000,
		defaultRetries: 0,
		includeDocumentation: true,
		generateExamples: false,
	},
	typescript: {
		moduleFormat: "esm",
		generateIndex: true,
		includeDocuments: false,
		namingConvention: "PascalCase",
		strictMode: true,
		generateValidators: true,
		generateGuards: true,
		includeProfiles: true,
		includeExtensions: false,
		includeValueSets: true,
		includeCodeSystems: false,
		includeOperations: false,
		fhirVersion: "R4",
		resourceTypes: [],
		maxDepth: 10,

		// Builder generation defaults
		generateBuilders: false,
		builderOptions: {
			includeValidation: true,
			includeFactoryMethods: true,
			includeInterfaces: true,
			generateNestedBuilders: true,
			includeHelperMethods: true,
			supportPartialBuild: true,
			includeJSDoc: true,
			generateFactories: true,
			includeTypeGuards: true,
			handleChoiceTypes: true,
			generateArrayHelpers: true,
		},

		// Validator generation defaults
		validatorOptions: {
			includeCardinality: true,
			includeTypes: true,
			includeConstraints: true,
			includeInvariants: false,
			validateRequired: true,
			allowAdditional: false,
			strictValidation: false,
			collectMetrics: false,
			generateAssertions: true,
			generatePartialValidators: true,
			optimizePerformance: true,
			includeJSDoc: true,
			generateCompositeValidators: true,
		},

		// Type guard generation defaults
		guardOptions: {
			includeRuntimeValidation: true,
			includeErrorMessages: true,
			treeShakeable: true,
			targetTSVersion: "5.0",
			strictGuards: false,
			includeNullChecks: true,
			verbose: false,
		},
	},
	typeSchema: {
		enablePersistence: true,
		cacheDir: ".typeschema-cache",
		maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
		validateCached: true,
		forceRegenerate: false,
		shareCache: true,
		cacheKeyPrefix: "",
	},
	packages: [],
	files: [],
	$schema: "https://atomic-ehr.github.io/codegen/config-schema.json",
};

/**
 * Configuration file names to search for
 */
export const CONFIG_FILE_NAMES = [
	"atomic-codegen.config.ts",
	"atomic-codegen.config.js",
	"atomic-codegen.config.json",
	".atomic-codegenrc",
	"atomic-codegen.json",
	".atomic-codegen.json",
	"codegen.config.json",
	"codegen.json",
];

/**
 * Validation error interface
 */
export interface ConfigValidationError {
	path: string;
	message: string;
	value?: unknown;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
	valid: boolean;
	errors: ConfigValidationError[];
	warnings: string[];
	config?: Config;
}

/**
 * Simple configuration validator
 */
export class ConfigValidator {
	/**
	 * Validate a configuration object
	 */
	validate(config: unknown): ConfigValidationResult {
		const result: ConfigValidationResult = {
			valid: true,
			errors: [],
			warnings: [],
		};

		if (!config || typeof config !== "object") {
			result.valid = false;
			result.errors.push({
				path: "root",
				message: "Configuration must be an object",
				value: config,
			});
			return result;
		}

		const cfg = config as Record<string, unknown>;

		// Validate outputDir
		if (cfg.outputDir !== undefined && typeof cfg.outputDir !== "string") {
			result.errors.push({
				path: "outputDir",
				message: "outputDir must be a string",
				value: cfg.outputDir,
			});
		}

		// Validate boolean fields
		const booleanFields = ["verbose", "overwrite", "validate", "cache"];
		for (const field of booleanFields) {
			if (cfg[field] !== undefined && typeof cfg[field] !== "boolean") {
				result.errors.push({
					path: field,
					message: `${field} must be a boolean`,
					value: cfg[field],
				});
			}
		}

		// Validate typescript config
		if (cfg.typescript !== undefined) {
			const tsErrors = this.validateTypeScriptConfig(cfg.typescript);
			result.errors.push(...tsErrors);
		}

		// Validate restClient config
		if (cfg.restClient !== undefined) {
			const rcErrors = this.validateRestClientConfig(cfg.restClient);
			result.errors.push(...rcErrors);
		}

		// Validate packages array
		if (cfg.packages !== undefined) {
			if (!Array.isArray(cfg.packages)) {
				result.errors.push({
					path: "packages",
					message: "packages must be an array",
					value: cfg.packages,
				});
			} else {
				cfg.packages.forEach((pkg, index) => {
					if (typeof pkg !== "string") {
						result.errors.push({
							path: `packages[${index}]`,
							message: "package name must be a string",
							value: pkg,
						});
					}
				});
			}
		}

		// Validate files array
		if (cfg.files !== undefined) {
			if (!Array.isArray(cfg.files)) {
				result.errors.push({
					path: "files",
					message: "files must be an array",
					value: cfg.files,
				});
			} else {
				cfg.files.forEach((file, index) => {
					if (typeof file !== "string") {
						result.errors.push({
							path: `files[${index}]`,
							message: "file path must be a string",
							value: file,
						});
					}
				});
			}
		}

		result.valid = result.errors.length === 0;
		if (result.valid) {
			result.config = cfg as Config;
		}

		return result;
	}

	private validateTypeScriptConfig(config: unknown): ConfigValidationError[] {
		const errors: ConfigValidationError[] = [];

		if (typeof config !== "object" || config === null) {
			errors.push({
				path: "typescript",
				message: "typescript config must be an object",
				value: config,
			});
			return errors;
		}

		const cfg = config as Record<string, unknown>;

		// Validate moduleFormat
		if (cfg.moduleFormat !== undefined) {
			if (!["esm", "cjs"].includes(cfg.moduleFormat as string)) {
				errors.push({
					path: "typescript.moduleFormat",
					message: 'moduleFormat must be "esm" or "cjs"',
					value: cfg.moduleFormat,
				});
			}
		}

		// Validate namingConvention
		if (cfg.namingConvention !== undefined) {
			if (
				!["PascalCase", "camelCase"].includes(cfg.namingConvention as string)
			) {
				errors.push({
					path: "typescript.namingConvention",
					message: 'namingConvention must be "PascalCase" or "camelCase"',
					value: cfg.namingConvention,
				});
			}
		}

		// Validate boolean fields
		const booleanFields = [
			"generateIndex",
			"includeDocuments",
			"strictMode",
			"generateValidators",
			"generateGuards",
			"includeProfiles",
			"includeExtensions",
		];
		for (const field of booleanFields) {
			if (cfg[field] !== undefined && typeof cfg[field] !== "boolean") {
				errors.push({
					path: `typescript.${field}`,
					message: `${field} must be a boolean`,
					value: cfg[field],
				});
			}
		}

		// Validate validatorOptions
		if (cfg.validatorOptions !== undefined) {
			const validatorErrors = this.validateValidatorOptions(
				cfg.validatorOptions,
			);
			errors.push(...validatorErrors);
		}

		// Validate guardOptions
		if (cfg.guardOptions !== undefined) {
			const guardErrors = this.validateGuardOptions(cfg.guardOptions);
			errors.push(...guardErrors);
		}

		return errors;
	}

	private validateValidatorOptions(config: unknown): ConfigValidationError[] {
		const errors: ConfigValidationError[] = [];

		if (typeof config !== "object" || config === null) {
			errors.push({
				path: "typescript.validatorOptions",
				message: "validatorOptions must be an object",
				value: config,
			});
			return errors;
		}

		const cfg = config as Record<string, unknown>;

		// Validate boolean fields
		const booleanFields = [
			"includeCardinality",
			"includeTypes",
			"includeConstraints",
			"includeInvariants",
			"validateRequired",
			"allowAdditional",
			"strictValidation",
			"collectMetrics",
			"generateAssertions",
			"generatePartialValidators",
			"optimizePerformance",
			"includeJSDoc",
			"generateCompositeValidators",
		];

		for (const field of booleanFields) {
			if (cfg[field] !== undefined && typeof cfg[field] !== "boolean") {
				errors.push({
					path: `typescript.validatorOptions.${field}`,
					message: `${field} must be a boolean`,
					value: cfg[field],
				});
			}
		}

		return errors;
	}

	private validateRestClientConfig(config: unknown): ConfigValidationError[] {
		const errors: ConfigValidationError[] = [];

		if (typeof config !== "object" || config === null) {
			errors.push({
				path: "restClient",
				message: "restClient config must be an object",
				value: config,
			});
			return errors;
		}

		const cfg = config as Record<string, unknown>;

		// Validate clientName
		if (cfg.clientName !== undefined && typeof cfg.clientName !== "string") {
			errors.push({
				path: "restClient.clientName",
				message: "clientName must be a string",
				value: cfg.clientName,
			});
		}

		// Validate baseUrlOverride
		if (cfg.baseUrlOverride !== undefined && typeof cfg.baseUrlOverride !== "string") {
			errors.push({
				path: "restClient.baseUrlOverride",
				message: "baseUrlOverride must be a string",
				value: cfg.baseUrlOverride,
			});
		}

		// Validate timeout
		if (cfg.defaultTimeout !== undefined) {
			if (typeof cfg.defaultTimeout !== "number" || cfg.defaultTimeout <= 0) {
				errors.push({
					path: "restClient.defaultTimeout",
					message: "defaultTimeout must be a positive number",
					value: cfg.defaultTimeout,
				});
			}
		}

		// Validate retries
		if (cfg.defaultRetries !== undefined) {
			if (typeof cfg.defaultRetries !== "number" || cfg.defaultRetries < 0) {
				errors.push({
					path: "restClient.defaultRetries",
					message: "defaultRetries must be a non-negative number",
					value: cfg.defaultRetries,
				});
			}
		}

		// Validate boolean fields
		const booleanFields = [
			"includeValidation",
			"includeErrorHandling",
			"includeRequestInterceptors",
			"enhancedSearch",
			"includeUtilities",
			"generateValidators",
			"useCanonicalManager",
			"includeDocumentation",
			"generateExamples",
		];

		for (const field of booleanFields) {
			if (cfg[field] !== undefined && typeof cfg[field] !== "boolean") {
				errors.push({
					path: `restClient.${field}`,
					message: `${field} must be a boolean`,
					value: cfg[field],
				});
			}
		}

		return errors;
	}

	private validateGuardOptions(config: unknown): ConfigValidationError[] {
		const errors: ConfigValidationError[] = [];

		if (typeof config !== "object" || config === null) {
			errors.push({
				path: "typescript.guardOptions",
				message: "guardOptions must be an object",
				value: config,
			});
			return errors;
		}

		const cfg = config as Record<string, unknown>;

		// Validate targetTSVersion
		if (cfg.targetTSVersion !== undefined) {
			if (
				!["3.8", "4.0", "4.5", "5.0"].includes(cfg.targetTSVersion as string)
			) {
				errors.push({
					path: "typescript.guardOptions.targetTSVersion",
					message: 'targetTSVersion must be one of: "3.8", "4.0", "4.5", "5.0"',
					value: cfg.targetTSVersion,
				});
			}
		}

		// Validate boolean fields
		const booleanFields = [
			"includeRuntimeValidation",
			"includeErrorMessages",
			"treeShakeable",
			"strictGuards",
			"includeNullChecks",
			"verbose",
		];

		for (const field of booleanFields) {
			if (cfg[field] !== undefined && typeof cfg[field] !== "boolean") {
				errors.push({
					path: `typescript.guardOptions.${field}`,
					message: `${field} must be a boolean`,
					value: cfg[field],
				});
			}
		}

		return errors;
	}
}

/**
 * Configuration loader with autoloading capabilities
 */
export class ConfigLoader {
	private validator = new ConfigValidator();

	/**
	 * Auto-load configuration from the current working directory
	 */
	async autoload(workingDir: string = process.cwd()): Promise<Config> {
		const configPath = await this.findConfigFile(workingDir);

		if (configPath) {
			return this.loadFromFile(configPath);
		}

		// Return default config if no file found
		return { ...DEFAULT_CONFIG };
	}

	/**
	 * Load configuration from a specific file
	 */
	async loadFromFile(filePath: string): Promise<Config> {
		try {
			let config: unknown;

			if (filePath.endsWith(".ts") || filePath.endsWith(".js")) {
				// Use dynamic import for TypeScript/JavaScript files
				const absolutePath = resolve(filePath);
				const importResult = await import(absolutePath);
				config = importResult.default || importResult;
			} else {
				// JSON files
				const content = await readFile(filePath, "utf-8");
				config = JSON.parse(content);
			}

			const validation = this.validator.validate(config);

			if (!validation.valid) {
				const errorMessages = validation.errors
					.map((e) => `${e.path}: ${e.message}`)
					.join("\n");
				throw new Error(`Configuration validation failed:\n${errorMessages}`);
			}

			// Merge with defaults
			return this.mergeWithDefaults(validation.config!);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(
					`Failed to load config from ${filePath}: ${error.message}`,
				);
			}
			throw error;
		}
	}

	/**
	 * Find configuration file in the given directory
	 */
	private async findConfigFile(startDir: string): Promise<string | null> {
		for (const fileName of CONFIG_FILE_NAMES) {
			const configPath = resolve(startDir, fileName);
			if (existsSync(configPath)) {
				return configPath;
			}
		}
		return null;
	}

	/**
	 * Merge user config with defaults
	 */
	private mergeWithDefaults(userConfig: Config): Config {
		return {
			...DEFAULT_CONFIG,
			...userConfig,
			typescript: {
				...DEFAULT_CONFIG.typescript,
				...userConfig.typescript,
			},
			restClient: {
				...DEFAULT_CONFIG.restClient,
				...userConfig.restClient,
			},
		};
	}
}

/**
 * Global config loader instance
 */
export const configLoader = new ConfigLoader();

/**
 * Convenience function to auto-load configuration
 */
export async function loadConfig(workingDir?: string): Promise<Config> {
	return configLoader.autoload(workingDir);
}

/**
 * Type guard to check if an object is a valid Config
 */
export function isConfig(obj: unknown): obj is Config {
	const validator = new ConfigValidator();
	const result = validator.validate(obj);
	return result.valid;
}
