/**
 * Module Manager Tests
 * 
 * Tests for import/export management utilities including module registration,
 * dependency resolution, circular dependency detection, and optimization.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	ModuleManager,
	DependencyGraph,
	type ModuleInfo,
	type ModuleDependency,
	type DependencyResolutionResult,
	type ImportOptimizationOptions
} from '../../../src/api/low-level/module-manager';
import { ASTBuilder, type ImportDeclaration, type ExportDeclaration } from '../../../src/api/low-level/ast';
import { CodeFragmentBuilder } from '../../../src/api/low-level/fragment';

describe('ModuleManager', () => {
	let manager: ModuleManager;
	let builder: ASTBuilder;
	let fragmentBuilder: CodeFragmentBuilder;

	beforeEach(() => {
		manager = new ModuleManager();
		builder = new ASTBuilder();
		fragmentBuilder = new CodeFragmentBuilder();
	});

	describe('Module Registration', () => {
		it('should register module', () => {
			const import_ = builder.createImport('./base', {
				namedImports: ['Resource']
			});

			const module = manager.registerModule('src/patient.ts', {
				imports: [import_]
			});

			expect(module.id).toBeDefined();
			expect(module.path).toBe('src/patient.ts');
			expect(module.imports).toHaveLength(1);
			expect(module.dependencies).toHaveLength(1);
		});

		it('should register multiple modules', () => {
			const modules = [
				{ path: 'src/patient.ts' },
				{ path: 'src/practitioner.ts' }
			];

			const registered = manager.registerModules(modules);

			expect(registered).toHaveLength(2);
			expect(registered[0].path).toBe('src/patient.ts');
			expect(registered[1].path).toBe('src/practitioner.ts');
		});

		it('should get module by path', () => {
			const module = manager.registerModule('src/patient.ts');
			const retrieved = manager.getModule('src/patient.ts');

			expect(retrieved).toBe(module);
		});

		it('should get all modules', () => {
			manager.registerModule('src/patient.ts');
			manager.registerModule('src/practitioner.ts');

			const all = manager.getAllModules();

			expect(all).toHaveLength(2);
		});

		it('should remove module', () => {
			manager.registerModule('src/patient.ts');
			const removed = manager.removeModule('src/patient.ts');

			expect(removed).toBe(true);
			expect(manager.getModule('src/patient.ts')).toBeUndefined();
		});
	});

	describe('Dependency Analysis', () => {
		it('should analyze import dependencies', () => {
			const namedImport = builder.createImport('./base', {
				namedImports: ['Resource', 'Meta']
			});

			const defaultImport = builder.createImport('./utils', {
				defaultImport: 'Utils'
			});

			const namespaceImport = builder.createImport('./types', {
				namespaceImport: 'Types'
			});

			const module = manager.registerModule('src/patient.ts', {
				imports: [namedImport, defaultImport, namespaceImport]
			});

			expect(module.dependencies).toHaveLength(3);
			
			const resourceDep = module.dependencies.find(d => d.target === './base');
			expect(resourceDep?.imports).toEqual(['Resource', 'Meta']);
			expect(resourceDep?.isExternal).toBe(false);

			const utilsDep = module.dependencies.find(d => d.target === './utils');
			expect(utilsDep?.imports).toContain('Utils');
			expect(utilsDep?.isDefault).toBe(true);

			const typesDep = module.dependencies.find(d => d.target === './types');
			expect(typesDep?.imports).toContain('Types');
			expect(typesDep?.isNamespace).toBe(true);
		});

		it('should detect external dependencies', () => {
			const externalImport = builder.createImport('lodash', {
				namedImports: ['isEmpty']
			});

			const internalImport = builder.createImport('./base', {
				namedImports: ['Resource']
			});

			const module = manager.registerModule('src/patient.ts', {
				imports: [externalImport, internalImport]
			});

			const externalDep = module.dependencies.find(d => d.target === 'lodash');
			const internalDep = module.dependencies.find(d => d.target === './base');

			expect(externalDep?.isExternal).toBe(true);
			expect(internalDep?.isExternal).toBe(false);
		});

		it('should analyze export declarations', () => {
			const namedExport = builder.createExport({
				namedExports: ['Patient', 'PatientType']
			});

			const reExport = builder.createExport({
				namedExports: ['Resource'],
				moduleSpecifier: './base'
			});

			const module = manager.registerModule('src/patient.ts', {
				exports: [namedExport, reExport]
			});

			expect(module.providedExports).toHaveLength(3); // Patient, PatientType, Resource
			
			const patientExport = module.providedExports.find(e => e.name === 'Patient');
			expect(patientExport?.type).toBe('named');
			expect(patientExport?.source).toBeUndefined();

			const resourceExport = module.providedExports.find(e => e.name === 'Resource');
			expect(resourceExport?.source).toBe('./base');
		});
	});

	describe('Dependency Resolution', () => {
		it('should resolve all dependencies successfully', () => {
			// Create base module
			const baseModule = manager.registerModule('src/base.ts', {
				exports: [builder.createExport({ namedExports: ['Resource'] })]
			});

			// Create patient module that depends on base
			const patientModule = manager.registerModule('src/patient.ts', {
				imports: [builder.createImport('./base', { namedImports: ['Resource'] })],
				exports: [builder.createExport({ namedExports: ['Patient'] })]
			});

			// Adjust dependency target to match registered path
			patientModule.dependencies[0].target = 'src/base.ts';

			const result = manager.resolveDependencies();

			expect(result.success).toBe(true);
			expect(result.modules.size).toBe(2);
			expect(result.missingDependencies).toHaveLength(0);
			expect(result.circularDependencies).toHaveLength(0);
		});

		it('should detect missing dependencies', () => {
			const patientModule = manager.registerModule('src/patient.ts', {
				imports: [builder.createImport('./nonexistent', { namedImports: ['Missing'] })]
			});

			const result = manager.resolveDependencies();

			expect(result.success).toBe(false);
			expect(result.missingDependencies).toContain('./nonexistent');
			expect(result.errors.some(e => e.code === 'MISSING_DEPENDENCY')).toBe(true);
		});

		it('should detect circular dependencies', () => {
			// Create modules with circular dependency
			const moduleA = manager.registerModule('src/a.ts', {
				imports: [builder.createImport('./b', { namedImports: ['B'] })],
				exports: [builder.createExport({ namedExports: ['A'] })]
			});

			const moduleB = manager.registerModule('src/b.ts', {
				imports: [builder.createImport('./a', { namedImports: ['A'] })],
				exports: [builder.createExport({ namedExports: ['B'] })]
			});

			// Adjust dependency targets
			moduleA.dependencies[0].target = 'src/b.ts';
			moduleB.dependencies[0].target = 'src/a.ts';

			const result = manager.resolveDependencies();

			expect(result.success).toBe(false);
			expect(result.circularDependencies.length).toBeGreaterThan(0);
			expect(result.errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
		});

		it('should generate dependency statistics', () => {
			// Create modules with dependencies
			manager.registerModule('src/base.ts');
			manager.registerModule('src/patient.ts', {
				imports: [
					builder.createImport('src/base.ts', { namedImports: ['Resource'] }),
					builder.createImport('lodash', { namedImports: ['isEmpty'] })
				]
			});

			const result = manager.resolveDependencies();

			expect(result.statistics.totalModules).toBe(2);
			expect(result.statistics.totalDependencies).toBe(2);
			expect(result.statistics.externalDependencies).toBe(1);
		});
	});

	describe('Import Optimization', () => {
		it('should merge named imports from same module', () => {
			const import1 = builder.createImport('./base', { namedImports: ['Resource'] });
			const import2 = builder.createImport('./base', { namedImports: ['Meta'] });

			const module = manager.registerModule('src/patient.ts', {
				imports: [import1, import2]
			});

			const optimized = manager.optimizeImports({
				mergeNamedImports: true
			});

			const patientOptimized = optimized.get('src/patient.ts');
			expect(patientOptimized).toHaveLength(1);
			expect(patientOptimized?.[0].namedImports).toContain('Resource');
			expect(patientOptimized?.[0].namedImports).toContain('Meta');
		});

		it('should sort imports by external/internal', () => {
			const externalImport = builder.createImport('lodash', { namedImports: ['isEmpty'] });
			const internalImport = builder.createImport('./base', { namedImports: ['Resource'] });

			manager.registerModule('src/patient.ts', {
				imports: [internalImport, externalImport] // Intentionally out of order
			});

			const optimized = manager.optimizeImports({
				sortImports: true
			});

			const patientOptimized = optimized.get('src/patient.ts');
			expect(patientOptimized?.[0].moduleSpecifier).toBe('lodash'); // External first
			expect(patientOptimized?.[1].moduleSpecifier).toBe('./base'); // Internal second
		});

		it('should group imports by type', () => {
			const typeImport = builder.createImport('./types', { 
				namedImports: ['PatientType'], 
				typeOnly: true 
			});
			const valueImport = builder.createImport('./patient', { namedImports: ['Patient'] });

			manager.registerModule('src/index.ts', {
				imports: [valueImport, typeImport] // Intentionally out of order
			});

			const optimized = manager.optimizeImports({
				groupByType: true
			});

			const indexOptimized = optimized.get('src/index.ts');
			expect(indexOptimized?.[0].typeOnly).toBe(true); // Type imports first
			expect(indexOptimized?.[1].typeOnly).toBeFalsy(); // Value imports second
		});

		it('should remove unused imports with fragments', () => {
			const usedImport = builder.createImport('./base', { namedImports: ['Resource'] });
			const unusedImport = builder.createImport('./utils', { namedImports: ['UnusedUtil'] });

			const fragment = fragmentBuilder.create('interface Patient extends Resource {}');

			manager.registerModule('src/patient.ts', {
				imports: [usedImport, unusedImport],
				fragments: [fragment]
			});

			const optimized = manager.optimizeImports({
				removeUnusedImports: true
			});

			const patientOptimized = optimized.get('src/patient.ts');
			expect(patientOptimized).toHaveLength(1);
			expect(patientOptimized?.[0].moduleSpecifier).toBe('./base');
		});
	});

	describe('Barrel Export Generation', () => {
		it('should generate barrel exports for directories', () => {
			manager.registerModule('src/resources/patient.ts', {
				exports: [builder.createExport({ namedExports: ['Patient'] })]
			});

			manager.registerModule('src/resources/practitioner.ts', {
				exports: [builder.createExport({ namedExports: ['Practitioner'] })]
			});

			const barrels = manager.generateBarrels(['src/resources']);

			expect(barrels.has('src/resources/index.ts')).toBe(true);
			const barrel = barrels.get('src/resources/index.ts');
			expect(barrel?.some(exp => exp.moduleSpecifier?.includes('patient'))).toBe(true);
			expect(barrel?.some(exp => exp.moduleSpecifier?.includes('practitioner'))).toBe(true);
		});
	});

	describe('Topological Sorting', () => {
		it('should return modules in dependency order', () => {
			// Create dependency chain: base -> patient -> index
			manager.registerModule('src/base.ts', {
				exports: [builder.createExport({ namedExports: ['Resource'] })]
			});

			const patientModule = manager.registerModule('src/patient.ts', {
				imports: [builder.createImport('./base', { namedImports: ['Resource'] })],
				exports: [builder.createExport({ namedExports: ['Patient'] })]
			});

			const indexModule = manager.registerModule('src/index.ts', {
				imports: [builder.createImport('./patient', { namedImports: ['Patient'] })]
			});

			// Adjust dependency targets
			patientModule.dependencies[0].target = 'src/base.ts';
			indexModule.dependencies[0].target = 'src/patient.ts';

			const order = manager.getTopologicalOrder();

			const baseIndex = order.indexOf('src/base.ts');
			const patientIndex = order.indexOf('src/patient.ts');
			const indexIndex = order.indexOf('src/index.ts');

			expect(baseIndex).toBeLessThan(patientIndex);
			expect(patientIndex).toBeLessThan(indexIndex);
		});

		it('should throw error on circular dependencies', () => {
			const moduleA = manager.registerModule('src/a.ts', {
				imports: [builder.createImport('./b', { namedImports: ['B'] })]
			});

			const moduleB = manager.registerModule('src/b.ts', {
				imports: [builder.createImport('./a', { namedImports: ['A'] })]
			});

			// Adjust dependency targets
			moduleA.dependencies[0].target = 'src/b.ts';
			moduleB.dependencies[0].target = 'src/a.ts';

			expect(() => manager.getTopologicalOrder()).toThrow();
		});
	});

	describe('Module Validation', () => {
		it('should validate module structure', () => {
			const validModule = manager.registerModule('src/patient.ts', {
				imports: [builder.createImport('./base', { namedImports: ['Resource'] })]
			});

			const validation = manager.validateModules();

			expect(validation.isValid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('should detect duplicate imports', () => {
			const import1 = builder.createImport('./base', { namedImports: ['Resource'] });
			const import2 = builder.createImport('./base', { namedImports: ['Meta'] });

			manager.registerModule('src/patient.ts', {
				imports: [import1, import2]
			});

			const validation = manager.validateModules();

			expect(validation.isValid).toBe(true); // Not invalid, just a warning
			expect(validation.warnings.some(w => w.includes('duplicate imports'))).toBe(true);
		});

		it('should detect conflicting imports', () => {
			const import1 = builder.createImport('./base', { defaultImport: 'Resource' });
			const import2 = builder.createImport('./base', { namedImports: ['Resource'] });

			manager.registerModule('src/patient.ts', {
				imports: [import1, import2]
			});

			const validation = manager.validateModules();

			expect(validation.isValid).toBe(false);
			expect(validation.errors.some(e => e.includes('conflicting imports'))).toBe(true);
		});
	});
});

describe('DependencyGraph', () => {
	let graph: DependencyGraph;

	beforeEach(() => {
		graph = new DependencyGraph();
	});

	it('should add nodes', () => {
		graph.addNode('nodeA');
		graph.addNode('nodeB');

		const nodes = graph.getNodes();

		expect(nodes).toContain('nodeA');
		expect(nodes).toContain('nodeB');
	});

	it('should add edges', () => {
		const mockDependency: ModuleDependency = {
			source: 'nodeA',
			target: 'nodeB',
			imports: ['Test'],
			isTypeOnly: false,
			isDefault: false,
			isNamespace: false,
			isExternal: false
		};

		graph.addEdge('nodeA', 'nodeB', mockDependency);

		const edges = graph.getEdges('nodeA');
		expect(edges).toHaveLength(1);
		expect(edges[0].target).toBe('nodeB');
		expect(edges[0].dependency).toBe(mockDependency);
	});

	it('should find dependents', () => {
		const mockDependency: ModuleDependency = {
			source: 'nodeA',
			target: 'nodeB',
			imports: ['Test'],
			isTypeOnly: false,
			isDefault: false,
			isNamespace: false,
			isExternal: false
		};

		graph.addEdge('nodeA', 'nodeB', mockDependency);

		const dependents = graph.getDependents('nodeB');

		expect(dependents).toContain('nodeA');
	});

	it('should serialize to JSON', () => {
		const mockDependency: ModuleDependency = {
			source: 'nodeA',
			target: 'nodeB',
			imports: ['Test'],
			isTypeOnly: false,
			isDefault: false,
			isNamespace: false,
			isExternal: false
		};

		graph.addNode('nodeA');
		graph.addNode('nodeB');
		graph.addEdge('nodeA', 'nodeB', mockDependency);

		const json = graph.toJSON();

		expect(json.nodes).toContain('nodeA');
		expect(json.nodes).toContain('nodeB');
		expect(json.edges.nodeA).toHaveLength(1);
		expect(json.edges.nodeA[0].target).toBe('nodeB');
	});
});

describe('Integration Tests', () => {
	let manager: ModuleManager;
	let builder: ASTBuilder;
	let fragmentBuilder: CodeFragmentBuilder;

	beforeEach(() => {
		manager = new ModuleManager();
		builder = new ASTBuilder();
		fragmentBuilder = new CodeFragmentBuilder();
	});

	it('should handle complex FHIR module structure', () => {
		// Create base FHIR module
		const baseExports = [
			builder.createExport({ namedExports: ['Resource', 'DomainResource', 'Meta'] })
		];
		const baseModule = manager.registerModule('src/fhir/base.ts', {
			exports: baseExports
		});

		// Create datatypes module
		const datatypeExports = [
			builder.createExport({ namedExports: ['Identifier', 'HumanName', 'ContactPoint'] })
		];
		const datatypeModule = manager.registerModule('src/fhir/datatypes.ts', {
			exports: datatypeExports
		});

		// Create Patient resource
		const patientImports = [
			builder.createImport('./base', { namedImports: ['DomainResource'] }),
			builder.createImport('./datatypes', { namedImports: ['Identifier', 'HumanName'] })
		];
		const patientExports = [
			builder.createExport({ namedExports: ['Patient'] })
		];
		const patientFragment = fragmentBuilder.create(`
export interface Patient extends DomainResource {
  resourceType: 'Patient';
  identifier?: Identifier[];
  name?: HumanName[];
}`, {
			dependencies: ['DomainResource', 'Identifier', 'HumanName']
		});

		const patientModule = manager.registerModule('src/fhir/resources/patient.ts', {
			imports: patientImports,
			exports: patientExports,
			fragments: [patientFragment]
		});

		// Create Practitioner resource
		const practitionerImports = [
			builder.createImport('../base', { namedImports: ['DomainResource'] }),
			builder.createImport('../datatypes', { namedImports: ['Identifier', 'HumanName', 'ContactPoint'] })
		];
		const practitionerExports = [
			builder.createExport({ namedExports: ['Practitioner'] })
		];

		const practitionerModule = manager.registerModule('src/fhir/resources/practitioner.ts', {
			imports: practitionerImports,
			exports: practitionerExports
		});

		// Adjust dependency targets to match actual module paths
		patientModule.dependencies[0].target = 'src/fhir/base.ts';
		patientModule.dependencies[1].target = 'src/fhir/datatypes.ts';
		practitionerModule.dependencies[0].target = 'src/fhir/base.ts';
		practitionerModule.dependencies[1].target = 'src/fhir/datatypes.ts';

		// Resolve dependencies
		const resolution = manager.resolveDependencies();

		expect(resolution.success).toBe(true);
		expect(resolution.modules.size).toBe(4);
		expect(resolution.circularDependencies).toHaveLength(0);
		expect(resolution.missingDependencies).toHaveLength(0);

		// Test topological ordering
		const order = manager.getTopologicalOrder();
		const baseIndex = order.indexOf('src/fhir/base.ts');
		const patientIndex = order.indexOf('src/fhir/resources/patient.ts');

		expect(baseIndex).toBeLessThan(patientIndex); // Base should come before Patient

		// Test barrel generation
		const barrels = manager.generateBarrels(['src/fhir/resources']);
		expect(barrels.has('src/fhir/resources/index.ts')).toBe(true);

		// Test import optimization
		const optimized = manager.optimizeImports({
			mergeNamedImports: true,
			sortImports: true,
			groupByType: false
		});

		expect(optimized.size).toBe(4);
		expect(optimized.get('src/fhir/resources/patient.ts')?.length).toBeLessThanOrEqual(2); // Should be merged
	});

	it('should handle large-scale module optimization', () => {
		// Create many modules with overlapping dependencies
		const moduleCount = 20;
		const modules: ModuleInfo[] = [];

		for (let i = 0; i < moduleCount; i++) {
			const imports = [];
			const exports = [];

			// Each module depends on previous modules
			for (let j = Math.max(0, i - 3); j < i; j++) {
				imports.push(builder.createImport(`./module${j}`, { 
					namedImports: [`Type${j}`, `Interface${j}`] 
				}));
			}

			// Each module exports something
			exports.push(builder.createExport({ 
				namedExports: [`Type${i}`, `Interface${i}`] 
			}));

			const module = manager.registerModule(`src/module${i}.ts`, {
				imports,
				exports
			});

			// Fix dependency targets
			module.dependencies.forEach((dep, index) => {
				const targetIndex = Math.max(0, i - 3) + index;
				dep.target = `src/module${targetIndex}.ts`;
			});

			modules.push(module);
		}

		// Test dependency resolution
		const resolution = manager.resolveDependencies();
		expect(resolution.success).toBe(true);
		expect(resolution.statistics.totalModules).toBe(moduleCount);

		// Test optimization
		const startTime = Date.now();
		const optimized = manager.optimizeImports({
			mergeNamedImports: true,
			sortImports: true,
			removeUnusedImports: false // Skip this for performance
		});
		const optimizationTime = Date.now() - startTime;

		expect(optimized.size).toBe(moduleCount);
		expect(optimizationTime).toBeLessThan(1000); // Should complete in reasonable time

		// Test topological sort
		const sortStartTime = Date.now();
		const order = manager.getTopologicalOrder();
		const sortTime = Date.now() - sortStartTime;

		expect(order).toHaveLength(moduleCount);
		expect(sortTime).toBeLessThan(100); // Should be fast

		// Validate order correctness
		for (let i = 0; i < moduleCount; i++) {
			const currentIndex = order.indexOf(`src/module${i}.ts`);
			
			// Check that all dependencies come before current module
			for (let j = Math.max(0, i - 3); j < i; j++) {
				const depIndex = order.indexOf(`src/module${j}.ts`);
				expect(depIndex).toBeLessThan(currentIndex);
			}
		}
	});
});