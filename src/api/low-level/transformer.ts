/**
 * Custom Transformer System
 *
 * Provides pluggable transformation pipeline for AST manipulation and code generation.
 * Supports custom transformers, middleware, and transformation contexts.
 */

import type {
	ASTNode,
	InterfaceDeclaration,
	PropertySignature,
	TypeNode,
} from "./ast";
import { ASTManipulator, ASTTraverser } from "./ast";
import type { CodeFragment } from "./fragment";

/**
 * Transformation context provides shared state and utilities during transformation
 */
export interface TransformationContext {
	id: string;
	sourceNode: ASTNode;
	targetNode?: ASTNode;
	metadata: Record<string, any>;
	options: Record<string, any>;
	errors: TransformationError[];
	warnings: TransformationWarning[];
	statistics: TransformationStats;
}

/**
 * Transformation error
 */
export interface TransformationError {
	message: string;
	code: string;
	node?: ASTNode;
	transformer?: string;
	severity: "error" | "warning" | "info";
}

/**
 * Transformation warning
 */
export interface TransformationWarning {
	message: string;
	code: string;
	node?: ASTNode;
	transformer?: string;
}

/**
 * Transformation statistics
 */
export interface TransformationStats {
	startTime: number;
	endTime?: number;
	duration?: number;
	nodesProcessed: number;
	transformersApplied: number;
	errorsCount: number;
	warningsCount: number;
}

/**
 * Transformation result
 */
export interface TransformationResult {
	success: boolean;
	transformedNode?: ASTNode;
	fragments?: CodeFragment[];
	context: TransformationContext;
	errors: TransformationError[];
	warnings: TransformationWarning[];
	statistics: TransformationStats;
}

/**
 * Base transformer interface
 */
export interface Transformer {
	name: string;
	description?: string;
	version?: string;
	priority?: number;

	/**
	 * Check if this transformer can handle the given node
	 */
	canTransform(node: ASTNode, context: TransformationContext): boolean;

	/**
	 * Transform the node
	 */
	transform(
		node: ASTNode,
		context: TransformationContext,
	): Promise<ASTNode | null>;

	/**
	 * Validate the transformation result
	 */
	validate?(result: ASTNode, context: TransformationContext): Promise<boolean>;

	/**
	 * Cleanup after transformation
	 */
	cleanup?(context: TransformationContext): Promise<void>;
}

/**
 * Transformer middleware for pre/post processing
 */
export interface TransformerMiddleware {
	name: string;

	/**
	 * Execute before transformers
	 */
	before?(node: ASTNode, context: TransformationContext): Promise<void>;

	/**
	 * Execute after transformers
	 */
	after?(node: ASTNode, context: TransformationContext): Promise<void>;

	/**
	 * Handle errors during transformation
	 */
	onError?(
		error: TransformationError,
		context: TransformationContext,
	): Promise<void>;
}

/**
 * Transformation pipeline configuration
 */
export interface TransformationPipelineConfig {
	transformers: Transformer[];
	middleware: TransformerMiddleware[];
	options: Record<string, any>;
	parallel?: boolean;
	continueOnError?: boolean;
	validateResults?: boolean;
}

/**
 * Main transformation engine
 */
export class TransformationEngine {
	private transformers: Map<string, Transformer> = new Map();
	private middleware: TransformerMiddleware[] = [];
	private contextCounter = 0;

	/**
	 * Register a transformer
	 */
	registerTransformer(transformer: Transformer): void {
		this.transformers.set(transformer.name, transformer);
	}

	/**
	 * Register multiple transformers
	 */
	registerTransformers(transformers: Transformer[]): void {
		transformers.forEach((transformer) =>
			this.registerTransformer(transformer),
		);
	}

	/**
	 * Unregister a transformer
	 */
	unregisterTransformer(name: string): boolean {
		return this.transformers.delete(name);
	}

	/**
	 * Get registered transformer
	 */
	getTransformer(name: string): Transformer | undefined {
		return this.transformers.get(name);
	}

	/**
	 * Get all registered transformers
	 */
	getAllTransformers(): Transformer[] {
		return Array.from(this.transformers.values());
	}

	/**
	 * Add middleware
	 */
	addMiddleware(middleware: TransformerMiddleware): void {
		this.middleware.push(middleware);
	}

	/**
	 * Remove middleware
	 */
	removeMiddleware(name: string): boolean {
		const index = this.middleware.findIndex((m) => m.name === name);
		if (index !== -1) {
			this.middleware.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Transform a node using registered transformers
	 */
	async transform(
		node: ASTNode,
		options: {
			transformers?: string[];
			parallel?: boolean;
			continueOnError?: boolean;
			validateResults?: boolean;
			metadata?: Record<string, any>;
		} = {},
	): Promise<TransformationResult> {
		const context = this.createContext(node, options.metadata || {}, options);

		try {
			// Execute before middleware
			for (const middleware of this.middleware) {
				if (middleware.before) {
					await middleware.before(node, context);
				}
			}

			// Get applicable transformers
			const applicableTransformers = this.getApplicableTransformers(
				node,
				context,
				options.transformers,
			);

			// Execute transformations
			let currentNode = node;

			if (options.parallel && applicableTransformers.length > 1) {
				currentNode = await this.executeParallelTransformations(
					currentNode,
					applicableTransformers,
					context,
					options.continueOnError || false,
				);
			} else {
				currentNode = await this.executeSequentialTransformations(
					currentNode,
					applicableTransformers,
					context,
					options.continueOnError || false,
				);
			}

			// Validate results if requested
			if (options.validateResults) {
				await this.validateTransformationResults(currentNode, context);
			}

			// Execute after middleware
			for (const middleware of this.middleware) {
				if (middleware.after) {
					await middleware.after(currentNode, context);
				}
			}

			// Complete statistics
			context.statistics.endTime = Date.now();
			context.statistics.duration =
				context.statistics.endTime - context.statistics.startTime;

			return {
				success:
					context.errors.filter((e) => e.severity === "error").length === 0,
				transformedNode: currentNode,
				context,
				errors: context.errors,
				warnings: context.warnings,
				statistics: context.statistics,
			};
		} catch (error) {
			const transformationError: TransformationError = {
				message: error instanceof Error ? error.message : String(error),
				code: "TRANSFORMATION_FAILED",
				severity: "error",
				transformer: "TransformationEngine",
			};

			context.errors.push(transformationError);

			// Execute error middleware
			for (const middleware of this.middleware) {
				if (middleware.onError) {
					await middleware.onError(transformationError, context);
				}
			}

			return {
				success: false,
				context,
				errors: context.errors,
				warnings: context.warnings,
				statistics: context.statistics,
			};
		}
	}

	/**
	 * Transform using a specific pipeline configuration
	 */
	async transformWithPipeline(
		node: ASTNode,
		pipeline: TransformationPipelineConfig,
	): Promise<TransformationResult> {
		// Temporarily register pipeline transformers
		const previousTransformers = new Map(this.transformers);
		pipeline.transformers.forEach((t) => this.registerTransformer(t));

		// Temporarily add pipeline middleware
		const previousMiddleware = [...this.middleware];
		pipeline.middleware.forEach((m) => this.addMiddleware(m));

		try {
			return await this.transform(node, {
				parallel: pipeline.parallel,
				continueOnError: pipeline.continueOnError,
				validateResults: pipeline.validateResults,
				metadata: { pipelineConfig: pipeline.options },
			});
		} finally {
			// Restore previous state
			this.transformers = previousTransformers;
			this.middleware = previousMiddleware;
		}
	}

	/**
	 * Create a transformation pipeline builder
	 */
	createPipeline(): TransformationPipelineBuilder {
		return new TransformationPipelineBuilder();
	}

	// Private methods

	private createContext(
		sourceNode: ASTNode,
		metadata: Record<string, any>,
		options: Record<string, any>,
	): TransformationContext {
		return {
			id: `transform_${++this.contextCounter}`,
			sourceNode,
			metadata: { ...metadata },
			options: { ...options },
			errors: [],
			warnings: [],
			statistics: {
				startTime: Date.now(),
				nodesProcessed: 0,
				transformersApplied: 0,
				errorsCount: 0,
				warningsCount: 0,
			},
		};
	}

	private getApplicableTransformers(
		node: ASTNode,
		context: TransformationContext,
		transformerNames?: string[],
	): Transformer[] {
		let transformers: Transformer[];

		if (transformerNames) {
			transformers = transformerNames
				.map((name) => this.transformers.get(name))
				.filter((t): t is Transformer => t !== undefined);
		} else {
			transformers = Array.from(this.transformers.values());
		}

		return transformers
			.filter((transformer) => transformer.canTransform(node, context))
			.sort((a, b) => (b.priority || 0) - (a.priority || 0));
	}

	private async executeSequentialTransformations(
		node: ASTNode,
		transformers: Transformer[],
		context: TransformationContext,
		continueOnError: boolean,
	): Promise<ASTNode> {
		let currentNode = node;

		for (const transformer of transformers) {
			try {
				const result = await transformer.transform(currentNode, context);

				if (result !== null) {
					currentNode = result;
					context.statistics.transformersApplied++;
				}

				// Validate if transformer supports it
				if (transformer.validate) {
					const isValid = await transformer.validate(currentNode, context);
					if (!isValid) {
						const error: TransformationError = {
							message: `Transformer '${transformer.name}' produced invalid result`,
							code: "VALIDATION_FAILED",
							severity: "error",
							transformer: transformer.name,
							node: currentNode,
						};
						context.errors.push(error);

						if (!continueOnError) {
							break;
						}
					}
				}

				// Cleanup if transformer supports it
				if (transformer.cleanup) {
					await transformer.cleanup(context);
				}
			} catch (error) {
				const transformationError: TransformationError = {
					message: error instanceof Error ? error.message : String(error),
					code: "TRANSFORMER_FAILED",
					severity: "error",
					transformer: transformer.name,
					node: currentNode,
				};

				context.errors.push(transformationError);

				if (!continueOnError) {
					break;
				}
			}

			context.statistics.nodesProcessed++;
		}

		return currentNode;
	}

	private async executeParallelTransformations(
		node: ASTNode,
		transformers: Transformer[],
		context: TransformationContext,
		continueOnError: boolean,
	): Promise<ASTNode> {
		// Note: Parallel execution is complex for AST transformations
		// as transformers may depend on previous results.
		// This implementation creates separate contexts for each transformer
		// and then merges results based on priority.

		const transformationPromises = transformers.map(async (transformer) => {
			const clonedNode = this.deepCloneNode(node);
			const transformerContext = {
				...context,
				id: `${context.id}_${transformer.name}`,
			};

			try {
				const result = await transformer.transform(
					clonedNode,
					transformerContext,
				);
				return {
					transformer,
					result,
					context: transformerContext,
					error: null,
				};
			} catch (error) {
				return {
					transformer,
					result: null,
					context: transformerContext,
					error: error instanceof Error ? error : new Error(String(error)),
				};
			}
		});

		const results = await Promise.all(transformationPromises);

		// Merge results based on transformer priority
		let finalNode = node;

		results
			.filter((r) => r.result !== null)
			.sort(
				(a, b) => (b.transformer.priority || 0) - (a.transformer.priority || 0),
			)
			.forEach((r) => {
				if (r.result) {
					finalNode = r.result;
					context.statistics.transformersApplied++;
				}
			});

		// Collect errors
		results
			.filter((r) => r.error !== null)
			.forEach((r) => {
				const transformationError: TransformationError = {
					message: r.error!.message,
					code: "PARALLEL_TRANSFORMER_FAILED",
					severity: "error",
					transformer: r.transformer.name,
					node: node,
				};
				context.errors.push(transformationError);
			});

		context.statistics.nodesProcessed += results.length;

		return finalNode;
	}

	private async validateTransformationResults(
		node: ASTNode,
		context: TransformationContext,
	): Promise<void> {
		// Basic AST structure validation
		const manipulator = new ASTManipulator();
		const validation = manipulator.validateAST(node);

		if (!validation.isValid) {
			validation.errors.forEach((errorMsg) => {
				const error: TransformationError = {
					message: errorMsg,
					code: "AST_VALIDATION_FAILED",
					severity: "error",
					node,
				};
				context.errors.push(error);
			});
		}
	}

	private deepCloneNode(node: ASTNode): ASTNode {
		const manipulator = new ASTManipulator();
		return manipulator.cloneNode(node);
	}
}

/**
 * Transformation pipeline builder for fluent API
 */
export class TransformationPipelineBuilder {
	private config: TransformationPipelineConfig = {
		transformers: [],
		middleware: [],
		options: {},
		parallel: false,
		continueOnError: false,
		validateResults: true,
	};

	/**
	 * Add a transformer to the pipeline
	 */
	addTransformer(transformer: Transformer): TransformationPipelineBuilder {
		this.config.transformers.push(transformer);
		return this;
	}

	/**
	 * Add multiple transformers
	 */
	addTransformers(transformers: Transformer[]): TransformationPipelineBuilder {
		this.config.transformers.push(...transformers);
		return this;
	}

	/**
	 * Add middleware to the pipeline
	 */
	addMiddleware(
		middleware: TransformerMiddleware,
	): TransformationPipelineBuilder {
		this.config.middleware.push(middleware);
		return this;
	}

	/**
	 * Set pipeline options
	 */
	setOptions(options: Record<string, any>): TransformationPipelineBuilder {
		this.config.options = { ...this.config.options, ...options };
		return this;
	}

	/**
	 * Enable parallel execution
	 */
	parallel(enabled = true): TransformationPipelineBuilder {
		this.config.parallel = enabled;
		return this;
	}

	/**
	 * Continue on error
	 */
	continueOnError(enabled = true): TransformationPipelineBuilder {
		this.config.continueOnError = enabled;
		return this;
	}

	/**
	 * Enable/disable result validation
	 */
	validateResults(enabled = true): TransformationPipelineBuilder {
		this.config.validateResults = enabled;
		return this;
	}

	/**
	 * Build the pipeline configuration
	 */
	build(): TransformationPipelineConfig {
		return { ...this.config };
	}
}

/**
 * Built-in transformers for common operations
 */
export namespace BuiltInTransformers {
	/**
	 * TypeScript interface property transformer
	 */
	export class PropertyTransformer implements Transformer {
		name = "PropertyTransformer";
		description = "Transforms TypeScript interface properties";
		priority = 100;

		constructor(
			private propertyMapper: (
				property: PropertySignature,
			) => PropertySignature | null,
		) {}

		canTransform(node: ASTNode): boolean {
			return node.kind === "InterfaceDeclaration";
		}

		async transform(node: ASTNode): Promise<ASTNode | null> {
			const interfaceNode = node as InterfaceDeclaration;
			const manipulator = new ASTManipulator();
			const cloned = manipulator.cloneNode(interfaceNode);

			// Transform properties
			cloned.properties = cloned.properties
				.map((prop) => this.propertyMapper(prop))
				.filter((prop): prop is PropertySignature => prop !== null);

			return cloned;
		}
	}

	/**
	 * Interface renaming transformer
	 */
	export class InterfaceRenameTransformer implements Transformer {
		name = "InterfaceRenameTransformer";
		description = "Renames TypeScript interfaces";
		priority = 200;

		constructor(private nameMapper: (currentName: string) => string) {}

		canTransform(node: ASTNode): boolean {
			return node.kind === "InterfaceDeclaration";
		}

		async transform(node: ASTNode): Promise<ASTNode | null> {
			const interfaceNode = node as InterfaceDeclaration;
			const manipulator = new ASTManipulator();
			const cloned = manipulator.cloneNode(interfaceNode);

			cloned.name = this.nameMapper(cloned.name);

			return cloned;
		}
	}

	/**
	 * Type mapping transformer
	 */
	export class TypeMappingTransformer implements Transformer {
		name = "TypeMappingTransformer";
		description = "Maps types according to provided mapping rules";
		priority = 150;

		constructor(private typeMap: Record<string, string>) {}

		canTransform(node: ASTNode): boolean {
			return node.kind === "InterfaceDeclaration";
		}

		async transform(
			node: ASTNode,
			context: TransformationContext,
		): Promise<ASTNode | null> {
			const interfaceNode = node as InterfaceDeclaration;
			const manipulator = new ASTManipulator();
			const cloned = manipulator.cloneNode(interfaceNode);
			const traverser = new ASTTraverser();

			// Transform all type references
			traverser.traverse(cloned, {
				enter: (currentNode) => {
					if (currentNode.kind === "TypeReference") {
						const typeRef = currentNode as any;
						if (this.typeMap[typeRef.name]) {
							typeRef.name = this.typeMap[typeRef.name];
						}
					}
				},
			});

			return cloned;
		}
	}

	/**
	 * Documentation transformer
	 */
	export class DocumentationTransformer implements Transformer {
		name = "DocumentationTransformer";
		description = "Adds or modifies documentation";
		priority = 50;

		constructor(
			private documentationProvider: (node: ASTNode) => string | null,
		) {}

		canTransform(node: ASTNode): boolean {
			return (
				node.kind === "InterfaceDeclaration" ||
				node.kind === "PropertySignature"
			);
		}

		async transform(node: ASTNode): Promise<ASTNode | null> {
			const manipulator = new ASTManipulator();
			const cloned = manipulator.cloneNode(node);

			const documentation = this.documentationProvider(cloned);
			if (documentation) {
				if (!cloned.metadata) {
					cloned.metadata = {};
				}
				cloned.metadata.documentation = documentation;
			}

			return cloned;
		}
	}
}

/**
 * Built-in middleware for common operations
 */
export namespace BuiltInMiddleware {
	/**
	 * Logging middleware
	 */
	export class LoggingMiddleware implements TransformerMiddleware {
		name = "LoggingMiddleware";

		constructor(private logger: (message: string) => void = console.log) {}

		async before(node: ASTNode, context: TransformationContext): Promise<void> {
			this.logger(`[${context.id}] Starting transformation of ${node.kind}`);
		}

		async after(node: ASTNode, context: TransformationContext): Promise<void> {
			this.logger(
				`[${context.id}] Completed transformation in ${context.statistics.duration || 0}ms`,
			);
		}

		async onError(
			error: TransformationError,
			context: TransformationContext,
		): Promise<void> {
			this.logger(
				`[${context.id}] Error in ${error.transformer}: ${error.message}`,
			);
		}
	}

	/**
	 * Statistics collection middleware
	 */
	export class StatisticsMiddleware implements TransformerMiddleware {
		name = "StatisticsMiddleware";

		private statistics = new Map<
			string,
			{
				totalTransformations: number;
				totalDuration: number;
				successRate: number;
				errorCount: number;
			}
		>();

		async after(node: ASTNode, context: TransformationContext): Promise<void> {
			const nodeType = node.kind;
			const current = this.statistics.get(nodeType) || {
				totalTransformations: 0,
				totalDuration: 0,
				successRate: 0,
				errorCount: 0,
			};

			current.totalTransformations++;
			current.totalDuration += context.statistics.duration || 0;
			current.errorCount += context.errors.filter(
				(e) => e.severity === "error",
			).length;
			current.successRate =
				(current.totalTransformations - current.errorCount) /
				current.totalTransformations;

			this.statistics.set(nodeType, current);
		}

		getStatistics(): Map<string, any> {
			return new Map(this.statistics);
		}

		resetStatistics(): void {
			this.statistics.clear();
		}
	}

	/**
	 * Validation middleware
	 */
	export class ValidationMiddleware implements TransformerMiddleware {
		name = "ValidationMiddleware";

		async after(node: ASTNode, context: TransformationContext): Promise<void> {
			const manipulator = new ASTManipulator();
			const validation = manipulator.validateAST(node);

			if (!validation.isValid) {
				validation.errors.forEach((errorMsg) => {
					context.errors.push({
						message: errorMsg,
						code: "VALIDATION_ERROR",
						severity: "error",
						node,
					});
				});
			}
		}
	}
}
