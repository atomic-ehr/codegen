/**
 * Integration Tests for API Components
 */

import { describe, it, expect } from 'bun:test';
import { createAPI } from '../../src/api/builder';
import type { AnyTypeSchema } from '../../src/typeschema/types';

describe('API Integration Tests', () => {
	const mockSchemas: AnyTypeSchema[] = [
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
				},
				name: {
					type: { name: 'HumanName', kind: 'complex-type' },
					description: 'A name associated with the patient',
					required: false,
					array: true
				}
			}
		},
		{
			identifier: { 
				name: 'HumanName', 
				kind: 'complex-type', 
				url: 'http://hl7.org/fhir/HumanName' 
			},
			description: 'Human Name',
			fields: {
				use: {
					type: { name: 'code', kind: 'primitive-type' },
					description: 'usual | official | temp | nickname | anonymous | old | maiden',
					required: false,
					array: false,
					enum: ['usual', 'official', 'temp', 'nickname', 'anonymous', 'old', 'maiden']
				},
				family: {
					type: { name: 'string', kind: 'primitive-type' },
					description: 'Family name (often called surname)',
					required: false,
					array: false
				}
			}
		}
	];

	describe('Complete workflow', () => {
		it('should generate TypeScript types from schemas', async () => {
			const api = createAPI({
				outputDir: './test-integration-output',
				validate: false
			});

			const results = await api
				.fromSchemas(mockSchemas)
				.typescript()
				.build();

			expect(results.typescript).toBeDefined();
			expect(results.typescript!.length).toBeGreaterThan(0);

			// Check Patient interface
			const patientFile = results.typescript!.find(r => r.filename.includes('Patient'));
			expect(patientFile).toBeDefined();
			expect(patientFile!.content).toContain('export interface Patient');
			expect(patientFile!.content).toContain('resourceType: \'Patient\'');
			expect(patientFile!.content).toContain('id?:');
			expect(patientFile!.content).toContain('active?:');
			expect(patientFile!.content).toContain('name?:');
		});

		it('should generate REST client from schemas', async () => {
			const api = createAPI({
				outputDir: './test-integration-output',
				validate: false
			});

			const results = await api
				.fromSchemas(mockSchemas)
				.restClient({
					language: 'typescript',
					httpClient: 'fetch'
				})
				.build();

			expect(results.restclient).toBeDefined();
			expect(results.restclient!.length).toBeGreaterThan(0);

			// Check base client
			const baseClient = results.restclient!.find(r => r.filename.includes('base-client'));
			expect(baseClient).toBeDefined();
			expect(baseClient!.content).toContain('class BaseClient');
			
			// Check resource client (only for Patient since it's a resource)
			const patientClient = results.restclient!.find(r => r.filename.includes('patient-client'));
			expect(patientClient).toBeDefined();
			expect(patientClient!.content).toContain('PatientClient extends BaseClient');
			
			// Check main client
			const fhirClient = results.restclient!.find(r => r.filename.includes('fhir-client'));
			expect(fhirClient).toBeDefined();
			expect(fhirClient!.content).toContain('class FHIRClient');
		});

		it('should generate both TypeScript types and REST client', async () => {
			const api = createAPI({
				outputDir: './test-integration-output',
				validate: false
			});

			const results = await api
				.fromSchemas(mockSchemas)
				.typescript()
				.restClient()
				.build();

			expect(results.typescript).toBeDefined();
			expect(results.restclient).toBeDefined();
			expect(results.typescript!.length).toBeGreaterThan(0);
			expect(results.restclient!.length).toBeGreaterThan(0);
		});

		it('should handle different configuration combinations', async () => {
			const api = createAPI({
				outputDir: './test-integration-output',
				validate: false,
				verbose: false
			});

			const results = await api
				.fromSchemas(mockSchemas)
				.typescript({
					moduleFormat: 'cjs',
					generateIndex: false,
					namingConvention: 'camelCase'
				})
				.restClient({
					language: 'javascript',
					httpClient: 'axios',
					authentication: 'bearer'
				})
				.build();

			expect(results.typescript).toBeDefined();
			expect(results.restclient).toBeDefined();
		});

		it('should work with fluent chaining', async () => {
			const results = await createAPI({ validate: false })
				.fromSchemas(mockSchemas)
				.typescript()
				.restClient()
				.outputTo('./chained-output')
				.verbose(false)
				.build();

			expect(results).toBeDefined();
			expect(results.typescript).toBeDefined();
			expect(results.restclient).toBeDefined();
		});

		it('should handle reset functionality', async () => {
			const api = createAPI({ validate: false });

			// Configure first set
			api
				.fromSchemas(mockSchemas)
				.typescript()
				.restClient();

			expect(api.getSchemas()).toHaveLength(2);
			expect(api.getGenerators()).toHaveLength(2);

			// Reset and configure new set
			const newSchemas: AnyTypeSchema[] = [{
				identifier: { 
					name: 'Observation', 
					kind: 'resource', 
					url: 'http://hl7.org/fhir/Observation' 
				},
				description: 'Observation resource',
				fields: {}
			}];

			api.reset().fromSchemas(newSchemas).typescript();

			expect(api.getSchemas()).toHaveLength(1);
			expect(api.getGenerators()).toHaveLength(1);
			expect(api.getSchemas()[0].identifier.name).toBe('Observation');
		});
	});

	describe('Error handling', () => {
		it('should handle empty schema arrays gracefully', async () => {
			const results = await createAPI({ validate: false })
				.fromSchemas([])
				.typescript()
				.restClient()
				.build();

			expect(results.typescript).toBeDefined();
			expect(results.restclient).toBeDefined();
		});

		it('should handle missing generators gracefully', async () => {
			const api = createAPI({ validate: false });
			
			// Don't configure any generators
			const results = await api
				.fromSchemas(mockSchemas)
				.build();

			expect(results).toBeDefined();
			expect(Object.keys(results)).toHaveLength(0);
		});
	});

	describe('Progress tracking', () => {
		it('should call progress callback during generation', async () => {
			const progressCalls: Array<{ phase: string; current: number; total: number; message?: string }> = [];
			
			const api = createAPI({
				outputDir: './test-progress-output',
				validate: false
			});

			api.onProgress((phase, current, total, message) => {
				progressCalls.push({ phase, current, total, message });
			});

			const result = await api
				.fromSchemas(mockSchemas)
				.typescript()
				.generate();

			expect(result.success).toBe(true);
			expect(progressCalls.length).toBeGreaterThan(0);
			
			// Should have at least Loading and Complete phases
			const phases = progressCalls.map(call => call.phase);
			expect(phases).toContain('Loading');
			expect(phases).toContain('Complete');
		});
	});
});