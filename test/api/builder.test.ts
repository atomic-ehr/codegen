/**
 * Tests for API Builder
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { APIBuilder, createAPI } from '../../src/api/builder';
import type { AnyTypeSchema } from '../../src/typeschema/types';

describe('APIBuilder', () => {
	let builder: APIBuilder;

	beforeEach(() => {
		builder = new APIBuilder({
			outputDir: './test-output',
			verbose: false,
			validate: false
		});
	});

	describe('constructor', () => {
		it('should create with default options', () => {
			const defaultBuilder = new APIBuilder();
			expect(defaultBuilder).toBeDefined();
		});

		it('should create with custom options', () => {
			const customBuilder = new APIBuilder({
				outputDir: './custom-output',
				verbose: true,
				validate: true
			});
			expect(customBuilder).toBeDefined();
		});
	});

	describe('fluent interface', () => {
		it('should chain fromSchemas', () => {
			const mockSchemas: AnyTypeSchema[] = [{
				identifier: { name: 'TestResource', kind: 'resource', url: 'http://example.com/TestResource' },
				description: 'Test resource',
				fields: {}
			}];

			const result = builder.fromSchemas(mockSchemas);
			expect(result).toBe(builder);
			expect(builder.getSchemas()).toHaveLength(1);
		});

		it('should chain typescript configuration', () => {
			const result = builder.typescript({
				moduleFormat: 'esm',
				generateIndex: true
			});
			expect(result).toBe(builder);
			expect(builder.getGenerators()).toContain('typescript');
		});

		it('should chain restClient configuration', () => {
			const result = builder.restClient({
				language: 'typescript',
				httpClient: 'fetch'
			});
			expect(result).toBe(builder);
			expect(builder.getGenerators()).toContain('restclient');
		});

		it('should chain outputTo', () => {
			const result = builder.outputTo('./new-output');
			expect(result).toBe(builder);
		});

		it('should chain verbose', () => {
			const result = builder.verbose(true);
			expect(result).toBe(builder);
		});

		it('should chain validate', () => {
			const result = builder.validate(true);
			expect(result).toBe(builder);
		});
	});

	describe('generator management', () => {
		it('should track configured generators', () => {
			builder.typescript().restClient();
			const generators = builder.getGenerators();
			expect(generators).toContain('typescript');
			expect(generators).toContain('restclient');
		});

		it('should update output directory for all generators', () => {
			builder.typescript().restClient();
			builder.outputTo('./updated-output');
			// This test ensures the method doesn't throw
			expect(builder.getGenerators()).toHaveLength(2);
		});
	});

	describe('schema management', () => {
		it('should store schemas from fromSchemas', () => {
			const mockSchemas: AnyTypeSchema[] = [
				{
					identifier: { name: 'Patient', kind: 'resource', url: 'http://hl7.org/fhir/Patient' },
					description: 'Patient resource',
					fields: {}
				},
				{
					identifier: { name: 'Observation', kind: 'resource', url: 'http://hl7.org/fhir/Observation' },
					description: 'Observation resource',
					fields: {}
				}
			];

			builder.fromSchemas(mockSchemas);
			const storedSchemas = builder.getSchemas();
			expect(storedSchemas).toHaveLength(2);
			expect(storedSchemas[0].identifier.name).toBe('Patient');
			expect(storedSchemas[1].identifier.name).toBe('Observation');
		});

		it('should accumulate schemas from multiple calls', () => {
			const schemas1: AnyTypeSchema[] = [{
				identifier: { name: 'Patient', kind: 'resource', url: 'http://hl7.org/fhir/Patient' },
				description: 'Patient resource',
				fields: {}
			}];

			const schemas2: AnyTypeSchema[] = [{
				identifier: { name: 'Observation', kind: 'resource', url: 'http://hl7.org/fhir/Observation' },
				description: 'Observation resource',
				fields: {}
			}];

			builder.fromSchemas(schemas1).fromSchemas(schemas2);
			expect(builder.getSchemas()).toHaveLength(2);
		});
	});

	describe('reset', () => {
		it('should clear all configuration', () => {
			builder
				.fromSchemas([{
					identifier: { name: 'Test', kind: 'resource', url: 'http://example.com/Test' },
					description: 'Test',
					fields: {}
				}])
				.typescript()
				.restClient();

			expect(builder.getSchemas()).toHaveLength(1);
			expect(builder.getGenerators()).toHaveLength(2);

			builder.reset();

			expect(builder.getSchemas()).toHaveLength(0);
			expect(builder.getGenerators()).toHaveLength(0);
		});
	});

	describe('build', () => {
		it('should build without validation when disabled', async () => {
			const mockSchemas: AnyTypeSchema[] = [{
				identifier: { name: 'TestResource', kind: 'resource', url: 'http://example.com/TestResource' },
				description: 'Test resource',
				fields: {}
			}];

			builder
				.fromSchemas(mockSchemas)
				.typescript()
				.validate(false);

			const results = await builder.build();
			expect(results).toBeDefined();
			expect(results.typescript).toBeDefined();
		});
	});
});

describe('createAPI', () => {
	it('should create a new APIBuilder instance', () => {
		const api = createAPI();
		expect(api).toBeInstanceOf(APIBuilder);
	});

	it('should pass options to APIBuilder', () => {
		const api = createAPI({
			outputDir: './custom-output',
			verbose: true
		});
		expect(api).toBeInstanceOf(APIBuilder);
	});
});