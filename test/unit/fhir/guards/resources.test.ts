/**
 * Unit tests for FHIR Resource Type Guards
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	generateResourceTypeGuards,
	generateComplexTypeGuards,
	generateNestedTypeGuards,
} from '../../../../src/fhir/generators/typescript/guards';
import type {
	GuardGenerationContext,
	GuardGenerationOptions,
} from '../../../../src/fhir/generators/typescript/guards';
import type { AnyTypeSchema } from '../../../../src/typeschema/types';

describe('FHIR Resource Type Guards', () => {
	let context: GuardGenerationContext;
	let mockSchemas: AnyTypeSchema[];

	beforeEach(() => {
		const options: GuardGenerationOptions = {
			includeRuntimeValidation: true,
			includeErrorMessages: true,
			treeShakeable: true,
			strict: false,
			includeNullChecks: true,
		};

		context = {
			schemas: [],
			options,
			guardCache: new Map(),
			processing: new Set(),
		};

		mockSchemas = [
			testUtils.schema.createPatient(),
			testUtils.schema.createWithFields('Observation', {
				status: {
					type: { name: 'code', kind: 'primitive-type', url: 'http://hl7.org/fhir/code', package: 'hl7.fhir.r4.core', version: '4.0.1' },
					enum: ['registered', 'preliminary', 'final'],
					required: true,
				},
				subject: {
					reference: [{ name: 'Patient', kind: 'resource', url: 'http://hl7.org/fhir/Patient', package: 'hl7.fhir.r4.core', version: '4.0.1' }],
					required: false,
				}
			})
		];

		context.schemas = mockSchemas;
	});

	describe('generateResourceTypeGuards', () => {
		it('should generate guards for all resource schemas', () => {
			const result = generateResourceTypeGuards(mockSchemas, context);
			
			expect(result.guardCode).toBeDefined();
			expect(result.typeDefinitions).toBeDefined();
			expect(result.imports).toBeInstanceOf(Array);
			expect(result.dependencies).toBeInstanceOf(Array);
		});

		it('should generate valid TypeScript guard functions', () => {
			const result = generateResourceTypeGuards([mockSchemas[0]], context);
			
			// Should contain a guard function
			expect(result.guardCode).toContain('function isPatient');
			expect(result.guardCode).toContain('value is Patient');
			expect(result.guardCode).toContain('resourceType');
			
			// Should validate basic structure
			testUtils.validation.assertValidTypeScript(result.guardCode);
		});

		it('should handle schemas with required fields', () => {
			const observationSchema = mockSchemas[1];
			const result = generateResourceTypeGuards([observationSchema], context);
			
			// Should validate required status field
			expect(result.guardCode).toContain('status');
			expect(result.guardCode).toContain('required');
		});

		it('should handle schemas with optional fields', () => {
			const patientSchema = mockSchemas[0];
			const result = generateResourceTypeGuards([patientSchema], context);
			
			// Should handle optional fields gracefully
			expect(result.guardCode).toContain('undefined');
		});

		it('should handle array fields', () => {
			const result = generateResourceTypeGuards([mockSchemas[0]], context);
			
			// Patient has array field 'name'
			expect(result.guardCode).toContain('Array.isArray');
		});

		it('should handle enum fields', () => {
			const result = generateResourceTypeGuards([mockSchemas[0]], context);
			
			// Patient has gender enum
			expect(result.guardCode).toContain('male');
			expect(result.guardCode).toContain('female');
		});

		it('should generate type definitions for guard functions', () => {
			const result = generateResourceTypeGuards([mockSchemas[0]], context);
			
			expect(result.typeDefinitions).toContain('RequiredPatientFields');
			expect(result.typeDefinitions).toContain('OptionalPatientFields');
			expect(result.typeDefinitions).toContain('PatientTypeGuard');
		});

		it('should use guard cache to avoid duplicate generation', () => {
			const schema = mockSchemas[0];
			
			// First generation
			const result1 = generateResourceTypeGuards([schema], context);
			expect(context.guardCache.size).toBeGreaterThan(0);
			
			// Second generation should use cache
			const result2 = generateResourceTypeGuards([schema], context);
			expect(result2.guardCode).toContain('already generated');
		});

		it('should detect circular dependencies', () => {
			const circularSchema: AnyTypeSchema = {
				identifier: { name: 'CircularTest', kind: 'resource', url: 'http://test.com/CircularTest', package: 'test', version: '1.0.0' },
				description: 'Test circular dependency',
				fields: {
					self: {
						reference: [{ name: 'CircularTest', kind: 'resource', url: 'http://test.com/CircularTest', package: 'test', version: '1.0.0' }],
						required: false
					}
				}
			};

			// Manually trigger processing state to simulate circular dependency
			context.processing.add('resource:CircularTest');
			
			const result = generateResourceTypeGuards([circularSchema], context);
			expect(result.guardCode).toContain('circular dependency');
		});
	});

	describe('generateComplexTypeGuards', () => {
		it('should generate guards for complex types only', () => {
			const complexTypeSchema: AnyTypeSchema = {
				identifier: { name: 'HumanName', kind: 'complex-type', url: 'http://hl7.org/fhir/HumanName', package: 'hl7.fhir.r4.core', version: '4.0.1' },
				description: 'A human name',
				fields: {
					family: {
						type: { name: 'string', kind: 'primitive-type', url: 'http://hl7.org/fhir/string', package: 'hl7.fhir.r4.core', version: '4.0.1' },
						required: false
					},
					given: {
						type: { name: 'string', kind: 'primitive-type', url: 'http://hl7.org/fhir/string', package: 'hl7.fhir.r4.core', version: '4.0.1' },
						array: true,
						required: false
					}
				}
			};

			const result = generateComplexTypeGuards([complexTypeSchema], context);
			
			expect(result.guardCode).toContain('function isHumanName');
			expect(result.guardCode).not.toContain('resourceType'); // Complex types don't have resourceType
		});

		it('should filter out non-complex-type schemas', () => {
			const mixedSchemas = [
				mockSchemas[0], // Patient resource
				{
					identifier: { name: 'HumanName', kind: 'complex-type', url: 'http://hl7.org/fhir/HumanName', package: 'hl7.fhir.r4.core', version: '4.0.1' },
					description: 'A human name',
					fields: {}
				}
			];

			const result = generateComplexTypeGuards(mixedSchemas, context);
			
			// Should only generate for complex type
			expect(result.guardCode).toContain('HumanName');
			expect(result.guardCode).not.toContain('Patient');
		});
	});

	describe('performance characteristics', () => {
		it('should generate guards within performance threshold', async () => {
			const largeSchemaCollection = Array.from({ length: 10 }, (_, i) =>
				testUtils.schema.createWithFields(`TestResource${i}`, {
					field1: { type: { name: 'string', kind: 'primitive-type', url: 'http://hl7.org/fhir/string', package: 'test', version: '1.0.0' }, required: false },
					field2: { type: { name: 'boolean', kind: 'primitive-type', url: 'http://hl7.org/fhir/boolean', package: 'test', version: '1.0.0' }, required: true },
					field3: { type: { name: 'integer', kind: 'primitive-type', url: 'http://hl7.org/fhir/integer', package: 'test', version: '1.0.0' }, array: true, required: false }
				})
			);

			context.schemas = largeSchemaCollection;

			await testUtils.performance.assertPerformance(
				'Resource guard generation for 10 schemas',
				async () => generateResourceTypeGuards(largeSchemaCollection, context),
				TEST_CONFIG.PERFORMANCE_THRESHOLDS.CODE_GENERATION
			);
		});

		it('should produce reasonably sized output', () => {
			const result = generateResourceTypeGuards(mockSchemas, context);
			
			// Generated code shouldn't be excessively large
			const codeSize = Buffer.byteLength(result.guardCode, 'utf8');
			const typesSize = Buffer.byteLength(result.typeDefinitions, 'utf8');
			
			expect(codeSize).toBeLessThan(100000); // Less than 100KB for 2 schemas
			expect(typesSize).toBeLessThan(50000);  // Less than 50KB for type definitions
		});
	});

	describe('error handling', () => {
		it('should handle schemas without fields', () => {
			const minimalSchema = testUtils.schema.createMinimal('MinimalResource');
			
			const result = generateResourceTypeGuards([minimalSchema], context);
			
			expect(result.guardCode).toBeDefined();
			expect(result.guardCode).toContain('MinimalResource');
		});

		it('should handle invalid field configurations gracefully', () => {
			const invalidSchema: AnyTypeSchema = {
				identifier: { name: 'InvalidResource', kind: 'resource', url: 'http://test.com/InvalidResource', package: 'test', version: '1.0.0' },
				description: 'Invalid schema for testing',
				fields: {
					invalidField: {} as any // Invalid field configuration
				}
			};

			expect(() => {
				generateResourceTypeGuards([invalidSchema], context);
			}).not.toThrow();
		});
	});

	describe('snapshot testing', () => {
		it('should generate consistent output for Patient schema', () => {
			const result = generateResourceTypeGuards([mockSchemas[0]], context);
			
			// Test that the generated code structure is consistent
			testUtils.snapshot.maybeUpdate('patient-resource-guard', result.guardCode);
			testUtils.snapshot.maybeUpdate('patient-resource-types', result.typeDefinitions);
		});
	});
});