/**
 * Config Init Command
 *
 * Initialize atomic-codegen configuration file
 */

import { access, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CommandModule } from "yargs";
import type { Config } from "../../../config";

interface InitCommandArgs {
	output?: string;
	"working-dir"?: string;
	template?: "minimal" | "full" | "typescript" | "multi-lang";
	force?: boolean;
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
	},
	handler: async (argv) => {
		await initConfig({
			outputPath: argv.output,
			workingDir: argv["working-dir"] || process.cwd(),
			template: argv.template || "minimal",
			force: argv.force || false,
		});
	},
};

interface InitConfigOptions {
	outputPath?: string;
	workingDir: string;
	template: "minimal" | "full" | "typescript" | "multi-lang";
	force: boolean;
}

/**
 * Initialize configuration file
 */
export async function initConfig(options: InitConfigOptions): Promise<void> {
	const { outputPath, workingDir, template, force } = options;

	try {
		// Determine output file path
		const fileName = "atomic-codegen.config.ts";
		const filePath = outputPath
			? resolve(outputPath)
			: join(workingDir, fileName);

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

		// Write TypeScript configuration file
		await writeTSConfig(filePath, config);

		console.log(`✅ Created configuration file: ${filePath}`);
		console.log();
		console.log("📝 Next steps:");
		console.log(`   1. Review and customize the configuration in ${filePath}`);
		console.log(
			"   2. Generate TypeScript types: atomic-codegen generate typescript",
		);
		console.log(
			"   3. Or generate with specific packages: atomic-codegen generate typescript --packages hl7.fhir.r4.core",
		);
	} catch (error) {
		console.error(
			`❌ Failed to initialize configuration: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

/**
 * Generate configuration template
 */
function generateConfigTemplate(
	template: "minimal" | "full" | "typescript" | "multi-lang",
): Config {
	const baseConfig: Config = {
		$schema: "https://atomic-ehr.github.io/codegen/config-schema.json",
		outputDir: "./generated",
		verbose: false,
		overwrite: true,
		validate: true,
		cache: true,
	};

	switch (template) {
		case "minimal":
			return {
				...baseConfig,
				packages: ["hl7.fhir.r4.core@4.0.1"],
				typescript: {
					moduleFormat: "esm",
					generateIndex: true,
					includeDocuments: false,
					namingConvention: "PascalCase",
					strictMode: true,
					generateValidators: false,
					generateGuards: false,
					includeProfiles: true,
					includeExtensions: false,
				},
			};

		case "typescript":
			return {
				...baseConfig,
				outputDir: "./src/types/fhir",
				packages: ["hl7.fhir.r4.core@4.0.1"],
				typescript: {
					moduleFormat: "esm",
					generateIndex: true,
					includeDocuments: true,
					namingConvention: "PascalCase",
					strictMode: true,
					generateValidators: true,
					generateGuards: true,
					includeProfiles: true,
					includeExtensions: false,
				},
			};

		case "multi-lang":
			return {
				...baseConfig,
				packages: ["hl7.fhir.r4.core@4.0.1", "hl7.fhir.us.core@6.1.0"],
				typescript: {
					moduleFormat: "esm",
					generateIndex: true,
					includeDocuments: true,
					namingConvention: "PascalCase",
					strictMode: true,
					generateValidators: true,
					generateGuards: true,
					includeProfiles: true,
					includeExtensions: false,
				},
				restClient: {
					clientName: "FHIRClient",
					baseUrl: "https://api.example.com/fhir",
					apiVersion: "R4",
					generateMocks: false,
					authType: "none",
				},
			};

		case "full":
			return {
				...baseConfig,
				outputDir: "./src/generated",
				verbose: true,
				packages: ["hl7.fhir.r4.core@4.0.1", "hl7.fhir.us.core@6.1.0"],
				typescript: {
					moduleFormat: "esm",
					generateIndex: true,
					includeDocuments: true,
					namingConvention: "PascalCase",
					strictMode: true,
					generateValidators: true,
					generateGuards: true,
					includeProfiles: true,
					includeExtensions: true,
				},
				restClient: {
					clientName: "FHIRClient",
					baseUrl: "https://api.example.com/fhir",
					apiVersion: "R4",
					generateMocks: true,
					authType: "bearer",
				},
			};

		default:
			return baseConfig;
	}
}

/**
 * Write TypeScript configuration file
 */
async function writeTSConfig(filePath: string, config: Config): Promise<void> {
	const content = `import type { Config } from '@atomic-ehr/codegen';

/**
 * Atomic Codegen Configuration
 */
const config: Config = ${JSON.stringify(config, null, 2)};

export default config;
`;
	await writeFile(filePath, content, "utf-8");
}
