/**
 * TypeSchema Generate Command
 *
 * Generate TypeSchema files from FHIR packages
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CommandModule } from "yargs";
import { TypeSchemaGenerator } from "../../../typeschema/generator";

interface GenerateTypeschemaArgs {
	packages: string[];
	output?: string;
	format?: "ndjson" | "json";
	verbose?: boolean;
}

/**
 * Generate TypeSchema from FHIR packages
 */
export const generateTypeschemaCommand: CommandModule<
	{},
	GenerateTypeschemaArgs
> = {
	command: "generate <packages..>",
	describe: "Generate TypeSchema files from FHIR packages",
	builder: {
		packages: {
			type: "string",
			array: true,
			demandOption: true,
			describe: "FHIR packages to process (e.g., hl7.fhir.r4.core@4.0.1)",
		},
		output: {
			alias: "o",
			type: "string",
			describe: "Output file or directory",
			default: "./schemas.ndjson",
		},
		format: {
			alias: "f",
			type: "string",
			choices: ["ndjson", "json"] as const,
			default: "ndjson" as const,
			describe: "Output format for TypeSchema files",
		},
		verbose: {
			alias: "v",
			type: "boolean",
			default: false,
			describe: "Enable verbose output",
		},
	},
	handler: async (argv) => {
		try {
			if (argv.verbose) {
				console.log("🔄 Generating TypeSchema from FHIR packages...");
				console.log(`📦 Packages: ${argv.packages.join(", ")}`);
				console.log(`📁 Output: ${argv.output}`);
				console.log(`📄 Format: ${argv.format}`);
			}

			const startTime = Date.now();

			// Create TypeSchema generator
			const generator = new TypeSchemaGenerator({
				verbose: argv.verbose,
			});

			// Generate schemas from all packages
			const allSchemas: any[] = [];

			for (const packageSpec of argv.packages) {
				const [name, version] = packageSpec.includes("@")
					? packageSpec.split("@")
					: [packageSpec, undefined];

				if (argv.verbose) {
					console.log(
						`📦 Processing package: ${name}${version ? `@${version}` : ""}`,
					);
				}

				const schemas = await generator.generateFromPackage(name, version);
				allSchemas.push(...schemas);
			}

			if (allSchemas.length === 0) {
				throw new Error(
					"No schemas were generated from the specified packages",
				);
			}

			// Ensure output directory exists
			const outputPath = argv.output!;
			await mkdir(dirname(outputPath), { recursive: true });

			// Format and write the schemas
			let content: string;
			if (argv.format === "json") {
				content = JSON.stringify(allSchemas, null, 2);
			} else {
				// NDJSON format
				content = allSchemas.map((schema) => JSON.stringify(schema)).join("\n");
			}

			await writeFile(outputPath, content, "utf-8");

			const duration = Date.now() - startTime;
			console.log(
				`✨ Successfully generated ${allSchemas.length} TypeSchema definitions in ${duration}ms`,
			);
			console.log(`📁 Output: ${outputPath}`);

			if (argv.verbose) {
				console.log("\n📋 Generated schemas:");
				allSchemas.forEach((schema: any) => {
					console.log(
						`  • ${schema.identifier?.name || "Unknown"} (${schema.identifier?.kind || "unknown"})`,
					);
				});
			}
		} catch (error) {
			console.error("❌ Failed to generate TypeSchema:");
			console.error(error instanceof Error ? error.message : String(error));
			if (argv.verbose && error instanceof Error && error.stack) {
				console.error(error.stack);
			}
			process.exit(1);
		}
	},
};
