/**
 * Tests for REST Client API Generator
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RESTClientAPIGenerator } from '../../src/api/generators/rest-client';
import type { AnyTypeSchema } from '../../src/typeschema/types';

describe('RESTClientAPIGenerator', () => {
	let generator: RESTClientAPIGenerator;
	let mockResourceSchemas: AnyTypeSchema[];

	beforeEach(() => {
		generator = new RESTClientAPIGenerator({
			outputDir: './test-output'
		});

		mockResourceSchemas = [
			{
				identifier: { 
					name: 'Patient', 
					kind: 'resource', 
					url: 'http://hl7.org/fhir/Patient' 
				},
				description: 'Patient demographic and administrative information',
				fields: {
					id: {
						type: { name: 'id', kind: 'primitive-type' },
						description: 'Logical id of this artifact',
						required: false,
						array: false
					},
					active: {
						type: { name: 'boolean', kind: 'primitive-type' },
						description: 'Whether this patient record is in active use',
						required: false,
						array: false
					}
				}
			},
			{
				identifier: { 
					name: 'Observation', 
					kind: 'resource', 
					url: 'http://hl7.org/fhir/Observation' 
				},
				description: 'Measurements and simple assertions made about a patient',
				fields: {
					id: {
						type: { name: 'id', kind: 'primitive-type' },
						description: 'Logical id of this artifact',
						required: false,
						array: false
					},
					status: {
						type: { name: 'code', kind: 'primitive-type' },
						description: 'registered | preliminary | final | amended +',
						required: true,
						array: false,
						enum: ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown']
					}
				}
			}
		];
	});

	describe('constructor', () => {
		it('should create with required options', () => {
			expect(generator).toBeDefined();
		});

		it('should create with custom options', () => {
			const customGenerator = new RESTClientAPIGenerator({
				outputDir: './custom-output',
				language: 'javascript',
				httpClient: 'axios',
				generateTypes: false,
				includeValidation: true,
				baseUrl: 'https://fhir.example.com/R4',
				apiVersion: 'R4',
				authentication: 'bearer'
			});
			expect(customGenerator).toBeDefined();
		});
	});

	describe('build', () => {
		it('should build REST client files without writing to disk', async () => {
			const results = await generator.build(mockResourceSchemas);
			
			expect(results).toBeArray();
			expect(results.length).toBeGreaterThan(0);
			
			// Should have base client
			const baseClientFile = results.find(r => r.filename.includes('base-client'));
			expect(baseClientFile).toBeDefined();
			expect(baseClientFile!.content).toContain('class BaseClient');
			expect(baseClientFile!.exports).toContain('BaseClient');

			// Should have resource clients
			const patientClientFile = results.find(r => r.filename.includes('patient-client'));
			expect(patientClientFile).toBeDefined();
			expect(patientClientFile!.content).toContain('PatientClient');
			expect(patientClientFile!.exports).toContain('PatientClient');

			const observationClientFile = results.find(r => r.filename.includes('observation-client'));
			expect(observationClientFile).toBeDefined();
			expect(observationClientFile!.content).toContain('ObservationClient');
			expect(observationClientFile!.exports).toContain('ObservationClient');

			// Should have main client
			const mainClientFile = results.find(r => r.filename.includes('fhir-client'));
			expect(mainClientFile).toBeDefined();
			expect(mainClientFile!.content).toContain('class FHIRClient');
			expect(mainClientFile!.exports).toContain('FHIRClient');
		});

		it('should generate TypeScript files by default', async () => {
			const results = await generator.build(mockResourceSchemas);
			
			const baseClientFile = results.find(r => r.filename.includes('base-client'));
			expect(baseClientFile!.filename).toEndWith('.ts');
			expect(baseClientFile!.content).toContain('export interface ClientConfig');
			expect(baseClientFile!.content).toContain(': Promise<FHIRResponse<T>>');
		});

		it('should generate JavaScript files when specified', async () => {
			const jsGenerator = new RESTClientAPIGenerator({
				outputDir: './test-output',
				language: 'javascript'
			});

			const results = await jsGenerator.build(mockResourceSchemas);
			
			const baseClientFile = results.find(r => r.filename.includes('base-client'));
			expect(baseClientFile!.filename).toEndWith('.js');
			expect(baseClientFile!.content).not.toContain('export interface');
			expect(baseClientFile!.content).toContain('module.exports');
		});

		it('should generate CRUD operations for resources', async () => {
			const results = await generator.build(mockResourceSchemas);
			
			const patientClientFile = results.find(r => r.filename.includes('patient-client'));
			const content = patientClientFile!.content;
			
			expect(content).toContain('async create(');
			expect(content).toContain('async read(');
			expect(content).toContain('async update(');
			expect(content).toContain('async delete(');
			expect(content).toContain('async search(');
		});

		it('should handle different HTTP clients', async () => {
			// Test with axios
			const axiosGenerator = new RESTClientAPIGenerator({
				outputDir: './test-output',
				httpClient: 'axios'
			});

			const axiosResults = await axiosGenerator.build(mockResourceSchemas);
			const axiosBaseClient = axiosResults.find(r => r.filename.includes('base-client'));
			expect(axiosBaseClient!.content).toContain('import axios');
			expect(axiosBaseClient!.content).toContain('axiosInstance');

			// Test with fetch (default)
			const fetchResults = await generator.build(mockResourceSchemas);
			const fetchBaseClient = fetchResults.find(r => r.filename.includes('base-client'));
			expect(fetchBaseClient!.content).toContain('await fetch(');
		});

		it('should handle authentication options', async () => {
			const authGenerator = new RESTClientAPIGenerator({
				outputDir: './test-output',
				authentication: 'bearer'
			});

			const results = await authGenerator.build(mockResourceSchemas);
			const baseClientFile = results.find(r => r.filename.includes('base-client'));
			expect(baseClientFile!.content).toContain('Bearer ${config.auth.token}');
		});

		it('should filter non-resource schemas', async () => {
			const mixedSchemas: AnyTypeSchema[] = [
				...mockResourceSchemas,
				{
					identifier: { 
						name: 'HumanName', 
						kind: 'complex-type', 
						url: 'http://hl7.org/fhir/HumanName' 
					},
					description: 'Human Name',
					fields: {}
				}
			];

			const results = await generator.build(mixedSchemas);
			
			// Should only generate clients for resources, not complex types
			const humanNameClientFile = results.find(r => r.filename.includes('humanname-client'));
			expect(humanNameClientFile).toBeUndefined();

			// Should still have resource clients
			const patientClientFile = results.find(r => r.filename.includes('patient-client'));
			expect(patientClientFile).toBeDefined();
		});

		it('should handle empty resource list', async () => {
			const results = await generator.build([]);
			expect(results).toBeArray();
			
			// Should still generate base client and main client
			const baseClientFile = results.find(r => r.filename.includes('base-client'));
			expect(baseClientFile).toBeDefined();
		});
	});

	describe('setOutputDir', () => {
		it('should update output directory', () => {
			generator.setOutputDir('./new-output');
			// This test ensures the method doesn't throw
			expect(generator).toBeDefined();
		});
	});
});