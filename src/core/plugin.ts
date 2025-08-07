/**
 * Plugin System
 *
 * Core plugin management and registry system
 */

import type {
	GenerationContext,
	GenerationResult,
	Plugin,
	PluginCapabilities,
	PluginLifecycle,
} from "./types";
import { AtomicCodegenError } from "./utils/errors";

/**
 * Plugin metadata
 */
export interface PluginMetadata {
	id: string;
	name: string;
	version: string;
	description: string;
	author?: string;
	repository?: string;
	keywords?: string[];
}

/**
 * Plugin definition
 */
export interface PluginDefinition<TOptions = Record<string, unknown>> {
	metadata: PluginMetadata;
	capabilities: PluginCapabilities;
	configSchema?: Record<string, unknown>;

	// Factory function to create plugin instance
	create(options?: TOptions): Plugin | Promise<Plugin>;
}

/**
 * Base plugin class
 */
export class BasePlugin implements Plugin, PluginLifecycle {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly capabilities: PluginCapabilities;
	configSchema?: Record<string, unknown>;

	constructor(
		metadata: PluginMetadata,
		capabilities: PluginCapabilities,
		configSchema?: Record<string, unknown>,
	) {
		this.id = metadata.id;
		this.name = metadata.name;
		this.version = metadata.version;
		this.capabilities = capabilities;
		this.configSchema = configSchema;
	}

	// Lifecycle hooks - can be overridden by subclasses
	async onInit(): Promise<void> {
		// Default implementation - no op
	}

	async beforeGenerate(_context: GenerationContext): Promise<void> {
		// Default implementation - no op
	}

	async afterGenerate(
		_context: GenerationContext,
		_result: GenerationResult,
	): Promise<void> {
		// Default implementation - no op
	}

	async onDestroy(): Promise<void> {
		// Default implementation - no op
	}

	// Transform method - must be implemented by subclasses if needed
	async transform(
		_input: unknown,
		_options?: Record<string, unknown>,
	): Promise<unknown> {
		throw new Error(`Transform not implemented for plugin: ${this.name}`);
	}
}

/**
 * Plugin registry for managing available plugins
 */
export class PluginRegistry {
	private plugins = new Map<string, PluginDefinition>();
	private instances = new Map<string, Plugin>();

	/**
	 * Register a plugin definition
	 */
	register(definition: PluginDefinition): void {
		if (this.plugins.has(definition.metadata.id)) {
			throw new AtomicCodegenError(
				`Plugin already registered: ${definition.metadata.id}`,
				{
					code: "PLUGIN_DUPLICATE",
					context: { id: definition.metadata.id },
				},
			);
		}

		this.plugins.set(definition.metadata.id, definition);
	}

	/**
	 * Unregister a plugin
	 */
	unregister(id: string): boolean {
		// Destroy instance if exists
		const instance = this.instances.get(id);
		if (instance?.onDestroy) {
			instance.onDestroy();
		}
		this.instances.delete(id);

		return this.plugins.delete(id);
	}

	/**
	 * Get a plugin definition
	 */
	get(id: string): PluginDefinition | undefined {
		return this.plugins.get(id);
	}

	/**
	 * Check if a plugin is registered
	 */
	has(id: string): boolean {
		return this.plugins.has(id);
	}

	/**
	 * List all registered plugins
	 */
	list(): PluginMetadata[] {
		return Array.from(this.plugins.values()).map((p) => p.metadata);
	}

	/**
	 * Create a plugin instance
	 */
	async createInstance(
		id: string,
		options?: Record<string, unknown>,
	): Promise<Plugin> {
		const definition = this.plugins.get(id);

		if (!definition) {
			throw new AtomicCodegenError(`Plugin not found: ${id}`, {
				code: "PLUGIN_NOT_FOUND",
				context: { id },
				suggestions: [
					"Check that the plugin is registered",
					"Verify the plugin ID is correct",
				],
			});
		}

		// Check if instance already exists (singleton pattern)
		if (this.instances.has(id)) {
			return this.instances.get(id)!;
		}

		// Validate options against schema if provided
		if (definition.configSchema && options) {
			// TODO: Implement schema validation
			// validateSchema(options, definition.configSchema);
		}

		// Create instance
		const instance = await definition.create(options);

		// Initialize the plugin
		if (instance.onInit) {
			await instance.onInit();
		}

		// Cache the instance
		this.instances.set(id, instance);

		return instance;
	}

	/**
	 * Get or create a plugin instance
	 */
	async getInstance(
		id: string,
		options?: Record<string, unknown>,
	): Promise<Plugin> {
		if (this.instances.has(id)) {
			return this.instances.get(id)!;
		}

		return this.createInstance(id, options);
	}

	/**
	 * Destroy all plugin instances
	 */
	async destroyAll(): Promise<void> {
		for (const instance of this.instances.values()) {
			if (instance.onDestroy) {
				await instance.onDestroy();
			}
		}
		this.instances.clear();
	}

	/**
	 * Find plugins by capability
	 */
	findByCapability(
		input?: string,
		output?: string,
		features?: {
			streaming?: boolean;
			incremental?: boolean;
			parallel?: boolean;
		},
	): PluginMetadata[] {
		const results: PluginMetadata[] = [];

		for (const definition of this.plugins.values()) {
			const caps = definition.capabilities;

			// Check input format
			if (input && !caps.inputs.includes(input)) {
				continue;
			}

			// Check output format
			if (output && !caps.outputs.includes(output)) {
				continue;
			}

			// Check features
			if (features) {
				if (features.streaming && !caps.streaming) continue;
				if (features.incremental && !caps.incremental) continue;
				if (features.parallel && !caps.parallel) continue;
			}

			results.push(definition.metadata);
		}

		return results;
	}
}

/**
 * Global plugin registry
 */
export const pluginRegistry = new PluginRegistry();

/**
 * Plugin builder for creating plugins with fluent API
 */
export class PluginBuilder<TOptions = Record<string, unknown>> {
	private metadata: Partial<PluginMetadata> = {};
	private capabilities: Partial<PluginCapabilities> = {
		inputs: [],
		outputs: [],
	};
	private configSchema?: Record<string, unknown>;
	private createFn?: (options?: TOptions) => Plugin | Promise<Plugin>;
	private hooks: Partial<PluginLifecycle> = {};

	/**
	 * Set plugin metadata
	 */
	withMetadata(metadata: PluginMetadata): this {
		this.metadata = metadata;
		return this;
	}

	/**
	 * Set plugin ID
	 */
	withId(id: string): this {
		this.metadata.id = id;
		return this;
	}

	/**
	 * Set plugin name
	 */
	withName(name: string): this {
		this.metadata.name = name;
		return this;
	}

	/**
	 * Set plugin version
	 */
	withVersion(version: string): this {
		this.metadata.version = version;
		return this;
	}

	/**
	 * Set plugin description
	 */
	withDescription(description: string): this {
		this.metadata.description = description;
		return this;
	}

	/**
	 * Set plugin capabilities
	 */
	withCapabilities(capabilities: PluginCapabilities): this {
		this.capabilities = capabilities;
		return this;
	}

	/**
	 * Add input format
	 */
	addInput(format: string): this {
		this.capabilities.inputs = this.capabilities.inputs || [];
		this.capabilities.inputs.push(format);
		return this;
	}

	/**
	 * Add output format
	 */
	addOutput(format: string): this {
		this.capabilities.outputs = this.capabilities.outputs || [];
		this.capabilities.outputs.push(format);
		return this;
	}

	/**
	 * Enable streaming
	 */
	withStreaming(enabled = true): this {
		this.capabilities.streaming = enabled;
		return this;
	}

	/**
	 * Enable incremental generation
	 */
	withIncremental(enabled = true): this {
		this.capabilities.incremental = enabled;
		return this;
	}

	/**
	 * Enable parallel processing
	 */
	withParallel(enabled = true): this {
		this.capabilities.parallel = enabled;
		return this;
	}

	/**
	 * Set configuration schema
	 */
	withConfigSchema(schema: Record<string, unknown>): this {
		this.configSchema = schema;
		return this;
	}

	/**
	 * Set initialization hook
	 */
	onInit(handler: () => Promise<void> | void): this {
		this.hooks.onInit = handler;
		return this;
	}

	/**
	 * Set before generate hook
	 */
	beforeGenerate(
		handler: (context: GenerationContext) => Promise<void> | void,
	): this {
		this.hooks.beforeGenerate = handler;
		return this;
	}

	/**
	 * Set after generate hook
	 */
	afterGenerate(
		handler: (
			context: GenerationContext,
			result: GenerationResult,
		) => Promise<void> | void,
	): this {
		this.hooks.afterGenerate = handler;
		return this;
	}

	/**
	 * Set destroy hook
	 */
	onDestroy(handler: () => Promise<void> | void): this {
		this.hooks.onDestroy = handler;
		return this;
	}

	/**
	 * Set create function
	 */
	withCreate(createFn: (options?: TOptions) => Plugin | Promise<Plugin>): this {
		this.createFn = createFn;
		return this;
	}

	/**
	 * Build the plugin definition
	 */
	build(): PluginDefinition<TOptions> {
		// Validate required fields
		if (!this.metadata.id) {
			throw new Error("Plugin ID is required");
		}
		if (!this.metadata.name) {
			throw new Error("Plugin name is required");
		}
		if (!this.metadata.version) {
			throw new Error("Plugin version is required");
		}
		if (!this.metadata.description) {
			throw new Error("Plugin description is required");
		}
		if (!this.capabilities.inputs || this.capabilities.inputs.length === 0) {
			throw new Error("At least one input format is required");
		}
		if (!this.capabilities.outputs || this.capabilities.outputs.length === 0) {
			throw new Error("At least one output format is required");
		}

		const metadata = this.metadata as PluginMetadata;
		const capabilities = this.capabilities as PluginCapabilities;
		const hooks = this.hooks;
		const configSchema = this.configSchema;

		// Create factory function
		const create =
			this.createFn ||
			((_options?: TOptions) => {
				return new (class BuiltPlugin extends BasePlugin {
					constructor() {
						super(metadata, capabilities, configSchema);
					}

					override async onInit() {
						if (hooks.onInit) await hooks.onInit();
					}

					override async beforeGenerate(context: GenerationContext) {
						if (hooks.beforeGenerate) await hooks.beforeGenerate(context);
					}

					override async afterGenerate(
						context: GenerationContext,
						result: GenerationResult,
					) {
						if (hooks.afterGenerate) await hooks.afterGenerate(context, result);
					}

					override async onDestroy() {
						if (hooks.onDestroy) await hooks.onDestroy();
					}
				})();
			});

		return {
			metadata,
			capabilities,
			configSchema,
			create,
		};
	}

	/**
	 * Build and register the plugin
	 */
	register(): PluginDefinition {
		const definition = this.build();
		pluginRegistry.register(definition as PluginDefinition);
		return definition as PluginDefinition;
	}
}

/**
 * Create a new plugin builder
 */
export function createPlugin<
	TOptions = Record<string, unknown>,
>(): PluginBuilder<TOptions> {
	return new PluginBuilder<TOptions>();
}
