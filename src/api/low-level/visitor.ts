/**
 * Visitor Pattern Implementation
 *
 * Provides advanced visitor patterns for AST traversal and manipulation.
 * Supports multiple visitor types and language-agnostic patterns for future
 * Python and other language generators.
 */

import type {
	ASTNode,
	ExportDeclaration,
	ImportDeclaration,
	InterfaceDeclaration,
	PropertySignature,
	TypeNode,
} from "./ast";

/**
 * Generic visitor interface that can be extended for any language target
 */
export interface Visitor<T = any> {
	name: string;
	description?: string;
	languageTarget?: "typescript" | "python" | "java" | "csharp" | "generic";

	/**
	 * Visit any AST node - entry point for all node types
	 */
	visit?(node: ASTNode, context: VisitorContext): T | Promise<T>;

	/**
	 * Language-specific node visitors
	 */
	visitInterface?(
		node: InterfaceDeclaration,
		context: VisitorContext,
	): T | Promise<T>;
	visitProperty?(
		node: PropertySignature,
		context: VisitorContext,
	): T | Promise<T>;
	visitType?(node: TypeNode, context: VisitorContext): T | Promise<T>;
	visitImport?(
		node: ImportDeclaration,
		context: VisitorContext,
	): T | Promise<T>;
	visitExport?(
		node: ExportDeclaration,
		context: VisitorContext,
	): T | Promise<T>;

	/**
	 * Generic node type visitors for language-agnostic operations
	 */
	visitClassLike?(node: ASTNode, context: VisitorContext): T | Promise<T>;
	visitFieldLike?(node: ASTNode, context: VisitorContext): T | Promise<T>;
	visitTypeLike?(node: ASTNode, context: VisitorContext): T | Promise<T>;
	visitModuleLike?(node: ASTNode, context: VisitorContext): T | Promise<T>;

	/**
	 * Lifecycle methods
	 */
	beforeVisit?(node: ASTNode, context: VisitorContext): void | Promise<void>;
	afterVisit?(node: ASTNode, context: VisitorContext): void | Promise<void>;
	onError?(
		error: Error,
		node: ASTNode,
		context: VisitorContext,
	): void | Promise<void>;
}

/**
 * Visitor context provides state and utilities during traversal
 */
export interface VisitorContext {
	id: string;
	currentNode: ASTNode;
	parentNode?: ASTNode;
	rootNode: ASTNode;
	path: ASTNode[];
	depth: number;
	metadata: Record<string, any>;
	options: VisitorOptions;
	state: Record<string, any>;
	results: Map<string, any>;
	errors: VisitorError[];
	statistics: VisitorStatistics;
}

/**
 * Visitor execution options
 */
export interface VisitorOptions {
	parallel?: boolean;
	continueOnError?: boolean;
	maxDepth?: number;
	skipNodes?: string[];
	onlyNodes?: string[];
	collectResults?: boolean;
	enableStatistics?: boolean;
	languageTarget?: string;
	customData?: Record<string, any>;
}

/**
 * Visitor error information
 */
export interface VisitorError {
	message: string;
	code: string;
	node: ASTNode;
	visitor: string;
	context?: VisitorContext;
}

/**
 * Visitor execution statistics
 */
export interface VisitorStatistics {
	startTime: number;
	endTime?: number;
	duration?: number;
	nodesVisited: number;
	visitorsExecuted: number;
	errorsCount: number;
	maxDepth: number;
	nodeTypeCounts: Record<string, number>;
}

/**
 * Visitor execution result
 */
export interface VisitorResult<T = any> {
	success: boolean;
	results: Map<string, T>;
	errors: VisitorError[];
	statistics: VisitorStatistics;
	context: VisitorContext;
}

/**
 * Advanced visitor engine for AST traversal
 */
export class VisitorEngine {
	private visitors: Map<string, Visitor> = new Map();
	private contextCounter = 0;

	/**
	 * Register a visitor
	 */
	registerVisitor(visitor: Visitor): void {
		this.visitors.set(visitor.name, visitor);
	}

	/**
	 * Register multiple visitors
	 */
	registerVisitors(visitors: Visitor[]): void {
		visitors.forEach((visitor) => this.registerVisitor(visitor));
	}

	/**
	 * Unregister a visitor
	 */
	unregisterVisitor(name: string): boolean {
		return this.visitors.delete(name);
	}

	/**
	 * Get registered visitor
	 */
	getVisitor(name: string): Visitor | undefined {
		return this.visitors.get(name);
	}

	/**
	 * Get all registered visitors
	 */
	getAllVisitors(): Visitor[] {
		return Array.from(this.visitors.values());
	}

	/**
	 * Execute visitors on an AST node
	 */
	async execute<T = any>(
		node: ASTNode,
		options: VisitorOptions & {
			visitors?: string[];
		} = {},
	): Promise<VisitorResult<T>> {
		const context = this.createContext(node, options);

		try {
			// Get applicable visitors
			const applicableVisitors = this.getApplicableVisitors(
				options.visitors,
				options.languageTarget,
			);

			// Execute traversal
			await this.traverseWithVisitors(node, applicableVisitors, context);

			// Complete statistics
			context.statistics.endTime = Date.now();
			context.statistics.duration =
				context.statistics.endTime - context.statistics.startTime;

			return {
				success: context.errors.length === 0,
				results: context.results,
				errors: context.errors,
				statistics: context.statistics,
				context,
			};
		} catch (error) {
			const visitorError: VisitorError = {
				message: error instanceof Error ? error.message : String(error),
				code: "VISITOR_ENGINE_ERROR",
				node,
				visitor: "VisitorEngine",
			};

			context.errors.push(visitorError);

			return {
				success: false,
				results: context.results,
				errors: context.errors,
				statistics: context.statistics,
				context,
			};
		}
	}

	/**
	 * Create a visitor pattern builder for fluent API
	 */
	createPattern(): VisitorPatternBuilder {
		return new VisitorPatternBuilder(this);
	}

	// Private methods

	private createContext(
		node: ASTNode,
		options: VisitorOptions,
	): VisitorContext {
		return {
			id: `visitor_${++this.contextCounter}`,
			currentNode: node,
			rootNode: node,
			path: [node],
			depth: 0,
			metadata: {},
			options: {
				parallel: false,
				continueOnError: false,
				maxDepth: Infinity,
				collectResults: true,
				enableStatistics: true,
				...options,
			},
			state: {},
			results: new Map(),
			errors: [],
			statistics: {
				startTime: Date.now(),
				nodesVisited: 0,
				visitorsExecuted: 0,
				errorsCount: 0,
				maxDepth: 0,
				nodeTypeCounts: {},
			},
		};
	}

	private getApplicableVisitors(
		visitorNames?: string[],
		languageTarget?: string,
	): Visitor[] {
		let visitors: Visitor[];

		if (visitorNames) {
			visitors = visitorNames
				.map((name) => this.visitors.get(name))
				.filter((v): v is Visitor => v !== undefined);
		} else {
			visitors = Array.from(this.visitors.values());
		}

		// Filter by language target if specified
		if (languageTarget) {
			visitors = visitors.filter(
				(v) =>
					!v.languageTarget ||
					v.languageTarget === languageTarget ||
					v.languageTarget === "generic",
			);
		}

		return visitors;
	}

	private async traverseWithVisitors(
		node: ASTNode,
		visitors: Visitor[],
		context: VisitorContext,
	): Promise<void> {
		// Check depth limit
		if (context.depth > (context.options.maxDepth || Infinity)) {
			return;
		}

		// Check skip conditions
		if (this.shouldSkipNode(node, context.options)) {
			return;
		}

		// Update context
		context.currentNode = node;
		context.statistics.nodesVisited++;
		context.statistics.maxDepth = Math.max(
			context.statistics.maxDepth,
			context.depth,
		);
		context.statistics.nodeTypeCounts[node.kind] =
			(context.statistics.nodeTypeCounts[node.kind] || 0) + 1;

		// Execute visitors on current node
		if (context.options.parallel) {
			await this.executeVisitorsParallel(node, visitors, context);
		} else {
			await this.executeVisitorsSequential(node, visitors, context);
		}

		// Traverse children
		await this.traverseChildren(node, visitors, context);
	}

	private async executeVisitorsSequential(
		node: ASTNode,
		visitors: Visitor[],
		context: VisitorContext,
	): Promise<void> {
		for (const visitor of visitors) {
			try {
				// Before visit
				if (visitor.beforeVisit) {
					await visitor.beforeVisit(node, context);
				}

				// Execute visit
				const result = await this.executeVisitorMethod(node, visitor, context);

				if (context.options.collectResults && result !== undefined) {
					context.results.set(`${visitor.name}_${node.id}`, result);
				}

				// After visit
				if (visitor.afterVisit) {
					await visitor.afterVisit(node, context);
				}

				context.statistics.visitorsExecuted++;
			} catch (error) {
				const visitorError: VisitorError = {
					message: error instanceof Error ? error.message : String(error),
					code: "VISITOR_EXECUTION_ERROR",
					node,
					visitor: visitor.name,
					context,
				};

				context.errors.push(visitorError);
				context.statistics.errorsCount++;

				// Handle error
				if (visitor.onError) {
					await visitor.onError(
						error instanceof Error ? error : new Error(String(error)),
						node,
						context,
					);
				}

				if (!context.options.continueOnError) {
					break;
				}
			}
		}
	}

	private async executeVisitorsParallel(
		node: ASTNode,
		visitors: Visitor[],
		context: VisitorContext,
	): Promise<void> {
		const promises = visitors.map(async (visitor) => {
			try {
				// Before visit
				if (visitor.beforeVisit) {
					await visitor.beforeVisit(node, context);
				}

				// Execute visit
				const result = await this.executeVisitorMethod(node, visitor, context);

				if (context.options.collectResults && result !== undefined) {
					context.results.set(`${visitor.name}_${node.id}`, result);
				}

				// After visit
				if (visitor.afterVisit) {
					await visitor.afterVisit(node, context);
				}

				return { visitor, result, error: null };
			} catch (error) {
				const visitorError: VisitorError = {
					message: error instanceof Error ? error.message : String(error),
					code: "PARALLEL_VISITOR_ERROR",
					node,
					visitor: visitor.name,
					context,
				};

				context.errors.push(visitorError);

				// Handle error
				if (visitor.onError) {
					await visitor.onError(
						error instanceof Error ? error : new Error(String(error)),
						node,
						context,
					);
				}

				return { visitor, result: null, error: visitorError };
			}
		});

		const results = await Promise.all(promises);

		context.statistics.visitorsExecuted += results.filter(
			(r) => r.error === null,
		).length;
		context.statistics.errorsCount += results.filter(
			(r) => r.error !== null,
		).length;
	}

	private async executeVisitorMethod(
		node: ASTNode,
		visitor: Visitor,
		context: VisitorContext,
	): Promise<any> {
		// Try specific node type methods first
		switch (node.kind) {
			case "InterfaceDeclaration":
				if (visitor.visitInterface) {
					return await visitor.visitInterface(
						node as InterfaceDeclaration,
						context,
					);
				}
				// Fallback to generic class-like visitor for Python compatibility
				if (visitor.visitClassLike) {
					return await visitor.visitClassLike(node, context);
				}
				break;

			case "PropertySignature":
				if (visitor.visitProperty) {
					return await visitor.visitProperty(
						node as PropertySignature,
						context,
					);
				}
				// Fallback to generic field-like visitor for Python compatibility
				if (visitor.visitFieldLike) {
					return await visitor.visitFieldLike(node, context);
				}
				break;

			case "StringKeyword":
			case "NumberKeyword":
			case "BooleanKeyword":
			case "ArrayType":
			case "UnionType":
			case "TypeReference":
			case "LiteralType":
				if (visitor.visitType) {
					return await visitor.visitType(node as TypeNode, context);
				}
				// Fallback to generic type-like visitor for Python compatibility
				if (visitor.visitTypeLike) {
					return await visitor.visitTypeLike(node, context);
				}
				break;

			case "ImportDeclaration":
				if (visitor.visitImport) {
					return await visitor.visitImport(node as ImportDeclaration, context);
				}
				// Fallback to generic module-like visitor
				if (visitor.visitModuleLike) {
					return await visitor.visitModuleLike(node, context);
				}
				break;

			case "ExportDeclaration":
				if (visitor.visitExport) {
					return await visitor.visitExport(node as ExportDeclaration, context);
				}
				// Fallback to generic module-like visitor
				if (visitor.visitModuleLike) {
					return await visitor.visitModuleLike(node, context);
				}
				break;
		}

		// Fallback to generic visit method
		if (visitor.visit) {
			return await visitor.visit(node, context);
		}

		return undefined;
	}

	private async traverseChildren(
		node: ASTNode,
		visitors: Visitor[],
		context: VisitorContext,
	): Promise<void> {
		const childNodes = this.getChildNodes(node);

		for (const child of childNodes) {
			// Update context for child traversal
			const childContext = {
				...context,
				currentNode: child,
				parentNode: node,
				path: [...context.path, child],
				depth: context.depth + 1,
			};

			await this.traverseWithVisitors(child, visitors, childContext);
		}
	}

	private getChildNodes(node: ASTNode): ASTNode[] {
		const children: ASTNode[] = [];

		// Add generic children
		if (node.children) {
			children.push(...node.children);
		}

		// Add specific node type children
		switch (node.kind) {
			case "InterfaceDeclaration": {
				const interfaceNode = node as InterfaceDeclaration;
				if (interfaceNode.properties) {
					children.push(...interfaceNode.properties);
				}
				if (interfaceNode.typeParameters) {
					children.push(...interfaceNode.typeParameters);
				}
				if (interfaceNode.extends) {
					children.push(...interfaceNode.extends);
				}
				break;
			}

			case "PropertySignature": {
				const propNode = node as PropertySignature;
				if (propNode.type) {
					children.push(propNode.type);
				}
				break;
			}

			case "ArrayType": {
				const arrayNode = node as any;
				if (arrayNode.elementType) {
					children.push(arrayNode.elementType);
				}
				break;
			}

			case "UnionType": {
				const unionNode = node as any;
				if (unionNode.types) {
					children.push(...unionNode.types);
				}
				break;
			}

			case "TypeReference": {
				const typeRefNode = node as any;
				if (typeRefNode.typeArguments) {
					children.push(...typeRefNode.typeArguments);
				}
				break;
			}
		}

		return children;
	}

	private shouldSkipNode(node: ASTNode, options: VisitorOptions): boolean {
		if (options.skipNodes?.includes(node.kind)) {
			return true;
		}

		if (options.onlyNodes && !options.onlyNodes.includes(node.kind)) {
			return true;
		}

		return false;
	}
}

/**
 * Visitor pattern builder for fluent API
 */
export class VisitorPatternBuilder {
	private visitors: Visitor[] = [];
	private options: VisitorOptions = {};

	constructor(private engine: VisitorEngine) {}

	/**
	 * Add a visitor to the pattern
	 */
	addVisitor(visitor: Visitor): VisitorPatternBuilder {
		this.visitors.push(visitor);
		return this;
	}

	/**
	 * Set execution options
	 */
	setOptions(options: VisitorOptions): VisitorPatternBuilder {
		this.options = { ...this.options, ...options };
		return this;
	}

	/**
	 * Enable parallel execution
	 */
	parallel(enabled = true): VisitorPatternBuilder {
		this.options.parallel = enabled;
		return this;
	}

	/**
	 * Continue on error
	 */
	continueOnError(enabled = true): VisitorPatternBuilder {
		this.options.continueOnError = enabled;
		return this;
	}

	/**
	 * Set language target for filtering visitors
	 */
	forLanguage(target: string): VisitorPatternBuilder {
		this.options.languageTarget = target;
		return this;
	}

	/**
	 * Set maximum traversal depth
	 */
	maxDepth(depth: number): VisitorPatternBuilder {
		this.options.maxDepth = depth;
		return this;
	}

	/**
	 * Skip specific node types
	 */
	skipNodes(nodeTypes: string[]): VisitorPatternBuilder {
		this.options.skipNodes = nodeTypes;
		return this;
	}

	/**
	 * Only visit specific node types
	 */
	onlyNodes(nodeTypes: string[]): VisitorPatternBuilder {
		this.options.onlyNodes = nodeTypes;
		return this;
	}

	/**
	 * Execute the visitor pattern
	 */
	async execute<T = any>(node: ASTNode): Promise<VisitorResult<T>> {
		// Temporarily register visitors
		this.visitors.forEach((visitor) => this.engine.registerVisitor(visitor));

		try {
			return await this.engine.execute<T>(node, {
				...this.options,
				visitors: this.visitors.map((v) => v.name),
			});
		} finally {
			// Clean up temporarily registered visitors
			this.visitors.forEach((visitor) =>
				this.engine.unregisterVisitor(visitor.name),
			);
		}
	}
}

/**
 * Language-specific visitor factories for future extensibility
 */
export namespace LanguageVisitors {
	/**
	 * Python class generator visitor factory (future implementation)
	 * This demonstrates how the AST structure supports future Python generation
	 */
	export function createPythonClassVisitor(): Visitor<string> {
		return {
			name: "PythonClassVisitor",
			description: "Generates Python classes from TypeScript interfaces",
			languageTarget: "python",

			visitClassLike: async (
				node: ASTNode,
				_context: VisitorContext,
			): Promise<string> => {
				if (node.kind === "InterfaceDeclaration") {
					const interfaceNode = node as InterfaceDeclaration;
					const lines: string[] = [];

					// Python class declaration
					lines.push(`class ${interfaceNode.name}:`);
					lines.push('    """');
					lines.push(
						`    ${interfaceNode.metadata?.documentation || `${interfaceNode.name} class`}`,
					);
					lines.push('    """');

					// Constructor with type hints
					lines.push("    def __init__(self):");

					if (interfaceNode.properties && interfaceNode.properties.length > 0) {
						interfaceNode.properties.forEach((prop) => {
							const pythonType = mapTypeToPython(prop.type);
							const optional = prop.optional ? " | None" : "";
							lines.push(
								`        self.${prop.name}: ${pythonType}${optional} = None`,
							);
						});
					} else {
						lines.push("        pass");
					}

					return lines.join("\n");
				}
				return "";
			},

			visitFieldLike: async (
				_node: ASTNode,
				_context: VisitorContext,
			): Promise<string> => {
				// Handle Python field generation
				return "";
			},

			visitTypeLike: async (
				node: ASTNode,
				_context: VisitorContext,
			): Promise<string> => {
				// Handle Python type mapping
				return mapTypeToPython(node as TypeNode);
			},
		};
	}

	/**
	 * Map TypeScript types to Python types (future implementation)
	 */
	function mapTypeToPython(typeNode: TypeNode): string {
		switch (typeNode.kind) {
			case "StringKeyword":
				return "str";
			case "NumberKeyword":
				return "float";
			case "BooleanKeyword":
				return "bool";
			case "ArrayType": {
				const arrayType = typeNode as any;
				return `List[${mapTypeToPython(arrayType.elementType)}]`;
			}
			case "UnionType": {
				const unionType = typeNode as any;
				return unionType.types
					.map((t: TypeNode) => mapTypeToPython(t))
					.join(" | ");
			}
			case "TypeReference": {
				const typeRef = typeNode as any;
				return typeRef.name;
			}
			case "LiteralType": {
				const literal = typeNode as any;
				return typeof literal.value === "string"
					? "str"
					: typeof literal.value === "number"
						? "float"
						: "bool";
			}
			default:
				return "Any";
		}
	}

	/**
	 * Java class generator visitor factory (future implementation)
	 */
	export function createJavaClassVisitor(): Visitor<string> {
		return {
			name: "JavaClassVisitor",
			description: "Generates Java classes from TypeScript interfaces",
			languageTarget: "java",

			visitClassLike: async (
				node: ASTNode,
				_context: VisitorContext,
			): Promise<string> => {
				if (node.kind === "InterfaceDeclaration") {
					const interfaceNode = node as InterfaceDeclaration;
					const lines: string[] = [];

					// Java class declaration
					lines.push("/**");
					lines.push(
						` * ${interfaceNode.metadata?.documentation || `${interfaceNode.name} class`}`,
					);
					lines.push(" */");
					lines.push(`public class ${interfaceNode.name} {`);

					// Private fields
					if (interfaceNode.properties) {
						interfaceNode.properties.forEach((prop) => {
							const javaType = mapTypeToJava(prop.type);
							lines.push(`    private ${javaType} ${prop.name};`);
						});
					}

					// Constructors, getters, setters would be generated here
					lines.push("}");

					return lines.join("\n");
				}
				return "";
			},
		};
	}

	function mapTypeToJava(typeNode: TypeNode): string {
		switch (typeNode.kind) {
			case "StringKeyword":
				return "String";
			case "NumberKeyword":
				return "Double";
			case "BooleanKeyword":
				return "Boolean";
			case "ArrayType": {
				const arrayType = typeNode as any;
				return `List<${mapTypeToJava(arrayType.elementType)}>`;
			}
			case "TypeReference": {
				const typeRef = typeNode as any;
				return typeRef.name;
			}
			default:
				return "Object";
		}
	}
}

/**
 * Built-in visitors for common operations
 */
export namespace BuiltInVisitors {
	/**
	 * Statistics collector visitor
	 */
	export class StatisticsVisitor implements Visitor<void> {
		name = "StatisticsVisitor";
		languageTarget = "generic";

		private stats = {
			interfaces: 0,
			properties: 0,
			types: 0,
			complexTypes: 0,
			primitiveTypes: 0,
		};

		visit = async (node: ASTNode): Promise<void> => {
			switch (node.kind) {
				case "InterfaceDeclaration":
					this.stats.interfaces++;
					break;
				case "PropertySignature":
					this.stats.properties++;
					break;
				case "ArrayType":
				case "UnionType":
				case "TypeReference":
					this.stats.complexTypes++;
					break;
				case "StringKeyword":
				case "NumberKeyword":
				case "BooleanKeyword":
				case "LiteralType":
					this.stats.primitiveTypes++;
					break;
			}
			this.stats.types = this.stats.complexTypes + this.stats.primitiveTypes;
		};

		getStatistics() {
			return { ...this.stats };
		}

		reset() {
			this.stats = {
				interfaces: 0,
				properties: 0,
				types: 0,
				complexTypes: 0,
				primitiveTypes: 0,
			};
		}
	}

	/**
	 * Type dependency analyzer visitor
	 */
	export class DependencyAnalyzer implements Visitor<string[]> {
		name = "DependencyAnalyzer";
		languageTarget = "generic";

		private dependencies = new Set<string>();

		visitType = async (node: TypeNode): Promise<string[]> => {
			if (node.kind === "TypeReference") {
				const typeRef = node as any;
				this.dependencies.add(typeRef.name);
			}
			return Array.from(this.dependencies);
		};

		getDependencies(): string[] {
			return Array.from(this.dependencies);
		}

		reset() {
			this.dependencies.clear();
		}
	}

	/**
	 * Documentation extractor visitor
	 */
	export class DocumentationExtractor
		implements Visitor<Record<string, string>>
	{
		name = "DocumentationExtractor";
		languageTarget = "generic";

		private documentation: Record<string, string> = {};

		visit = async (node: ASTNode): Promise<Record<string, string>> => {
			if (node.metadata?.documentation) {
				const key = node.id || `${node.kind}_${Date.now()}`;
				this.documentation[key] = node.metadata.documentation;
			}
			return { ...this.documentation };
		};

		getDocumentation(): Record<string, string> {
			return { ...this.documentation };
		}

		reset() {
			this.documentation = {};
		}
	}
}
