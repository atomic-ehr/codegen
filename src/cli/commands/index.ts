#!/usr/bin/env bun

/**
 * Atomic Codegen CLI - New Command Structure
 *
 * Modern CLI with subcommands for typeschema and code generation
 */

import { header } from "@root/utils/cli-fmt";
import type { LogLevel } from "@root/utils/log";
import { mkLogger } from "@root/utils/log";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { typeschemaCommand } from "./typeschema";

/**
 * CLI arguments interface
 */
export interface CLIArgv {
    verbose?: boolean;
    debug?: boolean;
    logLevel?: LogLevel;
}

let cliLogger = mkLogger({ prefix: "cli" });

async function setupLoggingMiddleware(argv: any) {
    const level: LogLevel = argv.logLevel ?? (argv.debug || argv.verbose ? "DEBUG" : "INFO");
    cliLogger = mkLogger({ prefix: "cli", level });
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
            choices: ["DEBUG", "INFO", "WARN", "ERROR", "SILENT"] as const,
            description: "Set the log level (default: INFO)",
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
                console.log("\nUse 'atomic-codegen <command> --help' for more information about a command.");
                console.log("\nQuick examples:");
                console.log("  atomic-codegen typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson");
                console.log("\nUse 'atomic-codegen --help' to see all options.");
                process.exit(0);
            }
        })
        .help()
        .version("0.1.0")
        .example(
            "$0 typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson",
            "Generate TypeSchemas from FHIR package",
        )
        .fail((msg, err, _yargs) => {
            cliLogger.error(err ? err.message : msg);
            cliLogger.error("Use --help for usage information");
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
    runCLI().catch((err) => {
        cliLogger.error(String(err));
        process.exit(1);
    });
}
