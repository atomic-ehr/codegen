/**
 * Performance benchmarks for code generation speed
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TestGenerator, MockLogger } from '../helpers/mock-generators';
import { createMockSchemas, createComplexNestedSchema } from '../helpers/schema-helpers';
import { TestFileSystem } from '../helpers/file-helpers';
import { assertPerformanceBenchmark, assertMemoryUsage } from '../helpers/assertions';

describe.skip('Generation Speed Performance', () => {
  let generator: TestGenerator;
  let logger: MockLogger;
  let testFs: TestFileSystem;

  beforeEach(async () => {
    logger = new MockLogger();
    testFs = await TestFileSystem.createTempTestDir();
    
    generator = new TestGenerator({
      outputDir: testFs.getBasePath(),
      logger: logger as any,
      verbose: false // Reduce logging overhead for performance tests
    });
  });

  afterEach(async () => {
    await testFs.cleanup();
  });

  describe('Small Schema Sets (1-10 schemas)', () => {
    test('generates single schema within performance target', async () => {
      const schema = createMockSchemas(['Patient'])[0]!;
      
      const startTime = performance.now();
      const results = await generator.build([schema]);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(1);
      
      // Single schema should generate in under 50ms
      assertPerformanceBenchmark(duration, 50, 1.0); // 100% tolerance for CI variance
    });

    test('generates 5 schemas within performance target', async () => {
      const schemas = createMockSchemas(['Patient', 'Observation', 'Practitioner', 'Organization', 'Location']);
      
      const startTime = performance.now();
      const results = await generator.build(schemas);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(5);
      
      // 5 schemas should generate in under 200ms
      assertPerformanceBenchmark(duration, 200, 0.5);
      
      // Check average time per schema
      const averageTime = duration / schemas.length;
      expect(averageTime).toBeLessThan(50); // Under 50ms per schema on average
    });

    test('generates 10 schemas within performance target', async () => {
      const schemaNames = Array.from({ length: 10 }, (_, i) => `Schema${i}`);
      const schemas = createMockSchemas(schemaNames);
      
      const startTime = performance.now();
      const results = await generator.build(schemas);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(10);
      
      // 10 schemas should generate in under 400ms
      assertPerformanceBenchmark(duration, 400, 0.5);
    });
  });

  describe('Medium Schema Sets (11-50 schemas)', () => {
    test('generates 25 schemas within performance target', async () => {
      const schemaNames = Array.from({ length: 25 }, (_, i) => `MediumSchema${i}`);
      const schemas = createMockSchemas(schemaNames);
      
      const startTime = performance.now();
      const results = await generator.build(schemas);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(25);
      
      // 25 schemas should generate in under 1 second
      assertPerformanceBenchmark(duration, 1000, 0.5);
      
      // Check performance scales reasonably
      const averageTime = duration / schemas.length;
      expect(averageTime).toBeLessThan(50); // Should maintain good per-schema performance
    });

    test('generates 50 schemas within performance target', async () => {
      const schemaNames = Array.from({ length: 50 }, (_, i) => `LargeSchema${i}`);
      const schemas = createMockSchemas(schemaNames);
      
      const startTime = performance.now();
      const results = await generator.build(schemas);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(50);
      
      // 50 schemas should generate in under 2 seconds
      assertPerformanceBenchmark(duration, 2000, 0.5);
    });
  });

  describe('Large Schema Sets (51+ schemas)', () => {
    test('generates 100 schemas within performance target', async () => {
      const schemaNames = Array.from({ length: 100 }, (_, i) => `VeryLargeSchema${i}`);
      const schemas = createMockSchemas(schemaNames);
      
      const startTime = performance.now();
      const results = await generator.build(schemas);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(100);
      
      // 100 schemas should generate in under 4 seconds
      assertPerformanceBenchmark(duration, 4000, 0.5);
      
      // Performance should scale sub-linearly (better than O(n))
      const averageTime = duration / schemas.length;
      expect(averageTime).toBeLessThan(50); // Should maintain efficiency
    });

    test('handles scaling to 200 schemas', async () => {
      const schemaNames = Array.from({ length: 200 }, (_, i) => `MassiveSchema${i}`);
      const schemas = createMockSchemas(schemaNames);
      
      const startTime = performance.now();
      const results = await generator.build(schemas);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(200);
      
      // 200 schemas should generate in under 8 seconds
      assertPerformanceBenchmark(duration, 8000, 0.5);
    });
  });

  describe('Complex Schema Performance', () => {
    test('handles complex nested schemas efficiently', async () => {
      const complexSchemas = [
        createComplexNestedSchema('DiagnosticReport'),
        createComplexNestedSchema('Bundle'),
        createComplexNestedSchema('Composition'),
        createComplexNestedSchema('QuestionnaireResponse'),
        createComplexNestedSchema('MessageDefinition')
      ];
      
      const startTime = performance.now();
      const results = await generator.build(complexSchemas);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(5);
      
      // Complex schemas should still complete in reasonable time
      assertPerformanceBenchmark(duration, 500, 0.5);
    });

    test('performance with mixed complexity schemas', async () => {
      const mixedSchemas = [
        ...createMockSchemas(['Simple1', 'Simple2']),
        createComplexNestedSchema('Complex1'),
        ...createMockSchemas(['Simple3', 'Simple4']),
        createComplexNestedSchema('Complex2'),
      ];
      
      const startTime = performance.now();
      const results = await generator.build(mixedSchemas);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(6);
      
      // Mixed complexity should handle well
      assertPerformanceBenchmark(duration, 400, 0.5);
    });
  });

  describe('Comparative Performance', () => {
    test('build() vs generate() performance comparison', async () => {
      const schemas = createMockSchemas(['Perf1', 'Perf2', 'Perf3', 'Perf4', 'Perf5']);
      
      // Test build() performance (no file I/O)
      const buildStart = performance.now();
      const buildResults = await generator.build(schemas);
      const buildDuration = performance.now() - buildStart;

      // Test generate() performance (with file I/O)
      const generateStart = performance.now();
      const generateResults = await generator.generate(schemas);
      const generateDuration = performance.now() - generateStart;

      expect(buildResults).toHaveLength(5);
      expect(generateResults).toHaveLength(5);
      
      // build() should be faster than generate()
      expect(buildDuration).toBeLessThan(generateDuration);
      
      // File I/O overhead should be reasonable
      const ioOverhead = generateDuration - buildDuration;
      expect(ioOverhead).toBeLessThan(200); // Less than 200ms overhead for 5 files
    });

    test('validation enabled vs disabled performance', async () => {
      const schemas = createMockSchemas(['Val1', 'Val2', 'Val3', 'Val4', 'Val5']);
      
      // Test with validation enabled
      const validatingGenerator = new TestGenerator({
        outputDir: testFs.getBasePath(),
        logger: logger as any,
        validate: true
      });
      
      const validationStart = performance.now();
      await validatingGenerator.build(schemas);
      const validationDuration = performance.now() - validationStart;

      // Test with validation disabled
      const nonValidatingGenerator = new TestGenerator({
        outputDir: testFs.getBasePath(),
        logger: logger as any,
        validate: false
      });
      
      const noValidationStart = performance.now();
      await nonValidatingGenerator.build(schemas);
      const noValidationDuration = performance.now() - noValidationStart;

      // Validation should add some overhead but not too much
      expect(validationDuration).toBeGreaterThan(noValidationDuration);
      
      const validationOverhead = validationDuration - noValidationDuration;
      expect(validationOverhead).toBeLessThan(100); // Less than 100ms validation overhead
    });
  });

  describe('Regression Testing', () => {
    test('performance regression detection', async () => {
      const schemas = createMockSchemas(['Regression1', 'Regression2', 'Regression3']);
      
      // Run multiple times to get stable baseline
      const runs: number[] = [];
      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        await generator.build(schemas);
        runs.push(performance.now() - startTime);
      }
      
      const averageTime = runs.reduce((a, b) => a + b, 0) / runs.length;
      const maxTime = Math.max(...runs);
      const minTime = Math.min(...runs);
      
      // Results should be consistent (low variance)
      const variance = maxTime - minTime;
      expect(variance).toBeLessThan(averageTime * 0.5); // Variance should be < 50% of average
      
      // Average should be within expected range
      expect(averageTime).toBeLessThan(200); // 3 schemas in under 200ms
    });

    test('performance with realistic FHIR workload', async () => {
      // Simulate a realistic FHIR package with various resource types
      const realisticSchemas = createMockSchemas([
        'Patient', 'Observation', 'Practitioner', 'Organization', 'Location',
        'Encounter', 'Procedure', 'Medication', 'Device', 'Specimen',
        'DiagnosticReport', 'Condition', 'AllergyIntolerance', 'Immunization', 'CarePlan'
      ]);
      
      const startTime = performance.now();
      const results = await generator.build(realisticSchemas);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(15);
      
      // Realistic FHIR workload should complete in under 1 second
      assertPerformanceBenchmark(duration, 1000, 0.3);
    });
  });

  describe('Resource Efficiency', () => {
    test('memory usage stays reasonable during generation', async () => {
      const schemas = createMockSchemas(
        Array.from({ length: 50 }, (_, i) => `MemoryTest${i}`)
      );
      
      const memoryBefore = process.memoryUsage();
      await generator.build(schemas);
      const memoryAfter = process.memoryUsage();
      
      const heapIncrease = (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024;
      
      // Should not use excessive memory (less than 20MB for 50 schemas)
      assertMemoryUsage(memoryBefore.heapUsed / 1024 / 1024 + 20);
      expect(heapIncrease).toBeLessThan(20);
    });

    test('garbage collection behavior', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Generate many schemas
      for (let batch = 0; batch < 5; batch++) {
        const schemas = createMockSchemas([`Batch${batch}_A`, `Batch${batch}_B`]);
        await generator.build(schemas);
      }
      
      // Force garbage collection again
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024;
      
      // Memory growth should be minimal after GC
      expect(memoryGrowth).toBeLessThan(10); // Less than 10MB growth
    });
  });
});