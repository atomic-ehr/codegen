/**
 * Core Type Definitions for Atomic Codegen
 *
 * Central type definitions for the API-first codegen architecture
 */

import type { TypeSchema } from "../lib/typeschema";

/**
 * Plugin lifecycle hooks
 */
export interface PluginLifecycle {
	/** Called when plugin is initialized */
	onInit?(): Promise<void> | void;

	/** Called before generation starts */
	beforeGenerate?(context: GenerationContext): Promise<void> | void;

	/** Called after generation completes */
	afterGenerate?(
		context: GenerationContext,
		result: GenerationResult,
	): Promise<void> | void;

	/** Called when plugin is being destroyed */
	onDestroy?(): Promise<void> | void;
}

/**
 * Plugin capability declaration
 */
export interface PluginCapabilities {
	/** Supported input formats */
	inputs: string[];

	/** Supported output formats */
	outputs: string[];

	/** Whether the plugin supports streaming */
	streaming?: boolean;

	/** Whether the plugin supports incremental generation */
	incremental?: boolean;

	/** Whether the plugin supports parallel processing */
	parallel?: boolean;
}

/**
 * Enhanced plugin interface with lifecycle and capabilities
 */
export interface Plugin extends PluginLifecycle {
	/** Unique plugin identifier */
	id: string;

	/** Plugin name */
	name: string;

	/** Plugin version */
	version: string;

	/** Plugin capabilities */
	capabilities: PluginCapabilities;

	/** Plugin configuration schema */
	configSchema?: Record<string, unknown>;

	/** Transform method for the plugin */
	transform?(
		input: unknown,
		options?: Record<string, unknown>,
	): Promise<unknown> | unknown;
}

/**
 * Generation context passed to plugins
 */
export interface GenerationContext {
	/** Current configuration */
	config: GeneratorConfig;

	/** Logger instance */
	logger: Logger;

	/** Shared state between plugins */
	state: Map<string, unknown>;

	/** Input schemas */
	schemas?: TypeSchema[];

	/** Output directory */
	outputDir: string;

	/** Generation mode */
	mode: "full" | "incremental" | "watch";
}

/**
 * Generation result from plugins
 */
export interface GenerationResult {
	/** Generated files */
	files: GeneratedFile[];

	/** Generation statistics */
	stats: GenerationStats;

	/** Any errors that occurred */
	errors?: GenerationError[];

	/** Any warnings */
	warnings?: string[];
}

/**
 * Generated file information
 */
export interface GeneratedFile {
	/** File path relative to output directory */
	path: string;

	/** File content */
	content: string;

	/** File metadata */
	metadata?: {
		/** Source schema that generated this file */
		source?: string;

		/** Generation timestamp */
		timestamp?: string;

		/** Custom metadata */
		[key: string]: unknown;
	};
}

/**
 * Generation statistics
 */
export interface GenerationStats {
	/** Number of files generated */
	filesGenerated: number;

	/** Total generation time in milliseconds */
	duration: number;

	/** Number of schemas processed */
	schemasProcessed: number;

	/** Memory usage in bytes */
	memoryUsage?: number;

	/** Custom statistics */
	[key: string]: unknown;
}

/**
 * Generation error details
 */
export interface GenerationError {
	/** Error code */
	code: string;

	/** Error message */
	message: string;

	/** File that caused the error */
	file?: string;

	/** Line number if applicable */
	line?: number;

	/** Column number if applicable */
	column?: number;

	/** Stack trace */
	stack?: string;
}

/**
 * Generator configuration
 */
export interface GeneratorConfig {
	/** Target language/format */
	target: string;

	/** Output directory */
	outputDir: string;

	/** Plugin configurations */
	plugins?: PluginConfig[];

	/** Global options */
	options?: GeneratorOptions;

	/** TypeSchema specific configuration */
	typeschema?: TypeSchemaConfig;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
	/** Plugin ID to load */
	id: string;

	/** Plugin-specific options */
	options?: Record<string, unknown>;

	/** Whether the plugin is enabled */
	enabled?: boolean;
}

/**
 * Generator options
 */
export interface GeneratorOptions {
	/** Enable verbose logging */
	verbose?: boolean;

	/** Enable debug mode */
	debug?: boolean;

	/** Whether to overwrite existing files */
	overwrite?: boolean;

	/** File encoding */
	encoding?: BufferEncoding;

	/** Whether to format generated code */
	format?: boolean;

	/** Custom file header */
	fileHeader?: string;

	/** Whether to generate source maps */
	sourceMaps?: boolean;

	/** Whether to run in dry-run mode */
	dryRun?: boolean;
}

/**
 * TypeSchema configuration
 */
export interface TypeSchemaConfig {
	/** FHIR packages to process */
	packages: string[];

	/** Output format for TypeSchema */
	outputFormat: "ndjson" | "separate" | "merged";

	/** Enable validation */
	validation?: boolean;

	/** Types to include (tree-shaking) */
	include?: string[];

	/** Types to exclude */
	exclude?: string[];

	/** Working directory for caching */
	cacheDir?: string;

	/** Whether to use cache */
	useCache?: boolean;
}

/**
 * Logger interface
 */
export interface Logger {
	debug(message: string, context?: Record<string, unknown>): void;
	info(message: string, context?: Record<string, unknown>): void;
	warn(message: string, context?: Record<string, unknown>): void;
	error(
		message: string,
		error?: Error,
		context?: Record<string, unknown>,
	): void;
	child(component: string): Logger;
}

/**
 * Dependency injection container interface
 */
export interface Container {
	/** Register a service */
	register<T>(
		token: string | symbol,
		factory: () => T,
		options?: RegisterOptions,
	): void;

	/** Resolve a service */
	resolve<T>(token: string | symbol): T;

	/** Check if a service is registered */
	has(token: string | symbol): boolean;

	/** Create a child container */
	createScope(): Container;
}

/**
 * Service registration options
 */
export interface RegisterOptions {
	/** Service lifetime */
	lifetime?: "singleton" | "transient" | "scoped";

	/** Dependencies to inject */
	dependencies?: Array<string | symbol>;

	/** Tags for the service */
	tags?: string[];
}

/**
 * Event emitter interface for plugin communication
 */
export interface EventEmitter {
	on(event: string, handler: (...args: any[]) => void): void;
	off(event: string, handler: (...args: any[]) => void): void;
	emit(event: string, ...args: any[]): void;
	once(event: string, handler: (...args: any[]) => void): void;
}

/**
 * Cache interface for performance optimization
 */
export interface Cache<T = unknown> {
	get(key: string): T | undefined;
	set(key: string, value: T, ttl?: number): void;
	has(key: string): boolean;
	delete(key: string): boolean;
	clear(): void;
	size(): number;
}

/**
 * File system abstraction
 */
export interface FileSystem {
	readFile(path: string): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
	readdir(path: string): Promise<string[]>;
	stat(path: string): Promise<FileStat>;
	rm(
		path: string,
		options?: { recursive?: boolean; force?: boolean },
	): Promise<void>;
}

/**
 * File statistics
 */
export interface FileStat {
	isFile(): boolean;
	isDirectory(): boolean;
	size: number;
	mtime: Date;
	ctime: Date;
}

/**
 * Progress reporter for long-running operations
 */
export interface ProgressReporter {
	start(total: number, message?: string): void;
	update(current: number, message?: string): void;
	increment(delta?: number, message?: string): void;
	finish(message?: string): void;
}

/**
 * Validation result
 */
export interface ValidationResult {
	valid: boolean;
	errors?: ValidationError[];
	warnings?: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
	path: string;
	message: string;
	code?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
	path: string;
	message: string;
	code?: string;
}

/**
 * Transform function type
 */
export type TransformFunction<TInput = unknown, TOutput = unknown> = (
	input: TInput,
	context: TransformContext,
) => Promise<TOutput> | TOutput;

/**
 * Transform context
 */
export interface TransformContext {
	/** Logger for the transform */
	logger: Logger;

	/** Current configuration */
	config: Record<string, unknown>;

	/** Shared state */
	state: Map<string, unknown>;
}

/**
 * Pipeline stage interface
 */
export interface PipelineStage<TInput = unknown, TOutput = unknown> {
	/** Stage name */
	name: string;

	/** Transform function */
	transform: TransformFunction<TInput, TOutput>;

	/** Whether this stage can be skipped */
	optional?: boolean;

	/** Whether this stage can run in parallel */
	parallel?: boolean;
}

/**
 * Pipeline interface for chaining transformations
 */
export interface Pipeline<TInput = unknown, TOutput = unknown> {
	/** Add a stage to the pipeline */
	pipe<TNext>(stage: PipelineStage<TOutput, TNext>): Pipeline<TInput, TNext>;

	/** Execute the pipeline */
	execute(input: TInput, context?: TransformContext): Promise<TOutput>;

	/** Get pipeline metadata */
	getMetadata(): PipelineMetadata;
}

/**
 * Pipeline metadata
 */
export interface PipelineMetadata {
	/** Pipeline stages */
	stages: Array<{ name: string; optional: boolean; parallel: boolean }>;

	/** Total number of stages */
	length: number;

	/** Whether the pipeline has parallel stages */
	hasParallel: boolean;
}

export type { TypeSchema };
