/**
 * Test TypeSchema caching and reuse functionality
 */

import { APIBuilder } from "./src/api/builder";
import { existsSync, rmSync } from "fs";
import { join } from "path";

const cacheDir = ".typeschema-cache";

async function testCaching() {
	console.log("Testing TypeSchema caching functionality...\n");

	// Clean up any existing cache
	if (existsSync(cacheDir)) {
		console.log("Cleaning existing cache directory...");
		rmSync(cacheDir, { recursive: true, force: true });
	}

	// First run - generate and cache TypeSchemas
	console.log("=== First Run: Generating and caching TypeSchemas ===");
	const startTime1 = performance.now();
	
	const api1 = new APIBuilder({
		outputDir: "./test-cache-output",
		verbose: true,
		cache: true,
		typeSchemaConfig: {
			enablePersistence: true,
			cacheDir: cacheDir,
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
			validateCached: true,
			shareCache: true,
		}
	});

	await api1
		.fromPackage("hl7.fhir.r4.core", "4.0.1")
		.typescript({
			resourceTypes: ["Patient", "Observation"],
			includeProfiles: false,
			includeExtensions: false,
		})
		.generate();

	const duration1 = performance.now() - startTime1;
	console.log(`First run completed in ${(duration1 / 1000).toFixed(2)} seconds\n`);

	// Check cache directory was created
	if (existsSync(cacheDir)) {
		const fs = await import("fs/promises");
		const files = await fs.readdir(cacheDir);
		console.log(`Cache directory contains ${files.length} files`);
		console.log("Sample cached files:", files.slice(0, 5).join(", "));
	}

	// Second run - should use cached TypeSchemas
	console.log("\n=== Second Run: Using cached TypeSchemas ===");
	const startTime2 = performance.now();
	
	const api2 = new APIBuilder({
		outputDir: "./test-cache-output2",
		verbose: true,
		cache: true,
		typeSchemaConfig: {
			enablePersistence: true,
			cacheDir: cacheDir,
			maxAge: 24 * 60 * 60 * 1000,
			validateCached: true,
			shareCache: true,
		}
	});

	await api2
		.fromPackage("hl7.fhir.r4.core", "4.0.1")
		.typescript({
			resourceTypes: ["Patient", "Observation"],
			includeProfiles: false,
			includeExtensions: false,
		})
		.generate();

	const duration2 = performance.now() - startTime2;
	console.log(`Second run completed in ${(duration2 / 1000).toFixed(2)} seconds\n`);

	// Compare performance
	const speedup = duration1 / duration2;
	console.log("=== Performance Comparison ===");
	console.log(`First run (no cache): ${(duration1 / 1000).toFixed(2)}s`);
	console.log(`Second run (with cache): ${(duration2 / 1000).toFixed(2)}s`);
	console.log(`Speedup: ${speedup.toFixed(2)}x faster with cache`);

	// Test forced regeneration
	console.log("\n=== Third Run: Force regeneration (ignore cache) ===");
	const startTime3 = performance.now();
	
	const api3 = new APIBuilder({
		outputDir: "./test-cache-output3",
		verbose: true,
		cache: true,
		typeSchemaConfig: {
			enablePersistence: true,
			cacheDir: cacheDir,
			maxAge: 24 * 60 * 60 * 1000,
			validateCached: true,
			forceRegenerate: true, // Force regeneration
		}
	});

	await api3
		.fromPackage("hl7.fhir.r4.core", "4.0.1")
		.typescript({
			resourceTypes: ["Patient"],
			includeProfiles: false,
		})
		.generate();

	const duration3 = performance.now() - startTime3;
	console.log(`Forced regeneration completed in ${(duration3 / 1000).toFixed(2)} seconds`);

	console.log("\n✅ TypeSchema caching test completed successfully!");
}

// Run the test
testCaching().catch(console.error);