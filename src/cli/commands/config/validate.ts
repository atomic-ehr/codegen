/**
 * Config Validate Command
 *
 * Validate atomic-codegen configuration files and settings
 */

import type { CommandModule } from "yargs";
// Import not needed currently
import { ConfigManager } from "../../../lib/core/config-manager";

interface ValidateCommandArgs {
	config?: string;
	"working-dir"?: string;
	verbose?: boolean;
	"output-format"?: "text" | "json";
}

/**
 * Config validate command
 */
export const configValidateCommand: CommandModule<{}, ValidateCommandArgs> = {
	command: "validate",
	describe: "Validate configuration files and settings",
	builder: {
		config: {
			alias: "c",
			type: "string",
			description: "Path to configuration file",
		},
		"working-dir": {
			alias: "w",
			type: "string",
			description: "Working directory to search for config files",
			default: process.cwd(),
		},
		"output-format": {
			alias: "o",
			type: "string",
			choices: ["text", "json"] as const,
			default: "text" as const,
			description: "Output format for validation results",
		},
		verbose: {
			alias: "v",
			type: "boolean",
			default: false,
			description: "Show detailed validation information",
		},
	},
	handler: async (argv) => {
		await validateConfig({
			configPath: argv.config,
			workingDir: argv["working-dir"] || process.cwd(),
			outputFormat: argv["output-format"] || "text",
			verbose: argv.verbose || false,
		});
	},
};

interface ValidateConfigOptions {
	configPath?: string;
	workingDir: string;
	outputFormat: "text" | "json";
	verbose: boolean;
}

/**
 * Validate configuration
 */
export async function validateConfig(
	options: ValidateConfigOptions,
): Promise<void> {
	const { configPath, workingDir, outputFormat, verbose } = options;

	try {
		const configManager = new ConfigManager();

		// Load configuration from all sources
		const config = await configManager.loadConfig({
			configPath,
			workingDir,
		});

		// Validate the merged configuration
		const validation = configManager.validateConfig(config);

		if (outputFormat === "json") {
			// Output JSON format
			const result = {
				valid: validation.valid,
				errors: validation.errors,
				warnings: validation.warnings,
				sources: Array.from(configManager.getConfigSources().entries()).map(
					([key, source]) => ({
						key,
						...source,
					}),
				),
				config: verbose ? config : undefined,
			};
			console.log(JSON.stringify(result, null, 2));
		} else {
			// Output text format
			printValidationResult(validation, configManager, verbose);
		}

		// Exit with error code if validation failed
		if (!validation.valid) {
			process.exit(1);
		}
	} catch (error) {
		if (outputFormat === "json") {
			console.log(
				JSON.stringify(
					{
						valid: false,
						error: error instanceof Error ? error.message : String(error),
					},
					null,
					2,
				),
			);
		} else {
			console.error(
				`❌ Configuration error: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		process.exit(1);
	}
}

/**
 * Print validation result in text format
 */
function printValidationResult(
	validation: any,
	configManager: ConfigManager,
	verbose: boolean,
): void {
	const sources = configManager.getConfigSources();

	// Print configuration sources
	console.log("📂 Configuration Sources:");
	for (const [key, source] of sources) {
		const location = source.location ? ` (${source.location})` : "";
		console.log(`   ${key}: ${source.type}${location}`);
	}
	console.log();

	// Print validation summary
	console.log("🔍 Validation Summary:");
	console.log(`   Valid: ${validation.valid ? "✅ Yes" : "❌ No"}`);
	console.log(`   Errors: ${validation.errors.length}`);
	console.log(`   Warnings: ${validation.warnings.length}`);
	console.log();

	// Print errors
	if (validation.errors.length > 0) {
		console.log("❌ Errors:");
		for (const error of validation.errors) {
			console.log(`   ${error.path}: ${error.message}`);
			if (error.suggestion) {
				console.log(`      💡 Suggestion: ${error.suggestion}`);
			}
			if (verbose && error.value !== undefined) {
				console.log(`      🔍 Value: ${JSON.stringify(error.value)}`);
			}
		}
		console.log();
	}

	// Print warnings
	if (validation.warnings.length > 0) {
		console.log("⚠️  Warnings:");
		for (const warning of validation.warnings) {
			console.log(`   ${warning.path}: ${warning.message}`);
			if (warning.suggestion) {
				console.log(`      💡 Suggestion: ${warning.suggestion}`);
			}
		}
		console.log();
	}

	// Print final result
	if (validation.valid) {
		console.log("✅ Configuration is valid!");
	} else {
		console.log("❌ Configuration validation failed!");
		console.log("   Please fix the errors above and try again.");
	}
}
