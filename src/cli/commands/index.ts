#!/usr/bin/env bun

/**
 * Atomic Codegen CLI - New Command Structure
 *
 * Modern CLI with subcommands for typeschema and code generation
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ConfigManager } from "../../lib/core/config-manager";
import type { AtomicCodegenConfig } from "../../lib/core/config-schema";
import { AtomicCodegenError, ConfigurationError } from "../../lib/core/errors";
import { createLoggerFromConfig, LogLevel } from "../../lib/core/logger";
import { ensureInitialized } from "../../lib/generators";
import { configCommand } from "./config";
import { generateCommand } from "./generate";
import { generatorsCommand } from "./generators";
import { typeschemaCommand } from "./typeschema";
import { validateCommand } from "./validate";

/**
 * Extended argv interface with config
 */
export interface CLIArgvWithConfig {
	config?: string;
	verbose?: boolean;
	debug?: boolean;
	logLevel?: string;
	logFormat?: string;
	logFile?: string;
	_config?: AtomicCodegenConfig;
	_logger?: ReturnType<typeof createLoggerFromConfig>;
}

/**
 * Middleware to load configuration and setup logging
 */
async function loadConfigMiddleware(argv: CLIArgvWithConfig) {
	// Create logger first so we can use it for configuration loading
	const logger = createLoggerFromConfig({
		verbose: argv.verbose,
		debug: argv.debug,
		logLevel: argv.logLevel,
		logFormat: argv.logFormat,
		logFile: argv.logFile,
		component: "CLI",
	});

	// Attach logger to argv for use in commands
	argv._logger = logger;

	try {
		await logger.debug(
			"Loading configuration",
			{
				configPath: argv.config,
				workingDir: process.cwd(),
			},
			"loadConfig",
		);

		const configManager = new ConfigManager();
		const config = await configManager.loadConfig({
			configPath: argv.config,
			workingDir: process.cwd(),
			cliArgs: {
				global: {
					verbose: argv.verbose,
					debug: argv.debug,
				},
			},
		});

		// Attach config to argv for use in commands
		argv._config = config;

		const sources = Array.from(configManager.getConfigSources().values());
		await logger.info(
			"Configuration loaded successfully",
			{
				sources: sources.map((s) => s.type),
				configPath: argv.config || "default",
			},
			"loadConfig",
		);

		// Initialize generator system
		try {
			await ensureInitialized();
			await logger.debug(
				"Generator system initialized",
				undefined,
				"loadConfig",
			);
		} catch (error) {
			await logger.warn(
				"Generator system initialization failed",
				error instanceof Error ? error : new Error(String(error)),
				undefined,
				"loadConfig",
			);
		}
	} catch (error) {
		// If config loading fails, continue with defaults but warn
		const configError =
			error instanceof Error
				? new ConfigurationError(
						`Failed to load configuration: ${error.message}`,
						{
							context: {
								configPath: argv.config,
								workingDir: process.cwd(),
							},
							suggestions: [
								"Check that the configuration file exists and is readable",
								"Verify the configuration file syntax is valid JSON",
								'Run "atomic-codegen config validate" to check your configuration',
								'Use "atomic-codegen config init" to create a new configuration file',
							],
							recoverable: true,
							cause: error,
						},
					)
				: new ConfigurationError("Unknown configuration error", {
						context: { configPath: argv.config },
						recoverable: true,
					});

		await logger.warn(
			"Configuration loading failed, using defaults",
			configError,
			undefined,
			"loadConfig",
		);
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
		.command(generatorsCommand)
		.option("verbose", {
			alias: "v",
			type: "boolean",
			description: "Enable verbose output",
			default: false,
			global: true,
		})
		.option("debug", {
			alias: "d",
			type: "boolean",
			description: "Enable debug output with detailed logging",
			default: false,
			global: true,
		})
		.option("log-level", {
			type: "string",
			description: "Set log level (debug, info, warn, error, silent)",
			choices: ["debug", "info", "warn", "error", "silent"],
			global: true,
		})
		.option("log-format", {
			type: "string",
			description: "Set log output format",
			choices: ["pretty", "json", "compact"],
			default: "pretty",
			global: true,
		})
		.option("log-file", {
			type: "string",
			description: "Write logs to file (in addition to console)",
			global: true,
		})
		.option("config", {
			alias: "c",
			type: "string",
			description:
				"Path to configuration file (.atomic-codegen.json by default)",
			global: true,
		})
		.demandCommand(1, "You must specify a command")
		.help()
		.version("0.1.0")
		.example(
			"$0 typeschema create hl7.fhir.r4.core",
			"Create TypeSchema from FHIR package",
		)
		.example(
			"$0 generate typescript -i types.ndjson -o ./generated",
			"Generate TypeScript from TypeSchema",
		)
		.example(
			"$0 config init --template typescript",
			"Initialize TypeScript configuration",
		)
		.example("$0 config validate", "Validate current configuration")
		.example(
			"$0 validate -i types.ndjson -o ./generated",
			"Run comprehensive validation",
		)
		.example(
			"$0 --config my-config.json typeschema create",
			"Use custom configuration file",
		)
		.fail(async (msg, err, yargs) => {
			// Create a logger for error handling (fallback if middleware hasn't run)
			const logger = createLoggerFromConfig({
				debug: !!process.env.DEBUG,
				verbose: !!process.env.VERBOSE,
				component: "CLI",
			});

			if (err) {
				if (err instanceof AtomicCodegenError) {
					await logger.error("Command failed", err, undefined, "command");
					console.error("\n" + err.getFormattedMessage());
				} else {
					await logger.error(
						"Unexpected error occurred",
						err,
						undefined,
						"command",
					);
					console.error("Error:", err.message);
					if (process.env.DEBUG) {
						console.error(err.stack);
					}
				}
			} else {
				await logger.error(
					"Command validation failed",
					undefined,
					{ message: msg },
					"validation",
				);
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
