/**
 * New Config Schema for High-Level API
 *
 * Simple configuration system compatible ONLY with the new high-level APIBuilder.
 * All legacy config functionality has been removed.
 */

import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve } from "path";

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
}

/**
 * REST Client generator configuration options
 * Inherits TypeScript generation settings from the main typescript config
 */
export interface RESTClientGeneratorConfig {
	clientName?: string;
	baseUrl?: string;
	apiVersion?: string;
	generateMocks?: boolean;
	authType?: "none" | "bearer" | "apikey" | "oauth2";
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
	restClient?: RESTClientGeneratorConfig;

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
	},
	restClient: {
		clientName: "FHIRClient",
		baseUrl: "https://api.example.com/fhir",
		apiVersion: "R4",
		generateMocks: false,
		authType: "none",
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
			const restErrors = this.validateRESTClientConfig(cfg.restClient);
			result.errors.push(...restErrors);
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

		return errors;
	}

	private validateRESTClientConfig(config: unknown): ConfigValidationError[] {
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

		// Validate authType
		if (cfg.authType !== undefined) {
			if (
				!["none", "bearer", "apikey", "oauth2"].includes(cfg.authType as string)
			) {
				errors.push({
					path: "restClient.authType",
					message: "authType must be one of: none, bearer, apikey, oauth2",
					value: cfg.authType,
				});
			}
		}

		// Validate boolean fields
		const booleanFields = ["generateMocks"];
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
