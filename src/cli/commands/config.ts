/**
 * Config Commands
 *
 * Commands for managing atomic-codegen configuration
 */

import type { CommandModule } from "yargs";
import { configInitCommand } from "./config/init";
import { configShowCommand } from "./config/show";
import { configValidateCommand } from "./config/validate";

/**
 * Config command group
 */
export const configCommand: CommandModule = {
	command: "config <command>",
	describe: "Configuration management - validate, show, and initialize",
	builder: (yargs) => {
		return yargs
			.command(configValidateCommand)
			.command(configShowCommand)
			.command(configInitCommand)
			.demandCommand(1, "You must specify a config subcommand")
			.help()
			.example("$0 config validate", "Validate current configuration")
			.example("$0 config show", "Show current configuration")
			.example("$0 config init", "Initialize configuration file");
	},
	handler: () => {
		// This handler won't be called due to demandCommand(1)
	},
};
