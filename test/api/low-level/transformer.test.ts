/**
 * Transformer System Tests
 * 
 * Tests for the custom transformer system including transformation engines,
 * pipeline builders, built-in transformers, and middleware.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	TransformationEngine,
	TransformationPipelineBuilder,
	BuiltInTransformers,
	BuiltInMiddleware,
	type Transformer,
	type TransformerMiddleware,
	type TransformationContext,
	type TransformationResult
} from '../../../src/api/low-level/transformer';
import { ASTBuilder, type InterfaceDeclaration, type PropertySignature, type ASTNode } from '../../../src/api/low-level/ast';

describe('TransformationEngine', () => {
	let engine: TransformationEngine;
	let builder: ASTBuilder;

	beforeEach(() => {
		engine = new TransformationEngine();
		builder = new ASTBuilder();
	});

	describe('Transformer Registration', () => {
		it('should register transformer', () => {
			const transformer: Transformer = {
				name: 'TestTransformer',
				canTransform: () => true,
				transform: async (node) => node
			};

			engine.registerTransformer(transformer);
			const retrieved = engine.getTransformer('TestTransformer');

			expect(retrieved).toBe(transformer);
		});

		it('should register multiple transformers', () => {
			const transformers: Transformer[] = [
				{
					name: 'Transformer1',
					canTransform: () => true,
					transform: async (node) => node
				},
				{
					name: 'Transformer2',
					canTransform: () => true,
					transform: async (node) => node
				}
			];

			engine.registerTransformers(transformers);

			expect(engine.getTransformer('Transformer1')).toBe(transformers[0]);
			expect(engine.getTransformer('Transformer2')).toBe(transformers[1]);
		});

		it('should unregister transformer', () => {
			const transformer: Transformer = {
				name: 'TestTransformer',
				canTransform: () => true,
				transform: async (node) => node
			};

			engine.registerTransformer(transformer);
			const unregistered = engine.unregisterTransformer('TestTransformer');

			expect(unregistered).toBe(true);
			expect(engine.getTransformer('TestTransformer')).toBeUndefined();
		});

		it('should get all transformers', () => {
			const transformer1: Transformer = {
				name: 'Transformer1',
				canTransform: () => true,
				transform: async (node) => node
			};
			const transformer2: Transformer = {
				name: 'Transformer2',
				canTransform: () => true,
				transform: async (node) => node
			};

			engine.registerTransformers([transformer1, transformer2]);
			const all = engine.getAllTransformers();

			expect(all).toHaveLength(2);
			expect(all).toContain(transformer1);
			expect(all).toContain(transformer2);
		});
	});

	describe('Middleware Management', () => {
		it('should add middleware', () => {
			const middleware: TransformerMiddleware = {
				name: 'TestMiddleware',
				before: async () => {}
			};

			engine.addMiddleware(middleware);
			// No direct getter, but we can test via transformation
		});

		it('should remove middleware', () => {
			const middleware: TransformerMiddleware = {
				name: 'TestMiddleware',
				before: async () => {}
			};

			engine.addMiddleware(middleware);
			const removed = engine.removeMiddleware('TestMiddleware');

			expect(removed).toBe(true);
		});

		it('should return false when removing non-existent middleware', () => {
			const removed = engine.removeMiddleware('NonExistent');

			expect(removed).toBe(false);
		});
	});

	describe('Transformation Execution', () => {
		it('should execute transformation', async () => {
			const transformer: Transformer = {
				name: 'TestTransformer',
				canTransform: (node) => node.kind === 'InterfaceDeclaration',
				transform: async (node) => {
					const cloned = { ...node } as InterfaceDeclaration;
					cloned.name = 'Transformed' + cloned.name;
					return cloned;
				}
			};

			engine.registerTransformer(transformer);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.transform(interface_);

			expect(result.success).toBe(true);
			expect((result.transformedNode as InterfaceDeclaration).name).toBe('TransformedPatient');
		});

		it('should skip non-applicable transformers', async () => {
			const transformer: Transformer = {
				name: 'PropertyTransformer',
				canTransform: (node) => node.kind === 'PropertySignature',
				transform: async (node) => {
					const cloned = { ...node } as PropertySignature;
					cloned.name = 'transformed' + cloned.name;
					return cloned;
				}
			};

			engine.registerTransformer(transformer);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.transform(interface_);

			expect(result.success).toBe(true);
			expect((result.transformedNode as InterfaceDeclaration).name).toBe('Patient'); // Unchanged
		});

		it('should execute transformers by priority', async () => {
			const transformer1: Transformer = {
				name: 'LowPriority',
				priority: 1,
				canTransform: () => true,
				transform: async (node) => {
					const cloned = { ...node } as InterfaceDeclaration;
					cloned.name = cloned.name + '_Low';
					return cloned;
				}
			};

			const transformer2: Transformer = {
				name: 'HighPriority',
				priority: 10,
				canTransform: () => true,
				transform: async (node) => {
					const cloned = { ...node } as InterfaceDeclaration;
					cloned.name = cloned.name + '_High';
					return cloned;
				}
			};

			engine.registerTransformers([transformer1, transformer2]);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.transform(interface_);

			expect(result.success).toBe(true);
			// High priority should execute first, then low priority
			expect((result.transformedNode as InterfaceDeclaration).name).toBe('Patient_High_Low');
		});

		it('should execute specific transformers only', async () => {
			const transformer1: Transformer = {
				name: 'Transformer1',
				canTransform: () => true,
				transform: async (node) => {
					const cloned = { ...node } as InterfaceDeclaration;
					cloned.name = cloned.name + '_1';
					return cloned;
				}
			};

			const transformer2: Transformer = {
				name: 'Transformer2',
				canTransform: () => true,
				transform: async (node) => {
					const cloned = { ...node } as InterfaceDeclaration;
					cloned.name = cloned.name + '_2';
					return cloned;
				}
			};

			engine.registerTransformers([transformer1, transformer2]);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.transform(interface_, {
				transformers: ['Transformer1']
			});

			expect(result.success).toBe(true);
			expect((result.transformedNode as InterfaceDeclaration).name).toBe('Patient_1');
		});
	});

	describe('Error Handling', () => {
		it('should handle transformer errors gracefully', async () => {
			const transformer: Transformer = {
				name: 'FailingTransformer',
				canTransform: () => true,
				transform: async () => {
					throw new Error('Transformation failed');
				}
			};

			engine.registerTransformer(transformer);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.transform(interface_);

			expect(result.success).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].message).toContain('Transformation failed');
		});

		it('should continue on error when configured', async () => {
			const failingTransformer: Transformer = {
				name: 'FailingTransformer',
				priority: 10,
				canTransform: () => true,
				transform: async () => {
					throw new Error('Transformation failed');
				}
			};

			const workingTransformer: Transformer = {
				name: 'WorkingTransformer',
				priority: 5,
				canTransform: () => true,
				transform: async (node) => {
					const cloned = { ...node } as InterfaceDeclaration;
					cloned.name = 'Working' + cloned.name;
					return cloned;
				}
			};

			engine.registerTransformers([failingTransformer, workingTransformer]);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.transform(interface_, {
				continueOnError: true
			});

			expect(result.success).toBe(false); // Has errors
			expect(result.errors).toHaveLength(1);
			expect((result.transformedNode as InterfaceDeclaration).name).toBe('WorkingPatient');
		});
	});

	describe('Middleware Execution', () => {
		it('should execute before middleware', async () => {
			let beforeCalled = false;
			const middleware: TransformerMiddleware = {
				name: 'TestMiddleware',
				before: async () => {
					beforeCalled = true;
				}
			};

			engine.addMiddleware(middleware);

			const interface_ = builder.createInterface('Patient');
			await engine.transform(interface_);

			expect(beforeCalled).toBe(true);
		});

		it('should execute after middleware', async () => {
			let afterCalled = false;
			const middleware: TransformerMiddleware = {
				name: 'TestMiddleware',
				after: async () => {
					afterCalled = true;
				}
			};

			engine.addMiddleware(middleware);

			const interface_ = builder.createInterface('Patient');
			await engine.transform(interface_);

			expect(afterCalled).toBe(true);
		});

		it('should execute error middleware on transformer failure', async () => {
			let errorHandled = false;
			const middleware: TransformerMiddleware = {
				name: 'ErrorMiddleware',
				onError: async () => {
					errorHandled = true;
				}
			};

			const transformer: Transformer = {
				name: 'FailingTransformer',
				canTransform: () => true,
				transform: async () => {
					throw new Error('Test error');
				}
			};

			engine.addMiddleware(middleware);
			engine.registerTransformer(transformer);

			const interface_ = builder.createInterface('Patient');
			await engine.transform(interface_);

			expect(errorHandled).toBe(true);
		});
	});

	describe('Validation', () => {
		it('should validate transformation results', async () => {
			const transformer: Transformer = {
				name: 'ValidatingTransformer',
				canTransform: () => true,
				transform: async (node) => {
					const cloned = { ...node } as InterfaceDeclaration;
					cloned.name = 'Valid' + cloned.name;
					return cloned;
				},
				validate: async (node) => {
					return (node as InterfaceDeclaration).name.startsWith('Valid');
				}
			};

			engine.registerTransformer(transformer);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.transform(interface_, {
				validateResults: true
			});

			expect(result.success).toBe(true);
			expect((result.transformedNode as InterfaceDeclaration).name).toBe('ValidPatient');
		});

		it('should fail validation when transformer produces invalid result', async () => {
			const transformer: Transformer = {
				name: 'InvalidatingTransformer',
				canTransform: () => true,
				transform: async (node) => {
					const cloned = { ...node } as InterfaceDeclaration;
					cloned.name = 'Invalid' + cloned.name;
					return cloned;
				},
				validate: async (node) => {
					return (node as InterfaceDeclaration).name.startsWith('Valid');
				}
			};

			engine.registerTransformer(transformer);

			const interface_ = builder.createInterface('Patient');
			const result = await engine.transform(interface_, {
				validateResults: true,
				continueOnError: true
			});

			expect(result.success).toBe(false);
			expect(result.errors.some(e => e.code === 'VALIDATION_FAILED')).toBe(true);
		});
	});
});

describe('TransformationPipelineBuilder', () => {
	let builder: TransformationPipelineBuilder;

	beforeEach(() => {
		builder = new TransformationPipelineBuilder();
	});

	it('should build pipeline with transformers', () => {
		const transformer: Transformer = {
			name: 'TestTransformer',
			canTransform: () => true,
			transform: async (node) => node
		};

		const config = builder
			.addTransformer(transformer)
			.build();

		expect(config.transformers).toHaveLength(1);
		expect(config.transformers[0]).toBe(transformer);
	});

	it('should build pipeline with middleware', () => {
		const middleware: TransformerMiddleware = {
			name: 'TestMiddleware',
			before: async () => {}
		};

		const config = builder
			.addMiddleware(middleware)
			.build();

		expect(config.middleware).toHaveLength(1);
		expect(config.middleware[0]).toBe(middleware);
	});

	it('should build pipeline with options', () => {
		const config = builder
			.parallel(true)
			.continueOnError(true)
			.validateResults(false)
			.setOptions({ custom: 'value' })
			.build();

		expect(config.parallel).toBe(true);
		expect(config.continueOnError).toBe(true);
		expect(config.validateResults).toBe(false);
		expect(config.options.custom).toBe('value');
	});

	it('should add multiple transformers', () => {
		const transformers: Transformer[] = [
			{
				name: 'Transformer1',
				canTransform: () => true,
				transform: async (node) => node
			},
			{
				name: 'Transformer2',
				canTransform: () => true,
				transform: async (node) => node
			}
		];

		const config = builder
			.addTransformers(transformers)
			.build();

		expect(config.transformers).toHaveLength(2);
		expect(config.transformers).toEqual(transformers);
	});
});

describe('BuiltInTransformers', () => {
	let astBuilder: ASTBuilder;

	beforeEach(() => {
		astBuilder = new ASTBuilder();
	});

	describe('PropertyTransformer', () => {
		it('should transform interface properties', async () => {
			const transformer = new BuiltInTransformers.PropertyTransformer(
				(property) => {
					const cloned = { ...property };
					cloned.name = 'transformed_' + cloned.name;
					return cloned;
				}
			);

			const property = astBuilder.createProperty('name', astBuilder.createStringType());
			const interface_ = astBuilder.createInterface('Patient', {
				properties: [property]
			});

			const canTransform = transformer.canTransform(interface_);
			expect(canTransform).toBe(true);

			const result = await transformer.transform(interface_) as InterfaceDeclaration;
			expect(result.properties[0].name).toBe('transformed_name');
		});

		it('should filter out null properties', async () => {
			const transformer = new BuiltInTransformers.PropertyTransformer(
				(property) => property.name === 'keep' ? property : null
			);

			const keepProperty = astBuilder.createProperty('keep', astBuilder.createStringType());
			const removeProperty = astBuilder.createProperty('remove', astBuilder.createStringType());
			const interface_ = astBuilder.createInterface('Patient', {
				properties: [keepProperty, removeProperty]
			});

			const result = await transformer.transform(interface_) as InterfaceDeclaration;
			expect(result.properties).toHaveLength(1);
			expect(result.properties[0].name).toBe('keep');
		});
	});

	describe('InterfaceRenameTransformer', () => {
		it('should rename interface', async () => {
			const transformer = new BuiltInTransformers.InterfaceRenameTransformer(
				(name) => 'Renamed' + name
			);

			const interface_ = astBuilder.createInterface('Patient');

			const canTransform = transformer.canTransform(interface_);
			expect(canTransform).toBe(true);

			const result = await transformer.transform(interface_) as InterfaceDeclaration;
			expect(result.name).toBe('RenamedPatient');
		});
	});

	describe('TypeMappingTransformer', () => {
		it('should map types according to mapping rules', async () => {
			const transformer = new BuiltInTransformers.TypeMappingTransformer({
				'OldType': 'NewType',
				'AnotherOldType': 'AnotherNewType'
			});

			const property = astBuilder.createProperty('ref', astBuilder.createTypeReference('OldType'));
			const interface_ = astBuilder.createInterface('Patient', {
				properties: [property]
			});

			const mockContext: TransformationContext = {
				id: 'test',
				sourceNode: interface_,
				metadata: {},
				options: {},
				errors: [],
				warnings: [],
				statistics: {
					startTime: Date.now(),
					nodesProcessed: 0,
					transformersApplied: 0,
					errorsCount: 0,
					warningsCount: 0
				}
			};

			const result = await transformer.transform(interface_, mockContext) as InterfaceDeclaration;
			const typeRef = result.properties[0].type as any;
			expect(typeRef.name).toBe('NewType');
		});
	});

	describe('DocumentationTransformer', () => {
		it('should add documentation to nodes', async () => {
			const transformer = new BuiltInTransformers.DocumentationTransformer(
				(node) => node.kind === 'InterfaceDeclaration' ? 'Generated documentation' : null
			);

			const interface_ = astBuilder.createInterface('Patient');

			const canTransform = transformer.canTransform(interface_);
			expect(canTransform).toBe(true);

			const result = await transformer.transform(interface_) as InterfaceDeclaration;
			expect(result.metadata?.documentation).toBe('Generated documentation');
		});

		it('should work with properties', async () => {
			const transformer = new BuiltInTransformers.DocumentationTransformer(
				(node) => node.kind === 'PropertySignature' ? 'Property documentation' : null
			);

			const property = astBuilder.createProperty('name', astBuilder.createStringType());

			const canTransform = transformer.canTransform(property);
			expect(canTransform).toBe(true);

			const result = await transformer.transform(property) as PropertySignature;
			expect(result.metadata?.documentation).toBe('Property documentation');
		});
	});
});

describe('BuiltInMiddleware', () => {
	describe('LoggingMiddleware', () => {
		it('should log before transformation', async () => {
			const logs: string[] = [];
			const middleware = new BuiltInMiddleware.LoggingMiddleware((msg) => logs.push(msg));

			const interface_ = builder.createInterface('Patient');
			const context: TransformationContext = {
				id: 'test',
				sourceNode: interface_,
				metadata: {},
				options: {},
				errors: [],
				warnings: [],
				statistics: {
					startTime: Date.now(),
					nodesProcessed: 0,
					transformersApplied: 0,
					errorsCount: 0,
					warningsCount: 0
				}
			};

			await middleware.before!(interface_, context);

			expect(logs).toHaveLength(1);
			expect(logs[0]).toContain('[test]');
			expect(logs[0]).toContain('InterfaceDeclaration');
		});

		it('should log after transformation', async () => {
			const logs: string[] = [];
			const middleware = new BuiltInMiddleware.LoggingMiddleware((msg) => logs.push(msg));

			const interface_ = builder.createInterface('Patient');
			const context: TransformationContext = {
				id: 'test',
				sourceNode: interface_,
				metadata: {},
				options: {},
				errors: [],
				warnings: [],
				statistics: {
					startTime: Date.now(),
					duration: 100,
					nodesProcessed: 0,
					transformersApplied: 0,
					errorsCount: 0,
					warningsCount: 0
				}
			};

			await middleware.after!(interface_, context);

			expect(logs).toHaveLength(1);
			expect(logs[0]).toContain('[test]');
			expect(logs[0]).toContain('100ms');
		});
	});

	describe('StatisticsMiddleware', () => {
		it('should collect statistics', async () => {
			const middleware = new BuiltInMiddleware.StatisticsMiddleware();

			const interface_ = builder.createInterface('Patient');
			const context: TransformationContext = {
				id: 'test',
				sourceNode: interface_,
				metadata: {},
				options: {},
				errors: [],
				warnings: [],
				statistics: {
					startTime: Date.now(),
					duration: 50,
					nodesProcessed: 1,
					transformersApplied: 1,
					errorsCount: 0,
					warningsCount: 0
				}
			};

			await middleware.after!(interface_, context);

			const stats = middleware.getStatistics();
			expect(stats.has('InterfaceDeclaration')).toBe(true);
			
			const interfaceStats = stats.get('InterfaceDeclaration');
			expect(interfaceStats.totalTransformations).toBe(1);
			expect(interfaceStats.totalDuration).toBe(50);
		});

		it('should reset statistics', () => {
			const middleware = new BuiltInMiddleware.StatisticsMiddleware();

			// Manually set some data
			const stats = middleware.getStatistics();
			stats.set('test', { totalTransformations: 1, totalDuration: 100, successRate: 1, errorCount: 0 });

			middleware.resetStatistics();

			expect(middleware.getStatistics().size).toBe(0);
		});
	});

	describe('ValidationMiddleware', () => {
		it('should validate AST after transformation', async () => {
			const middleware = new BuiltInMiddleware.ValidationMiddleware();

			const interface_ = builder.createInterface('Patient');
			const context: TransformationContext = {
				id: 'test',
				sourceNode: interface_,
				metadata: {},
				options: {},
				errors: [],
				warnings: [],
				statistics: {
					startTime: Date.now(),
					nodesProcessed: 0,
					transformersApplied: 0,
					errorsCount: 0,
					warningsCount: 0
				}
			};

			await middleware.after!(interface_, context);

			// Should not add errors for valid interface
			expect(context.errors).toHaveLength(0);
		});

		it('should detect validation errors', async () => {
			const middleware = new BuiltInMiddleware.ValidationMiddleware();

			// Create invalid interface (missing name)
			const interface_ = builder.createInterface('Patient');
			(interface_ as any).name = null;

			const context: TransformationContext = {
				id: 'test',
				sourceNode: interface_,
				metadata: {},
				options: {},
				errors: [],
				warnings: [],
				statistics: {
					startTime: Date.now(),
					nodesProcessed: 0,
					transformersApplied: 0,
					errorsCount: 0,
					warningsCount: 0
				}
			};

			await middleware.after!(interface_, context);

			expect(context.errors.length).toBeGreaterThan(0);
			expect(context.errors.some(e => e.code === 'VALIDATION_ERROR')).toBe(true);
		});
	});
});

describe('Integration Tests', () => {
	let engine: TransformationEngine;
	let builder: ASTBuilder;

	beforeEach(() => {
		engine = new TransformationEngine();
		builder = new ASTBuilder();
	});

	it('should execute complete transformation pipeline', async () => {
		// Create logging middleware
		const logs: string[] = [];
		const loggingMiddleware = new BuiltInMiddleware.LoggingMiddleware((msg) => logs.push(msg));

		// Create statistics middleware
		const statsMiddleware = new BuiltInMiddleware.StatisticsMiddleware();

		// Create transformers
		const renameTransformer = new BuiltInTransformers.InterfaceRenameTransformer(
			(name) => 'FHIR' + name
		);

		const propertyTransformer = new BuiltInTransformers.PropertyTransformer(
			(property) => {
				const cloned = { ...property };
				if (cloned.name === 'id') {
					cloned.optional = false; // Make ID required
				}
				return cloned;
			}
		);

		const documentationTransformer = new BuiltInTransformers.DocumentationTransformer(
			(node) => node.kind === 'InterfaceDeclaration' ? 'Auto-generated FHIR resource' : null
		);

		// Register all components
		engine.addMiddleware(loggingMiddleware);
		engine.addMiddleware(statsMiddleware);
		engine.registerTransformers([renameTransformer, propertyTransformer, documentationTransformer]);

		// Create test interface
		const idProperty = builder.createProperty('id', builder.createStringType(), { optional: true });
		const nameProperty = builder.createProperty('name', builder.createStringType());
		const interface_ = builder.createInterface('Patient', {
			properties: [idProperty, nameProperty]
		});

		// Execute transformation
		const result = await engine.transform(interface_, {
			validateResults: true
		});

		// Validate results
		expect(result.success).toBe(true);
		expect((result.transformedNode as InterfaceDeclaration).name).toBe('FHIRPatient');
		expect(result.transformedNode?.metadata?.documentation).toBe('Auto-generated FHIR resource');

		// Check property transformation
		const transformedInterface = result.transformedNode as InterfaceDeclaration;
		const transformedIdProperty = transformedInterface.properties.find(p => p.name === 'id');
		expect(transformedIdProperty?.optional).toBe(false);

		// Check middleware execution
		expect(logs.length).toBeGreaterThan(0);
		expect(logs.some(log => log.includes('Starting transformation'))).toBe(true);
		expect(logs.some(log => log.includes('Completed transformation'))).toBe(true);

		// Check statistics
		const stats = statsMiddleware.getStatistics();
		expect(stats.has('InterfaceDeclaration')).toBe(true);
	});

	it('should handle complex FHIR transformation scenario', async () => {
		// Create type mapping for FHIR types
		const typeMappingTransformer = new BuiltInTransformers.TypeMappingTransformer({
			'string': 'FHIRString',
			'number': 'FHIRDecimal',
			'boolean': 'FHIRBoolean'
		});

		// Create FHIR documentation transformer
		const fhirDocTransformer = new BuiltInTransformers.DocumentationTransformer(
			(node) => {
				if (node.kind === 'InterfaceDeclaration') {
					const interface_ = node as InterfaceDeclaration;
					return `FHIR ${interface_.name} resource - auto-generated from schema`;
				}
				if (node.kind === 'PropertySignature') {
					const property = node as PropertySignature;
					return `${property.name} field - FHIR compliant`;
				}
				return null;
			}
		);

		engine.registerTransformers([typeMappingTransformer, fhirDocTransformer]);

		// Create complex interface with various types
		const properties = [
			builder.createProperty('id', builder.createTypeReference('string'), { optional: true }),
			builder.createProperty('active', builder.createTypeReference('boolean'), { optional: true }),
			builder.createProperty('multipleBirth', builder.createUnionType([
				builder.createTypeReference('boolean'),
				builder.createTypeReference('number')
			]), { optional: true })
		];

		const baseType = builder.createTypeReference('Resource');
		const patientInterface = builder.createInterface('Patient', {
			extends: [baseType],
			properties,
			exported: true
		});

		const result = await engine.transform(patientInterface);

		expect(result.success).toBe(true);
		expect(result.transformedNode?.metadata?.documentation).toContain('FHIR Patient resource');

		// Check type mapping
		const transformedInterface = result.transformedNode as InterfaceDeclaration;
		const idProperty = transformedInterface.properties.find(p => p.name === 'id');
		expect((idProperty?.type as any).name).toBe('FHIRString');
	});
});

// Helper function to create a basic builder instance for tests that need it
let builder: ASTBuilder;

beforeEach(() => {
	builder = new ASTBuilder();
});