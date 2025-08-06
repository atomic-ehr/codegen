/**
 * Configuration Interfaces
 *
 * Core configuration types for the code generation system
 */

/**
 * Configuration for TypeSchema generation from FHIR packages
 */
export interface TypeSchemaConfig {
	/** FHIR packages to process (includes both core packages and profiles) */
	packages: string[];

	/** Output format for TypeSchema */
	outputFormat: "ndjson" | "separate" | "merged";

	/** Enable validation of generated schemas */
	validation: boolean;

	/** Types to include (treeshaking) */
	treeshaking?: string[];

	/** Working directory for package caching */
	workingDir?: string;

	/** Drop existing caches */
	dropCache?: boolean;

	/** Verbose logging */
	verbose?: boolean;
}

/**
 * Configuration for code generators
 */
export interface GeneratorConfig {
	/** Target language/format */
	target: "typescript" | "python" | "java" | "rust";

	/** Output directory */
	outputDir: string;

	/** Include comments in generated code */
	includeComments: boolean;

	/** Include validation code */
	includeValidation: boolean;

	/** Namespace organization style */
	namespaceStyle: "nested" | "flat";

	/** File naming convention */
	fileNaming?: "camelCase" | "kebab-case" | "snake_case" | "PascalCase";

	/** Whether to format generated code */
	format?: boolean;

	/** Custom file header */
	fileHeader?: string;

	/** Whether to overwrite existing files */
	overwrite?: boolean;

	/** Verbose logging */
	verbose?: boolean;
}

/**
 * Language-specific generator configuration
 */
export interface LanguageConfig {
	/** Language-specific options */
	[key: string]: unknown;
}

/**
 * TypeScript-specific generator configuration
 */
export interface TypeScriptConfig extends LanguageConfig {
	/** Whether to use strict mode */
	strict?: boolean;

	/** TypeScript version target */
	target?:
		| "ES5"
		| "ES6"
		| "ES2015"
		| "ES2017"
		| "ES2018"
		| "ES2019"
		| "ES2020"
		| "ES2021"
		| "ES2022";

	/** Module system to use */
	module?: "CommonJS" | "ES6" | "ES2015" | "ES2020" | "ES2022" | "ESNext";

	/** Whether to emit declaration files */
	declaration?: boolean;

	/** Base types module import path */
	baseTypesModule?: string;

	/** Whether to use enums for value sets */
	useEnums?: boolean;

	/** Interface vs type alias preference */
	preferInterfaces?: boolean;
}

/**
 * Default configurations
 */
export const DEFAULT_TYPESCHEMA_CONFIG: Partial<TypeSchemaConfig> = {
	outputFormat: "ndjson",
	validation: true,
	verbose: false,
	dropCache: false,
};

export const DEFAULT_GENERATOR_CONFIG: Partial<GeneratorConfig> = {
	target: "typescript",
	includeComments: true,
	includeValidation: false,
	namespaceStyle: "nested",
	fileNaming: "PascalCase",
	format: true,
	overwrite: true,
	verbose: false,
};

export const DEFAULT_TYPESCRIPT_CONFIG: TypeScriptConfig = {
	strict: true,
	target: "ES2020",
	module: "ES2020",
	declaration: true,
	useEnums: true,
	preferInterfaces: true,
};
