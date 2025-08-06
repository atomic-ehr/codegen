/**
 * Generator Registry System
 *
 * Provides a centralized registry for code generators with support for:
 * - Generator discovery and registration
 * - Plugin loading
 * - Metadata and validation
 * - CLI integration
 */

import type { Generator, GeneratorOptions } from "./base";

/**
 * Metadata for a registered generator
 */
export interface GeneratorMetadata {
	/** Unique identifier for the generator */
	id: string;

	/** Human-readable name */
	name: string;

	/** Target language or format */
	target: string;

	/** Generator version */
	version: string;

	/** Brief description */
	description: string;

	/** Author information */
	author?: string;

	/** Supported file extensions for input */
	supportedInputs?: string[];

	/** Supported output formats */
	supportedOutputs?: string[];

	/** Whether this is a built-in generator */
	builtin: boolean;

	/** Path to generator module (for external generators) */
	modulePath?: string;

	/** Additional configuration schema */
	configSchema?: Record<string, unknown>;
}

/**
 * Factory function type for creating generator instances
 */
export type GeneratorFactory<T extends Generator = Generator> = (
	options: GeneratorOptions,
) => T | Promise<T>;

/**
 * Generator plugin interface for external generators
 */
export interface GeneratorPlugin {
	/** Plugin metadata */
	metadata: GeneratorMetadata;

	/** Factory function to create generator instances */
	createGenerator: GeneratorFactory;

	/** Optional validation function for plugin */
	validate?(): Promise<void>;

	/** Optional cleanup function for plugin */
	cleanup?(): Promise<void>;
}

/**
 * Registry entry for a generator
 */
export interface GeneratorRegistryEntry {
	metadata: GeneratorMetadata;
	factory: GeneratorFactory;
	plugin?: GeneratorPlugin;
}

/**
 * Generator discovery result
 */
export interface GeneratorDiscoveryResult {
	found: GeneratorMetadata[];
	errors: Array<{
		path: string;
		error: Error;
	}>;
}

/**
 * Generator registry interface
 */
export interface IGeneratorRegistry {
	/**
	 * Register a generator with the registry
	 */
	register(metadata: GeneratorMetadata, factory: GeneratorFactory): void;

	/**
	 * Register a generator plugin
	 */
	registerPlugin(plugin: GeneratorPlugin): void;

	/**
	 * Unregister a generator
	 */
	unregister(id: string): boolean;

	/**
	 * Get a generator by ID
	 */
	get(id: string): GeneratorRegistryEntry | undefined;

	/**
	 * Check if a generator is registered
	 */
	has(id: string): boolean;

	/**
	 * List all registered generators
	 */
	list(): GeneratorMetadata[];

	/**
	 * List generators by target language
	 */
	listByTarget(target: string): GeneratorMetadata[];

	/**
	 * Create a generator instance
	 */
	create(id: string, options: GeneratorOptions): Promise<Generator>;

	/**
	 * Discover generators in specified paths
	 */
	discover(paths: string[]): Promise<GeneratorDiscoveryResult>;

	/**
	 * Load generators from plugin directories
	 */
	loadPlugins(pluginDirs: string[]): Promise<void>;

	/**
	 * Validate all registered generators
	 */
	validate(): Promise<void>;

	/**
	 * Clear all registered generators
	 */
	clear(): void;
}

/**
 * Generator registry error types
 */
export class GeneratorRegistryError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "GeneratorRegistryError";
	}
}

export class GeneratorNotFoundError extends GeneratorRegistryError {
	constructor(id: string) {
		super(`Generator not found: ${id}`, "GENERATOR_NOT_FOUND", { id });
	}
}

export class GeneratorAlreadyRegisteredError extends GeneratorRegistryError {
	constructor(id: string) {
		super(
			`Generator already registered: ${id}`,
			"GENERATOR_ALREADY_REGISTERED",
			{ id },
		);
	}
}

export class InvalidGeneratorError extends GeneratorRegistryError {
	constructor(id: string, reason: string) {
		super(`Invalid generator ${id}: ${reason}`, "INVALID_GENERATOR", {
			id,
			reason,
		});
	}
}

export class PluginLoadError extends GeneratorRegistryError {
	constructor(path: string, cause: Error) {
		super(
			`Failed to load plugin from ${path}: ${cause.message}`,
			"PLUGIN_LOAD_ERROR",
			{ path, cause },
		);
	}
}
