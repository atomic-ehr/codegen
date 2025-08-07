/**
 * Generate Command - High-Level API
 *
 * Main generate command that uses the high-level API for end-to-end generation
 */

import type { CommandModule } from "yargs";
import { APIBuilder } from "../../api";
import { loadConfig } from "../../config";
import type { CLIArgv } from "./index";

interface GenerateArgs extends CLIArgv {
	packages?: string[];
	input?: string;
	output?: string;
	typescript?: boolean;
	"rest-client"?: boolean;
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
	describe:
		"Generate code using the high-level API (supports TypeScript and REST client)",
	builder: (yargs) =>
		yargs
			.positional("generator", {
				describe: "Generator type",
				choices: ["typescript", "ts", "rest-client", "client"],
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
			.option("rest-client", {
				type: "boolean",
				description: "Generate REST API client",
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
			// REST Client specific options
			.option("http-client", {
				type: "string",
				choices: ["fetch", "axios", "node-fetch"] as const,
				default: "fetch" as const,
				description: "HTTP client library for REST client",
			})
			.option("base-url", {
				type: "string",
				description: "Base URL for the REST API",
			})
			.option("api-version", {
				type: "string",
				description: "API version for the REST client",
			})
			.option("authentication", {
				type: "string",
				choices: ["bearer", "basic", "none"] as const,
				default: "none" as const,
				description: "Authentication method for REST client",
			})
			.option("include-validation", {
				type: "boolean",
				default: false,
				description: "Include validation in REST client",
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
				"$0 generate rest-client -i ./schemas/*.ndjson -o ./client",
				"Generate REST client from TypeSchema files",
			)
			.example(
				"$0 generate rest-client -i schemas.ndjson -o ./client --http-client axios --base-url https://api.example.com",
				"Generate REST client with custom HTTP client and base URL",
			)
			.example(
				"$0 generate typescript --typescript --rest-client -o ./generated",
				"Generate both TypeScript types and REST client",
			)
			.example(
				"$0 generate rest-client --authentication bearer --include-validation",
				"Generate REST client with authentication and validation",
			),
	handler: async (argv) => {
		try {
			// Load config file first, then merge with CLI args (CLI args take priority)
			const config = await loadConfig(process.cwd());

			const generator = argv.generator as string;
			const verbose = argv.verbose ?? config.verbose ?? false;

			if (verbose) {
				console.log("🚀 Starting high-level API generation...");
				console.log("📋 Config loaded from:", process.cwd());
				console.log("📋 Config packages:", config.packages);
				console.log("📋 Config files:", config.files);
			}

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
				if (verbose) {
					console.log(
						`📦 Loading FHIR packages from CLI: ${argv.packages.join(", ")}`,
					);
				}
				for (const packageSpec of argv.packages) {
					const [name, version] = packageSpec.includes("@")
						? packageSpec.split("@")
						: [packageSpec, undefined];
					builder.fromPackage(name, version);
				}
			} else if (argv.input) {
				if (verbose) {
					console.log(`📁 Loading TypeSchema from CLI: ${argv.input}`);
				}
				builder.fromFiles(argv.input);
			} else if (config.packages && config.packages.length > 0) {
				// Use packages from config file
				if (verbose) {
					console.log(
						`📦 Loading packages from config: ${config.packages.join(", ")}`,
					);
				}
				for (const packageSpec of config.packages) {
					const [name, version] = packageSpec.includes("@")
						? packageSpec.split("@")
						: [packageSpec, undefined];
					builder.fromPackage(name, version);
				}
			} else if (config.files && config.files.length > 0) {
				// Use files from config
				if (verbose) {
					console.log(
						`📁 Loading files from config: ${config.files.join(", ")}`,
					);
				}
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
				argv.typescript ||
				generator === "typescript" ||
				generator === "ts" ||
				(!argv["rest-client"] && !generator);

			const shouldGenerateRestClient =
				config.restClient ||
				argv["rest-client"] ||
				generator === "rest-client" ||
				generator === "client";

			if (shouldGenerateTypeScript) {
				if (verbose) {
					console.log("⚡ Configuring TypeScript generation...");
				}
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

			if (shouldGenerateRestClient) {
				if (verbose) {
					console.log("🌐 Configuring REST client generation...");
				}
				builder.restClient({
					language: "typescript",
					httpClient: argv["http-client"] as any,
					generateTypes: !shouldGenerateTypeScript, // Don't duplicate types
					includeValidation: argv["include-validation"],
					// CLI args override config values
					baseUrl: (argv["base-url"] as string) || config.restClient?.baseUrl,
					apiVersion: argv["api-version"] || config.restClient?.apiVersion,
					authentication: argv.authentication as any,
					clientName: config.restClient?.clientName || "FHIRClient",
					generateMocks: config.restClient?.generateMocks ?? false,
					authType: config.restClient?.authType || "none",
				});
			}

			// Add progress callback if verbose
			if (verbose) {
				builder.onProgress((phase, current, total, message) => {
					const progress = Math.round((current / total) * 100);
					console.log(
						`[${phase}] ${progress}% - ${message || "Processing..."}`,
					);
				});
			}

			// Execute generation
			const result = await builder.generate();

			if (result.success) {
				console.log(
					`✨ Successfully generated ${result.filesGenerated.length} files in ${result.duration.toFixed(2)}ms`,
				);
				console.log(`📁 Output directory: ${result.outputDir}`);

				if (result.warnings.length > 0) {
					console.warn(`⚠️  ${result.warnings.length} warnings:`);
					result.warnings.forEach((warning) => console.warn(`  ${warning}`));
				}
			} else {
				console.error("❌ Generation failed:");
				result.errors.forEach((error) => {
					console.error(`  ${error}`);
				});
				process.exit(1);
			}
		} catch (error) {
			console.error(
				"💥 Generation failed:",
				error instanceof Error ? error.message : String(error),
			);
			if (argv.verbose && error instanceof Error) {
				console.error(error.stack);
			}
			process.exit(1);
		}
	},
};
