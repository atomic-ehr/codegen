/**
 * Basic Usage Examples for Atomic FHIR Codegen
 *
 * This file demonstrates common usage patterns for generating
 * FHIR types using the Atomic Codegen toolkit.
 */

import type { Bundle, Observation, Patient } from "../generated/types";
import { APIBuilder } from "../src/api/builder";

// ============================================
// Example 1: Generate Basic FHIR R4 Types
// ============================================

async function generateBasicFHIRTypes() {
	console.log("📦 Generating FHIR R4 Core Types...");

	const builder = new APIBuilder();

	await builder
		.fromPackage("hl7.fhir.r4.core", "4.0.1")
		.typescript({
			generateIndex: true,
			includeDocuments: true,
		})
		.outputTo("./generated/fhir-r4")
		.generate();

	console.log("✅ FHIR R4 types generated successfully!");
}

// ============================================
// Example 2: Generate US Core Profile Types
// ============================================

async function generateUSCoreTypes() {
	console.log("🇺🇸 Generating US Core Profile Types...");

	const builder = new APIBuilder();

	await builder
		.fromPackage("hl7.fhir.us.core", "5.0.1")
		.fromPackage("hl7.fhir.r4.core", "4.0.1")
		.typescript({
			includeProfiles: true,
			includeExtensions: true,
		})
		.outputTo("./generated/us-core")
		.generate();

	console.log("✅ US Core types generated successfully!");
}

// ============================================
// Example 5: Using Generated Types
// ============================================

function demonstrateGeneratedTypes() {
	console.log("💡 Demonstrating Generated Types Usage...");

	// Create a type-safe Patient resource
	const patient: Patient = {
		resourceType: "Patient",
		id: "patient-123",
		meta: {
			versionId: "1",
			lastUpdated: "2024-01-15T10:30:00Z",
		},
		identifier: [
			{
				system: "http://hospital.example.org/patients",
				value: "MRN-12345",
			},
		],
		active: true,
		name: [
			{
				use: "official",
				family: "Smith",
				given: ["John", "Michael"],
			},
		],
		gender: "male",
		birthDate: "1980-05-15",
		address: [
			{
				use: "home",
				line: ["123 Main St"],
				city: "Boston",
				state: "MA",
				postalCode: "02101",
				country: "USA",
			},
		],
	};

	// Create a type-safe Observation with reference
	const observation: Observation = {
		resourceType: "Observation",
		id: "obs-456",
		status: "final",
		code: {
			coding: [
				{
					system: "http://loinc.org",
					code: "85354-9",
					display: "Blood pressure panel",
				},
			],
		},
		subject: {
			reference: "Patient/patient-123",
			type: "Patient", // Type-checked!
			display: "John Smith",
		},
		effectiveDateTime: "2024-01-15T09:30:00Z",
		component: [
			{
				code: {
					coding: [
						{
							system: "http://loinc.org",
							code: "8480-6",
							display: "Systolic blood pressure",
						},
					],
				},
				valueQuantity: {
					value: 120,
					unit: "mmHg",
					system: "http://unitsofmeasure.org",
					code: "mm[Hg]",
				},
			},
			{
				code: {
					coding: [
						{
							system: "http://loinc.org",
							code: "8462-4",
							display: "Diastolic blood pressure",
						},
					],
				},
				valueQuantity: {
					value: 80,
					unit: "mmHg",
					system: "http://unitsofmeasure.org",
					code: "mm[Hg]",
				},
			},
		],
	};

	// Create a Bundle containing multiple resources
	const bundle: Bundle = {
		resourceType: "Bundle",
		type: "collection",
		total: 2,
		entry: [
			{
				fullUrl: "http://example.org/Patient/patient-123",
				resource: patient,
			},
			{
				fullUrl: "http://example.org/Observation/obs-456",
				resource: observation,
			},
		],
	};

	console.log("✅ Type-safe FHIR resources created successfully!");
	return bundle;
}

async function main() {
	console.log("🚀 Starting Atomic FHIR Codegen Examples\n");

	try {
		// Run examples based on command line argument
		const example = process.argv[2];

		switch (example) {
			case "basic":
				await generateBasicFHIRTypes();
				break;
			case "us-core":
				await generateUSCoreTypes();
				break;

			case "usage":
				demonstrateGeneratedTypes();
				break;

			case "all":
				// Run all examples
				await generateBasicFHIRTypes();
				await generateUSCoreTypes();
				demonstrateGeneratedTypes();
				break;
			default:
				console.log("Available examples:");
				console.log(
					"  bun run examples/basic-usage.ts basic      - Generate basic FHIR R4 types",
				);
				console.log(
					"  bun run examples/basic-usage.ts us-core    - Generate US Core types",
				);
				console.log(
					"  bun run examples/basic-usage.ts custom     - Generate custom profile types",
				);
				console.log(
					"  bun run examples/basic-usage.ts selective  - Generate selected resources",
				);
				console.log(
					"  bun run examples/basic-usage.ts usage      - Demonstrate type usage",
				);
				console.log(
					"  bun run examples/basic-usage.ts advanced   - Advanced configuration",
				);
				console.log(
					"  bun run examples/basic-usage.ts multi      - Multi-package generation",
				);
				console.log(
					"  bun run examples/basic-usage.ts validation - Generate with validation",
				);
				console.log(
					"  bun run examples/basic-usage.ts all        - Run all examples",
				);
		}

		console.log("\n✨ Examples completed successfully!");
	} catch (error) {
		console.error("❌ Error running examples:", error);
		process.exit(1);
	}
}

// Run if executed directly
if (import.meta.main) {
	main();
}

// Export for use in other examples
export {
	generateBasicFHIRTypes,
	generateUSCoreTypes,
	demonstrateGeneratedTypes,
};
