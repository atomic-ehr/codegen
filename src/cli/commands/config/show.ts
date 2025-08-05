/**
 * Config Show Command
 *
 * Show current atomic-codegen configuration
 */

import type { CommandModule } from "yargs";
import { ConfigManager } from "../../../lib/core/config-manager";

interface ShowCommandArgs {
	config?: string;
	"working-dir"?: string;
	format?: "json" | "yaml" | "text";
	"show-sources"?: boolean;
	"show-defaults"?: boolean;
}

/**
 * Config show command
 */
export const configShowCommand: CommandModule<{}, ShowCommandArgs> = {
	command: "show",
	describe: "Show current configuration",
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
		format: {
			alias: "f",
			type: "string",
			choices: ["json", "yaml", "text"] as const,
			default: "text" as const,
			description: "Output format",
		},
		"show-sources": {
			type: "boolean",
			default: false,
			description: "Show configuration sources",
		},
		"show-defaults": {
			type: "boolean",
			default: false,
			description: "Show default values",
		},
	},
	handler: async (argv) => {
		await showConfig({
			configPath: argv.config,
			workingDir: argv["working-dir"] || process.cwd(),
			format: argv.format || "text",
			showSources: argv["show-sources"] || false,
			showDefaults: argv["show-defaults"] || false,
		});
	},
};

interface ShowConfigOptions {
	configPath?: string;
	workingDir: string;
	format: "json" | "yaml" | "text";
	showSources: boolean;
	showDefaults: boolean;
}

/**
 * Show configuration
 */
export async function showConfig(options: ShowConfigOptions): Promise<void> {
	const { configPath, workingDir, format, showSources, showDefaults } = options;

	try {
		const configManager = new ConfigManager();

		// Load configuration from all sources
		const config = await configManager.loadConfig({
			configPath,
			workingDir,
		});

		if (format === "json") {
			const output: any = { config };
			
			if (showSources) {
				output.sources = Array.from(configManager.getConfigSources().entries()).map(([key, source]) => ({
					key,
					...source,
				}));
			}
			
			console.log(JSON.stringify(output, null, 2));
		} else if (format === "yaml") {
			// For now, output JSON format (could add YAML library later)
			console.log("# YAML format not yet implemented, showing JSON:");
			console.log(JSON.stringify(config, null, 2));
		} else {
			// Text format
			printConfigText(config, configManager, showSources, showDefaults);
		}
	} catch (error) {
		console.error(`❌ Failed to show configuration: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

/**
 * Print configuration in text format
 */
function printConfigText(
	config: any,
	configManager: ConfigManager,
	showSources: boolean,
	showDefaults: boolean
): void {
	console.log("⚙️  Atomic Codegen Configuration");
	console.log("================================");
	console.log();

	if (showSources) {
		console.log("📂 Configuration Sources:");
		for (const [key, source] of configManager.getConfigSources()) {
			const location = source.location ? ` (${source.location})` : "";
			console.log(`   ${key}: ${source.type}${location}`);
		}
		console.log();
	}

	// Project Configuration
	if (config.project && Object.keys(config.project).length > 0) {
		console.log("📁 Project:");
		printSection(config.project, "   ");
		console.log();
	}

	// TypeSchema Configuration
	if (config.typeschema && Object.keys(config.typeschema).length > 0) {
		console.log("🔄 TypeSchema:");
		printSection(config.typeschema, "   ");
		console.log();
	}

	// Generator Configuration
	if (config.generator && Object.keys(config.generator).length > 0) {
		console.log("⚡ Generator:");
		printSection(config.generator, "   ");
		console.log();
	}

	// Language Configurations
	if (config.languages && Object.keys(config.languages).length > 0) {
		console.log("🌐 Languages:");
		for (const [lang, langConfig] of Object.entries(config.languages)) {
			if (langConfig && typeof langConfig === "object" && Object.keys(langConfig).length > 0) {
				console.log(`   ${lang}:`);
				printSection(langConfig, "     ");
			}
		}
		console.log();
	}

	// Global Configuration
	if (config.global && Object.keys(config.global).length > 0) {
		console.log("🌍 Global:");
		printSection(config.global, "   ");
		console.log();
	}
}

/**
 * Print a configuration section
 */
function printSection(obj: any, indent: string): void {
	for (const [key, value] of Object.entries(obj)) {
		if (value && typeof value === "object" && !Array.isArray(value)) {
			console.log(`${indent}${key}:`);
			printSection(value, indent + "  ");
		} else {
			const displayValue = Array.isArray(value) 
				? `[${value.join(", ")}]`
				: typeof value === "string" 
					? `"${value}"`
					: String(value);
			console.log(`${indent}${key}: ${displayValue}`);
		}
	}
}