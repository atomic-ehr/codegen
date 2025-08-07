/**
 * Basic Usage Examples for High-Level API
 *
 * This file demonstrates the most common use cases for the atomic-codegen
 * high-level API, including TypeScript generation and REST client generation.
 */

import { createAPI } from "../index";

/**
 * Example 1: Generate TypeScript types from a FHIR package
 */
async function generateTypesFromPackage() {
	console.log("🚀 Generating TypeScript types from FHIR package...");

	const result = await createAPI({
		outputDir: "./generated/types",
		verbose: true,
	})
		.fromPackage("hl7.fhir.r4.core")
		.fromPackage("")
		.typescript({
			moduleFormat: "esm",
			generateIndex: true,
			namingConvention: "PascalCase",
		})
		.generate();

	if (result.success) {
		console.log(
			`✅ Successfully generated ${result.filesGenerated.length} TypeScript files`,
		);
		console.log(`⏱️  Generation took ${result.duration.toFixed(2)}ms`);
	} else {
		console.error("❌ Generation failed:", result.errors);
	}

	return result;
}

/**
 * Example 2: Generate REST API client
 */
async function generateRestClient() {
	console.log("🚀 Generating REST API client...");

	const result = await createAPI({
		outputDir: "./generated/client",
		verbose: true,
	})
		.fromPackage("hl7.fhir.r4.core")
		.restClient({
			language: "typescript",
			httpClient: "fetch",
			authentication: "bearer",
			baseUrl: "https://api.example.com/fhir/R4",
		})
		.generate();

	if (result.success) {
		console.log(
			`✅ Successfully generated REST client with ${result.filesGenerated.length} files`,
		);
		console.log(`⏱️  Generation took ${result.duration.toFixed(2)}ms`);
	} else {
		console.error("❌ Generation failed:", result.errors);
	}

	return result;
}

/**
 * Example 3: Generate both types and client together
 */
async function generateTypesAndClient() {
	console.log("🚀 Generating both TypeScript types and REST client...");

	const result = await createAPI({
		outputDir: "./generated/complete",
		verbose: true,
	})
		.fromPackage("hl7.fhir.r4.core")
		.typescript({
			moduleFormat: "esm",
			generateIndex: true,
		})
		.restClient({
			language: "typescript",
			httpClient: "axios",
			generateTypes: false, // Don't duplicate types
		})
		.generate();

	if (result.success) {
		console.log(
			`✅ Successfully generated complete FHIR library with ${result.filesGenerated.length} files`,
		);
		console.log(`⏱️  Generation took ${result.duration.toFixed(2)}ms`);
	} else {
		console.error("❌ Generation failed:", result.errors);
		result.errors.forEach((error) => console.error(`   ${error}`));
	}

	return result;
}

/**
 * Example 4: Generate from local TypeSchema files
 */
async function generateFromFiles() {
	console.log("🚀 Generating from local TypeSchema files...");

	const result = await createAPI({
		outputDir: "./generated/from-files",
		verbose: true,
	})
		.fromFiles("./schemas/*.ndjson", "./custom-types.json")
		.typescript()
		.restClient()
		.generate();

	if (result.success) {
		console.log(
			`✅ Successfully generated from local files: ${result.filesGenerated.length} files`,
		);
	} else {
		console.error("❌ Generation failed:", result.errors);
	}

	return result;
}

/**
 * Example 5: Build in-memory without writing files
 */
async function buildInMemory() {
	console.log("🚀 Building TypeScript types in-memory...");

	const results = await createAPI()
		.fromPackage("hl7.fhir.r4.core")
		.typescript()
		.restClient()
		.build();

	console.log("📊 Generation Results:");
	console.log(`   TypeScript files: ${results.typescript?.length || 0}`);
	console.log(`   REST client files: ${results.restclient?.length || 0}`);

	// Process the first TypeScript file as an example
	if (results.typescript && results.typescript.length > 0) {
		const firstFile = results.typescript[0];
		console.log(`\n📄 Sample TypeScript file: ${firstFile.filename}`);
		console.log("   Exports:", firstFile.exports.slice(0, 5).join(", "));
		console.log("   Content preview:");
		console.log(
			"   " + firstFile.content.split("\n").slice(0, 10).join("\n   "),
		);
	}

	return results;
}

/**
 * Example 6: Progress tracking and error handling
 */
async function generateWithProgressTracking() {
	console.log("🚀 Generating with progress tracking...");

	const progressSteps: string[] = [];

	const result = await createAPI({
		outputDir: "./generated/with-progress",
		verbose: false, // Disable default logging
	})
		.fromPackage("hl7.fhir.r4.core")
		.typescript()
		.onProgress((phase, current, total, message) => {
			const progress = Math.round((current / total) * 100);
			const step = `[${phase}] ${progress}% - ${message || "Processing..."}`;
			console.log(step);
			progressSteps.push(step);
		})
		.generate();

	console.log(`\n📈 Progress tracking captured ${progressSteps.length} steps`);

	if (result.success) {
		console.log(`✅ Generation completed successfully`);
		console.log(`📁 Output directory: ${result.outputDir}`);
		console.log(`📄 Files generated: ${result.filesGenerated.length}`);

		if (result.warnings.length > 0) {
			console.log(`⚠️  Warnings: ${result.warnings.length}`);
			result.warnings.forEach((warning) => console.warn(`   ${warning}`));
		}
	} else {
		console.error(`❌ Generation failed with ${result.errors.length} errors`);
		result.errors.forEach((error) => console.error(`   ${error}`));
	}

	return result;
}

/**
 * Example 7: Custom configuration and chaining
 */
async function advancedConfiguration() {
	console.log("🚀 Advanced configuration example...");

	const api = createAPI({
		outputDir: "./generated/advanced",
		verbose: true,
		validate: true,
		cache: true,
	})
		.fromPackage("hl7.fhir.us.core", "3.1.1") // US Core profiles
		.typescript({
			moduleFormat: "cjs",
			generateIndex: false,
			namingConvention: "camelCase",
		})
		.restClient({
			language: "javascript",
			httpClient: "node-fetch",
			authentication: "basic",
			includeValidation: true,
			baseUrl: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
		})
		.outputTo("./output/epic-integration") // Override output directory
		.verbose(false); // Disable verbose logging

	// Reset and configure for a different package
	api
		.reset()
		.fromPackage("hl7.fhir.r4.core")
		.typescript({ moduleFormat: "esm" })
		.outputTo("./output/r4-core");

	const result = await api.generate();

	console.log("Advanced configuration result:", {
		success: result.success,
		filesCount: result.filesGenerated.length,
		duration: `${result.duration.toFixed(2)}ms`,
		errors: result.errors.length,
		warnings: result.warnings.length,
	});

	return result;
}

/**
 * Run all examples
 */
async function runAllExamples() {
	console.log("🎯 Running all High-Level API examples...\n");

	try {
		await generateTypesFromPackage();
		console.log("\n" + "=".repeat(80) + "\n");

		await generateRestClient();
		console.log("\n" + "=".repeat(80) + "\n");

		await generateTypesAndClient();
		console.log("\n" + "=".repeat(80) + "\n");

		// Skip file-based example as files may not exist
		// await generateFromFiles();

		await buildInMemory();
		console.log("\n" + "=".repeat(80) + "\n");

		await generateWithProgressTracking();
		console.log("\n" + "=".repeat(80) + "\n");

		await advancedConfiguration();

		console.log("\n🎉 All examples completed successfully!");
	} catch (error) {
		console.error("\n💥 Example execution failed:", error.message);
		console.error(error.stack);
	}
}

// Export examples for use in other modules
export {
	generateTypesFromPackage,
	generateRestClient,
	generateTypesAndClient,
	generateFromFiles,
	buildInMemory,
	generateWithProgressTracking,
	advancedConfiguration,
	runAllExamples,
};

// Run examples if this file is executed directly
if (import.meta.main) {
	runAllExamples().catch(console.error);
}
