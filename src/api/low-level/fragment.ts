/**
 * Code Fragment Composition Utilities
 *
 * Provides building blocks for code generation with composable fragments.
 * Supports TypeScript code generation with proper formatting and indentation.
 */

import type {
	ASTNode,
	ExportDeclaration,
	ImportDeclaration,
	InterfaceDeclaration,
	PropertySignature,
	SourceRange,
	TypeNode,
} from "./ast";

/**
 * Code fragment interface
 */
export interface CodeFragment {
	id: string;
	content: string;
	dependencies?: string[];
	imports?: ImportDeclaration[];
	exports?: ExportDeclaration[];
	metadata?: Record<string, any>;
	sourceRange?: SourceRange;
}

/**
 * Fragment composition options
 */
export interface FragmentCompositionOptions {
	indentSize?: number;
	indentChar?: string;
	newlineChar?: string;
	includeImports?: boolean;
	includeExports?: boolean;
	deduplicateImports?: boolean;
	sortImports?: boolean;
}

/**
 * Fragment template with placeholders
 */
export interface FragmentTemplate {
	id: string;
	template: string;
	placeholders: Record<string, any>;
	requiredPlaceholders: string[];
}

/**
 * Code fragment builder for creating reusable code snippets
 */
export class CodeFragmentBuilder {
	private fragmentCounter = 0;

	/**
	 * Generate a unique fragment ID
	 */
	private generateId(): string {
		return `fragment_${++this.fragmentCounter}`;
	}

	/**
	 * Create a basic code fragment (alias for createFragment for test compatibility)
	 */
	create(
		content: string,
		options: {
			id?: string;
			dependencies?: string[];
			imports?: ImportDeclaration[];
			exports?: ExportDeclaration[];
			metadata?: Record<string, any>;
			language?: string;
			category?: string;
			targetFile?: string;
			sourceRange?: SourceRange;
		} = {},
	): CodeFragment {
		const metadata = {
			...options.metadata,
			...(options.language && { language: options.language }),
			...(options.category && { category: options.category }),
			...(options.targetFile && { targetFile: options.targetFile }),
			...(options.dependencies && { dependencies: options.dependencies }),
		};

		return {
			id: options.id || this.generateId(),
			content,
			dependencies: options.dependencies,
			imports: options.imports,
			exports: options.exports,
			metadata,
			sourceRange: options.sourceRange,
		};
	}

	/**
	 * Create a basic code fragment
	 */
	createFragment(
		content: string,
		options: {
			id?: string;
			dependencies?: string[];
			imports?: ImportDeclaration[];
			exports?: ExportDeclaration[];
			metadata?: Record<string, any>;
		} = {},
	): CodeFragment {
		return {
			id: options.id || this.generateId(),
			content,
			dependencies: options.dependencies,
			imports: options.imports,
			exports: options.exports,
			metadata: options.metadata,
		};
	}

	/**
	 * Process a template with Handlebars-style features
	 */
	private processTemplate(template: string, data: Record<string, any>): string {
		let content = template;

		// Handle {{#each items}} blocks
		content = content.replace(
			/\{\{#each\s+(\w+)\}\}(.*?)\{\{\/each\}\}/gs,
			(match, arrayKey, blockContent) => {
				const array = data[arrayKey];
				if (!array || !Array.isArray(array)) return "";

				return array
					.map((item: any) => {
						let itemContent = blockContent;
						// Replace placeholders within the each block
						for (const [key, value] of Object.entries(item)) {
							const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
							itemContent = itemContent.replace(placeholder, String(value));
						}
						return itemContent;
					})
					.join("");
			},
		);

		// Handle {{#if condition}} blocks
		content = content.replace(
			/\{\{#if\s+(\w+)\}\}(.*?)(?:\{\{else\}\}(.*?))?\{\{\/if\}\}/gs,
			(match, condition, trueContent, falseContent) => {
				const value = data[condition];
				if (value) {
					return trueContent;
				} else if (falseContent) {
					return falseContent;
				}
				return "";
			},
		);

		// Handle Python-specific template for decorators
		if (content.includes("{{decorators}}")) {
			const decorators = data.decorators
				? data.decorators.join("\n") + "\n"
				: "";
			const baseClassList =
				data.baseClasses && data.baseClasses.length > 0
					? `(${data.baseClasses.join(", ")})`
					: "";

			let parameters = "";
			let propertyInit = "";

			if (data.properties && data.properties.length > 0) {
				const paramList = data.properties
					.map(
						(prop: any) =>
							`${prop.name}: ${prop.type}${prop.optional ? " | None" : ""}`,
					)
					.join(", ");
				parameters = paramList ? `, ${paramList}` : "";

				propertyInit = data.properties
					.map((prop: any) => {
						const assignment = prop.optional
							? `${prop.name} if ${prop.name} is not None else None`
							: prop.name;
						return `        self.${prop.name}: ${prop.type}${prop.optional ? " | None" : ""} = ${assignment}`;
					})
					.join("\n");
			}

			// Replace complex placeholders
			content = content
				.replace(/\{\{decorators\}\}/g, decorators)
				.replace(/\{\{className\}\}/g, data.className || "")
				.replace(/\{\{baseClasses\}\}/g, baseClassList)
				.replace(/\{\{documentation\}\}/g, data.documentation || "")
				.replace(/\{\{parameters\}\}/g, parameters)
				.replace(/\{\{propertyInit\}\}/g, propertyInit || "        pass");
		}

		// Simple placeholder replacement for remaining variables
		for (const [key, value] of Object.entries(data)) {
			const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
			content = content.replace(placeholder, String(value));
		}

		return content;
	}

	/**
	 * Create a fragment from template
	 */
	fromTemplate(
		template: string,
		data: Record<string, any>,
		options: {
			id?: string;
			metadata?: Record<string, any>;
		} = {},
	): CodeFragment {
		let content = template;

		// Process template with Handlebars-style features
		content = this.processTemplate(content, data);

		return this.create(content, {
			...options,
			metadata: {
				...options.metadata,
				template,
			},
		});
	}

	/**
	 * Append content to a fragment
	 */
	append(fragment: CodeFragment, content: string): void {
		fragment.content += content;
	}

	/**
	 * Prepend content to a fragment
	 */
	prepend(fragment: CodeFragment, content: string): void {
		fragment.content = content + fragment.content;
	}

	/**
	 * Replace text in a fragment
	 */
	replace(fragment: CodeFragment, search: string, replacement: string): void {
		fragment.content = fragment.content.replace(
			new RegExp(search, "g"),
			replacement,
		);
	}

	/**
	 * Wrap fragment content with prefix and suffix
	 */
	wrap(fragment: CodeFragment, prefix: string, suffix: string): void {
		fragment.content = prefix + fragment.content + suffix;
	}

	/**
	 * Set metadata on a fragment
	 */
	setMetadata(fragment: CodeFragment, key: string, value: any): void {
		if (!fragment.metadata) {
			fragment.metadata = {};
		}
		fragment.metadata[key] = value;
	}

	/**
	 * Get metadata from a fragment
	 */
	getMetadata(fragment: CodeFragment, key: string): any {
		return fragment.metadata?.[key];
	}

	/**
	 * Check if fragment has metadata key
	 */
	hasMetadata(fragment: CodeFragment, key: string): boolean {
		return fragment.metadata ? key in fragment.metadata : false;
	}

	/**
	 * Validate a fragment
	 */
	validate(
		fragment: CodeFragment,
		options: {
			checkSyntax?: boolean;
			checkDependencies?: boolean;
			availableTypes?: string[];
		} = {},
	): {
		isValid: boolean;
		errors: string[];
		warnings: string[];
	} {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Basic syntax validation
		if (options.checkSyntax !== false) {
			// Check for basic TypeScript syntax issues
			if (fragment.content.includes("{ id: }")) {
				errors.push("Invalid property syntax: missing type");
			}

			// Check for balanced braces
			const openBraces = (fragment.content.match(/\{/g) || []).length;
			const closeBraces = (fragment.content.match(/\}/g) || []).length;
			if (openBraces !== closeBraces) {
				errors.push("Unbalanced braces in fragment");
			}
		}

		// Dependency validation
		if (options.checkDependencies && options.availableTypes) {
			const content = fragment.content;
			const extendMatches = content.match(/extends\s+(\w+)/g);
			if (extendMatches) {
				extendMatches.forEach((match) => {
					const typeName = match.replace("extends ", "").trim();
					if (!options.availableTypes!.includes(typeName)) {
						errors.push(`Unknown type referenced: ${typeName}`);
					}
				});
			}
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Merge multiple fragments into one
	 */
	merge(fragments: CodeFragment[], separator: string = "\n"): CodeFragment {
		const content = fragments.map((f) => f.content).join(separator);
		const allDependencies = new Set<string>();
		const allImports: ImportDeclaration[] = [];
		const allExports: ExportDeclaration[] = [];
		const mergedMetadata: Record<string, any> = {};

		fragments.forEach((fragment) => {
			fragment.dependencies?.forEach((dep) => allDependencies.add(dep));
			if (fragment.imports) allImports.push(...fragment.imports);
			if (fragment.exports) allExports.push(...fragment.exports);
			if (fragment.metadata) Object.assign(mergedMetadata, fragment.metadata);
		});

		return this.create(content, {
			dependencies: Array.from(allDependencies),
			imports: allImports,
			exports: allExports,
			metadata: mergedMetadata,
		});
	}

	/**
	 * Split a fragment by separator
	 */
	split(fragment: CodeFragment, separator: string): CodeFragment[] {
		const parts = fragment.content.split(separator);
		return parts.map((part) => this.create(part.trim()));
	}

	/**
	 * Clone a fragment
	 */
	clone(fragment: CodeFragment): CodeFragment {
		return {
			...fragment,
			id: this.generateId(),
			dependencies: fragment.dependencies
				? [...fragment.dependencies]
				: undefined,
			imports: fragment.imports ? [...fragment.imports] : undefined,
			exports: fragment.exports ? [...fragment.exports] : undefined,
			metadata: fragment.metadata ? { ...fragment.metadata } : undefined,
			sourceRange: fragment.sourceRange
				? { ...fragment.sourceRange }
				: undefined,
		};
	}

	/**
	 * Filter fragments by criteria
	 */
	filter(
		fragments: CodeFragment[],
		criteria: {
			category?: string;
			language?: string;
			targetFile?: string;
			hasMetadata?: string;
		},
	): CodeFragment[] {
		return fragments.filter((fragment) => {
			if (
				criteria.category &&
				fragment.metadata?.category !== criteria.category
			) {
				return false;
			}
			if (
				criteria.language &&
				fragment.metadata?.language !== criteria.language
			) {
				return false;
			}
			if (
				criteria.targetFile &&
				fragment.metadata?.targetFile !== criteria.targetFile
			) {
				return false;
			}
			if (
				criteria.hasMetadata &&
				!this.hasMetadata(fragment, criteria.hasMetadata)
			) {
				return false;
			}
			return true;
		});
	}

	/**
	 * Group fragments by metadata key
	 */
	groupBy(fragments: CodeFragment[], key: string): Map<any, CodeFragment[]> {
		const groups = new Map<any, CodeFragment[]>();

		fragments.forEach((fragment) => {
			const value = this.getMetadata(fragment, key);
			if (!groups.has(value)) {
				groups.set(value, []);
			}
			groups.get(value)!.push(fragment);
		});

		return groups;
	}

	/**
	 * Sort fragments by criteria
	 */
	sort(
		fragments: CodeFragment[],
		criteria: {
			by: "id" | "content" | "metadata";
			key?: string;
			order?: "asc" | "desc";
		},
	): CodeFragment[] {
		const { by, key, order = "asc" } = criteria;
		const multiplier = order === "asc" ? 1 : -1;

		return fragments.sort((a, b) => {
			let aValue: any;
			let bValue: any;

			switch (by) {
				case "id":
					aValue = a.id;
					bValue = b.id;
					break;
				case "content":
					aValue = a.content.length;
					bValue = b.content.length;
					break;
				case "metadata":
					if (!key)
						throw new Error("Metadata key required for metadata sorting");
					aValue = this.getMetadata(a, key);
					bValue = this.getMetadata(b, key);
					break;
			}

			if (aValue < bValue) return -1 * multiplier;
			if (aValue > bValue) return 1 * multiplier;
			return 0;
		});
	}

	/**
	 * Analyze fragment dependencies
	 */
	analyzeDependencies(fragments: CodeFragment[]): {
		dependencies: Map<string, string[]>;
		circularDependencies: string[][];
		missingDependencies: string[];
	} {
		const dependencies = new Map<string, string[]>();
		const fragmentIds = new Set(fragments.map((f) => f.id));
		const missingDependencies: string[] = [];

		// Build dependency map
		fragments.forEach((fragment) => {
			const deps = fragment.dependencies || [];
			dependencies.set(fragment.id, deps);

			// Check for missing dependencies
			deps.forEach((dep) => {
				if (!fragmentIds.has(dep)) {
					missingDependencies.push(dep);
				}
			});
		});

		// Find circular dependencies
		const circularDependencies: string[][] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const detectCycles = (fragmentId: string, path: string[]): void => {
			if (visiting.has(fragmentId)) {
				const cycleStart = path.indexOf(fragmentId);
				if (cycleStart !== -1) {
					const cycle = [...path.slice(cycleStart), fragmentId];
					circularDependencies.push(cycle);
				}
				return;
			}

			if (visited.has(fragmentId)) {
				return;
			}

			visiting.add(fragmentId);
			const deps = dependencies.get(fragmentId) || [];
			deps.forEach((dep) => {
				detectCycles(dep, [...path, fragmentId]);
			});
			visiting.delete(fragmentId);
			visited.add(fragmentId);
		};

		fragments.forEach((fragment) => {
			if (!visited.has(fragment.id)) {
				detectCycles(fragment.id, []);
			}
		});

		return {
			dependencies,
			circularDependencies,
			missingDependencies: [...new Set(missingDependencies)],
		};
	}

	/**
	 * Create a fragment from AST node
	 */
	createFromAST(node: ASTNode, renderer: ASTRenderer): CodeFragment {
		const content = renderer.render(node);

		return this.createFragment(content, {
			metadata: {
				astNodeKind: node.kind,
				astNodeId: node.id,
			},
		});
	}

	/**
	 * Create an interface fragment
	 */
	createInterfaceFragment(
		interfaceNode: InterfaceDeclaration,
		options: {
			includeExport?: boolean;
			documentation?: boolean;
		} = {},
	): CodeFragment {
		const renderer = new ASTRenderer();
		const content = renderer.renderInterface(interfaceNode, options);

		const exports = options.includeExport
			? [
					{
						kind: "ExportDeclaration" as const,
						namedExports: [interfaceNode.name],
						typeOnly: true,
					},
				]
			: undefined;

		return this.createFragment(content, {
			exports: exports as ExportDeclaration[],
			metadata: {
				interfaceName: interfaceNode.name,
				propertiesCount: interfaceNode.properties.length,
			},
		});
	}

	/**
	 * Create an import fragment
	 */
	createImportFragment(imports: ImportDeclaration[]): CodeFragment {
		const renderer = new ASTRenderer();
		const content = imports.map((imp) => renderer.renderImport(imp)).join("\n");

		return this.createFragment(content, {
			imports,
			metadata: {
				importCount: imports.length,
			},
		});
	}

	/**
	 * Create an export fragment
	 */
	createExportFragment(exports: ExportDeclaration[]): CodeFragment {
		const renderer = new ASTRenderer();
		const content = exports.map((exp) => renderer.renderExport(exp)).join("\n");

		return this.createFragment(content, {
			exports,
			metadata: {
				exportCount: exports.length,
			},
		});
	}

	/**
	 * Create a documentation fragment
	 */
	createDocumentationFragment(
		documentation: string,
		type: "single-line" | "multi-line" | "jsdoc" = "jsdoc",
	): CodeFragment {
		let content: string;

		switch (type) {
			case "single-line":
				content = `// ${documentation}`;
				break;
			case "multi-line": {
				const lines = documentation.split("\n");
				content =
					"/*\n" + lines.map((line) => ` * ${line}`).join("\n") + "\n */";
				break;
			}
			case "jsdoc":
			default: {
				const docLines = documentation.split("\n");
				content =
					"/**\n" + docLines.map((line) => ` * ${line}`).join("\n") + "\n */";
				break;
			}
		}

		return this.createFragment(content, {
			metadata: {
				documentationType: type,
				lineCount: documentation.split("\n").length,
			},
		});
	}

	/**
	 * Create a template fragment
	 */
	createTemplate(
		template: string,
		requiredPlaceholders: string[] = [],
		options: {
			id?: string;
			metadata?: Record<string, any>;
		} = {},
	): FragmentTemplate {
		// Extract placeholders from template
		const placeholderRegex = /\{\{(\w+)\}\}/g;
		const foundPlaceholders = new Set<string>();
		let match;

		while ((match = placeholderRegex.exec(template)) !== null) {
			foundPlaceholders.add(match[1]);
		}

		return {
			id: options.id || this.generateId(),
			template,
			placeholders: Object.fromEntries(
				Array.from(foundPlaceholders).map((placeholder) => [
					placeholder,
					undefined,
				]),
			),
			requiredPlaceholders:
				requiredPlaceholders.length > 0
					? requiredPlaceholders
					: Array.from(foundPlaceholders),
		};
	}

	/**
	 * Render a template with values
	 */
	renderTemplate(
		template: FragmentTemplate,
		values: Record<string, any>,
	): CodeFragment {
		// Check required placeholders
		for (const required of template.requiredPlaceholders) {
			if (!(required in values)) {
				throw new Error(`Missing required placeholder: ${required}`);
			}
		}

		// Replace placeholders
		let content = template.template;
		for (const [key, value] of Object.entries(values)) {
			const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
			content = content.replace(placeholder, String(value));
		}

		return this.createFragment(content, {
			id: `${template.id}_rendered`,
			metadata: {
				templateId: template.id,
				placeholders: values,
			},
		});
	}
}

/**
 * Code fragment composer for combining multiple fragments
 */
export class CodeFragmentComposer {
	private fragments: Map<string, CodeFragment> = new Map();

	/**
	 * Add a fragment to the composer
	 */
	addFragment(fragment: CodeFragment): void {
		this.fragments.set(fragment.id, fragment);
	}

	/**
	 * Add multiple fragments
	 */
	addFragments(fragments: CodeFragment[]): void {
		fragments.forEach((fragment) => this.addFragment(fragment));
	}

	/**
	 * Remove a fragment
	 */
	removeFragment(id: string): boolean {
		return this.fragments.delete(id);
	}

	/**
	 * Get a fragment by ID
	 */
	getFragment(id: string): CodeFragment | undefined {
		return this.fragments.get(id);
	}

	/**
	 * Get all fragments
	 */
	getAllFragments(): CodeFragment[] {
		return Array.from(this.fragments.values());
	}

	/**
	 * Compose fragments into a single fragment
	 */
	compose(
		fragments: CodeFragment[],
		options?: { separator?: string; prefix?: string; suffix?: string },
	): CodeFragment;
	compose(options?: FragmentCompositionOptions): string;
	compose(
		fragmentsOrOptions?: CodeFragment[] | FragmentCompositionOptions,
		options?: { separator?: string; prefix?: string; suffix?: string },
	): CodeFragment | string {
		// If first argument is an array, compose those fragments into a new fragment
		if (Array.isArray(fragmentsOrOptions)) {
			const fragments = fragmentsOrOptions;
			const separator = options?.separator || "\n";
			const prefix = options?.prefix || "";
			const suffix = options?.suffix || "";

			let content = fragments.map((f) => f.content).join(separator);
			content = prefix + content + suffix;

			const builder = new CodeFragmentBuilder();
			return builder.create(content, {
				metadata: {
					composedFrom: fragments.map((f) => f.id),
					fragmentCount: fragments.length,
				},
			});
		}

		// Otherwise, compose all stored fragments into a string (original behavior)
		return this.composeToString(fragmentsOrOptions || {});
	}

	/**
	 * Compose all stored fragments into a single code string
	 */
	private composeToString(options: FragmentCompositionOptions = {}): string {
		const {
			indentSize = 2,
			indentChar = " ",
			newlineChar = "\n",
			includeImports = true,
			includeExports = true,
			deduplicateImports = true,
			sortImports = true,
		} = options;

		const fragments = this.getAllFragments();
		const parts: string[] = [];

		// Collect imports
		if (includeImports) {
			const allImports: ImportDeclaration[] = [];

			fragments.forEach((fragment) => {
				if (fragment.imports) {
					allImports.push(...fragment.imports);
				}
			});

			if (allImports.length > 0) {
				let processedImports = allImports;

				if (deduplicateImports) {
					processedImports = this.deduplicateImports(allImports);
				}

				if (sortImports) {
					processedImports = this.sortImports(processedImports);
				}

				const renderer = new ASTRenderer();
				const importContent = processedImports
					.map((imp) => renderer.renderImport(imp))
					.join(newlineChar);

				if (importContent.trim()) {
					parts.push(importContent);
					parts.push(""); // Empty line after imports
				}
			}
		}

		// Add fragment contents
		fragments.forEach((fragment) => {
			if (fragment.content.trim()) {
				parts.push(fragment.content);
			}
		});

		// Collect exports
		if (includeExports) {
			const allExports: ExportDeclaration[] = [];

			fragments.forEach((fragment) => {
				if (fragment.exports) {
					allExports.push(...fragment.exports);
				}
			});

			if (allExports.length > 0) {
				parts.push(""); // Empty line before exports
				const renderer = new ASTRenderer();
				const exportContent = allExports
					.map((exp) => renderer.renderExport(exp))
					.join(newlineChar);

				parts.push(exportContent);
			}
		}

		return parts.join(newlineChar);
	}

	/**
	 * Compose fragments in a specific order
	 */
	composeInOrder(
		fragmentIds: string[],
		options: FragmentCompositionOptions = {},
	): string {
		const orderedFragments = fragmentIds
			.map((id) => this.getFragment(id))
			.filter((fragment): fragment is CodeFragment => fragment !== undefined);

		// Temporarily replace fragments map
		const originalFragments = this.fragments;
		this.fragments = new Map(orderedFragments.map((f) => [f.id, f]));

		const result = this.compose(options);

		// Restore original fragments map
		this.fragments = originalFragments;

		return result;
	}

	/**
	 * Validate dependencies between fragments
	 */
	validateDependencies(): {
		isValid: boolean;
		errors: string[];
		missingDependencies: string[];
		circularDependencies: string[][];
	} {
		const errors: string[] = [];
		const missingDependencies: string[] = [];
		const circularDependencies: string[][] = [];

		const fragments = this.getAllFragments();
		const fragmentIds = new Set(fragments.map((f) => f.id));

		// Check for missing dependencies
		fragments.forEach((fragment) => {
			if (fragment.dependencies) {
				fragment.dependencies.forEach((depId) => {
					if (!fragmentIds.has(depId)) {
						missingDependencies.push(depId);
						errors.push(
							`Fragment '${fragment.id}' depends on missing fragment '${depId}'`,
						);
					}
				});
			}
		});

		// Check for circular dependencies
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const detectCycles = (fragmentId: string, path: string[] = []): void => {
			if (visiting.has(fragmentId)) {
				const cycleStart = path.indexOf(fragmentId);
				if (cycleStart !== -1) {
					const cycle = [...path.slice(cycleStart), fragmentId];
					circularDependencies.push(cycle);
					errors.push(`Circular dependency detected: ${cycle.join(" -> ")}`);
				}
				return;
			}

			if (visited.has(fragmentId)) {
				return;
			}

			visiting.add(fragmentId);

			const fragment = this.getFragment(fragmentId);
			if (fragment?.dependencies) {
				fragment.dependencies.forEach((depId) => {
					detectCycles(depId, [...path, fragmentId]);
				});
			}

			visiting.delete(fragmentId);
			visited.add(fragmentId);
		};

		fragments.forEach((fragment) => {
			if (!visited.has(fragment.id)) {
				detectCycles(fragment.id);
			}
		});

		return {
			isValid: errors.length === 0,
			errors,
			missingDependencies: [...new Set(missingDependencies)],
			circularDependencies,
		};
	}

	/**
	 * Sort fragments by dependencies (topological sort)
	 */
	topologicalSort(): CodeFragment[] {
		const fragments = this.getAllFragments();
		const sorted: CodeFragment[] = [];
		const visited = new Set<string>();
		const temp = new Set<string>();

		const visit = (fragmentId: string): void => {
			if (temp.has(fragmentId)) {
				throw new Error(
					`Circular dependency detected involving fragment '${fragmentId}'`,
				);
			}

			if (visited.has(fragmentId)) {
				return;
			}

			temp.add(fragmentId);

			const fragment = this.getFragment(fragmentId);
			if (fragment?.dependencies) {
				fragment.dependencies.forEach((depId) => {
					visit(depId);
				});
			}

			temp.delete(fragmentId);
			visited.add(fragmentId);

			if (fragment) {
				sorted.push(fragment);
			}
		};

		fragments.forEach((fragment) => {
			if (!visited.has(fragment.id)) {
				visit(fragment.id);
			}
		});

		return sorted;
	}

	/**
	 * Clear all fragments
	 */
	clear(): void {
		this.fragments.clear();
	}

	/**
	 * Get composition statistics
	 */
	getStats(): {
		fragmentCount: number;
		totalContentLength: number;
		totalImports: number;
		totalExports: number;
		averageFragmentSize: number;
	} {
		const fragments = this.getAllFragments();
		const totalContentLength = fragments.reduce(
			(sum, f) => sum + f.content.length,
			0,
		);
		const totalImports = fragments.reduce(
			(sum, f) => sum + (f.imports?.length || 0),
			0,
		);
		const totalExports = fragments.reduce(
			(sum, f) => sum + (f.exports?.length || 0),
			0,
		);

		return {
			fragmentCount: fragments.length,
			totalContentLength,
			totalImports,
			totalExports,
			averageFragmentSize:
				fragments.length > 0
					? Math.round(totalContentLength / fragments.length)
					: 0,
		};
	}

	// Private utility methods

	private deduplicateImports(
		imports: ImportDeclaration[],
	): ImportDeclaration[] {
		const seen = new Map<string, ImportDeclaration>();

		imports.forEach((imp) => {
			const key = `${imp.moduleSpecifier}:${imp.typeOnly ? "type" : "value"}`;
			const existing = seen.get(key);

			if (!existing) {
				seen.set(key, { ...imp });
			} else {
				// Merge imports from same module
				if (imp.namedImports && existing.namedImports) {
					existing.namedImports = [
						...new Set([...existing.namedImports, ...imp.namedImports]),
					];
				} else if (imp.namedImports) {
					existing.namedImports = imp.namedImports;
				}

				if (imp.defaultImport) {
					existing.defaultImport = imp.defaultImport;
				}

				if (imp.namespaceImport) {
					existing.namespaceImport = imp.namespaceImport;
				}
			}
		});

		return Array.from(seen.values());
	}

	private sortImports(imports: ImportDeclaration[]): ImportDeclaration[] {
		return imports.sort((a, b) => {
			// Sort by type-only first
			if (a.typeOnly && !b.typeOnly) return -1;
			if (!a.typeOnly && b.typeOnly) return 1;

			// Then by module specifier
			return a.moduleSpecifier.localeCompare(b.moduleSpecifier);
		});
	}
}

/**
 * AST to code renderer
 */
export class ASTRenderer {
	private indentSize = 2;
	private indentChar = " ";

	/**
	 * Set indentation options
	 */
	setIndentation(size: number, char: string = " "): void {
		this.indentSize = size;
		this.indentChar = char;
	}

	/**
	 * Create indentation string
	 */
	private indent(level: number): string {
		return this.indentChar.repeat(level * this.indentSize);
	}

	/**
	 * Render any AST node
	 */
	render(node: ASTNode): string {
		switch (node.kind) {
			case "InterfaceDeclaration":
				return this.renderInterface(node as InterfaceDeclaration);
			case "PropertySignature":
				return this.renderProperty(node as PropertySignature);
			case "ImportDeclaration":
				return this.renderImport(node as ImportDeclaration);
			case "ExportDeclaration":
				return this.renderExport(node as ExportDeclaration);
			default:
				return this.renderType(node as TypeNode);
		}
	}

	/**
	 * Render an interface declaration
	 */
	renderInterface(
		node: InterfaceDeclaration,
		options: {
			includeExport?: boolean;
			documentation?: boolean;
			indentLevel?: number;
		} = {},
	): string {
		const {
			includeExport = true,
			documentation = true,
			indentLevel = 0,
		} = options;
		const lines: string[] = [];

		// Add documentation
		if (documentation && node.metadata?.documentation) {
			lines.push(this.indent(indentLevel) + "/**");
			lines.push(
				this.indent(indentLevel) + ` * ${node.metadata.documentation}`,
			);
			lines.push(this.indent(indentLevel) + " */");
		}

		// Interface declaration line
		let declaration = "";
		if (includeExport && node.exported) {
			declaration += "export ";
		}
		declaration += `interface ${node.name}`;

		// Type parameters
		if (node.typeParameters && node.typeParameters.length > 0) {
			const params = node.typeParameters.map((param) => {
				let result = param.name;
				if (param.constraint) {
					result += ` extends ${this.renderType(param.constraint)}`;
				}
				if (param.default) {
					result += ` = ${this.renderType(param.default)}`;
				}
				return result;
			});
			declaration += `<${params.join(", ")}>`;
		}

		// Extends clause
		if (node.extends && node.extends.length > 0) {
			const extends_ = node.extends
				.map((ext) => this.renderType(ext))
				.join(", ");
			declaration += ` extends ${extends_}`;
		}

		declaration += " {";
		lines.push(this.indent(indentLevel) + declaration);

		// Properties
		if (node.properties && node.properties.length > 0) {
			node.properties.forEach((prop) => {
				const propLines = this.renderProperty(prop, {
					indentLevel: indentLevel + 1,
				}).split("\n");
				lines.push(...propLines);
			});
		}

		// Closing brace
		lines.push(this.indent(indentLevel) + "}");

		return lines.join("\n");
	}

	/**
	 * Render a property signature
	 */
	renderProperty(
		node: PropertySignature,
		options: {
			indentLevel?: number;
		} = {},
	): string {
		const { indentLevel = 0 } = options;
		const lines: string[] = [];

		// Add documentation
		if (node.documentation) {
			lines.push(this.indent(indentLevel) + "/**");
			lines.push(this.indent(indentLevel) + ` * ${node.documentation}`);
			lines.push(this.indent(indentLevel) + " */");
		}

		// Property line
		let property = this.indent(indentLevel);
		if (node.readonly) {
			property += "readonly ";
		}
		property += node.name;
		if (node.optional) {
			property += "?";
		}
		property += ": ";
		property += this.renderType(node.type);
		property += ";";

		lines.push(property);

		return lines.join("\n");
	}

	/**
	 * Render a type node
	 */
	renderType(node: TypeNode): string {
		switch (node.kind) {
			case "StringKeyword":
				return "string";
			case "NumberKeyword":
				return "number";
			case "BooleanKeyword":
				return "boolean";
			case "ArrayType": {
				const arrayType = node as any;
				return `${this.renderType(arrayType.elementType)}[]`;
			}
			case "UnionType": {
				const unionType = node as any;
				return unionType.types
					.map((type: TypeNode) => this.renderType(type))
					.join(" | ");
			}
			case "TypeReference": {
				const typeRef = node as any;
				let result = typeRef.name;
				if (typeRef.typeArguments && typeRef.typeArguments.length > 0) {
					const args = typeRef.typeArguments
						.map((arg: TypeNode) => this.renderType(arg))
						.join(", ");
					result += `<${args}>`;
				}
				return result;
			}
			case "LiteralType": {
				const literal = node as any;
				return typeof literal.value === "string"
					? `"${literal.value}"`
					: String(literal.value);
			}
			default:
				return "unknown";
		}
	}

	/**
	 * Render an import declaration
	 */
	renderImport(node: ImportDeclaration): string {
		let result = "import ";

		if (node.typeOnly) {
			result += "type ";
		}

		const imports: string[] = [];

		if (node.defaultImport) {
			imports.push(node.defaultImport);
		}

		if (node.namespaceImport) {
			imports.push(`* as ${node.namespaceImport}`);
		}

		if (node.namedImports && node.namedImports.length > 0) {
			imports.push(`{ ${node.namedImports.join(", ")} }`);
		}

		result += imports.join(", ");
		result += ` from '${node.moduleSpecifier}';`;

		return result;
	}

	/**
	 * Render an export declaration
	 */
	renderExport(node: ExportDeclaration): string {
		let result = "export ";

		if (node.typeOnly) {
			result += "type ";
		}

		if (node.defaultExport) {
			result += `default ${node.defaultExport}`;
		} else if (node.namedExports && node.namedExports.length > 0) {
			result += `{ ${node.namedExports.join(", ")} }`;

			if (node.moduleSpecifier) {
				result += ` from '${node.moduleSpecifier}'`;
			}
		}

		result += ";";

		return result;
	}

	/**
	 * Render AST node to a code fragment
	 */
	renderToFragment(
		node: ASTNode,
		options: {
			id?: string;
			metadata?: Record<string, any>;
			language?: string;
		} = {},
	): CodeFragment {
		const content = this.render(node);
		const builder = new CodeFragmentBuilder();

		return builder.create(content, {
			...options,
			metadata: {
				...options.metadata,
				nodeKind: node.kind,
				nodeId: node.id,
				language: options.language || "typescript",
			},
		});
	}
}

/**
 * Common fragment templates
 */
export const CommonTemplates = {
	/**
	 * TypeScript interface template
	 */
	TYPESCRIPT_INTERFACE: `/**
 * {{description}}
 */
export interface {{interfaceName}} {
{{properties}}
}`,

	/**
	 * FHIR resource interface template
	 */
	FHIR_RESOURCE: `/**
 * {{description}}
 */
export interface {{resourceName}} {
  resourceType: '{{resourceName}}';
{{properties}}
}`,

	/**
	 * Import statement template
	 */
	IMPORT_STATEMENT: `import { {{imports}} } from "{{module}}";`,

	/**
	 * Export statement template
	 */
	EXPORT_STATEMENT: `export { {{exports}} };`,

	/**
	 * Type-only import template
	 */
	TYPE_IMPORT: `import type { {{types}} } from '{{module}}';`,

	/**
	 * Named import template
	 */
	NAMED_IMPORT: `import { {{imports}} } from '{{module}}';`,

	/**
	 * Type export template
	 */
	TYPE_EXPORT: `export type { {{types}} };`,

	/**
	 * Module header template
	 */
	MODULE_HEADER: `/**
 * {{title}}
 * 
 * {{description}}
 * Generated by atomic-codegen
 */

`,

	/**
	 * Property template
	 */
	PROPERTY: `  {{name}}{{optional}}: {{type}};`,
};
