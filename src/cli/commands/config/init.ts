/**
 * Config Init Command
 *
 * Initialize atomic-codegen configuration file
 */

import type { CommandModule } from "yargs";
import { writeFile, access } from "fs/promises";
import { resolve, join } from "path";
import type { ConfigFileSchema } from "../../../lib/core/config-schema";

interface InitCommandArgs {
	output?: string;
	"working-dir"?: string;
	template?: "minimal" | "full" | "typescript" | "multi-lang";
	force?: boolean;
	format?: "json" | "js";
}

/**
 * Config init command
 */
export const configInitCommand: CommandModule<{}, InitCommandArgs> = {
	command: "init",
	describe: "Initialize configuration file",
	builder: {
		output: {
			alias: "o",
			type: "string",
			description: "Output file path",
		},
		"working-dir": {
			alias: "w",
			type: "string",
			description: "Working directory for config file",
			default: process.cwd(),
		},
		template: {
			alias: "t",
			type: "string",
			choices: ["minimal", "full", "typescript", "multi-lang"] as const,
			default: "minimal" as const,
			description: "Configuration template to use",
		},
		force: {
			alias: "f",
			type: "boolean",
			default: false,
			description: "Overwrite existing configuration file",
		},
		format: {
			type: "string",
			choices: ["json", "js"] as const,
			default: "json" as const,
			description: "Configuration file format",
		},
	},
	handler: async (argv) => {
		await initConfig({
			outputPath: argv.output,
			workingDir: argv["working-dir"] || process.cwd(),
			template: argv.template || "minimal",
			force: argv.force || false,
			format: argv.format || "json",
		});
	},
};

interface InitConfigOptions {
	outputPath?: string;
	workingDir: string;
	template: "minimal" | "full" | "typescript" | "multi-lang";
	force: boolean;
	format: "json" | "js";
}

/**
 * Initialize configuration file
 */
export async function initConfig(options: InitConfigOptions): Promise<void> {
	const { outputPath, workingDir, template, force, format } = options;

	try {
		// Determine output file path
		const fileName = format === "js" ? ".atomic-codegen.js" : ".atomic-codegen.json";
		const filePath = outputPath ? resolve(outputPath) : join(workingDir, fileName);

		// Check if file already exists
		try {
			await access(filePath);
			if (!force) {
				console.error(`❌ Configuration file already exists: ${filePath}`);
				console.error("   Use --force to overwrite");
				process.exit(1);
			}
		} catch {
			// File doesn't exist, which is fine
		}

		// Generate configuration based on template
		const config = generateConfigTemplate(template);

		// Write configuration file
		if (format === "js") {
			await writeJSConfig(filePath, config);
		} else {
			await writeJSONConfig(filePath, config);
		}

		console.log(`✅ Created configuration file: ${filePath}`);
		console.log();
		console.log("📝 Next steps:");
		console.log(`   1. Review and customize the configuration in ${filePath}`);
		console.log("   2. Validate your configuration: atomic-codegen config validate");
		console.log("   3. Test your setup: atomic-codegen typeschema create hl7.fhir.r4.core");
	} catch (error) {
		console.error(`❌ Failed to initialize configuration: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

/**
 * Generate configuration template
 */
function generateConfigTemplate(template: "minimal" | "full" | "typescript" | "multi-lang"): ConfigFileSchema {
	const baseConfig: ConfigFileSchema = {
		$schema: "https://atomic-ehr.github.io/codegen/config-schema.json",
		version: "1.0.0",
	};

	switch (template) {
		case "minimal":
			return {
				...baseConfig,
				typeschema: {
					packages: ["hl7.fhir.r4.core@4.0.1"],
					outputFormat: "ndjson",
					validation: true,
				},
				generator: {
					target: "typescript",
					outputDir: "./generated",
					includeComments: true,
					includeValidation: false,
					namespaceStyle: "nested",
				},
			};

		case "typescript":
			return {
				...baseConfig,
				project: {
					name: "my-fhir-project",
					description: "FHIR TypeScript types generated with atomic-codegen",
				},
				typeschema: {
					packages: ["hl7.fhir.r4.core@4.0.1"],
					outputFormat: "ndjson",
					validation: true,
				},
				generator: {
					target: "typescript",
					outputDir: "./src/types/fhir",
					includeComments: true,
					includeValidation: false,
					namespaceStyle: "nested",
					fileNaming: "PascalCase",
					format: true,
					fileHeader: "Auto-generated FHIR types - DO NOT EDIT",
				},
				languages: {
					typescript: {
						strict: true,
						target: "ES2020",
						module: "ES2020",
						declaration: true,
						useEnums: true,
						preferInterfaces: true,
					},
				},
			};

		case "multi-lang":
			return {
				...baseConfig,
				project: {
					name: "multi-language-fhir",
					description: "FHIR types for multiple programming languages",
				},
				typeschema: {
					packages: ["hl7.fhir.r4.core@4.0.1"],
					profiles: ["hl7.fhir.us.core@6.1.0"],
					outputFormat: "ndjson",
					validation: true,
				},
				generator: {
					target: "typescript",
					outputDir: "./generated",
					includeComments: true,
					includeValidation: true,
					namespaceStyle: "nested",
				},
				languages: {
					typescript: {
						strict: true,
						target: "ES2020",
						module: "ES2020",
						declaration: true,
					},
					python: {
						version: "3.11",
						typeHints: true,
						usePydantic: true,
					},
					java: {
						version: "17",
						packageName: "com.example.fhir",
						useJackson: true,
						useValidation: true,
					},
				},
			};

		case "full":
			return {
				...baseConfig,
				project: {
					name: "comprehensive-fhir-setup",
					version: "1.0.0",
					description: "Complete FHIR code generation setup",
					rootDir: process.cwd(),
					workingDir: "tmp/atomic-codegen",
				},
				typeschema: {
					packages: ["hl7.fhir.r4.core@4.0.1"],
					profiles: ["hl7.fhir.us.core@6.1.0"],
					outputFormat: "separate",
					validation: true,
					treeshaking: ["Patient", "Observation", "Encounter"],
					verbose: false,
					dropCache: false,
				},
				generator: {
					target: "typescript",
					outputDir: "./src/generated",
					includeComments: true,
					includeValidation: true,
					namespaceStyle: "nested",
					fileNaming: "PascalCase",
					format: true,
					fileHeader: "Generated by atomic-codegen",
					overwrite: true,
					verbose: false,
				},
				languages: {
					typescript: {
						strict: true,
						target: "ES2020",
						module: "ES2020",
						declaration: true,
						baseTypesModule: "@types/fhir",
						useEnums: true,
						preferInterfaces: true,
					},
				},
				global: {
					verbose: false,
					cache: {
						enabled: true,
						directory: "tmp/cache",
						ttl: 3600,
						maxSize: 100,
					},
					logging: {
						level: "info",
						format: "text",
						output: "console",
					},
				},
			};

		default:
			return baseConfig;
	}
}

/**
 * Write JSON configuration file
 */
async function writeJSONConfig(filePath: string, config: ConfigFileSchema): Promise<void> {
	const content = JSON.stringify(config, null, 2);
	await writeFile(filePath, content, "utf-8");
}

/**
 * Write JavaScript configuration file
 */
async function writeJSConfig(filePath: string, config: ConfigFileSchema): Promise<void> {
	const content = `/**
 * Atomic Codegen Configuration
 * 
 * @type {import('@atomic-ehr/codegen').ConfigFileSchema}
 */
module.exports = ${JSON.stringify(config, null, 2)};
`;
	await writeFile(filePath, content, "utf-8");
}