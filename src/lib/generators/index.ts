/**
 * Generator System Module
 *
 * Complete generator system including registry, plugins, and base functionality
 */

// Base generator functionality
export type { FileContent, Generator, GeneratorOptions } from "./base";
export { BaseGenerator, GeneratorError } from "./base";
// Built-in generators
export {
	createTypeScriptGenerator,
	getBuiltinGenerators,
	isBuiltinGenerator,
	registerBuiltinGenerators,
	typescriptGeneratorMetadata,
} from "./builtin-generators";
// Registry implementation
export { defaultRegistry, GeneratorRegistry } from "./generator-registry";
// Initialization
export {
	ensureInitialized,
	getInitializationStatus,
	initializeGeneratorSystem,
	isInitialized,
} from "./init";
// Schema loading
export type { LoadedSchemas, LoaderOptions } from "./loader";
export { SchemaLoader } from "./loader";

// Plugin loading
export type { PluginLoaderConfig, PluginLoadResult } from "./plugin-loader";
export {
	createPluginLoader,
	loadPluginsFromDirectories,
	PluginLoader,
} from "./plugin-loader";
// Registry system
export type {
	GeneratorDiscoveryResult,
	GeneratorFactory,
	GeneratorMetadata,
	GeneratorPlugin,
	GeneratorRegistryEntry,
	IGeneratorRegistry,
} from "./registry";
export {
	GeneratorAlreadyRegisteredError,
	GeneratorNotFoundError,
	GeneratorRegistryError,
	InvalidGeneratorError,
	PluginLoadError,
} from "./registry";

// Testing utilities
export type { TestGeneratorOptions } from "./testing";
export {
	assertGeneratorOutput,
	assertGeneratorValidation,
	createMockGeneratorFactory,
	createMockGeneratorMetadata,
	createMockGeneratorPlugin,
	createTestFixture,
	createTestRegistry,
	GeneratorTestFixture,
	MockGenerator,
	runGeneratorTest,
	TestGeneratorRegistry,
} from "./testing";
