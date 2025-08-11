/**
 * TypeSchema Generate Command
 *
 * Generate TypeSchema files from FHIR packages
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CommandModule } from "yargs";
import { TypeSchemaGenerator } from "../../../typeschema/generator";
import { complete, createLogger, list } from "../../utils/log";

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
		const log = createLogger({
			verbose: argv.verbose,
			prefix: "TypeSchema",
		});

		try {
			log.step("Generating TypeSchema from FHIR packages");
			log.info(`Packages: ${argv.packages.join(", ")}`);
			log.info(`Output: ${argv.output}`);
			log.debug(`Format: ${argv.format}`);

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

				log.progress(
					`Processing package: ${name}${version ? `@${version}` : ""}`,
				);

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
			complete(
				`Generated ${allSchemas.length} TypeSchema definitions`,
				duration,
				{ schemas: allSchemas.length },
			);
			log.dim(`Output: ${outputPath}`);

			if (argv.verbose) {
				log.debug("Generated schemas:");
				const schemaNames = allSchemas.map(
					(schema: any) =>
						`${schema.identifier?.name || "Unknown"} (${schema.identifier?.kind || "unknown"})`,
				);
				list(schemaNames);
			}
		} catch (error) {
			log.error(
				"Failed to generate TypeSchema",
				error instanceof Error ? error : new Error(String(error)),
			);
			process.exit(1);
		}
	},
};
