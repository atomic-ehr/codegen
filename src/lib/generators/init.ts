/**
 * Generator System Initialization
 *
 * Handles initialization of the generator registry system
 */

import { join } from "path";
import { registerBuiltinGenerators } from "./builtin-generators";
import { defaultRegistry } from "./generator-registry";
import { loadPluginsFromDirectories } from "./plugin-loader";

/**
 * Initialization options
 */
export interface InitializationOptions {
	/** Plugin directories to load from */
	pluginDirs?: string[];

	/** Whether to register built-in generators */
	registerBuiltins?: boolean;

	/** Whether to load plugins automatically */
	loadPlugins?: boolean;

	/** Whether to ignore plugin loading errors */
	ignorePluginErrors?: boolean;

	/** Custom plugin search paths relative to project root */
	customPluginPaths?: string[];
}

/**
 * Initialization state
 */
let initialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Default plugin directories
 */
const DEFAULT_PLUGIN_DIRS = [
	"plugins",
	"generators",
	"node_modules/@atomic-ehr/codegen-*",
	"node_modules/codegen-*",
];

/**
 * Initialize the generator system
 */
export async function initializeGeneratorSystem(
	options: InitializationOptions = {},
): Promise<void> {
	// Return existing initialization if already in progress
	if (initializationPromise) {
		return initializationPromise;
	}

	// Return immediately if already initialized
	if (initialized) {
		return;
	}

	initializationPromise = performInitialization(options);

	try {
		await initializationPromise;
		initialized = true;
	} catch (error) {
		initializationPromise = null;
		throw error;
	}
}

/**
 * Perform the actual initialization
 */
async function performInitialization(
	options: InitializationOptions,
): Promise<void> {
	const {
		pluginDirs = DEFAULT_PLUGIN_DIRS,
		registerBuiltins = true,
		loadPlugins = true,
		ignorePluginErrors = true,
		customPluginPaths = [],
	} = options;

	// Clear existing registry
	defaultRegistry.clear();

	// Register built-in generators
	if (registerBuiltins) {
		try {
			registerBuiltinGenerators();
		} catch (error) {
			console.warn("Failed to register built-in generators:", error);
			if (!ignorePluginErrors) {
				throw error;
			}
		}
	}

	// Load plugins
	if (loadPlugins) {
		const allPluginDirs = [...pluginDirs, ...customPluginPaths];

		try {
			const result = await loadPluginsFromDirectories(allPluginDirs);

			// Register loaded plugins
			for (const plugin of result.plugins) {
				try {
					defaultRegistry.registerPlugin(plugin);
				} catch (error) {
					console.warn(
						`Failed to register plugin ${plugin.metadata.id}:`,
						error,
					);
					if (!ignorePluginErrors) {
						throw error;
					}
				}
			}

			// Log loading results
			if (result.plugins.length > 0) {
				console.log(`Loaded ${result.plugins.length} generator plugin(s)`);
			}

			if (result.errors.length > 0) {
				console.warn(`Plugin loading errors: ${result.errors.length}`);
				for (const { path, error } of result.errors) {
					console.warn(`  ${path}: ${error.message}`);
				}
			}

			if (result.invalid.length > 0) {
				console.warn(`Invalid plugins found: ${result.invalid.length}`);
				for (const { path, reason } of result.invalid) {
					console.warn(`  ${path}: ${reason}`);
				}
			}
		} catch (error) {
			console.warn("Failed to load plugins:", error);
			if (!ignorePluginErrors) {
				throw error;
			}
		}
	}

	// Validate the registry
	try {
		await defaultRegistry.validate();
	} catch (error) {
		console.warn("Registry validation failed:", error);
		if (!ignorePluginErrors) {
			throw error;
		}
	}
}

/**
 * Check if the generator system is initialized
 */
export function isInitialized(): boolean {
	return initialized;
}

/**
 * Reset the initialization state (for testing)
 */
export function resetInitialization(): void {
	initialized = false;
	initializationPromise = null;
	defaultRegistry.clear();
}

/**
 * Ensure the generator system is initialized
 */
export async function ensureInitialized(
	options?: InitializationOptions,
): Promise<void> {
	if (!initialized && !initializationPromise) {
		await initializeGeneratorSystem(options);
	} else if (initializationPromise) {
		await initializationPromise;
	}
}

/**
 * Get initialization status and statistics
 */
export function getInitializationStatus() {
	return {
		initialized,
		inProgress: initializationPromise !== null,
		registeredGenerators: defaultRegistry.list().length,
		builtinGenerators: defaultRegistry.list().filter((g) => g.builtin).length,
		pluginGenerators: defaultRegistry.list().filter((g) => !g.builtin).length,
	};
}
