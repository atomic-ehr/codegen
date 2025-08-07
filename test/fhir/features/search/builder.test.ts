/**
 * FHIR Search Builder Tests
 * 
 * Tests for the type-safe FHIR search builder functionality.
 */

import { describe, test, expect, jest } from "bun:test";
import { 
	FHIRSearchBuilder, 
	ChainedSearchBuilder, 
	AdvancedSearchResultProcessor,
	SearchParameterValidatorImpl 
} from "../../../../src/fhir/features/search/builder";

// Mock FHIR client
class MockFHIRClient {
	async search(resourceType: string, params: Record<string, any>) {
		return {
			data: {
				resourceType: "Bundle",
				type: "searchset",
				total: 1,
				entry: [
					{
						resource: {
							resourceType: resourceType,
							id: "test-id",
							name: [{ family: "Doe", given: ["John"] }]
						}
					}
				],
				link: [
					{ relation: "self", url: `/${resourceType}?${new URLSearchParams(params).toString()}` }
				]
			},
			status: 200,
			headers: {}
		};
	}

	async request(method: string, path: string, body?: any, options?: any) {
		return {
			data: { resourceType: "OperationOutcome", issue: [] },
			status: 200,
			headers: {}
		};
	}
}

describe("FHIRSearchBuilder", () => {
	let client: MockFHIRClient;
	let builder: FHIRSearchBuilder<'Patient'>;

	beforeEach(() => {
		client = new MockFHIRClient();
		builder = new FHIRSearchBuilder(client as any, 'Patient');
	});

	test("should create a search builder instance", () => {
		expect(builder).toBeDefined();
		expect(builder.constructor.name).toBe("FHIRSearchBuilder");
	});

	test("should add basic parameters", () => {
		const result = builder.where('name' as any, 'John');
		expect(result).toBeInstanceOf(FHIRSearchBuilder);
		expect(result.getParams()).toEqual({ name: 'John' });
	});

	test("should support method chaining", () => {
		const result = builder
			.where('name' as any, 'John')
			.where('active' as any, true)
			.count(10);
		
		expect(result.getParams()).toEqual({
			name: 'John',
			active: true,
			_count: 10
		});
	});

	test("should support string search with modifiers", () => {
		const result = builder.whereString('name', 'John', 'contains');
		expect(result.getParams()).toEqual({
			'name:contains': 'John'
		});
	});

	test("should support token search with system and code", () => {
		const result = builder.whereToken('identifier', 'http://hl7.org/fhir/sid/us-ssn', '123-45-6789');
		expect(result.getParams()).toEqual({
			identifier: 'http://hl7.org/fhir/sid/us-ssn|123-45-6789'
		});
	});

	test("should support token search with code only", () => {
		const result = builder.whereToken('gender', undefined, 'male');
		expect(result.getParams()).toEqual({
			gender: 'male'
		});
	});

	test("should support date search with comparator", () => {
		const date = new Date('2023-01-01');
		const result = builder.whereDate('birthdate', date, 'ge');
		expect(result.getParams()).toEqual({
			birthdate: 'ge2023-01-01T00:00:00.000Z'
		});
	});

	test("should support date range search", () => {
		const start = new Date('2020-01-01');
		const end = new Date('2023-12-31');
		const result = builder.dateRange('birthdate', start, end);
		
		const params = result.getParams();
		expect(params.birthdate).toContain('ge2020-01-01');
		expect(params.birthdate).toContain('le2023-12-31');
	});

	test("should support number search with comparator", () => {
		const result = builder.whereNumber('age', 18, 'ge');
		expect(result.getParams()).toEqual({
			age: 'ge18'
		});
	});

	test("should support quantity search", () => {
		const result = builder.whereQuantity('weight', 70, 'kg', 'http://unitsofmeasure.org');
		expect(result.getParams()).toEqual({
			weight: '70|http://unitsofmeasure.org|kg'
		});
	});

	test("should support reference search", () => {
		const result = builder.whereReference('organization', 'Organization/123');
		expect(result.getParams()).toEqual({
			organization: 'Organization/123'
		});
	});

	test("should support multiple values with OR logic", () => {
		const result = builder.whereMultiple('status', ['active', 'inactive']);
		expect(result.getParams()).toEqual({
			status: 'active,inactive'
		});
	});

	test("should support pagination", () => {
		const result = builder.count(20).offset(100);
		expect(result.getParams()).toEqual({
			_count: 20,
			_offset: 100
		});
	});

	test("should support sorting", () => {
		const result = builder.sort('name' as any, 'desc');
		expect(result.getParams()).toEqual({
			_sort: '-name'
		});
	});

	test("should support includes", () => {
		const result = builder.include('Patient:organization');
		expect(result.getParams()).toEqual({
			_include: ['Patient:organization']
		});
	});

	test("should support reverse includes", () => {
		const result = builder.revInclude('Observation:patient');
		expect(result.getParams()).toEqual({
			_revinclude: ['Observation:patient']
		});
	});

	test("should support text search", () => {
		const result = builder.text('diabetes');
		expect(result.getParams()).toEqual({
			_text: 'diabetes'
		});
	});

	test("should support content search", () => {
		const result = builder.content('medication');
		expect(result.getParams()).toEqual({
			_content: 'medication'
		});
	});

	test("should support summary modes", () => {
		const result = builder.summary('true');
		expect(result.getParams()).toEqual({
			_summary: 'true'
		});
	});

	test("should support elements filtering", () => {
		const result = builder.elements('id', 'name', 'birthDate');
		expect(result.getParams()).toEqual({
			_elements: 'id,name,birthDate'
		});
	});

	test("should support last updated filtering", () => {
		const date = '2023-01-01';
		const result = builder.lastUpdated(date, 'ge');
		expect(result.getParams()).toEqual({
			_lastUpdated: 'ge2023-01-01'
		});
	});

	test("should support ID search", () => {
		const result = builder.id('patient-123');
		expect(result.getParams()).toEqual({
			_id: 'patient-123'
		});
	});

	test("should support multiple ID search", () => {
		const result = builder.ids('id1', 'id2', 'id3');
		expect(result.getParams()).toEqual({
			_id: 'id1,id2,id3'
		});
	});

	test("should generate correct search URL", () => {
		const result = builder
			.where('name' as any, 'John')
			.where('active' as any, true)
			.count(10);
		
		const url = result.toUrl();
		expect(url).toContain('Patient?');
		expect(url).toContain('name=John');
		expect(url).toContain('active=true');
		expect(url).toContain('_count=10');
	});

	test("should execute search and return promise", async () => {
		const result = builder.where('name' as any, 'John');
		const response = await result.execute();
		
		expect(response.data.resourceType).toBe('Bundle');
		expect(response.data.total).toBe(1);
		expect(response.status).toBe(200);
	});

	test("should support await syntax", async () => {
		const result = builder.where('name' as any, 'John');
		const response = await result;
		
		expect(response.data.resourceType).toBe('Bundle');
		expect(response.data.total).toBe(1);
	});
});

describe("ChainedSearchBuilder", () => {
	let client: MockFHIRClient;
	let builder: ChainedSearchBuilder<'Observation', 'Patient'>;

	beforeEach(() => {
		client = new MockFHIRClient();
		builder = new ChainedSearchBuilder(client as any, 'Observation', 'patient');
	});

	test("should create a chained search builder", () => {
		expect(builder).toBeInstanceOf(ChainedSearchBuilder);
		expect(builder).toBeInstanceOf(FHIRSearchBuilder);
	});

	test("should support chained parameters", () => {
		const result = builder.where('name' as any, 'John');
		expect(result.getParams()).toEqual({
			'patient.name': 'John'
		});
	});
});

describe("AdvancedSearchResultProcessor", () => {
	const mockBundle = {
		resourceType: "Bundle" as const,
		type: "searchset" as const,
		total: 2,
		entry: [
			{
				resource: { resourceType: "Patient", id: "1", name: [{ family: "Doe" }] },
				search: { mode: "match" as const, score: 0.9 }
			},
			{
				resource: { resourceType: "Patient", id: "2", name: [{ family: "Smith" }] },
				search: { mode: "match" as const, score: 0.8 }
			},
			{
				resource: { resourceType: "Organization", id: "org1" },
				search: { mode: "include" as const }
			}
		],
		link: [
			{ relation: "next" as const, url: "/Patient?_count=10&_offset=10" },
			{ relation: "self" as const, url: "/Patient?_count=10" }
		]
	};

	let processor: AdvancedSearchResultProcessor<any>;

	beforeEach(() => {
		processor = new AdvancedSearchResultProcessor(mockBundle);
	});

	test("should extract resources from bundle", () => {
		const resources = processor.getResources();
		expect(resources).toHaveLength(3);
		expect(resources[0].resourceType).toBe("Patient");
	});

	test("should get first resource", () => {
		const first = processor.first();
		expect(first?.resourceType).toBe("Patient");
		expect(first?.id).toBe("1");
	});

	test("should get total count", () => {
		expect(processor.total()).toBe(2);
	});

	test("should check for next page", () => {
		expect(processor.hasNext()).toBe(true);
	});

	test("should check for previous page", () => {
		expect(processor.hasPrevious()).toBe(false);
	});

	test("should get next URL", () => {
		const nextUrl = processor.getNextUrl();
		expect(nextUrl).toBe("/Patient?_count=10&_offset=10");
	});

	test("should filter resources", () => {
		const patients = processor.filter(r => r.resourceType === "Patient");
		expect(patients).toHaveLength(2);
	});

	test("should map resources", () => {
		const ids = processor.map(r => r.id);
		expect(ids).toEqual(["1", "2", "org1"]);
	});

	test("should group resources by property", () => {
		const grouped = processor.groupBy("resourceType");
		expect(grouped["Patient"]).toHaveLength(2);
		expect(grouped["Organization"]).toHaveLength(1);
	});

	test("should get included resources", () => {
		const included = processor.getIncluded();
		expect(included).toHaveLength(1);
		expect(included[0].resourceType).toBe("Organization");
	});
});

describe("SearchParameterValidator", () => {
	test("should validate valid parameters", () => {
		const result = SearchParameterValidatorImpl.validate('Patient', {
			name: 'John',
			_count: 10,
			_offset: 0
		});

		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test("should detect invalid _count parameter", () => {
		const result = SearchParameterValidatorImpl.validate('Patient', {
			_count: -5
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toContain('_count must be a non-negative number');
	});

	test("should detect invalid _offset parameter", () => {
		const result = SearchParameterValidatorImpl.validate('Patient', {
			_offset: -10
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toContain('_offset must be a non-negative number');
	});

	test("should warn about large _count values", () => {
		const result = SearchParameterValidatorImpl.validate('Patient', {
			_count: 2000
		});

		expect(result.valid).toBe(true);
		expect(result.warnings).toContain('_count values over 1000 may cause performance issues');
	});

	test("should validate single parameter", () => {
		const result = SearchParameterValidatorImpl.validateParameter('Patient', 'name', null);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain('Parameter \'name\' cannot be null or undefined');
	});
});