/**
 * Import/Export Management Utilities
 *
 * Provides sophisticated import/export dependency management and resolution
 * for multi-file code generation projects. Supports automatic dependency
 * resolution, circular dependency detection, and module optimization.
 */

import type { ASTNode, ExportDeclaration, ImportDeclaration } from "./ast";
import type { CodeFragment } from "./fragment";

/**
 * Module dependency information
 */
export interface ModuleDependency {
	source: string;
	target: string;
	imports: string[];
	isTypeOnly: boolean;
	isDefault: boolean;
	isNamespace: boolean;
	isExternal: boolean;
	metadata?: Record<string, any>;
}

/**
 * Module export information
 */
export interface ModuleExport {
	name: string;
	type: "named" | "default" | "namespace";
	isTypeOnly: boolean;
	declaration?: ASTNode;
	source?: string;
	metadata?: Record<string, any>;
}

/**
 * Module information
 */
export interface ModuleInfo {
	id: string;
	path: string;
	imports: ImportDeclaration[];
	exports: ExportDeclaration[];
	dependencies: ModuleDependency[];
	providedExports: ModuleExport[];
	fragments: CodeFragment[];
	metadata: Record<string, any>;
}

/**
 * Dependency resolution result
 */
export interface DependencyResolutionResult {
	success: boolean;
	modules: Map<string, ModuleInfo>;
	dependencies: ModuleDependency[];
	circularDependencies: string[][];
	missingDependencies: string[];
	errors: DependencyError[];
	statistics: DependencyStatistics;
}

/**
 * Dependency error
 */
export interface DependencyError {
	message: string;
	code: string;
	module: string;
	dependency?: string;
	severity: "error" | "warning" | "info";
}

/**
 * Dependency statistics
 */
export interface DependencyStatistics {
	totalModules: number;
	totalDependencies: number;
	externalDependencies: number;
	circularDependencies: number;
	maxDependencyDepth: number;
	mostDependentModule: string;
	leastDependentModule: string;
}

/**
 * Module resolution options
 */
export interface ModuleResolutionOptions {
	baseDir?: string;
	extensions?: string[];
	aliases?: Record<string, string>;
	external?: string[];
	resolveNodeModules?: boolean;
	resolveTsConfig?: boolean;
	generateBarrels?: boolean;
	optimizeImports?: boolean;
	sortImports?: boolean;
}

/**
 * Import optimization options
 */
export interface ImportOptimizationOptions {
	mergeNamedImports?: boolean;
	removeUnusedImports?: boolean;
	sortImports?: boolean;
	groupByType?: boolean;
	separateThirdParty?: boolean;
	consolidateReExports?: boolean;
}

/**
 * Module manager for handling complex import/export scenarios
 */
export class ModuleManager {
	private modules: Map<string, ModuleInfo> = new Map();
	private moduleCounter = 0;

	/**
	 * Register a module
	 */
	registerModule(
		path: string,
		options: {
			imports?: ImportDeclaration[];
			exports?: ExportDeclaration[];
			fragments?: CodeFragment[];
			metadata?: Record<string, any>;
		} = {},
	): ModuleInfo {
		const id = `module_${++this.moduleCounter}`;
		const moduleInfo: ModuleInfo = {
			id,
			path,
			imports: options.imports || [],
			exports: options.exports || [],
			dependencies: [],
			providedExports: [],
			fragments: options.fragments || [],
			metadata: options.metadata || {},
		};

		// Analyze imports to build dependencies
		moduleInfo.dependencies = this.analyzeDependencies(moduleInfo);

		// Analyze exports
		moduleInfo.providedExports = this.analyzeExports(moduleInfo);

		this.modules.set(path, moduleInfo);
		return moduleInfo;
	}

	/**
	 * Register multiple modules
	 */
	registerModules(
		modules: Array<{
			path: string;
			imports?: ImportDeclaration[];
			exports?: ExportDeclaration[];
			fragments?: CodeFragment[];
			metadata?: Record<string, any>;
		}>,
	): ModuleInfo[] {
		return modules.map((module) => this.registerModule(module.path, module));
	}

	/**
	 * Get module by path
	 */
	getModule(path: string): ModuleInfo | undefined {
		return this.modules.get(path);
	}

	/**
	 * Get all modules
	 */
	getAllModules(): ModuleInfo[] {
		return Array.from(this.modules.values());
	}

	/**
	 * Remove module
	 */
	removeModule(path: string): boolean {
		return this.modules.delete(path);
	}

	/**
	 * Resolve all dependencies
	 */
	resolveDependencies(
		options: ModuleResolutionOptions = {},
	): DependencyResolutionResult {
		const result: DependencyResolutionResult = {
			success: true,
			modules: new Map(this.modules),
			dependencies: [],
			circularDependencies: [],
			missingDependencies: [],
			errors: [],
			statistics: this.createEmptyStatistics(),
		};

		try {
			// Collect all dependencies
			result.dependencies = this.collectAllDependencies();

			// Detect circular dependencies
			result.circularDependencies = this.detectCircularDependencies();

			// Find missing dependencies
			result.missingDependencies = this.findMissingDependencies(options);

			// Generate statistics
			result.statistics = this.generateStatistics();

			// Check for errors
			if (result.circularDependencies.length > 0) {
				result.circularDependencies.forEach((cycle) => {
					result.errors.push({
						message: `Circular dependency detected: ${cycle.join(" -> ")}`,
						code: "CIRCULAR_DEPENDENCY",
						module: cycle[0] as string,
						severity: "error",
					});
				});
			}

			if (result.missingDependencies.length > 0) {
				result.missingDependencies.forEach((dep) => {
					result.errors.push({
						message: `Missing dependency: ${dep}`,
						code: "MISSING_DEPENDENCY",
						module: "unknown",
						dependency: dep,
						severity: "error",
					});
				});
			}

			result.success =
				result.errors.filter((e) => e.severity === "error").length === 0;
		} catch (error) {
			result.errors.push({
				message: error instanceof Error ? error.message : String(error),
				code: "RESOLUTION_ERROR",
				module: "ModuleManager",
				severity: "error",
			});
			result.success = false;
		}

		return result;
	}

	/**
	 * Optimize imports across all modules
	 */
	optimizeImports(
		options: ImportOptimizationOptions = {},
	): Map<string, ImportDeclaration[]> {
		const optimizedImports = new Map<string, ImportDeclaration[]>();

		for (const [path, module] of this.modules) {
			const optimized = this.optimizeModuleImports(module, options);
			optimizedImports.set(path, optimized);

			// Update module
			module.imports = optimized;
			module.dependencies = this.analyzeDependencies(module);
		}

		return optimizedImports;
	}

	/**
	 * Generate barrel exports (index files)
	 */
	generateBarrels(directories: string[]): Map<string, ExportDeclaration[]> {
		const barrels = new Map<string, ExportDeclaration[]>();

		directories.forEach((dir) => {
			const modulesinDir = this.getModulesInDirectory(dir);
			const exports = this.createBarrelExports(modulesinDir);

			if (exports.length > 0) {
				barrels.set(`${dir}/index.ts`, exports);
			}
		});

		return barrels;
	}

	/**
	 * Get topological sort order for modules
	 */
	getTopologicalOrder(): string[] {
		const visited = new Set<string>();
		const temp = new Set<string>();
		const order: string[] = [];

		const visit = (path: string): void => {
			if (temp.has(path)) {
				throw new Error(`Circular dependency detected involving ${path}`);
			}

			if (visited.has(path)) {
				return;
			}

			temp.add(path);

			const module = this.modules.get(path);
			if (module) {
				module.dependencies.forEach((dep) => {
					if (!dep.isExternal) {
						visit(dep.target);
					}
				});
			}

			temp.delete(path);
			visited.add(path);
			order.push(path);
		};

		for (const path of this.modules.keys()) {
			if (!visited.has(path)) {
				visit(path);
			}
		}

		return order;
	}

	/**
	 * Create dependency graph
	 */
	createDependencyGraph(): DependencyGraph {
		const graph = new DependencyGraph();

		// Add nodes
		for (const path of this.modules.keys()) {
			graph.addNode(path);
		}

		// Add edges
		for (const [path, module] of this.modules) {
			module.dependencies.forEach((dep) => {
				if (!dep.isExternal && this.modules.has(dep.target)) {
					graph.addEdge(path, dep.target, dep);
				}
			});
		}

		return graph;
	}

	/**
	 * Validate module structure
	 */
	validateModules(): {
		isValid: boolean;
		errors: string[];
		warnings: string[];
	} {
		const errors: string[] = [];
		const warnings: string[] = [];

		for (const [path, module] of this.modules) {
			// Check for duplicate imports
			const importMap = new Map<string, ImportDeclaration[]>();
			module.imports.forEach((imp) => {
				const key = imp.moduleSpecifier;
				if (!importMap.has(key)) {
					importMap.set(key, []);
				}
				importMap.get(key)!.push(imp);
			});

			importMap.forEach((imports, moduleSpec) => {
				if (imports.length > 1) {
					const hasConflicts = this.checkImportConflicts(imports);
					if (hasConflicts) {
						errors.push(
							`Module ${path} has conflicting imports from ${moduleSpec}`,
						);
					} else {
						warnings.push(
							`Module ${path} has duplicate imports from ${moduleSpec} that could be merged`,
						);
					}
				}
			});

			// Check for unused imports
			const usedImports = this.findUsedImports(module);
			module.imports.forEach((imp) => {
				if (imp.namedImports) {
					const unusedImports = imp.namedImports.filter(
						(name) => !usedImports.has(name),
					);
					if (unusedImports.length > 0) {
						warnings.push(
							`Module ${path} has unused imports: ${unusedImports.join(", ")}`,
						);
					}
				}
			});
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		};
	}

	// Private helper methods

	private analyzeDependencies(module: ModuleInfo): ModuleDependency[] {
		return module.imports.map((imp) => ({
			source: module.path,
			target: imp.moduleSpecifier,
			imports: [
				...(imp.namedImports || []),
				...(imp.defaultImport ? [imp.defaultImport] : []),
				...(imp.namespaceImport ? [imp.namespaceImport] : []),
			],
			isTypeOnly: imp.typeOnly || false,
			isDefault: !!imp.defaultImport,
			isNamespace: !!imp.namespaceImport,
			isExternal: this.isExternalModule(imp.moduleSpecifier),
		}));
	}

	private analyzeExports(module: ModuleInfo): ModuleExport[] {
		const exports: ModuleExport[] = [];

		module.exports.forEach((exp) => {
			if (exp.defaultExport) {
				exports.push({
					name: exp.defaultExport,
					type: "default",
					isTypeOnly: exp.typeOnly || false,
				});
			}

			if (exp.namedExports) {
				exp.namedExports.forEach((name) => {
					exports.push({
						name,
						type: "named",
						isTypeOnly: exp.typeOnly || false,
						source: exp.moduleSpecifier,
					});
				});
			}
		});

		return exports;
	}

	private isExternalModule(moduleSpecifier: string): boolean {
		return !moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/");
	}

	private collectAllDependencies(): ModuleDependency[] {
		const dependencies: ModuleDependency[] = [];

		for (const module of this.modules.values()) {
			dependencies.push(...module.dependencies);
		}

		return dependencies;
	}

	private detectCircularDependencies(): string[][] {
		const cycles: string[][] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const visit = (path: string, currentPath: string[] = []): void => {
			if (visiting.has(path)) {
				const cycleStart = currentPath.indexOf(path);
				if (cycleStart !== -1) {
					cycles.push([...currentPath.slice(cycleStart), path]);
				}
				return;
			}

			if (visited.has(path)) {
				return;
			}

			visiting.add(path);

			const module = this.modules.get(path);
			if (module) {
				module.dependencies.forEach((dep) => {
					if (!dep.isExternal && this.modules.has(dep.target)) {
						visit(dep.target, [...currentPath, path]);
					}
				});
			}

			visiting.delete(path);
			visited.add(path);
		};

		for (const path of this.modules.keys()) {
			if (!visited.has(path)) {
				visit(path);
			}
		}

		return cycles;
	}

	private findMissingDependencies(options: ModuleResolutionOptions): string[] {
		const missing: string[] = [];
		const allPaths = new Set(this.modules.keys());

		for (const module of this.modules.values()) {
			module.dependencies.forEach((dep) => {
				if (!dep.isExternal && !allPaths.has(dep.target)) {
					// Try to resolve with extensions
					const resolved = this.resolveModulePath(dep.target, options);
					if (!resolved || !allPaths.has(resolved)) {
						missing.push(dep.target);
					}
				}
			});
		}

		return [...new Set(missing)];
	}

	private resolveModulePath(
		path: string,
		options: ModuleResolutionOptions,
	): string | null {
		// Try with different extensions
		const extensions = options.extensions || [".ts", ".tsx", ".js", ".jsx"];

		for (const ext of extensions) {
			const withExt = `${path}${ext}`;
			if (this.modules.has(withExt)) {
				return withExt;
			}
		}

		// Try index files
		for (const ext of extensions) {
			const indexPath = `${path}/index${ext}`;
			if (this.modules.has(indexPath)) {
				return indexPath;
			}
		}

		return null;
	}

	private generateStatistics(): DependencyStatistics {
		const modules = Array.from(this.modules.values());
		const allDependencies = this.collectAllDependencies();

		const dependencyCounts = new Map<string, number>();
		modules.forEach((module) => {
			dependencyCounts.set(module.path, module.dependencies.length);
		});

		const sortedByCounts = Array.from(dependencyCounts.entries()).sort(
			(a, b) => b[1] - a[1],
		);

		return {
			totalModules: modules.length,
			totalDependencies: allDependencies.length,
			externalDependencies: allDependencies.filter((d) => d.isExternal).length,
			circularDependencies: this.detectCircularDependencies().length,
			maxDependencyDepth: this.calculateMaxDepth(),
			mostDependentModule: sortedByCounts[0]?.[0] || "",
			leastDependentModule:
				sortedByCounts[sortedByCounts.length - 1]?.[0] || "",
		};
	}

	private calculateMaxDepth(): number {
		let maxDepth = 0;

		const visit = (path: string, depth: number, visited: Set<string>): void => {
			if (visited.has(path)) {
				return;
			}

			visited.add(path);
			maxDepth = Math.max(maxDepth, depth);

			const module = this.modules.get(path);
			if (module) {
				module.dependencies.forEach((dep) => {
					if (!dep.isExternal && this.modules.has(dep.target)) {
						visit(dep.target, depth + 1, new Set(visited));
					}
				});
			}
		};

		for (const path of this.modules.keys()) {
			visit(path, 0, new Set());
		}

		return maxDepth;
	}

	private createEmptyStatistics(): DependencyStatistics {
		return {
			totalModules: 0,
			totalDependencies: 0,
			externalDependencies: 0,
			circularDependencies: 0,
			maxDependencyDepth: 0,
			mostDependentModule: "",
			leastDependentModule: "",
		};
	}

	private optimizeModuleImports(
		module: ModuleInfo,
		options: ImportOptimizationOptions,
	): ImportDeclaration[] {
		let imports = [...module.imports];

		if (options.mergeNamedImports) {
			imports = this.mergeNamedImports(imports);
		}

		if (options.removeUnusedImports) {
			imports = this.removeUnusedImports(imports, module);
		}

		if (options.sortImports) {
			imports = this.sortImports(imports);
		}

		if (options.groupByType) {
			imports = this.groupImportsByType(imports);
		}

		return imports;
	}

	private mergeNamedImports(imports: ImportDeclaration[]): ImportDeclaration[] {
		const merged = new Map<string, ImportDeclaration>();

		imports.forEach((imp) => {
			const key = `${imp.moduleSpecifier}:${imp.typeOnly ? "type" : "value"}`;
			const existing = merged.get(key);

			if (!existing) {
				merged.set(key, { ...imp });
			} else {
				// Merge named imports
				if (imp.namedImports && existing.namedImports) {
					existing.namedImports = [
						...new Set([...existing.namedImports, ...imp.namedImports]),
					];
				} else if (imp.namedImports) {
					existing.namedImports = imp.namedImports;
				}

				// Keep default and namespace imports
				if (imp.defaultImport) {
					existing.defaultImport = imp.defaultImport;
				}
				if (imp.namespaceImport) {
					existing.namespaceImport = imp.namespaceImport;
				}
			}
		});

		return Array.from(merged.values());
	}

	private removeUnusedImports(
		imports: ImportDeclaration[],
		module: ModuleInfo,
	): ImportDeclaration[] {
		const usedImports = this.findUsedImports(module);

		return imports
			.map((imp) => {
				const filtered: ImportDeclaration = { ...imp };

				if (imp.namedImports) {
					filtered.namedImports = imp.namedImports.filter((name) =>
						usedImports.has(name),
					);
				}

				// Keep import if it has any remaining imports or side effects
				const hasImports =
					filtered.namedImports?.length ||
					filtered.defaultImport ||
					filtered.namespaceImport ||
					(!filtered.namedImports &&
						!filtered.defaultImport &&
						!filtered.namespaceImport); // side effect import

				return hasImports ? filtered : null;
			})
			.filter((imp): imp is ImportDeclaration => imp !== null);
	}

	private findUsedImports(module: ModuleInfo): Set<string> {
		const used = new Set<string>();

		// This is a simplified implementation
		// In a real scenario, you'd analyze the code fragments to find actual usage
		module.fragments.forEach((fragment) => {
			module.imports.forEach((imp) => {
				if (imp.namedImports) {
					imp.namedImports.forEach((name) => {
						if (fragment.content.includes(name)) {
							used.add(name);
						}
					});
				}
				if (imp.defaultImport && fragment.content.includes(imp.defaultImport)) {
					used.add(imp.defaultImport);
				}
				if (
					imp.namespaceImport &&
					fragment.content.includes(imp.namespaceImport)
				) {
					used.add(imp.namespaceImport);
				}
			});
		});

		return used;
	}

	private sortImports(imports: ImportDeclaration[]): ImportDeclaration[] {
		return imports.sort((a, b) => {
			// Type imports first
			if (a.typeOnly && !b.typeOnly) return -1;
			if (!a.typeOnly && b.typeOnly) return 1;

			// External modules before internal
			const aExternal = this.isExternalModule(a.moduleSpecifier);
			const bExternal = this.isExternalModule(b.moduleSpecifier);

			if (aExternal && !bExternal) return -1;
			if (!aExternal && bExternal) return 1;

			// Alphabetical by module specifier
			return a.moduleSpecifier.localeCompare(b.moduleSpecifier);
		});
	}

	private groupImportsByType(
		imports: ImportDeclaration[],
	): ImportDeclaration[] {
		const typeImports = imports.filter((imp) => imp.typeOnly);
		const valueImports = imports.filter((imp) => !imp.typeOnly);

		return [...typeImports, ...valueImports];
	}

	private checkImportConflicts(imports: ImportDeclaration[]): boolean {
		const names = new Set<string>();

		for (const imp of imports) {
			if (imp.defaultImport) {
				if (names.has(imp.defaultImport)) return true;
				names.add(imp.defaultImport);
			}

			if (imp.namespaceImport) {
				if (names.has(imp.namespaceImport)) return true;
				names.add(imp.namespaceImport);
			}

			if (imp.namedImports) {
				for (const name of imp.namedImports) {
					if (names.has(name)) return true;
					names.add(name);
				}
			}
		}

		return false;
	}

	private getModulesInDirectory(dir: string): ModuleInfo[] {
		return Array.from(this.modules.values()).filter(
			(module) =>
				module.path.startsWith(dir) &&
				!module.path.substring(dir.length + 1).includes("/"),
		);
	}

	private createBarrelExports(modules: ModuleInfo[]): ExportDeclaration[] {
		const exports: ExportDeclaration[] = [];

		modules.forEach((module) => {
			if (module.providedExports.length > 0) {
				const namedExports = module.providedExports
					.filter((exp) => exp.type === "named")
					.map((exp) => exp.name);

				if (namedExports.length > 0) {
					exports.push({
						kind: "ExportDeclaration",
						namedExports,
						moduleSpecifier: `./${module.path}`,
						typeOnly: module.providedExports.some((exp) => exp.isTypeOnly),
					});
				}
			}
		});

		return exports;
	}
}

/**
 * Dependency graph data structure
 */
export class DependencyGraph {
	private nodes: Set<string> = new Set();
	private edges: Map<
		string,
		Set<{ target: string; dependency: ModuleDependency }>
	> = new Map();

	addNode(path: string): void {
		this.nodes.add(path);
		if (!this.edges.has(path)) {
			this.edges.set(path, new Set());
		}
	}

	addEdge(from: string, to: string, dependency: ModuleDependency): void {
		if (!this.nodes.has(from)) this.addNode(from);
		if (!this.nodes.has(to)) this.addNode(to);

		this.edges.get(from)!.add({ target: to, dependency });
	}

	getNodes(): string[] {
		return Array.from(this.nodes);
	}

	getEdges(
		node: string,
	): Array<{ target: string; dependency: ModuleDependency }> {
		return Array.from(this.edges.get(node) || []);
	}

	getDependents(node: string): string[] {
		const dependents: string[] = [];

		for (const [source, edges] of this.edges) {
			for (const edge of edges) {
				if (edge.target === node) {
					dependents.push(source);
				}
			}
		}

		return dependents;
	}

	toJSON(): any {
		const result: any = {
			nodes: Array.from(this.nodes),
			edges: {},
		};

		for (const [node, edges] of this.edges) {
			result.edges[node] = Array.from(edges);
		}

		return result;
	}
}
