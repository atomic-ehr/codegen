#!/usr/bin/env bun

/**
 * Atomic Codegen CLI - New Command Structure
 *
 * Modern CLI with subcommands for typeschema and code generation
 */

import { configure, error, header, LogLevel } from "@root/utils/codegen-logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { generateCommand } from "./generate";
import { typeschemaCommand } from "./typeschema";

/**
 * CLI arguments interface
 */
export interface CLIArgv {
    config?: string;
    verbose?: boolean;
    debug?: boolean;
    logLevel?: "debug" | "info" | "warn" | "error" | "silent";
}

/**
 * Map string log level to LogLevel enum
 */
function parseLogLevel(level: string | undefined): LogLevel | undefined {
    if (!level) return undefined;
    const levelMap: Record<string, LogLevel> = {
        debug: LogLevel.DEBUG,
        info: LogLevel.INFO,
        warn: LogLevel.WARN,
        error: LogLevel.ERROR,
        silent: LogLevel.SILENT,
    };
    return levelMap[level.toLowerCase()];
}

/**
 * Middleware to setup logging
 */
async function setupLoggingMiddleware(argv: any) {
    // Determine log level: explicit --log-level takes precedence over --verbose/--debug
    let level = parseLogLevel(argv.logLevel);

    // If no explicit log level, use --verbose or --debug as shortcuts
    if (level === undefined) {
        if (argv.debug || argv.verbose) {
            level = LogLevel.DEBUG;
        } else {
            level = LogLevel.INFO;
        }
    }

    // Configure the CliLogger with user preferences
    configure({
        timestamp: argv.debug,
        level,
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
            alias: "l",
            type: "string",
            choices: ["debug", "info", "warn", "error", "silent"] as const,
            description: "Set the log level (default: info)",
            global: true,
        })
        .option("config", {
            alias: "c",
            type: "string",
            description: "Path to configuration file (.atomic-codegen.json by default)",
            global: true,
        })
        .demandCommand(0) // Allow 0 commands so we can handle it ourselves
        .middleware((argv) => {
            // Check if no command was provided (only the script name in argv._)
            if (argv._.length === 0) {
                // Show available commands instead of error
                header("Welcome to Atomic Codegen!");
                console.log("Available commands:");
                console.log("  typeschema   Generate, validate and merge TypeSchema files");
                console.log("  generate     Generate code based on configuration file");
                console.log("\nUse 'atomic-codegen <command> --help' for more information about a command.");
                console.log("\nQuick examples:");
                console.log("  atomic-codegen typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson");
                console.log("  atomic-codegen generate  # Uses atomic-codegen.config.ts");
                console.log("\nUse 'atomic-codegen --help' to see all options.");
                process.exit(0);
            }
        })
        .help()
        .version("0.1.0")
        .example("$0 generate", "Generate code using atomic-codegen.config.ts")
        .example("$0 generate --verbose", "Generate with detailed progress output")
        .example("$0 --config custom-config.ts generate", "Use custom configuration file")
        .example(
            "$0 typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson",
            "Generate TypeSchemas from FHIR package",
        )
        .fail((msg, err, _yargs) => {
            if (err) {
                error(err.message, err);
            } else {
                error(msg);
            }

            error("\nUse --help for usage information");
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
        error("Unexpected error:", error);
        process.exit(1);
    });
}
