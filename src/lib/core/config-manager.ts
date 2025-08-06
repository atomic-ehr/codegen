/**
 * Configuration Manager
 *
 * Handles loading, merging, and validating atomic-codegen configuration
 */

import { existsSync } from "fs";
import { access, readFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import type {
	AtomicCodegenConfig,
	ConfigFileSchema,
	ConfigSource,
	ConfigValidationError,
	ConfigValidationResult,
	EnvironmentConfig,
} from "./config-schema";
import {
	CONFIG_FILE_NAMES,
	ConfigPrecedence,
	DEFAULT_ATOMIC_CODEGEN_CONFIG,
	isConfigFileSchema,
} from "./config-schema";

/**
 * Configuration Manager class
 */
export class ConfigManager {
	private configSources: Map<string, ConfigSource> = new Map();
	private loadedConfig: AtomicCodegenConfig | null = null;

	/**
	 * Load configuration from all sources with proper precedence
	 */
	async loadConfig(
		options: {
			configPath?: string;
			workingDir?: string;
			cliArgs?: Partial<AtomicCodegenConfig>;
		} = {},
	): Promise<AtomicCodegenConfig> {
		const { configPath, workingDir = process.cwd(), cliArgs = {} } = options;

		// Start with default configuration
		let config: AtomicCodegenConfig = structuredClone(
			DEFAULT_ATOMIC_CODEGEN_CONFIG,
		);
		this.addConfigSource("default", {
			type: "default",
			precedence: ConfigPrecedence.DEFAULT,
		});

		// Load configuration file
		const fileConfig = await this.loadConfigFile(configPath, workingDir);
		if (fileConfig) {
			config = this.mergeConfigs(config, fileConfig.config);
			this.addConfigSource("config-file", fileConfig.source);
		}

		// Load environment variables
		const envConfig = this.loadEnvironmentConfig();
		if (envConfig) {
			config = this.mergeConfigs(config, envConfig.config);
			this.addConfigSource("environment", envConfig.source);
		}

		// Apply CLI arguments (highest precedence)
		if (Object.keys(cliArgs).length > 0) {
			config = this.mergeConfigs(config, cliArgs);
			this.addConfigSource("cli-args", {
				type: "cli-args",
				precedence: ConfigPrecedence.CLI_ARGS,
			});
		}

		this.loadedConfig = config;
		return config;
	}

	/**
	 * Load configuration from file
	 */
	private async loadConfigFile(
		configPath?: string,
		workingDir?: string,
	): Promise<{ config: AtomicCodegenConfig; source: ConfigSource } | null> {
		let filePath: string | null = null;

		if (configPath) {
			// Use explicitly provided config path
			filePath = resolve(configPath);
		} else {
			// Search for config files in working directory and parents
			filePath = await this.findConfigFile(workingDir || process.cwd());
		}

		if (!filePath) {
			return null;
		}

		try {
			const content = await readFile(filePath, "utf-8");
			let config: ConfigFileSchema;

			if (filePath.endsWith(".js")) {
				// Dynamic import for JS config files
				const module = await import(filePath);
				config = module.default || module;
			} else {
				// Parse JSON config
				config = JSON.parse(content);
			}

			if (!isConfigFileSchema(config)) {
				throw new Error("Invalid configuration file format");
			}

			return {
				config,
				source: {
					type: "config-file",
					location: filePath,
					precedence: ConfigPrecedence.CONFIG_FILE,
				},
			};
		} catch (error) {
			throw new Error(
				`Failed to load configuration file ${filePath}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	/**
	 * Find configuration file by searching upward from working directory
	 */
	private async findConfigFile(startDir: string): Promise<string | null> {
		let currentDir = resolve(startDir);
		const rootDir = resolve("/");

		while (currentDir !== rootDir) {
			for (const fileName of CONFIG_FILE_NAMES) {
				const filePath = join(currentDir, fileName);
				try {
					await access(filePath);
					return filePath;
				} catch {
					// File doesn't exist or not accessible, continue
				}
			}

			// Move up one directory
			const parentDir = dirname(currentDir);
			if (parentDir === currentDir) break;
			currentDir = parentDir;
		}

		return null;
	}

	/**
	 * Load configuration from environment variables
	 */
	private loadEnvironmentConfig(): {
		config: AtomicCodegenConfig;
		source: ConfigSource;
	} | null {
		const env = process.env;
		const config: AtomicCodegenConfig = {};
		let hasEnvConfig = false;

		// Global configuration
		if (env.ATOMIC_CODEGEN_VERBOSE) {
			config.global = {
				...config.global,
				verbose: this.parseBoolean(env.ATOMIC_CODEGEN_VERBOSE),
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_OUTPUT_DIR) {
			config.global = {
				...config.global,
				outputDir: env.ATOMIC_CODEGEN_OUTPUT_DIR,
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_WORKING_DIR) {
			config.project = {
				...config.project,
				workingDir: env.ATOMIC_CODEGEN_WORKING_DIR,
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_LOG_LEVEL) {
			const level = env.ATOMIC_CODEGEN_LOG_LEVEL as
				| "error"
				| "warn"
				| "info"
				| "debug";
			config.global = {
				...config.global,
				logging: { ...config.global?.logging, level },
			};
			hasEnvConfig = true;
		}

		// TypeSchema configuration
		if (env.ATOMIC_CODEGEN_TYPESCHEMA_FORMAT) {
			const format = env.ATOMIC_CODEGEN_TYPESCHEMA_FORMAT as
				| "ndjson"
				| "separate"
				| "merged";
			config.typeschema = { ...config.typeschema, outputFormat: format };
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_TYPESCHEMA_VALIDATION) {
			config.typeschema = {
				...config.typeschema,
				validation: this.parseBoolean(env.ATOMIC_CODEGEN_TYPESCHEMA_VALIDATION),
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_DROP_CACHE) {
			config.typeschema = {
				...config.typeschema,
				dropCache: this.parseBoolean(env.ATOMIC_CODEGEN_DROP_CACHE),
			};
			hasEnvConfig = true;
		}

		// Generator configuration
		if (env.ATOMIC_CODEGEN_GENERATOR_TARGET) {
			const target = env.ATOMIC_CODEGEN_GENERATOR_TARGET as
				| "typescript"
				| "python"
				| "java"
				| "rust";
			config.generator = { ...config.generator, target };
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_INCLUDE_COMMENTS) {
			config.generator = {
				...config.generator,
				includeComments: this.parseBoolean(env.ATOMIC_CODEGEN_INCLUDE_COMMENTS),
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_INCLUDE_VALIDATION) {
			config.generator = {
				...config.generator,
				includeValidation: this.parseBoolean(
					env.ATOMIC_CODEGEN_INCLUDE_VALIDATION,
				),
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_NAMESPACE_STYLE) {
			const style = env.ATOMIC_CODEGEN_NAMESPACE_STYLE as "nested" | "flat";
			config.generator = { ...config.generator, namespaceStyle: style };
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_FILE_NAMING) {
			const naming = env.ATOMIC_CODEGEN_FILE_NAMING as
				| "camelCase"
				| "kebab-case"
				| "snake_case"
				| "PascalCase";
			config.generator = { ...config.generator, fileNaming: naming };
			hasEnvConfig = true;
		}

		// TypeScript configuration
		if (env.ATOMIC_CODEGEN_TS_STRICT) {
			config.languages = {
				...config.languages,
				typescript: {
					...config.languages?.typescript,
					strict: this.parseBoolean(env.ATOMIC_CODEGEN_TS_STRICT),
				},
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_TS_TARGET) {
			const target = env.ATOMIC_CODEGEN_TS_TARGET as
				| "ES5"
				| "ES6"
				| "ES2015"
				| "ES2017"
				| "ES2018"
				| "ES2019"
				| "ES2020"
				| "ES2021"
				| "ES2022";
			config.languages = {
				...config.languages,
				typescript: { ...config.languages?.typescript, target },
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_TS_MODULE) {
			const module = env.ATOMIC_CODEGEN_TS_MODULE as
				| "CommonJS"
				| "ES6"
				| "ES2015"
				| "ES2020"
				| "ES2022"
				| "ESNext";
			config.languages = {
				...config.languages,
				typescript: { ...config.languages?.typescript, module },
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_TS_DECLARATION) {
			config.languages = {
				...config.languages,
				typescript: {
					...config.languages?.typescript,
					declaration: this.parseBoolean(env.ATOMIC_CODEGEN_TS_DECLARATION),
				},
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_TS_USE_ENUMS) {
			config.languages = {
				...config.languages,
				typescript: {
					...config.languages?.typescript,
					useEnums: this.parseBoolean(env.ATOMIC_CODEGEN_TS_USE_ENUMS),
				},
			};
			hasEnvConfig = true;
		}
		if (env.ATOMIC_CODEGEN_TS_PREFER_INTERFACES) {
			config.languages = {
				...config.languages,
				typescript: {
					...config.languages?.typescript,
					preferInterfaces: this.parseBoolean(
						env.ATOMIC_CODEGEN_TS_PREFER_INTERFACES,
					),
				},
			};
			hasEnvConfig = true;
		}

		if (!hasEnvConfig) {
			return null;
		}

		return {
			config,
			source: {
				type: "environment",
				precedence: ConfigPrecedence.ENVIRONMENT,
			},
		};
	}

	/**
	 * Validate configuration
	 */
	validateConfig(config: AtomicCodegenConfig): ConfigValidationResult {
		const errors: ConfigValidationError[] = [];
		const warnings: ConfigValidationError[] = [];

		// Validate TypeSchema configuration
		if (config.typeschema) {
			const ts = config.typeschema;

			if (
				ts.outputFormat &&
				!["ndjson", "separate", "merged"].includes(ts.outputFormat)
			) {
				errors.push({
					path: "typeschema.outputFormat",
					message: `Invalid output format: ${ts.outputFormat}`,
					value: ts.outputFormat,
					suggestion: "Use 'ndjson', 'separate', or 'merged'",
				});
			}

			if (
				ts.packages &&
				(!Array.isArray(ts.packages) || ts.packages.length === 0)
			) {
				errors.push({
					path: "typeschema.packages",
					message: "Packages must be a non-empty array",
					value: ts.packages,
					suggestion: "Provide at least one FHIR package name",
				});
			}
		}

		// Validate Generator configuration
		if (config.generator) {
			const gen = config.generator;

			if (
				gen.target &&
				!["typescript", "python", "java", "rust"].includes(gen.target)
			) {
				errors.push({
					path: "generator.target",
					message: `Invalid generator target: ${gen.target}`,
					value: gen.target,
					suggestion: "Use 'typescript', 'python', 'java', or 'rust'",
				});
			}

			if (
				gen.namespaceStyle &&
				!["nested", "flat"].includes(gen.namespaceStyle)
			) {
				errors.push({
					path: "generator.namespaceStyle",
					message: `Invalid namespace style: ${gen.namespaceStyle}`,
					value: gen.namespaceStyle,
					suggestion: "Use 'nested' or 'flat'",
				});
			}

			if (
				gen.fileNaming &&
				!["camelCase", "kebab-case", "snake_case", "PascalCase"].includes(
					gen.fileNaming,
				)
			) {
				errors.push({
					path: "generator.fileNaming",
					message: `Invalid file naming convention: ${gen.fileNaming}`,
					value: gen.fileNaming,
					suggestion:
						"Use 'camelCase', 'kebab-case', 'snake_case', or 'PascalCase'",
				});
			}

			if (gen.outputDir && typeof gen.outputDir !== "string") {
				errors.push({
					path: "generator.outputDir",
					message: "Output directory must be a string",
					value: gen.outputDir,
					suggestion: "Provide a valid directory path",
				});
			}
		}

		// Validate TypeScript configuration
		if (config.languages?.typescript) {
			const ts = config.languages.typescript;

			if (
				ts.target &&
				![
					"ES5",
					"ES6",
					"ES2015",
					"ES2017",
					"ES2018",
					"ES2019",
					"ES2020",
					"ES2021",
					"ES2022",
				].includes(ts.target)
			) {
				errors.push({
					path: "languages.typescript.target",
					message: `Invalid TypeScript target: ${ts.target}`,
					value: ts.target,
					suggestion: "Use a valid ES version like 'ES2020'",
				});
			}

			if (
				ts.module &&
				!["CommonJS", "ES6", "ES2015", "ES2020", "ES2022", "ESNext"].includes(
					ts.module,
				)
			) {
				errors.push({
					path: "languages.typescript.module",
					message: `Invalid TypeScript module system: ${ts.module}`,
					value: ts.module,
					suggestion: "Use 'CommonJS', 'ES6', 'ES2020', or 'ESNext'",
				});
			}
		}

		// Check for deprecated or unknown properties
		this.validateUnknownProperties(config, "", warnings);

		const valid = errors.length === 0;
		const result: ConfigValidationResult = {
			valid,
			errors,
			warnings,
		};

		if (valid) {
			result.config = config;
		}

		return result;
	}

	/**
	 * Get configuration sources information
	 */
	getConfigSources(): Map<string, ConfigSource> {
		return new Map(this.configSources);
	}

	/**
	 * Get currently loaded configuration
	 */
	getLoadedConfig(): AtomicCodegenConfig | null {
		return this.loadedConfig;
	}

	/**
	 * Merge two configurations with proper precedence
	 */
	private mergeConfigs(
		base: AtomicCodegenConfig,
		override: Partial<AtomicCodegenConfig>,
	): AtomicCodegenConfig {
		const result = structuredClone(base);

		// Merge project config
		if (override.project) {
			result.project = { ...result.project, ...override.project };
		}

		// Merge typeschema config
		if (override.typeschema) {
			result.typeschema = { ...result.typeschema, ...override.typeschema };
		}

		// Merge generator config
		if (override.generator) {
			result.generator = { ...result.generator, ...override.generator };
		}

		// Merge language configs
		if (override.languages) {
			result.languages = {
				...result.languages,
				...override.languages,
				// Deep merge nested language configs
				typescript: {
					...result.languages?.typescript,
					...override.languages.typescript,
				},
				python: {
					...result.languages?.python,
					...override.languages.python,
				},
				java: {
					...result.languages?.java,
					...override.languages.java,
				},
				rust: {
					...result.languages?.rust,
					...override.languages.rust,
				},
			};
		}

		// Merge global config
		if (override.global) {
			result.global = {
				...result.global,
				...override.global,
				// Deep merge nested configs
				cache: {
					...result.global?.cache,
					...override.global.cache,
				},
				logging: {
					...result.global?.logging,
					...override.global.logging,
				},
			};
		}

		return result;
	}

	/**
	 * Add configuration source tracking
	 */
	private addConfigSource(key: string, source: ConfigSource): void {
		this.configSources.set(key, source);
	}

	/**
	 * Parse boolean value from string
	 */
	private parseBoolean(value: string): boolean {
		const lower = value.toLowerCase();
		return (
			lower === "true" || lower === "1" || lower === "yes" || lower === "on"
		);
	}

	/**
	 * Validate for unknown properties and add warnings
	 */
	private validateUnknownProperties(
		obj: any,
		path: string,
		warnings: ConfigValidationError[],
	): void {
		// This would be more complex in a real implementation
		// For now, we'll skip detailed unknown property validation
		// but the structure is here for future enhancement
	}
}
