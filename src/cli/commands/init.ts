/**
 * Init Command - Interactive Project Setup
 *
 * Interactive command for setting up new atomic-codegen projects
 */

import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pc from "picocolors";
import type { CommandModule } from "yargs";
import type { Config } from "../../config";
import {
	promptConfirm,
	promptFHIRPackage,
	promptGeneratorConfig,
	promptInitConfig,
	showError,
	showInfo,
} from "../utils/prompts";
import { createSpinner, withSpinner } from "../utils/spinner";

/**
 * Arguments for init command
 */
interface InitArgs {
	interactive?: boolean;
	force?: boolean;
	"config-path"?: string;
	template?: "minimal" | "full" | "typescript" | "interactive";
}

/**
 * Interactive init command
 */
export const initCommand: CommandModule<{}, InitArgs> = {
	command: "init",
	describe: "Initialize a new atomic-codegen project",
	builder: (yargs) => {
		return yargs
			.option("interactive", {
				alias: "i",
				type: "boolean",
				describe: "Use interactive setup wizard",
				default: true,
			})
			.option("force", {
				alias: "f",
				type: "boolean",
				describe: "Overwrite existing configuration",
				default: false,
			})
			.option("config-path", {
				alias: "c",
				type: "string",
				describe: "Path for configuration file",
			})
			.option("template", {
				alias: "t",
				type: "string",
				choices: ["minimal", "full", "typescript", "interactive"] as const,
				describe: "Configuration template",
				default: "interactive" as const,
			})
			.example("$0 init", "Interactive setup wizard")
			.example("$0 init --template minimal", "Quick minimal setup")
			.example(
				"$0 init --template typescript --force",
				"TypeScript template, overwrite existing",
			);
	},
	handler: async (argv) => {
		console.log(pc.bold(pc.cyan("🚀 Atomic Codegen Project Initialization")));
		console.log(pc.gray("Setting up your FHIR code generation project..."));
		console.log();

		const configPath =
			argv["config-path"] || join(process.cwd(), ".atomic-codegenrc");

		// Check if config already exists
		try {
			await access(configPath);
			if (!argv.force) {
				const overwrite = await promptConfirm(
					`Configuration file already exists at ${configPath}. Overwrite?`,
					false,
				);
				if (!overwrite) {
					showInfo("Initialization cancelled.");
					return;
				}
			}
		} catch {
			// File doesn't exist, which is fine
		}

		try {
			if (argv.template === "interactive" && argv.interactive) {
				await runInteractiveSetup(configPath);
			} else {
				await runTemplateSetup(argv.template || "minimal", configPath);
			}
		} catch (error) {
			showError(
				`Initialization failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		}
	},
};

/**
 * Run interactive setup wizard
 */
async function runInteractiveSetup(configPath: string): Promise<void> {
	// Project configuration
	const projectConfig = await promptInitConfig();

	// FHIR package selection
	const fhirConfig = await promptFHIRPackage();

	// Generator configurations
	const generatorConfigs: Record<string, any> = {};
	for (const generatorId of projectConfig.generators) {
		console.log(pc.blue(`\n⚙️  Configuring ${generatorId} generator:`));
		generatorConfigs[generatorId] = await promptGeneratorConfig(generatorId);
	}

	// Build configuration object
	const config: Config = {
		$schema: "https://atomic-ehr.github.io/codegen/config-schema.json",
		version: "1.0.0",
		project: {
			name: projectConfig.projectName,
			description: projectConfig.description,
			version: "1.0.0",
			rootDir: process.cwd(),
		},
		typeschema: {
			packages: fhirConfig.version
				? [`${fhirConfig.packageId}@${fhirConfig.version}`]
				: [fhirConfig.packageId],
			outputFormat: "ndjson",
			validation: true,
			...(fhirConfig.profiles &&
				fhirConfig.profiles.length > 0 && {
					treeshaking: fhirConfig.profiles.includes("*")
						? undefined
						: fhirConfig.profiles,
				}),
		},
		generator: {
			target: projectConfig.generators[0] || "typescript", // Primary generator
			outputDir: projectConfig.outputDir,
			includeComments: true,
			includeValidation: true,
			namespaceStyle: "nested",
			format: true,
			overwrite: true,
		},
		languages: Object.fromEntries(
			projectConfig.generators.map((gen) => [gen, generatorConfigs[gen]]),
		),
		global: {
			cache: {
				enabled: true,
				directory: "tmp/cache",
			},
		},
	};

	// Write configuration
	await withSpinner(writeConfigFile(configPath, config), {
		start: "Writing configuration file...",
		success: `Configuration saved to ${configPath}`,
		fail: "Failed to write configuration file",
	});

	// Show next steps
	showNextSteps(configPath, projectConfig.packageManager);
}

/**
 * Run template-based setup
 */
async function runTemplateSetup(
	template: "minimal" | "full" | "typescript",
	configPath: string,
): Promise<void> {
	const spinner = createSpinner(`Setting up ${template} configuration...`);
	spinner.start();

	try {
		const config = generateConfigTemplate(template);
		await writeConfigFile(configPath, config);
		spinner.succeed(`Created ${template} configuration at ${configPath}`);

		showNextSteps(configPath, "bun");
	} catch (error) {
		spinner.fail("Failed to create configuration");
		throw error;
	}
}

/**
 * Write configuration file
 */
async function writeConfigFile(
	filePath: string,
	config: Config,
): Promise<void> {
	const content = JSON.stringify(config, null, 2);
	await writeFile(filePath, content, "utf-8");
}

/**
 * Generate configuration template
 */
function generateConfigTemplate(
	template: "minimal" | "full" | "typescript",
): Config {
	const baseConfig: Config = {
		$schema: "https://atomic-ehr.github.io/codegen/config-schema.json",
		version: "1.0.0",
	};

	switch (template) {
		case "minimal":
			return {
				...baseConfig,
				typeschema: {
					packages: ["hl7.fhir.r4.core"],
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
					name: "fhir-typescript-types",
					description: "TypeScript FHIR types generated with atomic-codegen",
				},
				typeschema: {
					packages: ["hl7.fhir.r4.core"],
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

		case "full":
			return {
				...baseConfig,
				project: {
					name: "comprehensive-fhir-setup",
					version: "1.0.0",
					description: "Complete FHIR code generation setup",
					rootDir: process.cwd(),
				},
				typeschema: {
					packages: ["hl7.fhir.r4.core", "hl7.fhir.us.core"],
					outputFormat: "ndjson",
					validation: true,
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
				global: {
					cache: {
						enabled: true,
						directory: "tmp/cache",
						ttl: 3600,
					},
					logging: {
						level: "info",
						format: "pretty",
					},
				},
			};

		default:
			return baseConfig;
	}
}

/**
 * Show next steps after initialization
 */
function showNextSteps(configPath: string, packageManager: string): void {
	console.log();
	console.log(pc.bold(pc.green("🎉 Project initialized successfully!")));
	console.log();
	console.log(pc.bold("📋 Next Steps:"));
	console.log();
	console.log(`${pc.cyan("1.")} Review your configuration:`);
	console.log(`   ${pc.gray(configPath)}`);
	console.log();
	console.log(`${pc.cyan("2.")} Install dependencies (if needed):`);
	console.log(
		`   ${pc.yellow(`${packageManager} install @atomic-ehr/codegen`)}`,
	);
	console.log();
	console.log(`${pc.cyan("3.")} Generate code from FHIR packages:`);
	console.log(
		`   ${pc.yellow("atomic-codegen generate typescript --packages hl7.fhir.r4.core")}`,
	);
	console.log();
	console.log(`${pc.cyan("4.")} Generate code from TypeSchema:`);
	console.log(
		`   ${pc.yellow("atomic-codegen generate typescript -i types.ndjson")}`,
	);
	console.log();
	console.log(`${pc.cyan("5.")} Set up watch mode for development:`);
	console.log(
		`   ${pc.yellow("atomic-codegen watch -i types.ndjson -o generated/ -g typescript")}`,
	);
	console.log();
	console.log(pc.bold("📚 Resources:"));
	console.log(
		`   • Documentation: ${pc.blue("https://atomic-ehr.github.io/codegen")}`,
	);
	console.log(
		`   • Examples: ${pc.blue("https://github.com/atomic-ehr/codegen/tree/main/examples")}`,
	);
	console.log(
		`   • Issues: ${pc.blue("https://github.com/atomic-ehr/codegen/issues")}`,
	);
}
