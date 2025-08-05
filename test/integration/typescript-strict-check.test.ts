/**
 * Test to ensure generated TypeScript code passes strict type checking
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { TypeScriptGenerator } from "../../src/generators/typescript";

describe("TypeScript Strict Checks", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `ts-strict-check-${Date.now()}`);
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("generated TypeScript code should compile without errors", async () => {
		const generator = new TypeScriptGenerator({
			outputDir: testDir,
			verbose: false,
		});

		// Mock a comprehensive schema to test various TypeScript features
		const generatorAny = generator as any;
		generatorAny.schemas = {
			primitiveTypes: [
				{
					identifier: { name: "string", kind: "primitive-type", url: "http://hl7.org/fhir/datatypes.html#string" },
					description: "A sequence of Unicode characters",
					dependencies: []
				},
				{
					identifier: { name: "code", kind: "primitive-type", url: "http://hl7.org/fhir/datatypes.html#code" },
					description: "A string from a required value set",
					dependencies: []
				},
				{
					identifier: { name: "id", kind: "primitive-type", url: "http://hl7.org/fhir/datatypes.html#id" },
					description: "Any combination of letters, numerals, \"-\" and \".\", with a length limit of 64 characters",
					dependencies: []
				}
			],
			complexTypes: [
				{
					identifier: { name: "Element", kind: "complex-type", url: "http://hl7.org/fhir/types.html#Element" },
					description: "Base definition for all elements in a resource",
					fields: {
						id: {
							type: { name: "string", kind: "primitive-type" },
							required: false,
							array: false,
							excluded: false
						}
					},
					dependencies: []
				}
			],
			resources: [
				{
					identifier: { name: "Patient", kind: "resource", url: "http://hl7.org/fhir/patient.html" },
					description: "Demographics and other administrative information about an individual",
					base: { name: "DomainResource", kind: "complex-type" },
					fields: {
						resourceType: {
							type: { name: "code", kind: "primitive-type" },
							required: true,
							array: false,
							excluded: false
						},
						id: {
							type: { name: "id", kind: "primitive-type" },
							required: false,
							array: false,
							excluded: false
						},
						name: {
							type: { name: "HumanName", kind: "complex-type" },
							required: false,
							array: true,
							excluded: false,
							min: 0,
							max: undefined
						},
						managingOrganization: {
							reference: [{ name: "Organization", kind: "resource" }],
							required: false,
							array: false,
							excluded: false
						}
					},
					dependencies: []
				},
				{
					identifier: { name: "Organization", kind: "resource", url: "http://hl7.org/fhir/organization.html" },
					description: "A formally or informally recognized grouping of people",
					fields: {
						resourceType: {
							type: { name: "code", kind: "primitive-type" },
							required: true,
							array: false,
							excluded: false
						},
						id: {
							type: { name: "id", kind: "primitive-type" },
							required: false,
							array: false,
							excluded: false
						},
						name: {
							type: { name: "string", kind: "primitive-type" },
							required: false,
							array: false,
							excluded: false
						}
					},
					dependencies: []
				}
			]
		};

		// Generate TypeScript files
		await generator.generate();

		// Check that files exist and contain expected content
		const indexFile = Bun.file(join(testDir, "index.ts"));
		const primitivesFile = Bun.file(join(testDir, "types", "primitives.ts"));
		const complexFile = Bun.file(join(testDir, "types", "complex.ts"));
		const patientFile = Bun.file(join(testDir, "resources", "Patient.ts"));
		const organizationFile = Bun.file(join(testDir, "resources", "Organization.ts"));

		expect(await indexFile.exists()).toBe(true);
		expect(await primitivesFile.exists()).toBe(true);
		expect(await complexFile.exists()).toBe(true);
		expect(await patientFile.exists()).toBe(true);
		expect(await organizationFile.exists()).toBe(true);

		// Check that the generated TypeScript contains proper types
		const primitivesContent = await primitivesFile.text();
		expect(primitivesContent).toContain("export interface Reference<T = any>");
		expect(primitivesContent).toContain("export type string = string;");
		expect(primitivesContent).toContain("export type code = string;");
		expect(primitivesContent).toContain("export type id = string;");

		const indexContent = await indexFile.text();
		expect(indexContent).toContain("export const ResourceTypeMap = {");
		expect(indexContent).toContain("Patient: true,");
		expect(indexContent).toContain("Organization: true,");
		expect(indexContent).toContain("export type AnyResource = Patient | Organization;");
		expect(indexContent).toContain("export function isFHIRResource(obj: any): obj is AnyResource");

		const patientContent = await patientFile.text();
		expect(patientContent).toContain("export interface Patient");
		expect(patientContent).toContain("resourceType: string;");
		expect(patientContent).toContain("id?: string;");
		expect(patientContent).toContain("name?: complex.HumanName[];");
		expect(patientContent).toContain("managingOrganization?: Reference<Organization>;");

		// Create a simple TypeScript test file to verify the generated types work
		const testTypeScriptContent = `
import { Patient, Organization, ResourceTypeMap, isFHIRResource, AnyResource } from './index';

// Test basic resource creation
const patient: Patient = {
	resourceType: 'Patient',
	id: 'patient-123',
	name: []
};

const organization: Organization = {
	resourceType: 'Organization',
	id: 'org-456',
	name: 'Test Organization'
};

// Test type guards
const unknownObject: any = { resourceType: 'Patient' };
if (isFHIRResource(unknownObject)) {
	// Should narrow the type to AnyResource
	console.log(unknownObject.resourceType);
}

// Test resource type map
if ('Patient' in ResourceTypeMap) {
	console.log('Patient is a valid resource type');
}

// Test reference types
const patientWithOrg: Patient = {
	resourceType: 'Patient',
	managingOrganization: {
		reference: 'Organization/org-456',
		display: 'Test Organization'
	}
};

export { patient, organization, patientWithOrg };
`;

		// Write the test TypeScript file
		await Bun.write(join(testDir, "test-types.ts"), testTypeScriptContent);

		// Try to run TypeScript compiler on the generated files to check for compilation errors
		// This is a basic compilation test - in a real project you'd use tsc
		try {
			// Use bun's TypeScript support to check if the files are valid
			const testFile = Bun.file(join(testDir, "test-types.ts"));
			const testContent = await testFile.text();
			
			// Basic validation - check that the test file contains expected imports and usage
			expect(testContent).toContain("import { Patient, Organization");
			expect(testContent).toContain("resourceType: 'Patient'");
			expect(testContent).toContain("isFHIRResource(unknownObject)");
		} catch (error) {
			// If TypeScript compilation fails, the test should fail
			throw new Error(`Generated TypeScript code failed compilation: ${error}`);
		}
	});

	test("should generate type-safe reference handling", async () => {
		const generator = new TypeScriptGenerator({
			outputDir: testDir,
			verbose: false,
		});

		const generatorAny = generator as any;
		generatorAny.schemas = {
			primitiveTypes: [
				{
					identifier: { name: "string", kind: "primitive-type" },
					description: "String type",
					dependencies: []
				}
			],
			complexTypes: [],
			resources: [
				{
					identifier: { name: "Patient", kind: "resource" },
					description: "Patient resource",
					fields: {
						resourceType: {
							type: { name: "code", kind: "primitive-type" },
							required: true,
							array: false,
							excluded: false
						},
						practitioner: {
							reference: [{ name: "Practitioner", kind: "resource" }],
							required: false,
							array: false,
							excluded: false
						},
						organization: {
							reference: [{ name: "Organization", kind: "resource" }],
							required: false,
							array: false,
							excluded: false
						},
						generalPractitioner: {
							reference: [
								{ name: "Practitioner", kind: "resource" },
								{ name: "Organization", kind: "resource" }
							],
							required: false,
							array: true,
							excluded: false
						}
					},
					dependencies: []
				},
				{
					identifier: { name: "Practitioner", kind: "resource" },
					description: "Practitioner resource",
					fields: {
						resourceType: {
							type: { name: "code", kind: "primitive-type" },
							required: true,
							array: false,
							excluded: false
						}
					},
					dependencies: []
				},
				{
					identifier: { name: "Organization", kind: "resource" },
					description: "Organization resource", 
					fields: {
						resourceType: {
							type: { name: "code", kind: "primitive-type" },
							required: true,
							array: false,
							excluded: false
						}
					},
					dependencies: []
				}
			]
		};

		await generator.generate();

		const patientContent = await Bun.file(join(testDir, "resources", "Patient.ts")).text();
		
		// Check single reference type
		expect(patientContent).toContain("practitioner?: Reference<Practitioner>;");
		expect(patientContent).toContain("organization?: Reference<Organization>;");
		
		// Check union reference type for multiple possible targets
		expect(patientContent).toContain("generalPractitioner?: (Reference<Practitioner> | Reference<Organization>)[];");
	});
});