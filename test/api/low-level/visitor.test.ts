/**
 * Visitor Pattern Tests
 * 
 * Tests for the visitor pattern implementation including visitor engines,
 * pattern builders, language-specific visitors, and built-in visitors.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	VisitorEngine,
	VisitorPatternBuilder,
	LanguageVisitors,
	BuiltInVisitors,
	type Visitor,
	type VisitorContext,
	type VisitorOptions,
	type VisitorResult
} from '../../../src/api/low-level/visitor';
import { ASTBuilder, type InterfaceDeclaration, type PropertySignature, type ASTNode } from '../../../src/api/low-level/ast';

describe('VisitorEngine', () => {
	let engine: VisitorEngine;
	let builder: ASTBuilder;

	beforeEach(() => {
		engine = new VisitorEngine();
		builder = new ASTBuilder();
	});

	describe('Visitor Registration', () => {
		it('should register visitor', () => {
			const visitor: Visitor = {
				name: 'TestVisitor',
				visit: async () => 'visited'
			};

			engine.registerVisitor(visitor);
			const retrieved = engine.getVisitor('TestVisitor');

			expect(retrieved).toBe(visitor);
		});

		it('should register multiple visitors', () => {
			const visitors: Visitor[] = [
				{
					name: 'Visitor1',
					visit: async () => 'visited1'
				},
				{
					name: 'Visitor2',
					visit: async () => 'visited2'
				}
			];

			engine.registerVisitors(visitors);

			expect(engine.getVisitor('Visitor1')).toBe(visitors[0]);
			expect(engine.getVisitor('Visitor2')).toBe(visitors[1]);
		});

		it('should unregister visitor', () => {
			const visitor: Visitor = {
				name: 'TestVisitor',
				visit: async () => 'visited'
			};

			engine.registerVisitor(visitor);
			const unregistered = engine.unregisterVisitor('TestVisitor');

			expect(unregistered).toBe(true);
			expect(engine.getVisitor('TestVisitor')).toBeUndefined();
		});

		it('should get all visitors', () => {
			const visitor1: Visitor = {
				name: 'Visitor1',
				visit: async () => 'visited1'
			};
			const visitor2: Visitor = {
				name: 'Visitor2',
				visit: async () => 'visited2'
			};

			engine.registerVisitors([visitor1, visitor2]);
			const all = engine.getAllVisitors();

			expect(all).toHaveLength(2);
			expect(all).toContain(visitor1);
			expect(all).toContain(visitor2);
		});
	});

	describe('Visitor Execution', () => {
		it('should execute visitor on node', async () => {
			const visitor: Visitor = {
				name: 'TestVisitor',
				visitInterface: async (node: InterfaceDeclaration) => {
					return `visited_${node.name}`;
				}
			};

			engine.registerVisitor(visitor);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.execute<string>(interface_);

			expect(result.success).toBe(true);
			expect(result.results.get('TestVisitor_' + interface_.id)).toBe('visited_Patient');
		});

		it('should execute multiple visitors', async () => {
			const visitor1: Visitor = {
				name: 'Visitor1',
				visitInterface: async (node: InterfaceDeclaration) => `v1_${node.name}`
			};
			const visitor2: Visitor = {
				name: 'Visitor2',
				visitInterface: async (node: InterfaceDeclaration) => `v2_${node.name}`
			};

			engine.registerVisitors([visitor1, visitor2]);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.execute<string>(interface_);

			expect(result.success).toBe(true);
			expect(result.results.get('Visitor1_' + interface_.id)).toBe('v1_Patient');
			expect(result.results.get('Visitor2_' + interface_.id)).toBe('v2_Patient');
		});

		it('should execute specific visitors only', async () => {
			const visitor1: Visitor = {
				name: 'Visitor1',
				visitInterface: async () => 'visited1'
			};
			const visitor2: Visitor = {
				name: 'Visitor2',
				visitInterface: async () => 'visited2'
			};

			engine.registerVisitors([visitor1, visitor2]);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.execute<string>(interface_, {
				visitors: ['Visitor1']
			});

			expect(result.success).toBe(true);
			expect(result.results.has('Visitor1_' + interface_.id)).toBe(true);
			expect(result.results.has('Visitor2_' + interface_.id)).toBe(false);
		});

		it('should filter visitors by language target', async () => {
			const tsVisitor: Visitor = {
				name: 'TypeScriptVisitor',
				languageTarget: 'typescript',
				visit: async () => 'ts'
			};
			const pyVisitor: Visitor = {
				name: 'PythonVisitor',
				languageTarget: 'python',
				visit: async () => 'py'
			};
			const genericVisitor: Visitor = {
				name: 'GenericVisitor',
				languageTarget: 'generic',
				visit: async () => 'generic'
			};

			engine.registerVisitors([tsVisitor, pyVisitor, genericVisitor]);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.execute(interface_, {
				languageTarget: 'python'
			});

			expect(result.success).toBe(true);
			expect(result.results.has('PythonVisitor_' + interface_.id)).toBe(true);
			expect(result.results.has('GenericVisitor_' + interface_.id)).toBe(true);
			expect(result.results.has('TypeScriptVisitor_' + interface_.id)).toBe(false);
		});
	});

	describe('Node Traversal', () => {
		it('should traverse interface and visit all nodes', async () => {
			const visitedNodes: string[] = [];
			const visitor: Visitor = {
				name: 'TraversalVisitor',
				visit: async (node: ASTNode) => {
					visitedNodes.push(node.kind);
					return node.kind;
				}
			};

			engine.registerVisitor(visitor);

			const property = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			const result = await engine.execute(interface_);

			expect(result.success).toBe(true);
			expect(visitedNodes).toContain('InterfaceDeclaration');
			expect(visitedNodes).toContain('PropertySignature');
			expect(visitedNodes).toContain('StringKeyword');
		});

		it('should respect max depth option', async () => {
			let maxDepth = 0;
			const visitor: Visitor = {
				name: 'DepthVisitor',
				visit: async (node: ASTNode, context: VisitorContext) => {
					maxDepth = Math.max(maxDepth, context.depth);
					return context.depth;
				}
			};

			engine.registerVisitor(visitor);

			const property = builder.createProperty('name', builder.createArrayType(builder.createStringType()));
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			await engine.execute(interface_, {
				maxDepth: 2
			});

			expect(maxDepth).toBeLessThanOrEqual(2);
		});

		it('should skip specified node types', async () => {
			const visitedNodes: string[] = [];
			const visitor: Visitor = {
				name: 'SkipVisitor',
				visit: async (node: ASTNode) => {
					visitedNodes.push(node.kind);
					return node.kind;
				}
			};

			engine.registerVisitor(visitor);

			const property = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			await engine.execute(interface_, {
				skipNodes: ['PropertySignature']
			});

			expect(visitedNodes).toContain('InterfaceDeclaration');
			expect(visitedNodes).toContain('StringKeyword');
			expect(visitedNodes).not.toContain('PropertySignature');
		});

		it('should only visit specified node types', async () => {
			const visitedNodes: string[] = [];
			const visitor: Visitor = {
				name: 'OnlyVisitor',
				visit: async (node: ASTNode) => {
					visitedNodes.push(node.kind);
					return node.kind;
				}
			};

			engine.registerVisitor(visitor);

			const property = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			await engine.execute(interface_, {
				onlyNodes: ['InterfaceDeclaration']
			});

			expect(visitedNodes).toContain('InterfaceDeclaration');
			expect(visitedNodes).not.toContain('PropertySignature');
			expect(visitedNodes).not.toContain('StringKeyword');
		});
	});

	describe('Visitor Methods', () => {
		it('should call specific node type visitor methods', async () => {
			const calls: string[] = [];
			const visitor: Visitor = {
				name: 'MethodVisitor',
				visitInterface: async (node: InterfaceDeclaration) => {
					calls.push('visitInterface');
					return 'interface';
				},
				visitProperty: async (node: PropertySignature) => {
					calls.push('visitProperty');
					return 'property';
				},
				visitType: async (node) => {
					calls.push('visitType');
					return 'type';
				}
			};

			engine.registerVisitor(visitor);

			const property = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			await engine.execute(interface_);

			expect(calls).toContain('visitInterface');
			expect(calls).toContain('visitProperty');
			expect(calls).toContain('visitType');
		});

		it('should fallback to generic visitor methods', async () => {
			const calls: string[] = [];
			const visitor: Visitor = {
				name: 'GenericVisitor',
				visitClassLike: async (node: ASTNode) => {
					calls.push('visitClassLike');
					return 'class-like';
				},
				visitFieldLike: async (node: ASTNode) => {
					calls.push('visitFieldLike');
					return 'field-like';
				}
			};

			engine.registerVisitor(visitor);

			const property = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			await engine.execute(interface_);

			expect(calls).toContain('visitClassLike'); // Interface should trigger this
			expect(calls).toContain('visitFieldLike'); // Property should trigger this
		});

		it('should call lifecycle methods', async () => {
			const calls: string[] = [];
			const visitor: Visitor = {
				name: 'LifecycleVisitor',
				beforeVisit: async () => {
					calls.push('before');
				},
				visit: async () => {
					calls.push('visit');
					return 'visited';
				},
				afterVisit: async () => {
					calls.push('after');
				}
			};

			engine.registerVisitor(visitor);

			const interface_ = builder.createInterface('Patient');
			await engine.execute(interface_);

			expect(calls).toEqual(['before', 'visit', 'after']);
		});
	});

	describe('Error Handling', () => {
		it('should handle visitor errors', async () => {
			const visitor: Visitor = {
				name: 'FailingVisitor',
				visit: async () => {
					throw new Error('Visitor failed');
				}
			};

			engine.registerVisitor(visitor);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.execute(interface_);

			expect(result.success).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].message).toBe('Visitor failed');
		});

		it('should call error handler', async () => {
			let errorHandled = false;
			const visitor: Visitor = {
				name: 'ErrorHandlerVisitor',
				visit: async () => {
					throw new Error('Test error');
				},
				onError: async () => {
					errorHandled = true;
				}
			};

			engine.registerVisitor(visitor);

			const interface_ = builder.createInterface('Patient');
			await engine.execute(interface_);

			expect(errorHandled).toBe(true);
		});

		it('should continue on error when configured', async () => {
			const visitor1: Visitor = {
				name: 'FailingVisitor',
				visit: async () => {
					throw new Error('Visitor failed');
				}
			};

			const visitor2: Visitor = {
				name: 'WorkingVisitor',
				visit: async () => 'success'
			};

			engine.registerVisitors([visitor1, visitor2]);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.execute(interface_, {
				continueOnError: true
			});

			expect(result.success).toBe(false); // Has errors
			expect(result.errors).toHaveLength(1);
			expect(result.results.get('WorkingVisitor_' + interface_.id)).toBe('success');
		});
	});

	describe('Parallel Execution', () => {
		it('should execute visitors in parallel', async () => {
			const executionOrder: string[] = [];
			
			const visitor1: Visitor = {
				name: 'SlowVisitor',
				visit: async () => {
					await new Promise(resolve => setTimeout(resolve, 50));
					executionOrder.push('slow');
					return 'slow';
				}
			};

			const visitor2: Visitor = {
				name: 'FastVisitor',
				visit: async () => {
					await new Promise(resolve => setTimeout(resolve, 10));
					executionOrder.push('fast');
					return 'fast';
				}
			};

			engine.registerVisitors([visitor1, visitor2]);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.execute(interface_, {
				parallel: true
			});

			expect(result.success).toBe(true);
			expect(result.results.get('SlowVisitor_' + interface_.id)).toBe('slow');
			expect(result.results.get('FastVisitor_' + interface_.id)).toBe('fast');
			// In parallel execution, the fast visitor should complete first
			expect(executionOrder[0]).toBe('fast');
		});
	});

	describe('Statistics', () => {
		it('should collect execution statistics', async () => {
			const visitor: Visitor = {
				name: 'StatsVisitor',
				visit: async () => 'visited'
			};

			engine.registerVisitor(visitor);

			const property = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			const result = await engine.execute(interface_, {
				enableStatistics: true
			});

			expect(result.statistics.nodesVisited).toBeGreaterThan(0);
			expect(result.statistics.visitorsExecuted).toBeGreaterThan(0);
			expect(result.statistics.duration).toBeGreaterThan(0);
			expect(result.statistics.nodeTypeCounts['InterfaceDeclaration']).toBe(1);
			expect(result.statistics.nodeTypeCounts['PropertySignature']).toBe(1);
		});
	});
});

describe('VisitorPatternBuilder', () => {
	let engine: VisitorEngine;
	let builder: ASTBuilder;

	beforeEach(() => {
		engine = new VisitorEngine();
		builder = new ASTBuilder();
	});

	it('should build and execute visitor pattern', async () => {
		const visitor: Visitor = {
			name: 'TestVisitor',
			visit: async () => 'tested'
		};

		const interface_ = builder.createInterface('Patient');
		const result = await engine.createPattern()
			.addVisitor(visitor)
			.execute(interface_);

		expect(result.success).toBe(true);
		expect(result.results.get('TestVisitor_' + interface_.id)).toBe('tested');
	});

	it('should configure execution options', async () => {
		const visitor: Visitor = {
			name: 'TestVisitor',
			visit: async () => 'tested'
		};

		const interface_ = builder.createInterface('Patient');
		const result = await engine.createPattern()
			.addVisitor(visitor)
			.parallel(true)
			.continueOnError(true)
			.forLanguage('typescript')
			.maxDepth(5)
			.skipNodes(['PropertySignature'])
			.execute(interface_);

		expect(result.success).toBe(true);
	});
});

describe('LanguageVisitors', () => {
	let builder: ASTBuilder;

	beforeEach(() => {
		builder = new ASTBuilder();
	});

	describe('PythonClassVisitor', () => {
		it('should generate Python class from TypeScript interface', async () => {
			const visitor = LanguageVisitors.createPythonClassVisitor();

			const properties = [
				builder.createProperty('id', builder.createStringType(), { optional: true }),
				builder.createProperty('name', builder.createStringType()),
				builder.createProperty('age', builder.createNumberType(), { optional: true })
			];

			const interface_ = builder.createInterface('Patient', {
				properties,
				documentation: 'Patient class for FHIR'
			});

			const mockContext: VisitorContext = {
				id: 'test',
				currentNode: interface_,
				rootNode: interface_,
				path: [interface_],
				depth: 0,
				metadata: {},
				options: {},
				state: {},
				results: new Map(),
				errors: [],
				statistics: {
					startTime: Date.now(),
					nodesVisited: 0,
					visitorsExecuted: 0,
					errorsCount: 0,
					maxDepth: 0,
					nodeTypeCounts: {}
				}
			};

			const result = await visitor.visitClassLike!(interface_, mockContext);

			expect(result).toContain('class Patient:');
			expect(result).toContain('def __init__(self):');
			expect(result).toContain('self.id: str | None = None');
			expect(result).toContain('self.name: str = None');
			expect(result).toContain('self.age: float | None = None');
		});

		it('should handle empty interface', async () => {
			const visitor = LanguageVisitors.createPythonClassVisitor();

			const interface_ = builder.createInterface('Empty');

			const mockContext: VisitorContext = {
				id: 'test',
				currentNode: interface_,
				rootNode: interface_,
				path: [interface_],
				depth: 0,
				metadata: {},
				options: {},
				state: {},
				results: new Map(),
				errors: [],
				statistics: {
					startTime: Date.now(),
					nodesVisited: 0,
					visitorsExecuted: 0,
					errorsCount: 0,
					maxDepth: 0,
					nodeTypeCounts: {}
				}
			};

			const result = await visitor.visitClassLike!(interface_, mockContext);

			expect(result).toContain('class Empty:');
			expect(result).toContain('pass');
		});
	});

	describe('JavaClassVisitor', () => {
		it('should generate Java class from TypeScript interface', async () => {
			const visitor = LanguageVisitors.createJavaClassVisitor();

			const properties = [
				builder.createProperty('id', builder.createStringType()),
				builder.createProperty('active', builder.createBooleanType())
			];

			const interface_ = builder.createInterface('Patient', {
				properties,
				documentation: 'Patient class for FHIR'
			});

			const mockContext: VisitorContext = {
				id: 'test',
				currentNode: interface_,
				rootNode: interface_,
				path: [interface_],
				depth: 0,
				metadata: {},
				options: {},
				state: {},
				results: new Map(),
				errors: [],
				statistics: {
					startTime: Date.now(),
					nodesVisited: 0,
					visitorsExecuted: 0,
					errorsCount: 0,
					maxDepth: 0,
					nodeTypeCounts: {}
				}
			};

			const result = await visitor.visitClassLike!(interface_, mockContext);

			expect(result).toContain('public class Patient {');
			expect(result).toContain('private String id;');
			expect(result).toContain('private Boolean active;');
		});
	});
});

describe('BuiltInVisitors', () => {
	let builder: ASTBuilder;

	beforeEach(() => {
		builder = new ASTBuilder();
	});

	describe('StatisticsVisitor', () => {
		it('should collect node statistics', async () => {
			const visitor = new BuiltInVisitors.StatisticsVisitor();

			const properties = [
				builder.createProperty('name', builder.createStringType()),
				builder.createProperty('tags', builder.createArrayType(builder.createStringType())),
				builder.createProperty('active', builder.createBooleanType())
			];

			const interface_ = builder.createInterface('Patient', {
				properties
			});

			// Visit interface
			await visitor.visit!(interface_);

			// Visit properties
			for (const property of properties) {
				await visitor.visit!(property);
				await visitor.visit!(property.type);
			}

			const stats = visitor.getStatistics();

			expect(stats.interfaces).toBe(1);
			expect(stats.properties).toBe(3);
			expect(stats.primitiveTypes).toBe(2); // string, boolean
			expect(stats.complexTypes).toBe(1); // array
			expect(stats.types).toBe(3);
		});

		it('should reset statistics', () => {
			const visitor = new BuiltInVisitors.StatisticsVisitor();

			// Manually set some statistics
			const stats = visitor.getStatistics();
			expect(stats.interfaces).toBe(0);

			// Simulate a visit
			visitor.visit!(builder.createInterface('Test'));

			expect(visitor.getStatistics().interfaces).toBe(1);

			// Reset
			visitor.reset();

			expect(visitor.getStatistics().interfaces).toBe(0);
		});
	});

	describe('DependencyAnalyzer', () => {
		it('should collect type dependencies', async () => {
			const visitor = new BuiltInVisitors.DependencyAnalyzer();

			const types = [
				builder.createTypeReference('Patient'),
				builder.createTypeReference('Practitioner'),
				builder.createStringType(), // Should be ignored
				builder.createTypeReference('Organization')
			];

			for (const type of types) {
				await visitor.visitType!(type);
			}

			const dependencies = visitor.getDependencies();

			expect(dependencies).toContain('Patient');
			expect(dependencies).toContain('Practitioner');
			expect(dependencies).toContain('Organization');
			expect(dependencies).not.toContain('StringKeyword');
		});

		it('should reset dependencies', () => {
			const visitor = new BuiltInVisitors.DependencyAnalyzer();

			// Add a dependency
			visitor.visitType!(builder.createTypeReference('Test'));

			expect(visitor.getDependencies()).toContain('Test');

			// Reset
			visitor.reset();

			expect(visitor.getDependencies()).toHaveLength(0);
		});
	});

	describe('DocumentationExtractor', () => {
		it('should extract documentation from nodes', async () => {
			const visitor = new BuiltInVisitors.DocumentationExtractor();

			const interface_ = builder.createInterface('Patient', {
				documentation: 'FHIR Patient resource'
			});

			const property = builder.createProperty('id', builder.createStringType(), {
				documentation: 'Unique identifier'
			});

			await visitor.visit!(interface_);
			await visitor.visit!(property);

			const documentation = visitor.getDocumentation();

			expect(Object.values(documentation)).toContain('FHIR Patient resource');
			expect(Object.values(documentation)).toContain('Unique identifier');
		});

		it('should reset documentation', () => {
			const visitor = new BuiltInVisitors.DocumentationExtractor();

			// Add documentation
			const interface_ = builder.createInterface('Test', {
				documentation: 'Test documentation'
			});
			visitor.visit!(interface_);

			expect(Object.keys(visitor.getDocumentation()).length).toBeGreaterThan(0);

			// Reset
			visitor.reset();

			expect(Object.keys(visitor.getDocumentation()).length).toBe(0);
		});
	});
});

describe('Integration Tests', () => {
	let engine: VisitorEngine;
	let builder: ASTBuilder;

	beforeEach(() => {
		engine = new VisitorEngine();
		builder = new ASTBuilder();
	});

	it('should execute complete visitor pipeline', async () => {
		// Create statistics collector
		const statsVisitor = new BuiltInVisitors.StatisticsVisitor();
		
		// Create dependency analyzer
		const depAnalyzer = new BuiltInVisitors.DependencyAnalyzer();
		
		// Create documentation extractor
		const docExtractor = new BuiltInVisitors.DocumentationExtractor();

		// Create Python code generator
		const pythonVisitor = LanguageVisitors.createPythonClassVisitor();

		engine.registerVisitors([statsVisitor, depAnalyzer, docExtractor, pythonVisitor]);

		// Create complex FHIR interface
		const properties = [
			builder.createProperty('resourceType', builder.createLiteralType('Patient')),
			builder.createProperty('identifier', builder.createArrayType(builder.createTypeReference('Identifier')), { 
				optional: true,
				documentation: 'Patient identifiers' 
			}),
			builder.createProperty('name', builder.createArrayType(builder.createTypeReference('HumanName')), { 
				optional: true,
				documentation: 'Patient names' 
			}),
			builder.createProperty('active', builder.createBooleanType(), { 
				optional: true,
				documentation: 'Whether patient record is active' 
			})
		];

		const baseType = builder.createTypeReference('DomainResource');
		const interface_ = builder.createInterface('Patient', {
			extends: [baseType],
			properties,
			exported: true,
			documentation: 'FHIR Patient resource'
		});

		// Execute all visitors
		const result = await engine.execute(interface_, {
			languageTarget: 'python',
			enableStatistics: true
		});

		expect(result.success).toBe(true);

		// Validate statistics
		const stats = statsVisitor.getStatistics();
		expect(stats.interfaces).toBeGreaterThan(0);
		expect(stats.properties).toBeGreaterThan(0);

		// Validate dependencies
		const dependencies = depAnalyzer.getDependencies();
		expect(dependencies).toContain('DomainResource');
		expect(dependencies).toContain('Identifier');
		expect(dependencies).toContain('HumanName');

		// Validate documentation
		const documentation = docExtractor.getDocumentation();
		expect(Object.values(documentation)).toContain('FHIR Patient resource');

		// Validate Python generation
		const pythonCode = result.results.get('PythonClassVisitor_' + interface_.id);
		expect(pythonCode).toContain('class Patient:');
		expect(pythonCode).toContain('self.identifier: List[Identifier] | None = None');
		expect(pythonCode).toContain('self.name: List[HumanName] | None = None');
		expect(pythonCode).toContain('self.active: bool | None = None');
	});

	it('should handle multi-language visitor execution', async () => {
		// Create language-specific visitors
		const tsVisitor: Visitor = {
			name: 'TypeScriptGenerator',
			languageTarget: 'typescript',
			visitInterface: async (node: InterfaceDeclaration) => {
				return `export interface ${node.name} {}`;
			}
		};

		const pythonVisitor = LanguageVisitors.createPythonClassVisitor();
		const javaVisitor = LanguageVisitors.createJavaClassVisitor();

		engine.registerVisitors([tsVisitor, pythonVisitor, javaVisitor]);

		const interface_ = builder.createInterface('Patient');

		// Execute for TypeScript
		const tsResult = await engine.execute(interface_, {
			languageTarget: 'typescript'
		});

		// Execute for Python
		const pyResult = await engine.execute(interface_, {
			languageTarget: 'python'
		});

		// Execute for Java
		const javaResult = await engine.execute(interface_, {
			languageTarget: 'java'
		});

		// Validate results
		expect(tsResult.success).toBe(true);
		expect(tsResult.results.get('TypeScriptGenerator_' + interface_.id)).toContain('export interface Patient');

		expect(pyResult.success).toBe(true);
		expect(pyResult.results.get('PythonClassVisitor_' + interface_.id)).toContain('class Patient:');

		expect(javaResult.success).toBe(true);
		expect(javaResult.results.get('JavaClassVisitor_' + interface_.id)).toContain('public class Patient {');
	});
});