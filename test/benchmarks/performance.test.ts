/**
 * Performance Benchmark Suite
 * 
 * Comprehensive performance benchmarks for all major codegen operations.
 */

import { describe, it, expect } from 'bun:test';
import { performance } from 'perf_hooks';
import { APIBuilder } from '../../src/api/builder';
import { TypeSchemaGenerator } from '../../src/typeschema/generator';
import { FHIRGenerator } from '../../src/fhir/generator';
import { FHIRGuardGenerator } from '../../src/fhir/guards/generator';
import type { AnyTypeSchema } from '../../src/lib/typeschema/types';

describe('Performance Benchmarks', () => {
	/**
	 * Benchmark configuration
	 */
	const BENCHMARK_CONFIG = {
		// Number of iterations for averaging
		ITERATIONS: 5,
		// Schema set sizes for scalability testing
		SMALL_SCHEMA_COUNT: 5,
		MEDIUM_SCHEMA_COUNT: 25,
		LARGE_SCHEMA_COUNT: 100,
		// Performance targets (milliseconds)
		TARGETS: {
			SMALL_CODEGEN: 500,     // Small schema sets should complete in 500ms
			MEDIUM_CODEGEN: 2000,   // Medium schema sets should complete in 2s
			LARGE_CODEGEN: 10000,   // Large schema sets should complete in 10s
			MEMORY_LIMIT: 100 * 1024 * 1024, // 100MB memory limit
		}
	};

	/**
	 * Create schema sets of different sizes for benchmarking
	 */
	function createSchemaSet(size: number): AnyTypeSchema[] {
		const schemas: AnyTypeSchema[] = [];
		
		// Add core FHIR schemas
		schemas.push(testUtils.schema.createPatient());
		schemas.push(testUtils.schema.createWithFields('Observation', {
			status: {
				type: { name: 'code', kind: 'primitive-type', url: 'http://hl7.org/fhir/code', package: 'hl7.fhir.r4.core', version: '4.0.1' },
				enum: ['registered', 'preliminary', 'final'],
				required: true,
			},
			subject: {
				reference: [{ name: 'Patient', kind: 'resource', url: 'http://hl7.org/fhir/Patient', package: 'hl7.fhir.r4.core', version: '4.0.1' }],
				required: true,
			}
		}));
		
		// Add primitive types
		const primitiveTypes = ['string', 'boolean', 'integer', 'decimal', 'date', 'dateTime', 'uri', 'code'];
		primitiveTypes.forEach(type => {
			schemas.push(testUtils.schema.createMinimal(type, 'primitive-type'));
		});
		
		// Generate additional schemas to reach target size
		const remaining = size - schemas.length;
		for (let i = 0; i < remaining; i++) {
			const fieldCount = Math.floor(Math.random() * 10) + 1;
			const fields: Record<string, any> = {};
			
			for (let j = 0; j < fieldCount; j++) {
				const fieldName = `field${j}`;
				const isArray = Math.random() > 0.7;
				const isRequired = Math.random() > 0.6;
				
				fields[fieldName] = {
					type: { name: 'string', kind: 'primitive-type', url: 'http://hl7.org/fhir/string', package: 'test', version: '1.0.0' },
					array: isArray,
					required: isRequired,
				};
			}
			
			schemas.push(testUtils.schema.createWithFields(`BenchmarkResource${i}`, fields));
		}
		
		return schemas.slice(0, size);
	}

	/**
	 * Run a benchmark multiple times and return statistics
	 */
	async function runBenchmark<T>(
		name: string,
		operation: () => Promise<T>,
		iterations: number = BENCHMARK_CONFIG.ITERATIONS
	): Promise<{
		name: string;
		averageTime: number;
		minTime: number;
		maxTime: number;
		totalTime: number;
		iterations: number;
		throughput: number; // operations per second
	}> {
		const times: number[] = [];
		let lastResult: T;
		
		console.log(`🏃 Running benchmark: ${name} (${iterations} iterations)`);
		
		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			lastResult = await operation();
			const end = performance.now();
			const duration = end - start;
			times.push(duration);
			
			if (i === 0) {
				console.log(`   First run: ${Math.round(duration)}ms`);
			}
		}
		
		const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
		const minTime = Math.min(...times);
		const maxTime = Math.max(...times);
		const totalTime = times.reduce((a, b) => a + b, 0);
		const throughput = (iterations / totalTime) * 1000; // ops per second
		
		console.log(`   Average: ${Math.round(averageTime)}ms, Min: ${Math.round(minTime)}ms, Max: ${Math.round(maxTime)}ms`);
		console.log(`   Throughput: ${throughput.toFixed(2)} ops/sec\n`);
		
		return {
			name,
			averageTime,
			minTime,
			maxTime,
			totalTime,
			iterations,
			throughput,
		};
	}

	/**
	 * Measure memory usage during operation
	 */
	async function measureMemoryUsage<T>(operation: () => Promise<T>): Promise<{
		result: T;
		memoryDelta: number;
		peakMemory: number;
	}> {
		// Force garbage collection if available
		if (global.gc) global.gc();
		
		const memoryBefore = process.memoryUsage();
		const result = await operation();
		const memoryAfter = process.memoryUsage();
		
		if (global.gc) global.gc();
		const memoryFinal = process.memoryUsage();
		
		const memoryDelta = memoryAfter.heapUsed - memoryBefore.heapUsed;
		const peakMemory = Math.max(memoryAfter.heapUsed, memoryFinal.heapUsed);
		
		return { result, memoryDelta, peakMemory };
	}

	describe('TypeScript Generation Benchmarks', () => {
		it('should generate TypeScript from small schema sets efficiently', async () => {
			const schemas = createSchemaSet(BENCHMARK_CONFIG.SMALL_SCHEMA_COUNT);
			
			const benchmark = await runBenchmark(
				`TypeScript generation (${schemas.length} schemas)`,
				async () => {
					const builder = new APIBuilder({
						outputDir: testUtils.fs.createTempDir('bench-small'),
						verbose: false,
						validate: false
					});
					
					const result = await builder
						.fromSchemas(schemas)
						.typescript({ generateIndex: true })
						.build();
					
					testUtils.fs.cleanup(builder['options'].outputDir);
					return result;
				}
			);
			
			expect(benchmark.averageTime).toBeLessThan(BENCHMARK_CONFIG.TARGETS.SMALL_CODEGEN);
			expect(benchmark.throughput).toBeGreaterThan(0.5); // At least 0.5 ops/sec
		});

		it('should scale to medium schema sets', async () => {
			const schemas = createSchemaSet(BENCHMARK_CONFIG.MEDIUM_SCHEMA_COUNT);
			
			const benchmark = await runBenchmark(
				`TypeScript generation (${schemas.length} schemas)`,
				async () => {
					const builder = new APIBuilder({
						outputDir: testUtils.fs.createTempDir('bench-medium'),
						verbose: false,
						validate: false
					});
					
					const result = await builder
						.fromSchemas(schemas)
						.typescript({ generateIndex: true })
						.build();
					
					testUtils.fs.cleanup(builder['options'].outputDir);
					return result;
				},
				3 // Fewer iterations for larger sets
			);
			
			expect(benchmark.averageTime).toBeLessThan(BENCHMARK_CONFIG.TARGETS.MEDIUM_CODEGEN);
			expect(benchmark.throughput).toBeGreaterThan(0.1); // At least 0.1 ops/sec
		});

		it('should handle large schema sets within time limits', async () => {
			const schemas = createSchemaSet(BENCHMARK_CONFIG.LARGE_SCHEMA_COUNT);
			
			const benchmark = await runBenchmark(
				`TypeScript generation (${schemas.length} schemas)`,
				async () => {
					const builder = new APIBuilder({
						outputDir: testUtils.fs.createTempDir('bench-large'),
						verbose: false,
						validate: false
					});
					
					const result = await builder
						.fromSchemas(schemas)
						.typescript({ generateIndex: true })
						.build();
					
					testUtils.fs.cleanup(builder['options'].outputDir);
					return result;
				},
				1 // Single iteration for largest set
			);
			
			expect(benchmark.averageTime).toBeLessThan(BENCHMARK_CONFIG.TARGETS.LARGE_CODEGEN);
		});
	});

	describe('FHIR Generation Benchmarks', () => {
		it('should generate FHIR types efficiently', async () => {
			const schemas = createSchemaSet(BENCHMARK_CONFIG.SMALL_SCHEMA_COUNT);
			
			const benchmark = await runBenchmark(
				`FHIR type generation (${schemas.length} schemas)`,
				async () => {
					const generator = new FHIRGenerator({ verbose: false });
					return generator.generateFromTypeSchemas(schemas);
				}
			);
			
			expect(benchmark.averageTime).toBeLessThan(BENCHMARK_CONFIG.TARGETS.SMALL_CODEGEN);
		});

		it('should generate FHIR guards efficiently', async () => {
			const schemas = createSchemaSet(BENCHMARK_CONFIG.SMALL_SCHEMA_COUNT);
			
			const benchmark = await runBenchmark(
				`FHIR guard generation (${schemas.length} schemas)`,
				async () => {
					const generator = new FHIRGuardGenerator({ treeShakeable: true });
					return generator.generateFromTypeSchemas(schemas, testUtils.mock.createPackageInfo());
				}
			);
			
			expect(benchmark.averageTime).toBeLessThan(BENCHMARK_CONFIG.TARGETS.SMALL_CODEGEN);
		});
	});

	describe('Memory Usage Benchmarks', () => {
		it('should maintain reasonable memory usage for TypeScript generation', async () => {
			const schemas = createSchemaSet(BENCHMARK_CONFIG.MEDIUM_SCHEMA_COUNT);
			
			const memoryTest = await measureMemoryUsage(async () => {
				const builder = new APIBuilder({
					outputDir: testUtils.fs.createTempDir('memory-test'),
					verbose: false
				});
				
				const result = await builder
					.fromSchemas(schemas)
					.typescript()
					.build();
				
				testUtils.fs.cleanup(builder['options'].outputDir);
				return result;
			});
			
			console.log(`Memory delta: ${Math.round(memoryTest.memoryDelta / 1024 / 1024)}MB`);
			console.log(`Peak memory: ${Math.round(memoryTest.peakMemory / 1024 / 1024)}MB`);
			
			expect(memoryTest.memoryDelta).toBeLessThan(BENCHMARK_CONFIG.TARGETS.MEMORY_LIMIT);
		});

		it('should not leak memory across multiple generations', async () => {
			const schemas = createSchemaSet(BENCHMARK_CONFIG.SMALL_SCHEMA_COUNT);
			const initialMemory = process.memoryUsage().heapUsed;
			
			// Run multiple generations
			for (let i = 0; i < 10; i++) {
				const builder = new APIBuilder({
					outputDir: testUtils.fs.createTempDir(`leak-test-${i}`),
					verbose: false
				});
				
				await builder
					.fromSchemas(schemas)
					.typescript()
					.build();
				
				testUtils.fs.cleanup(builder['options'].outputDir);
			}
			
			// Force garbage collection if available
			if (global.gc) global.gc();
			
			const finalMemory = process.memoryUsage().heapUsed;
			const memoryIncrease = finalMemory - initialMemory;
			
			console.log(`Memory increase after 10 generations: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
			
			// Memory should not increase significantly (allow 20MB variance)
			expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
		});
	});

	describe('Scalability Benchmarks', () => {
		it('should demonstrate linear scaling characteristics', async () => {
			const smallSchemas = createSchemaSet(BENCHMARK_CONFIG.SMALL_SCHEMA_COUNT);
			const mediumSchemas = createSchemaSet(BENCHMARK_CONFIG.MEDIUM_SCHEMA_COUNT);
			
			const smallBenchmark = await runBenchmark(
				'Small set baseline',
				async () => {
					const builder = new APIBuilder({
						outputDir: testUtils.fs.createTempDir('scale-small'),
						verbose: false
					});
					const result = await builder.fromSchemas(smallSchemas).typescript().build();
					testUtils.fs.cleanup(builder['options'].outputDir);
					return result;
				},
				3
			);
			
			const mediumBenchmark = await runBenchmark(
				'Medium set comparison',
				async () => {
					const builder = new APIBuilder({
						outputDir: testUtils.fs.createTempDir('scale-medium'),
						verbose: false
					});
					const result = await builder.fromSchemas(mediumSchemas).typescript().build();
					testUtils.fs.cleanup(builder['options'].outputDir);
					return result;
				},
				3
			);
			
			const scalingFactor = mediumBenchmark.averageTime / smallBenchmark.averageTime;
			const expectedScalingFactor = BENCHMARK_CONFIG.MEDIUM_SCHEMA_COUNT / BENCHMARK_CONFIG.SMALL_SCHEMA_COUNT;
			
			console.log(`Scaling factor: ${scalingFactor.toFixed(2)}x (expected: ${expectedScalingFactor}x)`);
			
			// Scaling should be roughly linear (allow 50% variance)
			expect(scalingFactor).toBeLessThan(expectedScalingFactor * 1.5);
		});
	});

	describe('Concurrent Operation Benchmarks', () => {
		it('should handle concurrent generation efficiently', async () => {
			const schemas = createSchemaSet(BENCHMARK_CONFIG.SMALL_SCHEMA_COUNT);
			const concurrencyLevel = 3;
			
			const benchmark = await runBenchmark(
				`Concurrent generation (${concurrencyLevel} parallel)`,
				async () => {
					const promises = Array.from({ length: concurrencyLevel }, (_, i) => {
						const builder = new APIBuilder({
							outputDir: testUtils.fs.createTempDir(`concurrent-${i}`),
							verbose: false
						});
						
						return builder
							.fromSchemas(schemas)
							.typescript()
							.build()
							.then(result => {
								testUtils.fs.cleanup(builder['options'].outputDir);
								return result;
							});
					});
					
					return Promise.all(promises);
				},
				2 // Fewer iterations for concurrent tests
			);
			
			// Concurrent execution should not be significantly slower than sequential
			expect(benchmark.averageTime).toBeLessThan(BENCHMARK_CONFIG.TARGETS.SMALL_CODEGEN * 2);
		});
	});

	describe('Real-world Scenario Benchmarks', () => {
		it('should handle typical FHIR R4 core subset efficiently', async () => {
			// Create a realistic FHIR subset
			const fhirSubset = [
				testUtils.schema.createPatient(),
				testUtils.schema.createWithFields('Observation', {
					status: { type: { name: 'code', kind: 'primitive-type', url: 'http://hl7.org/fhir/code', package: 'hl7.fhir.r4.core', version: '4.0.1' }, required: true },
					code: { type: { name: 'CodeableConcept', kind: 'complex-type', url: 'http://hl7.org/fhir/CodeableConcept', package: 'hl7.fhir.r4.core', version: '4.0.1' }, required: true },
					subject: { reference: [{ name: 'Patient', kind: 'resource', url: 'http://hl7.org/fhir/Patient', package: 'hl7.fhir.r4.core', version: '4.0.1' }] },
					'value[x]': { choices: ['Quantity', 'string', 'boolean'] },
					valueQuantity: { choiceOf: 'value[x]', type: { name: 'Quantity', kind: 'complex-type', url: 'http://hl7.org/fhir/Quantity', package: 'hl7.fhir.r4.core', version: '4.0.1' } },
					valueString: { choiceOf: 'value[x]', type: { name: 'string', kind: 'primitive-type', url: 'http://hl7.org/fhir/string', package: 'hl7.fhir.r4.core', version: '4.0.1' } }
				}),
				testUtils.schema.createWithFields('Practitioner', {
					name: { type: { name: 'HumanName', kind: 'complex-type', url: 'http://hl7.org/fhir/HumanName', package: 'hl7.fhir.r4.core', version: '4.0.1' }, array: true },
					qualification: { type: { name: 'BackboneElement', kind: 'complex-type', url: 'http://hl7.org/fhir/BackboneElement', package: 'hl7.fhir.r4.core', version: '4.0.1' }, array: true }
				}),
				// Add common primitives
				...['string', 'boolean', 'integer', 'decimal', 'uri', 'code', 'id', 'date', 'dateTime'].map(name =>
					testUtils.schema.createMinimal(name, 'primitive-type')
				)
			];
			
			const benchmark = await runBenchmark(
				'Realistic FHIR subset (full stack)',
				async () => {
					const tempDir = testUtils.fs.createTempDir('fhir-realistic');
					
					const builder = new APIBuilder({
						outputDir: tempDir,
						verbose: false
					});
					
					const result = await builder
						.fromSchemas(fhirSubset)
						.typescript({
							generateIndex: true,
							moduleFormat: 'esm'
						})
						.restClient({
							language: 'typescript',
							httpClient: 'fetch'
						})
						.build();
					
					testUtils.fs.cleanup(tempDir);
					return result;
				},
				2
			);
			
			expect(benchmark.averageTime).toBeLessThan(BENCHMARK_CONFIG.TARGETS.MEDIUM_CODEGEN);
			
			// Log performance summary
			console.log('\n📊 Performance Summary:');
			console.log(`   FHIR subset generation: ${Math.round(benchmark.averageTime)}ms`);
			console.log(`   Throughput: ${benchmark.throughput.toFixed(2)} builds/sec`);
		});
	});
});