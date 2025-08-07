/**
 * Tests for TypeScript API Generator
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TypeScriptAPIGenerator } from '../../src/api/generators/typescript';
import type { AnyTypeSchema } from '../../src/typeschema/types';

describe('TypeScriptAPIGenerator', () => {
	let generator: TypeScriptAPIGenerator;
	let mockSchemas: AnyTypeSchema[];

	beforeEach(() => {
		generator = new TypeScriptAPIGenerator({
			outputDir: './test-output'
		});

		mockSchemas = [
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
					},
					given: {
						type: { name: 'string', kind: 'primitive-type' },
						description: 'Given names (not always first). Includes middle names',
						required: false,
						array: true
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
			const customGenerator = new TypeScriptAPIGenerator({
				outputDir: './custom-output',
				moduleFormat: 'cjs',
				generateIndex: false,
				includeDocuments: false,
				namingConvention: 'camelCase'
			});
			expect(customGenerator).toBeDefined();
		});
	});

	describe('build', () => {
		it('should build TypeScript files without writing to disk', async () => {
			const results = await generator.build(mockSchemas);
			
			expect(results).toBeArray();
			expect(results.length).toBeGreaterThan(0);
			
			// Check that we have files for each schema
			const patientFile = results.find(r => r.filename.includes('Patient'));
			expect(patientFile).toBeDefined();
			expect(patientFile!.content).toContain('export interface Patient');
			expect(patientFile!.exports).toContain('Patient');

			const humanNameFile = results.find(r => r.filename.includes('HumanName'));
			expect(humanNameFile).toBeDefined();
			expect(humanNameFile!.content).toContain('export interface HumanName');
			expect(humanNameFile!.exports).toContain('HumanName');
		});

		it('should generate index file when requested', async () => {
			const customGenerator = new TypeScriptAPIGenerator({
				outputDir: './test-output',
				generateIndex: true
			});

			const results = await customGenerator.build(mockSchemas);
			const indexFile = results.find(r => r.filename === 'index.ts');
			
			expect(indexFile).toBeDefined();
			expect(indexFile!.content).toContain('export type { Patient }');
			expect(indexFile!.content).toContain('export type { HumanName }');
		});

		it('should handle empty schema array', async () => {
			const results = await generator.build([]);
			expect(results).toBeArray();
		});
	});

	describe('setOutputDir', () => {
		it('should update output directory', () => {
			generator.setOutputDir('./new-output');
			const options = generator.getOptions();
			expect(options.outputDir).toBe('./new-output');
		});
	});

	describe('setOptions', () => {
		it('should update generator options', () => {
			generator.setOptions({
				moduleFormat: 'cjs',
				generateIndex: false
			});

			const options = generator.getOptions();
			expect(options.moduleFormat).toBe('cjs');
			expect(options.generateIndex).toBe(false);
		});
	});

	describe('getOptions', () => {
		it('should return current options', () => {
			const options = generator.getOptions();
			expect(options.outputDir).toBe('./test-output');
			expect(options.moduleFormat).toBe('esm');
			expect(options.generateIndex).toBe(true);
		});
	});
});