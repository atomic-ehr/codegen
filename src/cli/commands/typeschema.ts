/**
 * TypeSchema Commands
 *
 * Commands for validating and managing TypeSchema files
 */

import type { CommandModule } from "yargs";
import { error, info, list } from "../utils/log.js";
import { generateTypeschemaCommand } from "./typeschema/generate.js";

/**
 * TypeSchema command group
 */
export const typeschemaCommand: CommandModule = {
	command: "typeschema [subcommand]",
	describe: "TypeSchema operations - generate, validate and merge schemas",
	builder: (yargs) => {
		return yargs
			.command(generateTypeschemaCommand)
			.help()
			.example(
				"$0 typeschema generate hl7.fhir.r4.core@4.0.1",
				"Generate TypeSchema from FHIR R4 core package",
			);
	},
	handler: (argv: any) => {
		// If no subcommand provided, show available subcommands
		if (!argv.subcommand && argv._.length === 1) {
			info("Available typeschema subcommands:");
			list(["generate    Generate TypeSchema files from FHIR packages"]);
			console.log(
				"\nUse 'atomic-codegen typeschema <subcommand> --help' for more information about a subcommand.",
			);
			console.log("\nExamples:");
			list([
				"atomic-codegen typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson",
				"atomic-codegen typeschema validate schemas.ndjson",
				"atomic-codegen typeschema merge schema1.ndjson schema2.ndjson -o merged.ndjson",
			]);
			return;
		}

		// If unknown subcommand provided, show error and available commands
		if (
			argv.subcommand &&
			!["generate", "validate", "merge"].includes(argv.subcommand)
		) {
			error(`Unknown typeschema subcommand: ${argv.subcommand}\n`);
			info("Available typeschema subcommands:");
			list([
				"generate    Generate TypeSchema files from FHIR packages",
				"validate    Validate TypeSchema files for correctness and consistency",
				"merge       Merge multiple TypeSchema files into a single file",
			]);
			console.log(
				"\nUse 'atomic-codegen typeschema <subcommand> --help' for more information about a subcommand.",
			);
			process.exit(1);
		}
	},
};
