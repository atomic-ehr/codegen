/**
 * FHIR Search Parameter Tests
 * 
 * Tests for search parameter extraction and type generation.
 */

import { describe, test, expect } from "bun:test";
import { 
	extractSearchParametersForResource,
	generateSearchParameterTypes,
	type ProcessedSearchParameter,
	type ResourceSearchParameters
} from "../../../../src/fhir/features/search/parameters";

// Mock TypeSchema Generator
class MockTypeSchemaGenerator {
	async getSearchParameters(resourceType: string) {
		// Mock search parameters for Patient resource
		if (resourceType === 'Patient') {
			return [
				{
					code: 'name',
					type: 'string',
					description: 'A portion of the given or family name of the patient',
					modifier: ['exact', 'contains'],
					multipleOr: true,
					multipleAnd: false
				},
				{
					code: 'birthdate',
					type: 'date',
					description: 'The patient\'s date of birth',
					comparator: ['eq', 'ne', 'gt', 'ge', 'lt', 'le'],
					multipleOr: false,
					multipleAnd: true
				},
				{
					code: 'gender',
					type: 'token',
					description: 'Gender of the patient',
					multipleOr: true,
					multipleAnd: false
				},
				{
					code: 'organization',
					type: 'reference',
					description: 'The organization that is the custodian of the patient record',
					target: ['Organization'],
					chain: ['name', 'identifier'],
					multipleOr: true,
					multipleAnd: false
				},
				{
					code: 'identifier',
					type: 'token',
					description: 'A patient identifier',
					modifier: ['not', 'of-type'],
					multipleOr: true,
					multipleAnd: true
				}
			];
		}
		
		return [];
	}

	async getResourceTypes() {
		return ['Patient', 'Observation', 'Organization'];
	}
}

describe("Search Parameter Extraction", () => {
	let generator: MockTypeSchemaGenerator;

	beforeEach(() => {
		generator = new MockTypeSchemaGenerator();
	});

	test("should extract search parameters for Patient resource", async () => {
		const result = await extractSearchParametersForResource(
			generator as any,
			'Patient'
		);

		expect(result.resourceType).toBe('Patient');
		expect(Object.keys(result.parameters)).toHaveLength(5);
		
		// Check name parameter
		const nameParam = result.parameters.name;
		expect(nameParam.type).toBe('string');
		expect(nameParam.description).toContain('given or family name');
		expect(nameParam.modifier).toContain('exact');
		expect(nameParam.modifier).toContain('contains');
		expect(nameParam.multipleOr).toBe(true);
	});

	test("should extract date parameters with comparators", async () => {
		const result = await extractSearchParametersForResource(
			generator as any,
			'Patient'
		);

		const birthdateParam = result.parameters.birthdate;
		expect(birthdateParam.type).toBe('date');
		expect(birthdateParam.comparator).toContain('ge');
		expect(birthdateParam.comparator).toContain('le');
		expect(birthdateParam.multipleAnd).toBe(true);
	});

	test("should extract reference parameters with targets and chains", async () => {
		const result = await extractSearchParametersForResource(
			generator as any,
			'Patient'
		);

		const orgParam = result.parameters.organization;
		expect(orgParam.type).toBe('reference');
		expect(orgParam.target).toContain('Organization');
		expect(orgParam.chain).toContain('name');
		expect(orgParam.chain).toContain('identifier');
		
		// Check chainable parameters mapping
		expect(result.chainableParameters.organization).toContain('Organization');
	});

	test("should extract token parameters with modifiers", async () => {
		const result = await extractSearchParametersForResource(
			generator as any,
			'Patient'
		);

		const identifierParam = result.parameters.identifier;
		expect(identifierParam.type).toBe('token');
		expect(identifierParam.modifier).toContain('not');
		expect(identifierParam.modifier).toContain('of-type');
		expect(identifierParam.multipleOr).toBe(true);
		expect(identifierParam.multipleAnd).toBe(true);
	});

	test("should handle empty resource parameters", async () => {
		const result = await extractSearchParametersForResource(
			generator as any,
			'UnknownResource'
		);

		expect(result.resourceType).toBe('UnknownResource');
		expect(Object.keys(result.parameters)).toHaveLength(0);
		expect(Object.keys(result.chainableParameters)).toHaveLength(0);
	});
});

describe("Search Parameter Type Generation", () => {
	test("should generate TypeScript types for search parameters", () => {
		const searchParametersMap = new Map<string, ResourceSearchParameters>();
		
		// Mock Patient search parameters
		searchParametersMap.set('Patient', {
			resourceType: 'Patient',
			parameters: {
				name: {
					name: 'name',
					type: 'string',
					description: 'Patient name',
					modifier: ['exact', 'contains'],
					multipleOr: true,
					multipleAnd: false
				},
				birthdate: {
					name: 'birthdate',
					type: 'date',
					description: 'Birth date',
					comparator: ['eq', 'ge', 'le'],
					multipleOr: false,
					multipleAnd: true
				},
				organization: {
					name: 'organization',
					type: 'reference',
					target: ['Organization'],
					chain: ['name'],
					multipleOr: true,
					multipleAnd: false
				}
			},
			chainableParameters: {
				organization: ['Organization']
			}
		});

		const generated = generateSearchParameterTypes(searchParametersMap);

		// Check that it contains base parameter types
		expect(generated).toContain('TokenParam');
		expect(generated).toContain('DateParam');
		expect(generated).toContain('StringParam');
		expect(generated).toContain('ReferenceParam');

		// Check that it contains Patient search interface
		expect(generated).toContain('PatientSearchParams');
		expect(generated).toContain('name?: StringParam | StringParam[]');
		expect(generated).toContain('birthdate?: DateParam | DateParam[]');

		// Check that it contains modifier support
		expect(generated).toContain("'name:exact'");
		expect(generated).toContain("'name:contains'");

		// Check that it contains chaining support
		expect(generated).toContain('Chain search on Organization resource');
		expect(generated).toContain("'organization:Organization'");

		// Check that it contains mapping types
		expect(generated).toContain('SearchParamsMap');
		expect(generated).toContain('Patient: PatientSearchParams');

		// Check that it contains chainable types
		expect(generated).toContain('ChainableParams');
		expect(generated).toContain("Patient: 'organization'");

		// Check that it contains include/revinclude types
		expect(generated).toContain('PatientIncludePaths');
		expect(generated).toContain('PatientRevIncludePaths');

		// Check that it contains sortable types
		expect(generated).toContain('PatientSortableParams');

		// Check that it contains resource mapping
		expect(generated).toContain('ResourceMap');
		expect(generated).toContain('ResourceType');
	});

	test("should handle empty search parameters map", () => {
		const emptyMap = new Map<string, ResourceSearchParameters>();
		const generated = generateSearchParameterTypes(emptyMap);

		// Should still contain base types
		expect(generated).toContain('TokenParam');
		expect(generated).toContain('DateParam');
		
		// But no resource-specific interfaces
		expect(generated).not.toContain('SearchParams');
	});

	test("should generate correct TypeScript types for different parameter types", () => {
		const searchParametersMap = new Map<string, ResourceSearchParameters>();
		
		searchParametersMap.set('Observation', {
			resourceType: 'Observation',
			parameters: {
				code: {
					name: 'code',
					type: 'token',
					multipleOr: true,
					multipleAnd: false
				},
				'value-quantity': {
					name: 'value-quantity',
					type: 'quantity',
					comparator: ['eq', 'ge', 'le'],
					multipleOr: false,
					multipleAnd: false
				},
				date: {
					name: 'date',
					type: 'date',
					comparator: ['eq', 'ge', 'le'],
					multipleOr: false,
					multipleAnd: true
				},
				subject: {
					name: 'subject',
					type: 'reference',
					target: ['Patient', 'Group'],
					multipleOr: true,
					multipleAnd: false
				}
			},
			chainableParameters: {
				subject: ['Patient', 'Group']
			}
		});

		const generated = generateSearchParameterTypes(searchParametersMap);

		// Check token parameter type
		expect(generated).toContain('code?: TokenParam | TokenParam[]');
		
		// Check quantity parameter type
		expect(generated).toContain("'value-quantity'?: QuantityParam");
		
		// Check date parameter type with multiple AND support
		expect(generated).toContain('date?: DateParam | DateParam[]');
		
		// Check reference parameter with multiple targets
		expect(generated).toContain("ReferenceParam<'Patient' | 'Group'>");
	});
});