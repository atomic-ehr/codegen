/**
 * Generator Registry Implementation
 *
 * Concrete implementation of the generator registry system
 */

import { readdir, stat } from "fs/promises";
import { extname, join, resolve } from "path";
import type { Generator, GeneratorOptions } from "./base";
import type {
	GeneratorDiscoveryResult,
	GeneratorFactory,
	GeneratorMetadata,
	GeneratorPlugin,
	GeneratorRegistryEntry,
	IGeneratorRegistry,
} from "./registry";
import {
	GeneratorAlreadyRegisteredError,
	GeneratorNotFoundError,
	GeneratorRegistryError,
	InvalidGeneratorError,
	PluginLoadError,
} from "./registry";

/**
 * Default generator registry implementation
 */
export class GeneratorRegistry implements IGeneratorRegistry {
	private generators = new Map<string, GeneratorRegistryEntry>();
	private pluginDirs: string[] = [];

	/**
	 * Register a generator with the registry
	 */
	register(metadata: GeneratorMetadata, factory: GeneratorFactory): void {
		if (this.generators.has(metadata.id)) {
			throw new GeneratorAlreadyRegisteredError(metadata.id);
		}

		this.validateMetadata(metadata);

		this.generators.set(metadata.id, {
			metadata,
			factory,
		});
	}

	/**
	 * Register a generator plugin
	 */
	registerPlugin(plugin: GeneratorPlugin): void {
		if (this.generators.has(plugin.metadata.id)) {
			throw new GeneratorAlreadyRegisteredError(plugin.metadata.id);
		}

		this.validateMetadata(plugin.metadata);

		this.generators.set(plugin.metadata.id, {
			metadata: plugin.metadata,
			factory: plugin.createGenerator,
			plugin,
		});
	}

	/**
	 * Unregister a generator
	 */
	unregister(id: string): boolean {
		return this.generators.delete(id);
	}

	/**
	 * Get a generator by ID
	 */
	get(id: string): GeneratorRegistryEntry | undefined {
		return this.generators.get(id);
	}

	/**
	 * Check if a generator is registered
	 */
	has(id: string): boolean {
		return this.generators.has(id);
	}

	/**
	 * List all registered generators
	 */
	list(): GeneratorMetadata[] {
		return Array.from(this.generators.values()).map((entry) => entry.metadata);
	}

	/**
	 * List generators by target language
	 */
	listByTarget(target: string): GeneratorMetadata[] {
		return this.list().filter((metadata) => metadata.target === target);
	}

	/**
	 * Create a generator instance
	 */
	async create(id: string, options: GeneratorOptions): Promise<Generator> {
		const entry = this.generators.get(id);
		if (!entry) {
			throw new GeneratorNotFoundError(id);
		}

		try {
			const generator = await entry.factory(options);

			// Validate that the generator implements the required interface
			if (!generator || typeof generator.generate !== "function") {
				throw new InvalidGeneratorError(
					id,
					"Generator must implement generate() method",
				);
			}

			if (!generator.name || !generator.target) {
				throw new InvalidGeneratorError(
					id,
					"Generator must have name and target properties",
				);
			}

			return generator;
		} catch (error) {
			if (error instanceof GeneratorRegistryError) {
				throw error;
			}
			throw new GeneratorRegistryError(
				`Failed to create generator ${id}: ${error instanceof Error ? error.message : String(error)}`,
				"GENERATOR_CREATION_FAILED",
				{ id, cause: error },
			);
		}
	}

	/**
	 * Discover generators in specified paths
	 */
	async discover(paths: string[]): Promise<GeneratorDiscoveryResult> {
		const found: GeneratorMetadata[] = [];
		const errors: Array<{ path: string; error: Error }> = [];

		for (const searchPath of paths) {
			try {
				const resolvedPath = resolve(searchPath);
				const stats = await stat(resolvedPath);

				if (stats.isDirectory()) {
					const dirResults = await this.discoverInDirectory(resolvedPath);
					found.push(...dirResults.found);
					errors.push(...dirResults.errors);
				} else if (stats.isFile() && this.isGeneratorFile(resolvedPath)) {
					try {
						const metadata = await this.loadGeneratorMetadata(resolvedPath);
						if (metadata) {
							found.push(metadata);
						}
					} catch (error) {
						errors.push({
							path: resolvedPath,
							error: error instanceof Error ? error : new Error(String(error)),
						});
					}
				}
			} catch (error) {
				errors.push({
					path: searchPath,
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		}

		return { found, errors };
	}

	/**
	 * Load generators from plugin directories
	 */
	async loadPlugins(pluginDirs: string[]): Promise<void> {
		this.pluginDirs = [...pluginDirs];

		for (const pluginDir of pluginDirs) {
			try {
				const resolvedDir = resolve(pluginDir);
				await this.loadPluginsFromDirectory(resolvedDir);
			} catch (error) {
				// Log error but continue loading other directories
				console.warn(`Failed to load plugins from ${pluginDir}:`, error);
			}
		}
	}

	/**
	 * Validate all registered generators
	 */
	async validate(): Promise<void> {
		const validationErrors: Array<{ id: string; error: Error }> = [];

		for (const [id, entry] of this.generators) {
			try {
				// Validate metadata
				this.validateMetadata(entry.metadata);

				// Validate plugin if present
				if (entry.plugin?.validate) {
					await entry.plugin.validate();
				}

				// Try to create a test instance to validate factory
				const testOptions: GeneratorOptions = {
					outputDir: "/tmp/test",
					verbose: false,
				};

				const generator = await entry.factory(testOptions);
				if (!generator || typeof generator.generate !== "function") {
					throw new Error("Invalid generator: missing generate method");
				}
			} catch (error) {
				validationErrors.push({
					id,
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		}

		if (validationErrors.length > 0) {
			const errorMessages = validationErrors
				.map(({ id, error }) => `${id}: ${error.message}`)
				.join("\n");
			throw new GeneratorRegistryError(
				`Generator validation failed:\n${errorMessages}`,
				"VALIDATION_FAILED",
				{ errors: validationErrors },
			);
		}
	}

	/**
	 * Clear all registered generators
	 */
	clear(): void {
		this.generators.clear();
	}

	/**
	 * Get plugin directories
	 */
	getPluginDirectories(): string[] {
		return [...this.pluginDirs];
	}

	/**
	 * Validate generator metadata
	 */
	private validateMetadata(metadata: GeneratorMetadata): void {
		if (!metadata.id || typeof metadata.id !== "string") {
			throw new InvalidGeneratorError(
				metadata.id || "unknown",
				"Invalid or missing id",
			);
		}

		if (!metadata.name || typeof metadata.name !== "string") {
			throw new InvalidGeneratorError(metadata.id, "Invalid or missing name");
		}

		if (!metadata.target || typeof metadata.target !== "string") {
			throw new InvalidGeneratorError(metadata.id, "Invalid or missing target");
		}

		if (!metadata.version || typeof metadata.version !== "string") {
			throw new InvalidGeneratorError(
				metadata.id,
				"Invalid or missing version",
			);
		}

		if (!metadata.description || typeof metadata.description !== "string") {
			throw new InvalidGeneratorError(
				metadata.id,
				"Invalid or missing description",
			);
		}

		if (typeof metadata.builtin !== "boolean") {
			throw new InvalidGeneratorError(
				metadata.id,
				"Invalid or missing builtin flag",
			);
		}
	}

	/**
	 * Discover generators in a directory
	 */
	private async discoverInDirectory(
		dirPath: string,
	): Promise<GeneratorDiscoveryResult> {
		const found: GeneratorMetadata[] = [];
		const errors: Array<{ path: string; error: Error }> = [];

		try {
			const entries = await readdir(dirPath);

			for (const entry of entries) {
				const entryPath = join(dirPath, entry);

				try {
					const stats = await stat(entryPath);

					if (stats.isFile() && this.isGeneratorFile(entryPath)) {
						const metadata = await this.loadGeneratorMetadata(entryPath);
						if (metadata) {
							found.push(metadata);
						}
					} else if (stats.isDirectory()) {
						// Recursively search subdirectories
						const subResults = await this.discoverInDirectory(entryPath);
						found.push(...subResults.found);
						errors.push(...subResults.errors);
					}
				} catch (error) {
					errors.push({
						path: entryPath,
						error: error instanceof Error ? error : new Error(String(error)),
					});
				}
			}
		} catch (error) {
			errors.push({
				path: dirPath,
				error: error instanceof Error ? error : new Error(String(error)),
			});
		}

		return { found, errors };
	}

	/**
	 * Check if a file is a potential generator file
	 */
	private isGeneratorFile(filePath: string): boolean {
		const ext = extname(filePath);
		return (
			[".js", ".ts", ".mjs"].includes(ext) &&
			(filePath.includes("generator") || filePath.includes("plugin"))
		);
	}

	/**
	 * Load generator metadata from a file
	 */
	private async loadGeneratorMetadata(
		filePath: string,
	): Promise<GeneratorMetadata | null> {
		try {
			// Try to import the module
			const module = await import(filePath);

			// Look for metadata export
			if (module.metadata && typeof module.metadata === "object") {
				return {
					...module.metadata,
					modulePath: filePath,
				};
			}

			// Look for plugin export
			if (module.plugin && module.plugin.metadata) {
				return {
					...module.plugin.metadata,
					modulePath: filePath,
				};
			}

			// Look for default export with metadata
			if (module.default && module.default.metadata) {
				return {
					...module.default.metadata,
					modulePath: filePath,
				};
			}

			return null;
		} catch (error) {
			throw new PluginLoadError(
				filePath,
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Load plugins from a directory
	 */
	private async loadPluginsFromDirectory(dirPath: string): Promise<void> {
		const discoveryResult = await this.discoverInDirectory(dirPath);

		for (const metadata of discoveryResult.found) {
			if (!metadata.modulePath) {
				continue;
			}

			try {
				const module = await import(metadata.modulePath);

				// Look for plugin export
				if (module.plugin && typeof module.plugin === "object") {
					this.registerPlugin(module.plugin);
					continue;
				}

				// Look for default export as plugin
				if (
					module.default &&
					typeof module.default === "object" &&
					module.default.metadata
				) {
					this.registerPlugin(module.default);
					continue;
				}

				// Look for factory function
				if (
					module.createGenerator &&
					typeof module.createGenerator === "function"
				) {
					this.register(metadata, module.createGenerator);
					continue;
				}

				console.warn(`No valid plugin found in ${metadata.modulePath}`);
			} catch (error) {
				console.warn(
					`Failed to load plugin from ${metadata.modulePath}:`,
					error,
				);
			}
		}

		// Log discovery errors as warnings
		for (const { path, error } of discoveryResult.errors) {
			console.warn(`Discovery error in ${path}:`, error.message);
		}
	}
}

/**
 * Default global registry instance
 */
export const defaultRegistry = new GeneratorRegistry();
