/**
 * FHIR Search Parameter Extractors Tests
 * 
 * Tests for advanced search parameter extraction and analysis.
 */

import { describe, test, expect } from "bun:test";
import {
	AdvancedSearchParameterExtractor,
	SearchParameterRelationshipAnalyzer,
	SearchParameterUtils,
	type EnhancedSearchParameter,
	type SearchParameterExtractionOptions
} from "../../../../src/fhir/features/search/extractors";

// Mock TypeSchema Generator
class MockAdvancedTypeSchemaGenerator {
	async getSearchParameters(resourceType: string) {
		if (resourceType === 'Patient') {
			return [
				{
					code: 'name',
					type: 'string',
					description: 'A portion of the given or family name of the patient',
					expression: 'Patient.name.given | Patient.name.family',
					url: 'http://hl7.org/fhir/SearchParameter/Patient-name',
					base: ['Patient'],
					status: 'active',
					experimental: false,
					modifier: ['exact', 'contains'],
					multipleOr: true,
					multipleAnd: false
				},
				{
					code: 'organization',
					type: 'reference',
					description: 'The organization that is the custodian of the patient record',
					expression: 'Patient.managingOrganization',
					url: 'http://hl7.org/fhir/SearchParameter/Patient-organization',
					base: ['Patient'],
					target: ['Organization'],
					chain: ['name', 'identifier'],
					multipleOr: true,
					multipleAnd: false
				},
				{
					code: 'experimental-param',
					type: 'string',
					description: 'Experimental parameter for testing',
					expression: 'Patient.extension.value',
					base: ['Patient'],
					experimental: true
				}
			];
		}

		if (resourceType === 'Observation') {
			return [
				{
					code: 'subject',
					type: 'reference',
					description: 'The subject of the observation',
					expression: 'Observation.subject',
					base: ['Observation'],
					target: ['Patient', 'Group'],
					chain: ['name', 'identifier']
				},
				{
					code: 'code-value-quantity',
					type: 'composite',
					description: 'Code and quantity value',
					expression: 'Observation.code & Observation.valueQuantity',
					base: ['Observation'],
					component: [
						{
							definition: 'http://hl7.org/fhir/SearchParameter/clinical-code',
							expression: 'Observation.code'
						},
						{
							definition: 'http://hl7.org/fhir/SearchParameter/Observation-value-quantity',
							expression: 'Observation.valueQuantity'
						}
					]
				}
			];
		}

		return [];
	}

	async getResourceTypes() {
		return ['Patient', 'Observation', 'Organization'];
	}
}

describe("AdvancedSearchParameterExtractor", () => {
	let generator: MockAdvancedTypeSchemaGenerator;
	let extractor: AdvancedSearchParameterExtractor;

	beforeEach(() => {
		generator = new MockAdvancedTypeSchemaGenerator();
		extractor = new AdvancedSearchParameterExtractor(generator as any);
	});

	test("should extract enhanced parameters for a resource", async () => {
		const parameters = await extractor.extractParametersForResource('Patient');

		expect(parameters).toHaveLength(5); // 3 from mock + 2 base parameters (id, lastUpdated, etc.)
		
		// Check enhanced parameter structure
		const nameParam = parameters.find(p => p.name === 'name');
		expect(nameParam).toBeDefined();
		expect(nameParam!.expression).toBe('Patient.name.given | Patient.name.family');
		expect(nameParam!.url).toBe('http://hl7.org/fhir/SearchParameter/Patient-name');
		expect(nameParam!.base).toContain('Patient');
		expect(nameParam!.status).toBe('active');
		expect(nameParam!.experimental).toBe(false);
	});

	test("should include base parameters when requested", async () => {
		const extractorWithBase = new AdvancedSearchParameterExtractor(
			generator as any,
			{ includeBase: true }
		);

		const parameters = await extractorWithBase.extractParametersForResource('Patient');
		
		// Should include base parameters like _id, _lastUpdated, etc.
		const idParam = parameters.find(p => p.name === '_id');
		const lastUpdatedParam = parameters.find(p => p.name === '_lastUpdated');
		
		expect(idParam).toBeDefined();
		expect(idParam!.type).toBe('token');
		expect(lastUpdatedParam).toBeDefined();
		expect(lastUpdatedParam!.type).toBe('date');
	});

	test("should filter experimental parameters when excluded", async () => {
		const extractorNoExp = new AdvancedSearchParameterExtractor(
			generator as any,
			{ includeExperimental: false }
		);

		const parameters = await extractorNoExp.extractParametersForResource('Patient');
		
		const experimentalParam = parameters.find(p => p.name === 'experimental-param');
		expect(experimentalParam).toBeUndefined();
	});

	test("should include experimental parameters when requested", async () => {
		const extractorWithExp = new AdvancedSearchParameterExtractor(
			generator as any,
			{ includeExperimental: true }
		);

		const parameters = await extractorWithExp.extractParametersForResource('Patient');
		
		const experimentalParam = parameters.find(p => p.name === 'experimental-param');
		expect(experimentalParam).toBeDefined();
		expect(experimentalParam!.experimental).toBe(true);
	});

	test("should extract composite parameters correctly", async () => {
		const parameters = await extractor.extractParametersForResource('Observation');
		
		const compositeParam = parameters.find(p => p.name === 'code-value-quantity');
		expect(compositeParam).toBeDefined();
		expect(compositeParam!.type).toBe('composite');
		expect(compositeParam!.component).toHaveLength(2);
		expect(compositeParam!.component![0].expression).toBe('Observation.code');
		expect(compositeParam!.component![1].expression).toBe('Observation.valueQuantity');
	});

	test("should extract all enhanced parameters", async () => {
		const allParameters = await extractor.extractAllEnhancedParameters();
		
		expect(allParameters.has('Patient')).toBe(true);
		expect(allParameters.has('Observation')).toBe(true);
		
		const patientParams = allParameters.get('Patient')!;
		const observationParams = allParameters.get('Observation')!;
		
		expect(patientParams.length).toBeGreaterThan(0);
		expect(observationParams.length).toBeGreaterThan(0);
	});

	test("should generate parameter documentation", () => {
		const param: EnhancedSearchParameter = {
			name: 'name',
			type: 'string',
			description: 'Patient name parameter',
			expression: 'Patient.name',
			base: ['Patient'],
			modifier: ['exact', 'contains'],
			multipleOr: true,
			url: 'http://hl7.org/fhir/SearchParameter/Patient-name'
		};

		const doc = extractor.generateParameterDocumentation(param);
		
		expect(doc).toContain('Patient name parameter');
		expect(doc).toContain('Expression: Patient.name');
		expect(doc).toContain('Type: string');
		expect(doc).toContain('Modifiers: exact, contains');
		expect(doc).toContain('Multiple: OR');
		expect(doc).toContain('URL: http://hl7.org/fhir/SearchParameter/Patient-name');
	});

	test("should analyze parameter usage patterns", async () => {
		const usage = await extractor.analyzeParameterUsage('Patient');
		
		expect(usage.mostCommon).toContain('name');
		expect(usage.chainable).toContain('organization');
		expect(usage.composite).toHaveLength(0); // No composite params in Patient mock
	});

	test("should generate comprehensive statistics", async () => {
		const stats = await extractor.generateStatistics();
		
		expect(stats.totalParameters).toBeGreaterThan(0);
		expect(stats.byType.string).toBeGreaterThan(0);
		expect(stats.byType.reference).toBeGreaterThan(0);
		expect(stats.byResourceType['Patient']).toBeGreaterThan(0);
		expect(stats.withModifiers).toBeGreaterThan(0);
		expect(stats.chainable).toBeGreaterThan(0);
	});
});

describe("SearchParameterRelationshipAnalyzer", () => {
	test("should find parameters referencing a resource", () => {
		const parametersMap = new Map();
		
		parametersMap.set('Observation', {
			resourceType: 'Observation',
			parameters: {
				subject: {
					name: 'subject',
					type: 'reference',
					target: ['Patient'],
					base: ['Observation']
				}
			},
			chainableParameters: {
				subject: ['Patient']
			}
		});

		const analyzer = new SearchParameterRelationshipAnalyzer(parametersMap);
		const references = analyzer.findParametersReferencingResource('Patient');
		
		expect(references).toHaveLength(1);
		expect(references[0].resourceType).toBe('Observation');
		expect(references[0].parameterName).toBe('subject');
	});

	test("should build parameter dependency graph", () => {
		const parametersMap = new Map();
		
		parametersMap.set('Observation', {
			resourceType: 'Observation',
			parameters: {
				subject: {
					name: 'subject',
					type: 'reference',
					target: ['Patient'],
					chain: ['name'],
					base: ['Observation']
				}
			},
			chainableParameters: {
				subject: ['Patient']
			}
		});

		parametersMap.set('Patient', {
			resourceType: 'Patient',
			parameters: {
				name: {
					name: 'name',
					type: 'string',
					base: ['Patient']
				}
			},
			chainableParameters: {}
		});

		const analyzer = new SearchParameterRelationshipAnalyzer(parametersMap);
		const graph = analyzer.buildParameterDependencyGraph();
		
		expect(graph.has('Observation.subject')).toBe(true);
		expect(graph.get('Observation.subject')!.has('Patient.name')).toBe(true);
	});

	test("should detect circular dependencies", () => {
		const parametersMap = new Map();
		
		// Create circular dependency scenario (unlikely in real FHIR but possible)
		parametersMap.set('ResourceA', {
			resourceType: 'ResourceA',
			parameters: {
				refB: {
					name: 'refB',
					type: 'reference',
					target: ['ResourceB'],
					chain: ['refA'],
					base: ['ResourceA']
				}
			},
			chainableParameters: {
				refB: ['ResourceB']
			}
		});

		parametersMap.set('ResourceB', {
			resourceType: 'ResourceB',
			parameters: {
				refA: {
					name: 'refA',
					type: 'reference',
					target: ['ResourceA'],
					chain: ['refB'],
					base: ['ResourceB']
				}
			},
			chainableParameters: {
				refA: ['ResourceA']
			}
		});

		const analyzer = new SearchParameterRelationshipAnalyzer(parametersMap);
		const cycles = analyzer.findCircularDependencies();
		
		// Should detect the circular dependency
		expect(cycles.length).toBeGreaterThan(0);
	});
});

describe("SearchParameterUtils", () => {
	test("should normalize parameter names", () => {
		expect(SearchParameterUtils.normalizeParameterName('normal-param')).toBe('normal_param');
		expect(SearchParameterUtils.normalizeParameterName('param.with.dots')).toBe('paramwithdots');
		expect(SearchParameterUtils.normalizeParameterName('param-with-dashes')).toBe('param_with_dashes');
	});

	test("should generate TypeScript types", () => {
		const stringParam: EnhancedSearchParameter = {
			name: 'name',
			type: 'string',
			multipleOr: true,
			base: ['Patient']
		};

		const tokenParam: EnhancedSearchParameter = {
			name: 'identifier',
			type: 'token',
			multipleOr: false,
			base: ['Patient']
		};

		expect(SearchParameterUtils.generateTypeScriptType(stringParam)).toBe('StringParam | StringParam[]');
		expect(SearchParameterUtils.generateTypeScriptType(tokenParam)).toBe('TokenParam');
	});

	test("should generate validation rules", () => {
		const dateParam: EnhancedSearchParameter = {
			name: 'birthdate',
			type: 'date',
			base: ['Patient']
		};

		const rules = SearchParameterUtils.generateValidationRules(dateParam);
		
		expect(rules.required).toBe(false);
		expect(rules.type).toBe('date');
		expect(rules.pattern).toContain('\\d{4}');
		expect(rules.multipleValues).toBe(false);
	});
});