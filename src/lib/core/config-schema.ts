/**
 * Configuration Schema
 *
 * Comprehensive configuration interfaces for atomic-codegen
 */

import type {
	GeneratorConfig,
	TypeSchemaConfig,
	TypeScriptConfig,
} from "./config";
import {
	DEFAULT_GENERATOR_CONFIG,
	DEFAULT_TYPESCHEMA_CONFIG,
	DEFAULT_TYPESCRIPT_CONFIG,
} from "./config";

/**
 * Complete atomic-codegen configuration
 */
export interface AtomicCodegenConfig {
	/** Project metadata */
	project?: ProjectConfig;

	/** TypeSchema generation configuration */
	typeschema?: TypeSchemaConfig;

	/** Code generation configuration */
	generator?: GeneratorConfig;

	/** Language-specific configurations */
	languages?: LanguageConfigs;

	/** Global settings */
	global?: GlobalConfig;
}

/**
 * Project-level configuration
 */
export interface ProjectConfig {
	/** Project name */
	name?: string;

	/** Project version */
	version?: string;

	/** Project description */
	description?: string;

	/** Root directory for relative paths */
	rootDir?: string;

	/** Working directory for temporary files */
	workingDir?: string;
}

/**
 * Language-specific configurations
 */
export interface LanguageConfigs {
	typescript?: TypeScriptConfig;
	python?: PythonConfig;
	java?: JavaConfig;
	rust?: RustConfig;
}

/**
 * Python-specific configuration
 */
export interface PythonConfig {
	/** Python version target */
	version?: "3.8" | "3.9" | "3.10" | "3.11" | "3.12";

	/** Package manager */
	packageManager?: "pip" | "poetry" | "pipenv";

	/** Use type hints */
	typeHints?: boolean;

	/** Use Pydantic for validation */
	usePydantic?: boolean;

	/** Import style */
	importStyle?: "absolute" | "relative";

	/** Generate __init__.py files */
	generateInit?: boolean;

	/** Include type checking imports and annotations */
	typeChecking?: boolean;

	/** Use strict optional typing */
	strictOptional?: boolean;
}

/**
 * Java-specific configuration
 */
export interface JavaConfig {
	/** Java version target */
	version?: "8" | "11" | "17" | "21";

	/** Package name */
	packageName?: string;

	/** Use Jackson annotations */
	useJackson?: boolean;

	/** Use validation annotations */
	useValidation?: boolean;
}

/**
 * Rust-specific configuration
 */
export interface RustConfig {
	/** Rust edition */
	edition?: "2018" | "2021";

	/** Use serde for serialization */
	useSerde?: boolean;

	/** Crate name */
	crateName?: string;
}

/**
 * Global configuration options
 */
export interface GlobalConfig {
	/** Default verbose mode */
	verbose?: boolean;

	/** Debug mode */
	debug?: boolean;

	/** Default output directory */
	outputDir?: string;

	/** Cache configuration */
	cache?: CacheConfig;

	/** Logging configuration */
	logging?: LoggingConfig;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
	/** Enable caching */
	enabled?: boolean;

	/** Cache directory */
	directory?: string;

	/** Cache TTL in seconds */
	ttl?: number;

	/** Maximum cache size in MB */
	maxSize?: number;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
	/** Log level */
	level?: "error" | "warn" | "info" | "debug";

	/** Log format */
	format?: "json" | "text";

	/** Log output */
	output?: "console" | "file";

	/** Log file path (when output is "file") */
	file?: string;
}

/**
 * Configuration file schema with validation
 */
export interface ConfigFileSchema extends AtomicCodegenConfig {
	/** Schema version for future compatibility */
	$schema?: string;

	/** Configuration version */
	version?: string;
}

/**
 * Environment variable configuration mapping
 */
export interface EnvironmentConfig {
	/** Environment variable prefix */
	prefix: "ATOMIC_CODEGEN";

	/** Mapped environment variables */
	variables: {
		// Global
		ATOMIC_CODEGEN_VERBOSE?: string;
		ATOMIC_CODEGEN_OUTPUT_DIR?: string;
		ATOMIC_CODEGEN_WORKING_DIR?: string;
		ATOMIC_CODEGEN_LOG_LEVEL?: string;

		// TypeSchema
		ATOMIC_CODEGEN_TYPESCHEMA_FORMAT?: string;
		ATOMIC_CODEGEN_TYPESCHEMA_VALIDATION?: string;
		ATOMIC_CODEGEN_DROP_CACHE?: string;

		// Generator
		ATOMIC_CODEGEN_GENERATOR_TARGET?: string;
		ATOMIC_CODEGEN_INCLUDE_COMMENTS?: string;
		ATOMIC_CODEGEN_INCLUDE_VALIDATION?: string;
		ATOMIC_CODEGEN_NAMESPACE_STYLE?: string;
		ATOMIC_CODEGEN_FILE_NAMING?: string;

		// TypeScript
		ATOMIC_CODEGEN_TS_STRICT?: string;
		ATOMIC_CODEGEN_TS_TARGET?: string;
		ATOMIC_CODEGEN_TS_MODULE?: string;
		ATOMIC_CODEGEN_TS_DECLARATION?: string;
		ATOMIC_CODEGEN_TS_USE_ENUMS?: string;
		ATOMIC_CODEGEN_TS_PREFER_INTERFACES?: string;
	};
}

/**
 * Configuration precedence levels
 */
export enum ConfigPrecedence {
	DEFAULT = 0,
	CONFIG_FILE = 1,
	ENVIRONMENT = 2,
	CLI_ARGS = 3,
}

/**
 * Configuration source information
 */
export interface ConfigSource {
	/** Source type */
	type: "default" | "config-file" | "environment" | "cli-args";

	/** Source location (file path for config files) */
	location?: string;

	/** Precedence level */
	precedence: ConfigPrecedence;
}

/**
 * Configuration validation error
 */
export interface ConfigValidationError {
	/** Field path (e.g., "typeschema.outputFormat") */
	path: string;

	/** Error message */
	message: string;

	/** Invalid value */
	value?: unknown;

	/** Suggested fix */
	suggestion?: string;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
	/** Whether configuration is valid */
	valid: boolean;

	/** Validation errors */
	errors: ConfigValidationError[];

	/** Validation warnings */
	warnings: ConfigValidationError[];

	/** Validated and normalized configuration */
	config?: AtomicCodegenConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_ATOMIC_CODEGEN_CONFIG: AtomicCodegenConfig = {
	project: {
		rootDir: process.cwd(),
		workingDir: "tmp/atomic-codegen",
	},
	typeschema: DEFAULT_TYPESCHEMA_CONFIG,
	generator: DEFAULT_GENERATOR_CONFIG,
	languages: {
		typescript: DEFAULT_TYPESCRIPT_CONFIG,
	},
	global: {
		verbose: false,
		cache: {
			enabled: true,
			directory: "tmp/cache",
			ttl: 3600, // 1 hour
			maxSize: 100, // 100MB
		},
		logging: {
			level: "info",
			format: "text",
			output: "console",
		},
	},
};

/**
 * Configuration file names to search for
 */
export const CONFIG_FILE_NAMES = [
	".atomic-codegen.json",
	".atomic-codegen.js",
	"atomic-codegen.config.json",
	"atomic-codegen.config.js",
] as const;

/**
 * Type guard for AtomicCodegenConfig
 */
export function isAtomicCodegenConfig(
	obj: unknown,
): obj is AtomicCodegenConfig {
	return typeof obj === "object" && obj !== null;
}

/**
 * Type guard for ConfigFileSchema
 */
export function isConfigFileSchema(obj: unknown): obj is ConfigFileSchema {
	return isAtomicCodegenConfig(obj);
}
