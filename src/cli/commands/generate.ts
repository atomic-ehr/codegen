/**
 * Generate Command - High-Level API
 *
 * Main generate command that uses the high-level API for end-to-end generation
 */

import type { CommandModule } from "yargs";
import { APIBuilder } from "../../api";
import { loadConfig } from "../../config";
import { createLoggerFromConfig } from "../../logger.ts";
import type { CLIArgv } from "./index";

interface GenerateArgs extends CLIArgv {
	packages?: string[];
	input?: string;
	output?: string;
	typescript?: boolean;
	format?: "esm" | "cjs";
	"generate-index"?: boolean;
	"include-docs"?: boolean;
	"naming-convention"?: "PascalCase" | "camelCase";
}

/**
 * Main generate command using high-level API
 */
export const generateCommand: CommandModule<{}, GenerateArgs> = {
	command: "generate [generator]",
	describe: "Generate code using the high-level API (supports TypeScript)",
	builder: (yargs) =>
		yargs
			.positional("generator", {
				describe: "Generator type",
				choices: ["typescript", "ts"],
				default: "typescript",
			})
			.option("packages", {
				alias: "p",
				type: "string",
				array: true,
				description: "FHIR packages to load (e.g., hl7.fhir.r4.core@4.0.1)",
			})
			.option("input", {
				alias: "i",
				type: "string",
				description: "Input TypeSchema files or directory",
			})
			.option("output", {
				alias: "o",
				type: "string",
				description: "Output directory",
			})
			.option("typescript", {
				type: "boolean",
				description: "Generate TypeScript types",
			})
			.option("format", {
				type: "string",
				choices: ["esm", "cjs"] as const,
				default: "esm" as const,
				description: "Module format",
			})
			.option("generate-index", {
				type: "boolean",
				default: true,
				description: "Generate index files",
			})
			.option("include-docs", {
				type: "boolean",
				default: true,
				description: "Include documentation comments",
			})
			.option("naming-convention", {
				type: "string",
				choices: ["PascalCase", "camelCase"] as const,
				default: "PascalCase" as const,
				description: "Naming convention for generated files",
			})
			.option("verbose", {
				alias: "v",
				type: "boolean",
				default: false,
				description: "Enable verbose output",
			})
			.example(
				"$0 generate typescript",
				"Generate TypeScript types using config file",
			)
			.example(
				"$0 generate typescript -p hl7.fhir.r4.core -o ./types",
				"Generate TypeScript types from FHIR R4 core package",
			)
			.example(
				"$0 generate typescript -i ./schemas/*.ndjson -o ./types",
				"Generate TypeScript types from TypeSchema files",
			),
	handler: async (argv) => {
		// Load config file first, then merge with CLI args (CLI args take priority)
		const config = await loadConfig(process.cwd());

		const generator = argv.generator as string;
		const verbose = argv.verbose ?? config.verbose ?? false;

		// Create logger for CLI command
		const logger = createLoggerFromConfig({
			verbose,
			component: "CLI-Generate",
		});

		try {
			await logger.info(
				"Starting high-level API generation",
				{
					generator,
					configDir: process.cwd(),
					packages: config.packages?.length || 0,
					files: config.files?.length || 0,
				},
				"startGeneration",
			);

			// Create API builder with options (CLI args override config)
			const builder = new APIBuilder({
				outputDir: argv.output || config.outputDir || "./generated",
				verbose,
				overwrite: config.overwrite ?? true,
				validate: config.validate ?? false, // Temporarily disable validation
				cache: config.cache ?? true,
			});

			// Load data sources - CLI args take priority over config
			if (argv.packages && argv.packages.length > 0) {
				await logger.info(
					"Loading FHIR packages from CLI arguments",
					{ packages: argv.packages },
					"loadPackages",
				);
				for (const packageSpec of argv.packages) {
					const [name, version] = packageSpec.includes("@")
						? packageSpec.split("@")
						: [packageSpec, undefined];
					builder.fromPackage(name, version);
				}
			} else if (argv.input) {
				await logger.info(
					"Loading TypeSchema from CLI input",
					{ input: argv.input },
					"loadInput",
				);
				builder.fromFiles(argv.input);
			} else if (config.packages && config.packages.length > 0) {
				// Use packages from config file
				await logger.info(
					"Loading packages from configuration file",
					{ packages: config.packages },
					"loadConfigPackages",
				);
				for (const packageSpec of config.packages) {
					const [name, version] = packageSpec.includes("@")
						? packageSpec.split("@")
						: [packageSpec, undefined];
					builder.fromPackage(name, version);
				}
			} else if (config.files && config.files.length > 0) {
				// Use files from config
				await logger.info(
					"Loading files from configuration",
					{ files: config.files },
					"loadConfigFiles",
				);
				for (const file of config.files) {
					builder.fromFiles(file);
				}
			} else {
				throw new Error(
					"No data source specified. Use --packages, --input, or configure packages/files in your config file.",
				);
			}

			// Configure generators based on arguments or command
			const shouldGenerateTypeScript =
				argv.typescript || generator === "typescript" || generator === "ts";

			if (shouldGenerateTypeScript) {
				await logger.info(
					"Configuring TypeScript generation",
					{
						moduleFormat:
							argv.format || config.typescript?.moduleFormat || "esm",
						generateIndex:
							argv["generate-index"] ??
							config.typescript?.generateIndex ??
							true,
						includeDocuments:
							argv["include-docs"] ??
							config.typescript?.includeDocuments ??
							false,
						namingConvention:
							argv["naming-convention"] ||
							config.typescript?.namingConvention ||
							"PascalCase",
					},
					"configureTypeScript",
				);
				builder.typescript({
					// CLI args override config values
					moduleFormat: argv.format || config.typescript?.moduleFormat || "esm",
					generateIndex:
						argv["generate-index"] ?? config.typescript?.generateIndex ?? true,
					includeDocuments:
						argv["include-docs"] ??
						config.typescript?.includeDocuments ??
						false,
					namingConvention:
						argv["naming-convention"] ||
						config.typescript?.namingConvention ||
						"PascalCase",
					generateValidators: config.typescript?.generateValidators ?? true,
					generateGuards: config.typescript?.generateGuards ?? true,
					includeProfiles: config.typescript?.includeProfiles ?? false,
				});
			}

			if (config.restClient) {
				builder.restClient(config.restClient);
			}

			// Add progress callback if verbose
			if (verbose) {
				builder.onProgress((phase, current, total, message) => {
					const progress = Math.round((current / total) * 100);
					logger.info(
						`Generation progress: [${phase}] ${progress}%`,
						{ phase, progress, message: message || "Processing..." },
						"progress",
					);
				});
			}

			// Execute generation
			await logger.info("Executing generation", {}, "executeGeneration");
			const result = await builder.generate();

			if (result.success) {
				await logger.info(
					"Generation completed successfully",
					{
						filesGenerated: result.filesGenerated.length,
						duration: `${result.duration.toFixed(2)}ms`,
						outputDir: result.outputDir,
						warnings: result.warnings.length,
					},
					"generationSuccess",
				);

				if (result.warnings.length > 0) {
					for (const warning of result.warnings) {
						await logger.warn("Generation warning", { warning });
					}
				}
			} else {
				await logger.error(
					"Generation failed",
					new Error("Generation process completed with errors"),
					{
						errorCount: result.errors.length,
						errors: result.errors,
					},
				);
				process.exit(1);
			}
		} catch (error) {
			await logger.error(
				"Generation failed with unexpected error",
				error instanceof Error ? error : new Error(String(error)),
				{ verbose: argv.verbose },
			);
			process.exit(1);
		}
	},
};
