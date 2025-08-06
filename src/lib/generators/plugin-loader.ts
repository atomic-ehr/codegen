/**
 * Plugin Loader Utility
 *
 * Utilities for loading and managing generator plugins
 */

import { access, readdir, stat } from "fs/promises";
import { join, resolve } from "path";
import type { GeneratorMetadata, GeneratorPlugin } from "./registry";
import { PluginLoadError } from "./registry";

/**
 * Plugin loader configuration
 */
export interface PluginLoaderConfig {
	/** Directories to search for plugins */
	pluginDirs: string[];

	/** Whether to load plugins recursively */
	recursive?: boolean;

	/** File patterns to match for plugin files */
	patterns?: string[];

	/** Whether to ignore loading errors */
	ignoreErrors?: boolean;
}

/**
 * Plugin loading result
 */
export interface PluginLoadResult {
	/** Successfully loaded plugins */
	plugins: GeneratorPlugin[];

	/** Loading errors */
	errors: Array<{
		path: string;
		error: Error;
	}>;

	/** Discovered but invalid plugins */
	invalid: Array<{
		path: string;
		reason: string;
	}>;
}

/**
 * Plugin loader class
 */
export class PluginLoader {
	private config: Required<PluginLoaderConfig>;

	constructor(config: PluginLoaderConfig) {
		this.config = {
			recursive: true,
			patterns: [
				"*generator*.js",
				"*generator*.ts",
				"*plugin*.js",
				"*plugin*.ts",
			],
			ignoreErrors: false,
			...config,
		};
	}

	/**
	 * Load plugins from configured directories
	 */
	async loadPlugins(): Promise<PluginLoadResult> {
		const plugins: GeneratorPlugin[] = [];
		const errors: Array<{ path: string; error: Error }> = [];
		const invalid: Array<{ path: string; reason: string }> = [];

		for (const pluginDir of this.config.pluginDirs) {
			try {
				const result = await this.loadPluginsFromDirectory(pluginDir);
				plugins.push(...result.plugins);
				errors.push(...result.errors);
				invalid.push(...result.invalid);
			} catch (error) {
				const loadError =
					error instanceof Error ? error : new Error(String(error));
				if (this.config.ignoreErrors) {
					errors.push({ path: pluginDir, error: loadError });
				} else {
					throw new PluginLoadError(pluginDir, loadError);
				}
			}
		}

		return { plugins, errors, invalid };
	}

	/**
	 * Load plugins from a specific directory
	 */
	async loadPluginsFromDirectory(dirPath: string): Promise<PluginLoadResult> {
		const plugins: GeneratorPlugin[] = [];
		const errors: Array<{ path: string; error: Error }> = [];
		const invalid: Array<{ path: string; reason: string }> = [];

		try {
			const resolvedDir = resolve(dirPath);

			// Check if directory exists
			try {
				await access(resolvedDir);
			} catch {
				// Directory doesn't exist, skip silently
				return { plugins, errors, invalid };
			}

			const entries = await this.discoverPluginFiles(resolvedDir);

			for (const filePath of entries) {
				try {
					const plugin = await this.loadPluginFromFile(filePath);
					if (plugin) {
						plugins.push(plugin);
					} else {
						invalid.push({
							path: filePath,
							reason: "No valid plugin export found",
						});
					}
				} catch (error) {
					const loadError =
						error instanceof Error ? error : new Error(String(error));
					if (this.config.ignoreErrors) {
						errors.push({ path: filePath, error: loadError });
					} else {
						throw new PluginLoadError(filePath, loadError);
					}
				}
			}
		} catch (error) {
			const loadError =
				error instanceof Error ? error : new Error(String(error));
			errors.push({ path: dirPath, error: loadError });
		}

		return { plugins, errors, invalid };
	}

	/**
	 * Load a plugin from a specific file
	 */
	async loadPluginFromFile(filePath: string): Promise<GeneratorPlugin | null> {
		try {
			const module = await import(filePath);

			// Look for plugin export
			if (module.plugin && this.isValidPlugin(module.plugin)) {
				return module.plugin;
			}

			// Look for default export as plugin
			if (module.default && this.isValidPlugin(module.default)) {
				return module.default;
			}

			// Look for named exports that could form a plugin
			if (module.metadata && module.createGenerator) {
				const plugin: GeneratorPlugin = {
					metadata: module.metadata,
					createGenerator: module.createGenerator,
				};

				if (module.validate && typeof module.validate === "function") {
					plugin.validate = module.validate;
				}

				if (module.cleanup && typeof module.cleanup === "function") {
					plugin.cleanup = module.cleanup;
				}

				if (this.isValidPlugin(plugin)) {
					return plugin;
				}
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
	 * Discover plugin files in a directory
	 */
	private async discoverPluginFiles(dirPath: string): Promise<string[]> {
		const files: string[] = [];

		const entries = await readdir(dirPath);

		for (const entry of entries) {
			const entryPath = join(dirPath, entry);
			const stats = await stat(entryPath);

			if (stats.isFile()) {
				if (this.matchesPattern(entry)) {
					files.push(entryPath);
				}
			} else if (stats.isDirectory() && this.config.recursive) {
				const subFiles = await this.discoverPluginFiles(entryPath);
				files.push(...subFiles);
			}
		}

		return files;
	}

	/**
	 * Check if a filename matches plugin patterns
	 */
	private matchesPattern(filename: string): boolean {
		return this.config.patterns.some((pattern) => {
			// Simple glob pattern matching
			const regex = new RegExp(
				pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
			);
			return regex.test(filename);
		});
	}

	/**
	 * Validate that an object is a valid plugin
	 */
	private isValidPlugin(obj: any): obj is GeneratorPlugin {
		if (!obj || typeof obj !== "object") {
			return false;
		}

		// Check required properties
		if (!obj.metadata || typeof obj.metadata !== "object") {
			return false;
		}

		if (!obj.createGenerator || typeof obj.createGenerator !== "function") {
			return false;
		}

		// Validate metadata
		const metadata = obj.metadata as GeneratorMetadata;
		if (!metadata.id || typeof metadata.id !== "string") {
			return false;
		}

		if (!metadata.name || typeof metadata.name !== "string") {
			return false;
		}

		if (!metadata.target || typeof metadata.target !== "string") {
			return false;
		}

		if (!metadata.version || typeof metadata.version !== "string") {
			return false;
		}

		if (!metadata.description || typeof metadata.description !== "string") {
			return false;
		}

		if (typeof metadata.builtin !== "boolean") {
			return false;
		}

		// Check optional methods
		if (obj.validate && typeof obj.validate !== "function") {
			return false;
		}

		if (obj.cleanup && typeof obj.cleanup !== "function") {
			return false;
		}

		return true;
	}
}

/**
 * Create a plugin loader with default configuration
 */
export function createPluginLoader(
	pluginDirs: string[],
	options?: Partial<PluginLoaderConfig>,
): PluginLoader {
	return new PluginLoader({
		pluginDirs,
		...options,
	});
}

/**
 * Load plugins from directories with default settings
 */
export async function loadPluginsFromDirectories(
	pluginDirs: string[],
): Promise<PluginLoadResult> {
	const loader = createPluginLoader(pluginDirs);
	return loader.loadPlugins();
}
