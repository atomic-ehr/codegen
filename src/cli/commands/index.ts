#!/usr/bin/env bun

/**
 * Atomic Codegen CLI - New Command Structure
 *
 * Modern CLI with subcommands for typeschema and code generation
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createLoggerFromConfig, type ILogger } from "../../logger.ts";
import { generateCommand } from "./generate";
import { typeschemaCommand } from "./typeschema";

/**
 * CLI arguments interface
 */
export interface CLIArgv {
	config?: string;
	verbose?: boolean;
	debug?: boolean;
	logLevel?: string;
	logFormat?: string;
	logFile?: string;
	_logger?: ILogger;
}

/**
 * Middleware to setup logging
 */
async function setupLoggingMiddleware(argv: any) {
	// Create logger for CLI operations
	// Attach logger to argv for use in commands
	argv._logger = createLoggerFromConfig({
		verbose: argv.verbose,
		debug: argv.debug,
		logLevel: argv.logLevel,
		logFormat: argv.logFormat,
		logFile: argv.logFile,
		component: "CLI",
	});
}

/**
 * Main CLI entry point with subcommands
 */
export function createCLI() {
	return yargs(hideBin(process.argv))
		.scriptName("atomic-codegen")
		.usage("$0 <command> [options]")
		.middleware(setupLoggingMiddleware)
		.command(typeschemaCommand)
		.command(generateCommand)
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
		.demandCommand(0) // Allow 0 commands so we can handle it ourselves
		.middleware((argv) => {
			// Check if no command was provided (only the script name in argv._)
			if (argv._.length === 0) {
				// Show available commands instead of error
				console.log("🚀 Welcome to Atomic Codegen!\n");
				console.log("📋 Available commands:\n");
				console.log("  init         Initialize a new atomic-codegen project");
				console.log(
					"  typeschema   Generate, validate and merge TypeSchema files",
				);
				console.log(
					"  generate     Generate code from TypeSchema (TypeScript, REST clients)",
				);
				console.log(
					"\nUse 'atomic-codegen <command> --help' for more information about a command.",
				);
				console.log("\n✨ Quick examples:");
				console.log(
					"  atomic-codegen typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson",
				);
				console.log(
					"  atomic-codegen generate typescript -i schemas.ndjson -o ./types",
				);
				console.log(
					"  atomic-codegen generate rest-client -i schemas.ndjson -o ./client",
				);
				console.log("\nUse 'atomic-codegen --help' to see all options.");
				process.exit(0);
			}
		})
		.help()
		.version("0.1.0")
		.example(
			"$0 generate typescript --input types.ndjson",
			"Generate TypeScript from TypeSchema files",
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
			"$0 --config my-config.json generate typescript",
			"Use custom configuration file",
		)
		.fail(async (msg, err, _yargs) => {
			// Create a logger for error handling (fallback if middleware hasn't run)
			const logger = createLoggerFromConfig({
				debug: !!process.env.DEBUG,
				verbose: !!process.env.VERBOSE,
				component: "CLI",
			});

			if (err) {
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
