/**
 * Core Module - API-First Codegen Architecture
 *
 * Central module providing core functionality for the codegen system
 */

// Export dependency injection
export {
	type Cache,
	type Container,
	createContainer,
	DIContainer,
	EventEmitter,
	globalContainer,
	MemoryCache,
	type RegisterOptions,
} from "./container";
// Export plugin system
export {
	BasePlugin,
	createPlugin,
	PluginBuilder,
	type PluginDefinition,
	type PluginMetadata,
	PluginRegistry,
	pluginRegistry,
} from "./plugin";
// Export all types
export type * from "./types";
// Export utilities
export * from "./utils";
// Export validation
export * from "./validation/generated-code";
export * from "./validation/typeschema-validator";

/**
 * Core module initialization
 */
export interface CoreOptions {
	/** Enable debug mode */
	debug?: boolean;

	/** Enable verbose logging */
	verbose?: boolean;

	/** Custom plugin directories */
	pluginDirs?: string[];
}

/**
 * Initialize the core module
 */
export async function initializeCore(options: CoreOptions = {}): Promise<void> {
	// Load plugins from directories if specified
	if (options.pluginDirs && options.pluginDirs.length > 0) {
		// TODO: Implement plugin loading from directories
		console.log(
			`Plugin directories configured: ${options.pluginDirs.join(", ")}`,
		);
	}

	console.log("Core module initialized");
}

/**
 * Register built-in plugins
 */
export async function registerBuiltinPlugins(): Promise<void> {
	const { createPlugin } = await import("./plugin");

	// TypeSchema to TypeScript plugin
	createPlugin()
		.withId("typeschema-typescript")
		.withName("TypeSchema to TypeScript")
		.withVersion("1.0.0")
		.withDescription("Generate TypeScript interfaces from TypeSchema")
		.addInput("typeschema")
		.addOutput("typescript")
		.register();

	// FHIR package loader plugin
	createPlugin()
		.withId("fhir-loader")
		.withName("FHIR Package Loader")
		.withVersion("1.0.0")
		.withDescription("Load FHIR packages and generate TypeSchema")
		.addInput("fhir")
		.addOutput("typeschema")
		.register();
}
