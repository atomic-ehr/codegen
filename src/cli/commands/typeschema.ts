/**
 * TypeSchema Commands
 *
 * Commands for creating, validating, and managing TypeSchema files
 */

import type { CommandModule } from "yargs";
import { createTypeschemaCommand } from "./typeschema/create";
import { mergeTypeschemaCommand } from "./typeschema/merge";
import { validateTypeschemaCommand } from "./typeschema/validate";

/**
 * TypeSchema command group
 */
export const typeschemaCommand: CommandModule = {
	command: "typeschema <command>",
	describe: "TypeSchema operations - create, validate, and merge schemas",
	builder: (yargs) => {
		return yargs
			.command(createTypeschemaCommand)
			.command(validateTypeschemaCommand)
			.command(mergeTypeschemaCommand)
			.demandCommand(1, "You must specify a typeschema subcommand")
			.help()
			.example(
				"$0 typeschema create hl7.fhir.r4.core",
				"Create TypeSchema from FHIR package",
			)
			.example(
				"$0 typeschema validate schemas.ndjson",
				"Validate TypeSchema file",
			)
			.example(
				"$0 typeschema merge schema1.ndjson schema2.ndjson",
				"Merge multiple TypeSchema files",
			);
	},
	handler: () => {
		// This handler won't be called due to demandCommand(1)
	},
};
