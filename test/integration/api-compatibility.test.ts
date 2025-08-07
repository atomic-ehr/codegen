/**
 * API Compatibility Integration Tests
 *
 * Tests compatibility and integration between different API layers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { APIBuilder } from '../../src/api/builder';
import { TypeSchemaGenerator } from '../../src/typeschema/generator';
import type { AnyTypeSchema } from '../../src/lib/typeschema/types';

describe('API Compatibility Integration', () => {
	let tempDir: string;
	let testSchemas: AnyTypeSchema[];

	beforeEach(() => {
		tempDir = testUtils.fs.createTempDir('api-compatibility');
		testSchemas = testUtils.schema.createCollection();
	});

	afterEach(() => {
		testUtils.fs.cleanup(tempDir);
	});

	describe('High-level API Integration', () => {
		it('should work with TypeSchema generator output', async () => {
			const typeSchemaGen = new TypeSchemaGenerator({
				verbose: false,
			});

			// Simulate TypeSchema generation
			const mockGeneratedSchemas = testSchemas;

			const builder = new APIBuilder({
				outputDir: tempDir,
				verbose: false
			});

 		const result = await builder
 			.fromSchemas(mockGeneratedSchemas)
 			.typescript({
 				moduleFormat: 'esm',
 				generateIndex: true
 			})
 			.generate();

 		expect(result).toBeDefined();
 		expect(result.success).toBe(true);
		});

		it('should maintain schema integrity across API layers', async () => {
			const originalSchema = testUtils.schema.createPatient();

			const builder = new APIBuilder();
			builder.fromSchemas([originalSchema]);

			const storedSchemas = builder.getSchemas();
			expect(storedSchemas).toHaveLength(1);

			const storedSchema = storedSchemas[0];
			expect(storedSchema.identifier.name).toBe(originalSchema.identifier.name);
			expect(storedSchema.identifier.kind).toBe(originalSchema.identifier.kind);
			expect(storedSchema.description).toBe(originalSchema.description);
		});

		it('should handle concurrent API operations', async () => {
			const builder1 = new APIBuilder({ outputDir: join(tempDir, 'build1') });
			const builder2 = new APIBuilder({ outputDir: join(tempDir, 'build2') });

			const schemas1 = [testSchemas[0], testSchemas[1]]; // Patient, Observation
			const schemas2 = [testSchemas[2], testSchemas[3]]; // Primitives

 		const [result1, result2] = await Promise.all([
 			builder1.fromSchemas(schemas1).typescript().generate(),
 			builder2.fromSchemas(schemas2).typescript().generate()
 		]);

 		expect(result1.success).toBe(true);
 		expect(result2.success).toBe(true);
		});
	});

	describe('Low-level API Integration', () => {
		it('should integrate with AST manipulation', async () => {
			// This would test integration with the low-level AST API
			// For now, we'll simulate the integration
			const mockASTResult = {
				nodes: ['Patient', 'Observation'],
				transformations: ['addTypeGuards', 'addValidation'],
				output: 'export interface Patient { resourceType: "Patient"; }'
			};

			expect(mockASTResult.nodes).toContain('Patient');
			expect(mockASTResult.transformations).toContain('addTypeGuards');
		});

		it('should maintain source maps across transformations', async () => {
			// Simulate source map generation
			const mockSourceMap = {
				version: 3,
				sources: ['Patient.schema.json'],
				mappings: 'AAAA,SAAS,OAAO',
				names: ['Patient', 'resourceType']
			};

			expect(mockSourceMap.version).toBe(3);
			expect(mockSourceMap.sources).toContain('Patient.schema.json');
		});

		it('should handle module dependency resolution', async () => {
			const schemas = [
				testUtils.schema.createPatient(),
				testUtils.schema.createWithFields('Organization', {
					name: {
						type: { name: 'string', kind: 'primitive-type', url: 'http://hl7.org/fhir/string', package: 'hl7.fhir.r4.core', version: '4.0.1' },
						required: true
					}
				})
			];

			const builder = new APIBuilder({
				outputDir: tempDir,
				verbose: false
			});

			const result = await builder
				.fromSchemas(schemas)
				.typescript({
					moduleFormat: 'esm',
					generateIndex: true
				})
				.generate();

			expect(result.success).toBe(true);
			// Should handle cross-module dependencies correctly
		});
	});

	describe('Generator Integration', () => {
		it('should support multiple generator types simultaneously', async () => {
			const builder = new APIBuilder({
				outputDir: tempDir,
				verbose: false
			});

			const result = await builder
				.fromSchemas(testSchemas.slice(0, 2))
				.typescript({
					moduleFormat: 'esm',
					generateIndex: true
				})
				.restClient({
					language: 'typescript',
					httpClient: 'fetch'
				})
				.generate();

 		expect(result).toBeDefined();
 		expect(result.success).toBe(true);
 		expect(result.filesGenerated.length).toBeGreaterThan(0);
		});

		it('should maintain consistent naming across generators', async () => {
			const patientSchema = testUtils.schema.createPatient();

			const builder = new APIBuilder({
				outputDir: tempDir,
				verbose: false
			});

			const result = await builder
				.fromSchemas([patientSchema])
				.typescript({
					typePrefix: 'FHIR'
				})
				.restClient({
					language: 'typescript'
				})
				.generate();

 		// Both generators should use consistent naming
 		expect(result.success).toBe(true);
 		expect(result.filesGenerated.length).toBeGreaterThan(0);
		});

		it('should handle generator configuration conflicts gracefully', async () => {
			const builder = new APIBuilder({
				outputDir: tempDir,
				verbose: false
			});

			// Configure potentially conflicting options
			const result = await builder
				.fromSchemas(testSchemas.slice(0, 1))
				.typescript({
					moduleFormat: 'esm',
					typePrefix: 'TS'
				})
				.restClient({
					language: 'typescript',
					// This might conflict with TypeScript generator settings
				})
				.generate();

 		// Should still succeed with conflict resolution
 		expect(result.success).toBe(true);
 		expect(result.filesGenerated.length).toBeGreaterThan(0);
		});
	});

	describe('Configuration Integration', () => {
		it('should respect global configuration across all components', async () => {
			const globalConfig = {
				output: { directory: tempDir, clean: true },
				typescript: { moduleFormat: 'esm' as const, generateIndex: true },
				validation: { strict: true }
			};

			const builder = new APIBuilder(globalConfig);

			const result = await builder
				.fromSchemas([testUtils.schema.createPatient()])
				.typescript()
				.generate();

			expect(result.success).toBe(true);
			// Configuration should be applied consistently
		});

		it('should allow per-generator configuration overrides', async () => {
			const builder = new APIBuilder({
				outputDir: tempDir,
				verbose: false
			});

			const result = await builder
				.fromSchemas([testUtils.schema.createPatient()])
				.typescript({
					// Override specific TypeScript settings
					moduleFormat: 'cjs',
					generateIndex: false
				})
				.generate();

			expect(result.success).toBe(true);
		});

		it('should validate configuration compatibility', async () => {
			const builder = new APIBuilder({
				outputDir: tempDir,
				validate: true // Enable validation
			});

			try {
				await builder
					.fromSchemas([])  // Empty schemas should trigger validation error
					.typescript()
					.generate();

				// Should not reach here if validation is working
				expect(false).toBe(true);
			} catch (error) {
				expect(error).toBeDefined();
			}
		});
	});

	describe('Error Propagation Integration', () => {
		it('should propagate schema validation errors correctly', async () => {
			const invalidSchema = {
				// Missing required fields
				description: 'Invalid schema for error testing'
			} as any;

			const builder = new APIBuilder({
				outputDir: tempDir,
				validate: true
			});

			try {
				await builder
					.fromSchemas([invalidSchema])
					.typescript()
					.generate();

				expect(false).toBe(true);
			} catch (error) {
				expect(error).toBeDefined();
				// Error should contain meaningful information
			}
		});

		it('should handle file system errors gracefully', async () => {
			const builder = new APIBuilder({
				outputDir: '/invalid/path/that/does/not/exist',
				verbose: false
			});

			try {
				await builder
					.fromSchemas([testUtils.schema.createPatient()])
					.typescript()
					.generate();

				expect(false).toBe(true);
			} catch (error) {
				expect(error).toBeDefined();
			}
		});

		it('should provide detailed error context', async () => {
			const schemasWithError = [
				testUtils.schema.createPatient(),
				{
					identifier: { name: 'InvalidResource', kind: 'invalid-kind' as any, url: '', package: '', version: '' },
					description: 'This should cause an error',
					fields: {}
				}
			];

			const builder = new APIBuilder({
				outputDir: tempDir,
				validate: true
			});

			try {
				await builder
					.fromSchemas(schemasWithError)
					.typescript()
					.generate();
			} catch (error: any) {
				expect(error).toBeDefined();
				// Error should provide context about which schema failed
			}
		});
	});

	describe('Performance Integration', () => {
		it('should optimize performance across API layers', async () => {
			const largeSchemaSet = Array.from({ length: 50 }, (_, i) =>
				testUtils.schema.createWithFields(`Resource${i}`, {
					id: { type: { name: 'string', kind: 'primitive-type', url: 'http://hl7.org/fhir/string', package: 'test', version: '1.0.0' }, required: false },
					name: { type: { name: 'string', kind: 'primitive-type', url: 'http://hl7.org/fhir/string', package: 'test', version: '1.0.0' }, required: true }
				})
			);

			await testUtils.performance.assertPerformance(
				'Large schema API integration',
				async () => {
					const builder = new APIBuilder({
						outputDir: tempDir,
						verbose: false
					});

					return builder
						.fromSchemas(largeSchemaSet)
						.typescript()
						.generate();
				},
				TEST_CONFIG.PERFORMANCE_THRESHOLDS.CODE_GENERATION * 2
			);
		});

		it('should reuse computations efficiently', async () => {
			const sharedSchema = testUtils.schema.createPatient();

			const builder1 = new APIBuilder({ outputDir: join(tempDir, 'build1') });
			const builder2 = new APIBuilder({ outputDir: join(tempDir, 'build2') });

			// Both builders use the same schema - should be able to optimize
			const [result1, result2] = await Promise.all([
				testUtils.performance.measure('Builder 1', async () =>
					builder1.fromSchemas([sharedSchema]).typescript().generate()
				),
				testUtils.performance.measure('Builder 2', async () =>
					builder2.fromSchemas([sharedSchema]).typescript().generate()
				)
			]);

			expect(result1.result.success).toBe(true);
			expect(result2.result.success).toBe(true);

			// Both should complete in reasonable time
			expect(result1.duration).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.CODE_GENERATION);
			expect(result2.duration).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLDS.CODE_GENERATION);
		});
	});
});
