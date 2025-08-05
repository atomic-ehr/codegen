import { test, expect } from "bun:test";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import {
	transformProfile,
	isUSCoreProfile,
	buildSchemaIdentifier,
	extractUSCoreConstraints,
} from "../../src/lib/typeschema";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";

// Create a mock manager for testing
function createMockManager() {
	return {
		resolveSync: (url: string) => {
			// Return undefined for base types we can't resolve
			return undefined;
		},
		resolve: async (url: string) => {
			return undefined;
		},
		findByUrl: async (url: string) => {
			// Mock some common base types
			if (url === "http://hl7.org/fhir/StructureDefinition/Observation") {
				return {
					name: "Observation",
					kind: "resource",
					derivation: "specialization",
				};
			}
			// Mock US Core profile
			if (url === "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure") {
				return {
					name: "us-core-blood-pressure",
					kind: "resource",
					derivation: "constraint", // This makes it a profile
					base: "http://hl7.org/fhir/StructureDefinition/Observation",
				};
			}
			return undefined;
		}
	} as any;
}

test("profile identification", () => {
	// Test US Core profile identification
	const usCoreSchema: Partial<FHIRSchema> = {
		name: "USCoreBloodPressure",
		url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure",
		derivation: "constraint",
		base: "http://hl7.org/fhir/StructureDefinition/Observation",
		kind: "resource",
	};

	expect(isUSCoreProfile(usCoreSchema as FHIRSchema)).toBe(true);

	// Test non-US Core profile
	const regularSchema: Partial<FHIRSchema> = {
		name: "CustomProfile",
		url: "http://example.com/StructureDefinition/custom-profile",
		derivation: "constraint",
		base: "http://hl7.org/fhir/StructureDefinition/Patient",
		kind: "resource",
	};

	expect(isUSCoreProfile(regularSchema as FHIRSchema)).toBe(false);
});

test("profile identifier generation", () => {
	const profileSchema: Partial<FHIRSchema> = {
		name: "USCoreBloodPressure",
		url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure",
		derivation: "constraint",
		base: "http://hl7.org/fhir/StructureDefinition/Observation",
		kind: "resource",
		package_name: "hl7.fhir.us.core",
		package_version: "8.0.0",
	};

	const identifier = buildSchemaIdentifier(profileSchema as FHIRSchema);

	expect(identifier.kind).toBe("profile");
	expect(identifier.name).toBe("USCoreBloodPressure");
	expect(identifier.package).toBe("hl7.fhir.us.core");
	expect(identifier.version).toBe("8.0.0");
	expect(identifier.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure");
});

test("profile transformation", async () => {
	console.log("[DEBUG_LOG] Starting profile transformation test");

	const manager = createMockManager();

	const profileSchema: FHIRSchema = {
		name: "USCoreBloodPressure",
		url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure",
		derivation: "constraint",
		base: "http://hl7.org/fhir/StructureDefinition/Observation",
		kind: "resource",
		type: "Observation",
		package_name: "hl7.fhir.us.core",
		package_version: "8.0.0",
		description: "US Core Blood Pressure Profile",
		elements: {},
	};

	const packageInfo = {
		name: "hl7.fhir.us.core",
		version: "8.0.0",
	};

	try {
		const result = await transformProfile(profileSchema, manager, packageInfo);

		console.log("[DEBUG_LOG] Profile transformation result:", JSON.stringify(result, null, 2));

		expect(result.identifier.kind).toBe("profile");
		expect(result.identifier.name).toBe("USCoreBloodPressure");
		expect(result.description).toBe("US Core Blood Pressure Profile");
		expect(result.base).toBeDefined();
		expect(result.base?.name).toBe("Observation");
		expect(result.base?.kind).toBe("resource");
		expect(result.dependencies).toContain(result.base);
	} catch (error) {
		console.log("[DEBUG_LOG] Profile transformation error:", error);
		throw error;
	}
});

test("profile inheritance hierarchy", async () => {
	console.log("[DEBUG_LOG] Starting profile inheritance test");

	const manager = createMockManager();

	// Test a profile that extends another profile
	const childProfileSchema: FHIRSchema = {
		name: "CustomBloodPressure",
		url: "http://example.com/StructureDefinition/custom-blood-pressure",
		derivation: "constraint",
		base: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure",
		kind: "resource",
		type: "Observation",
		package_name: "example.fhir.profiles",
		package_version: "1.0.0",
		description: "Custom Blood Pressure Profile extending US Core",
		elements: {},
	};

	const packageInfo = {
		name: "example.fhir.profiles",
		version: "1.0.0",
	};

	try {
		const result = await transformProfile(childProfileSchema, manager, packageInfo);

		console.log("[DEBUG_LOG] Child profile transformation result:", JSON.stringify(result, null, 2));

		expect(result.identifier.kind).toBe("profile");
		expect(result.identifier.name).toBe("CustomBloodPressure");
		expect(result.base).toBeDefined();
		expect(result.base?.name).toBe("us-core-blood-pressure");
		// The base should be detected as a profile since it extends another profile
		expect(result.base?.kind).toBe("profile");
	} catch (error) {
		console.log("[DEBUG_LOG] Child profile transformation error:", error);
		throw error;
	}
});

test("profile with constraints and extensions", async () => {
	console.log("[DEBUG_LOG] Starting profile constraints and extensions test");

	const manager = createMockManager();

	// Test a profile with constraints, extensions, and validation rules
	const profileWithConstraints: FHIRSchema = {
		name: "USCorePatient",
		url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
		derivation: "constraint",
		base: "http://hl7.org/fhir/StructureDefinition/Patient",
		kind: "resource",
		type: "Patient",
		package_name: "hl7.fhir.us.core",
		package_version: "8.0.0",
		description: "US Core Patient Profile",
		publisher: "HL7 US Realm Steering Committee",
		experimental: false,
		date: "2023-10-01",
		elements: {
			"Patient.identifier": {
				min: 1,
				max: "*",
				mustSupport: true,
				type: [{ code: "Identifier" }],
			},
			"Patient.name": {
				min: 1,
				max: "*",
				mustSupport: true,
				type: [{ code: "HumanName" }],
			},
			"Patient.gender": {
				min: 1,
				max: "1",
				mustSupport: true,
				binding: {
					strength: "required",
					valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender",
				},
			},
			"Patient.extension:race": {
				min: 0,
				max: "1",
				mustSupport: true,
				type: [{
					code: "Extension",
					profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-race"],
				}],
			},
			"Patient.birthDate": {
				min: 0,
				max: "1",
				mustSupport: true,
				constraint: [{
					key: "us-core-6",
					severity: "error",
					human: "At least name.given or name.family SHALL be present",
					expression: "name.given.exists() or name.family.exists()",
				}],
			},
		},
	};

	const packageInfo = {
		name: "hl7.fhir.us.core",
		version: "8.0.0",
	};

	try {
		const result = await transformProfile(profileWithConstraints, manager, packageInfo);

		console.log("[DEBUG_LOG] Profile with constraints result:", JSON.stringify(result, null, 2));

		// Test basic profile properties
		expect(result.identifier.kind).toBe("profile");
		expect(result.identifier.name).toBe("USCorePatient");
		expect(result.description).toBe("US Core Patient Profile");

		// Test metadata
		expect(result.metadata).toBeDefined();
		expect(result.metadata?.isUSCore).toBe(true);
		expect(result.metadata?.profileType).toBe("us-core");
		expect(result.metadata?.publisher).toBe("HL7 US Realm Steering Committee");
		expect(result.metadata?.experimental).toBe(false);

		// Test constraints
		expect(result.constraints).toBeDefined();
		expect(result.constraints?.["Patient.identifier"]).toBeDefined();
		expect(result.constraints?.["Patient.identifier"].min).toBe(1);
		expect(result.constraints?.["Patient.identifier"].mustSupport).toBe(true);
		expect(result.constraints?.["Patient.gender"].binding).toBeDefined();
		expect(result.constraints?.["Patient.gender"].binding?.strength).toBe("required");

		// Test extensions
		expect(result.extensions).toBeDefined();
		expect(result.extensions?.length).toBeGreaterThan(0);
		const raceExtension = result.extensions?.find(ext => ext.path === "Patient.extension:race");
		expect(raceExtension).toBeDefined();
		expect(raceExtension?.profile).toContain("http://hl7.org/fhir/us/core/StructureDefinition/us-core-race");

		// Test validation rules
		expect(result.validation).toBeDefined();
		expect(result.validation?.length).toBeGreaterThan(0);
		const nameConstraint = result.validation?.find(rule => rule.key === "us-core-6");
		expect(nameConstraint).toBeDefined();
		expect(nameConstraint?.severity).toBe("error");

	} catch (error) {
		console.log("[DEBUG_LOG] Profile constraints test error:", error);
		throw error;
	}
});

test("US Core constraint extraction", () => {
	console.log("[DEBUG_LOG] Starting US Core constraint extraction test");

	const usCoreSchema: FHIRSchema = {
		name: "USCoreObservation",
		url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation",
		derivation: "constraint",
		base: "http://hl7.org/fhir/StructureDefinition/Observation",
		kind: "resource",
		type: "Observation",
		package_name: "hl7.fhir.us.core",
		package_version: "8.0.0",
		elements: {
			"Observation.status": {
				min: 1,
				max: "1",
				mustSupport: true,
				binding: {
					strength: "required",
					valueSet: "http://hl7.org/fhir/ValueSet/observation-status",
				},
			},
			"Observation.code": {
				min: 1,
				max: "1",
				mustSupport: true,
			},
			"Observation.subject": {
				min: 1,
				max: "1",
				mustSupport: true,
			},
		},
	};

	const constraints = extractUSCoreConstraints(usCoreSchema);

	console.log("[DEBUG_LOG] US Core constraints:", JSON.stringify(constraints, null, 2));

	expect(Object.keys(constraints).length).toBeGreaterThan(0);
	expect(constraints["Observation.status"]).toBeDefined();
	expect(constraints["Observation.status"].mustSupport).toBe(true);
	expect(constraints["Observation.status"].usCoreRequirement).toBe("SHALL support");
	expect(constraints["Observation.status"].required).toBe(true);
	expect(constraints["Observation.status"].requiredValueSet).toBe("http://hl7.org/fhir/ValueSet/observation-status");
});
