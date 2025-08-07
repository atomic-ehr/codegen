/**
 * Config Commands
 *
 * Commands for managing atomic-codegen configuration
 */

import type { CommandModule } from "yargs";
import { configInitCommand } from "./config/init";

/**
 * Config command group
 */
export const configCommand: CommandModule = {
	command: "config [subcommand]",
	describe: "Configuration management - initialize configuration files",
	builder: (yargs) => {
		return yargs
			.command(configInitCommand)
			.help()
			.example("$0 config init", "Initialize configuration file")
			.example(
				"$0 config init --template typescript",
				"Initialize with TypeScript template",
			);
	},
	handler: (argv: any) => {
		// If no subcommand provided, show available subcommands
		if (!argv.subcommand && argv._.length === 1) {
			console.log("📋 Available config subcommands:\n");
			console.log("  init    Initialize configuration file");
			console.log(
				"\nUse 'atomic-codegen config <subcommand> --help' for more information about a subcommand.",
			);
			console.log("\nExamples:");
			console.log("  atomic-codegen config init");
			console.log("  atomic-codegen config init --template typescript");
			return;
		}

		// If unknown subcommand provided, show error and available commands
		if (argv.subcommand && !["init"].includes(argv.subcommand)) {
			console.error(`❌ Unknown config subcommand: ${argv.subcommand}\n`);
			console.log("📋 Available config subcommands:\n");
			console.log("  init    Initialize configuration file");
			console.log(
				"\nUse 'atomic-codegen config <subcommand> --help' for more information about a subcommand.",
			);
			process.exit(1);
		}
	},
};
