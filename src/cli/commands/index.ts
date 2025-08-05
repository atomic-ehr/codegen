#!/usr/bin/env bun

/**
 * Atomic Codegen CLI - New Command Structure
 *
 * Modern CLI with subcommands for typeschema and code generation
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { typeschemaCommand } from "./typeschema";
import { generateCommand } from "./generate";
import { configCommand } from "./config";
import { validateCommand } from "./validate";
import { ConfigManager } from "../../lib/core/config-manager";
import type { AtomicCodegenConfig } from "../../lib/core/config-schema";

/**
 * Extended argv interface with config
 */
export interface CLIArgvWithConfig {
	config?: string;
	verbose?: boolean;
	_config?: AtomicCodegenConfig;
}

/**
 * Middleware to load configuration
 */
async function loadConfigMiddleware(argv: CLIArgvWithConfig) {
	try {
		const configManager = new ConfigManager();
		const config = await configManager.loadConfig({
			configPath: argv.config,
			workingDir: process.cwd(),
			cliArgs: {
				global: {
					verbose: argv.verbose,
				},
			},
		});

		// Attach config to argv for use in commands
		argv._config = config;

		if (argv.verbose) {
			const sources = Array.from(configManager.getConfigSources().values());
			console.error(`[CLI] Loaded configuration from: ${sources.map(s => s.type).join(", ")}`);
		}
	} catch (error) {
		// If config loading fails, continue with defaults but warn
		if (argv.verbose) {
			console.error(`[CLI] Warning: Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

/**
 * Main CLI entry point with subcommands
 */
export function createCLI() {
	return yargs(hideBin(process.argv))
		.scriptName("atomic-codegen")
		.usage("$0 <command> [options]")
		.middleware(loadConfigMiddleware)
		.command(typeschemaCommand)
		.command(generateCommand)
		.command(configCommand)
		.command(validateCommand)
		.option("verbose", {
			alias: "v",
			type: "boolean",
			description: "Enable verbose output",
			default: false,
			global: true,
		})
		.option("config", {
			alias: "c",
			type: "string",
			description: "Path to configuration file (.atomic-codegen.json by default)",
			global: true,
		})
		.demandCommand(1, "You must specify a command")
		.help()
		.version("0.1.0")
		.example("$0 typeschema create hl7.fhir.r4.core", "Create TypeSchema from FHIR package")
		.example("$0 generate typescript -i types.ndjson -o ./generated", "Generate TypeScript from TypeSchema")
		.example("$0 config init --template typescript", "Initialize TypeScript configuration")
		.example("$0 config validate", "Validate current configuration")
		.example("$0 validate -i types.ndjson -o ./generated", "Run comprehensive validation")
		.example("$0 --config my-config.json typeschema create", "Use custom configuration file")
		.fail((msg, err, yargs) => {
			if (err) {
				console.error("Error:", err.message);
				if (process.env.DEBUG) {
					console.error(err.stack);
				}
			} else {
				console.error("Error:", msg);
			}
			console.error("\nUse --help for usage information");
			process.exit(1);
		})
		.wrap(Math.min(120, process.stdout.columns || 80));
}

/**
 * Run the CLI
 */
export async function runCLI() {
	const cli = createCLI();
	await cli.parseAsync();
}

// Run CLI if this file is executed directly
if (import.meta.main) {
	runCLI().catch((error) => {
		console.error("Unexpected error:", error.message);
		if (process.env.DEBUG) {
			console.error(error.stack);
		}
		process.exit(1);
	});
}
