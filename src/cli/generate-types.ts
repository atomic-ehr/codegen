#!/usr/bin/env bun

/**
 * CLI for generating TypeScript types from FHIR schemas
 */

import { resolve } from "path";
import { parseArgs } from "util";
import { generateTypes } from "../generators";

const usage = `
Usage: bun generate-types [options]

Options:
  -o, --output <dir>      Output directory for generated types (required)
  -p, --package <path>    Path to FHIR package or NDJSON file
  -v, --verbose          Enable verbose logging
  -h, --help             Show this help message

Examples:
  # Generate types to ./generated using default R4 package
  bun generate-types -o ./generated

  # Generate types from a specific package
  bun generate-types -o ./generated -p ./fhir-r4-core.tgz

  # Generate with verbose output
  bun generate-types -o ./generated -v
`;

async function main() {
	let args;

	try {
		args = parseArgs({
			args: Bun.argv.slice(2),
			options: {
				output: {
					type: "string",
					short: "o",
				},
				package: {
					type: "string",
					short: "p",
				},
				verbose: {
					type: "boolean",
					short: "v",
					default: false,
				},
				help: {
					type: "boolean",
					short: "h",
					default: false,
				},
			},
			allowPositionals: false,
		});
	} catch (error) {
		console.error("Error parsing arguments:", error);
		console.log(usage);
		process.exit(1);
	}

	if (args.values.help) {
		console.log(usage);
		process.exit(0);
	}

	if (!args.values.output) {
		console.error("Error: Output directory is required");
		console.log(usage);
		process.exit(1);
	}

	const outputDir = resolve(args.values.output as string);
	const packagePath = args.values.package
		? resolve(args.values.package as string)
		: undefined;
	const verbose = args.values.verbose as boolean;

	console.log("Generating FHIR TypeScript types...");
	console.log(`Output directory: ${outputDir}`);

	if (packagePath) {
		console.log(`Package: ${packagePath}`);
	} else {
		console.log("Using default FHIR R4 core package");
	}

	try {
		await generateTypes({
			outputDir,
			packagePath,
			verbose,
		});

		console.log("✨ Type generation completed successfully!");
	} catch (error) {
		console.error("❌ Error generating types:", error);
		process.exit(1);
	}
}

// Run if called directly
if (import.meta.main) {
	main().catch(console.error);
}
