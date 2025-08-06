#!/usr/bin/env bun

/**
 * Example: Generate TypeScript types from FHIR schemas
 */

import { resolve } from "path";
import { generateTypes } from "../src/generators";

async function main() {
	const outputDir = resolve("./generated-types");

	console.log("🚀 Generating FHIR TypeScript types...");
	console.log(`📁 Output directory: ${outputDir}`);

	try {
		await generateTypes({
			outputDir,
			verbose: true,
		});

		console.log("✨ Generation completed successfully!");
		console.log("");
		console.log("You can now import the generated types:");
		console.log("");
		console.log(`  import { Patient, Observation } from '${outputDir}';`);
		console.log(
			`  import * as primitives from '${outputDir}/types/primitives';`,
		);
		console.log(`  import * as complex from '${outputDir}/types/complex';`);
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
