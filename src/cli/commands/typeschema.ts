/**
 * TypeSchema Commands
 *
 * Commands for validating and managing TypeSchema files
 */

import type { CommandModule } from "yargs";
import { generateTypeschemaCommand } from "./typeschema/generate";
import { mergeTypeschemaCommand } from "./typeschema/merge";
import { validateTypeschemaCommand } from "./typeschema/validate";

/**
 * TypeSchema command group
 */
export const typeschemaCommand: CommandModule = {
	command: "typeschema [subcommand]",
	describe: "TypeSchema operations - generate, validate and merge schemas",
	builder: (yargs) => {
		return yargs
			.command(generateTypeschemaCommand)
			.command(validateTypeschemaCommand)
			.command(mergeTypeschemaCommand)
			.help()
			.example(
				"$0 typeschema generate hl7.fhir.r4.core@4.0.1",
				"Generate TypeSchema from FHIR R4 core package",
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
	handler: (argv: any) => {
		// If no subcommand provided, show available subcommands
		if (!argv.subcommand && argv._.length === 1) {
			console.log("📋 Available typeschema subcommands:\n");
			console.log("  generate    Generate TypeSchema files from FHIR packages");
			console.log(
				"  validate    Validate TypeSchema files for correctness and consistency",
			);
			console.log(
				"  merge       Merge multiple TypeSchema files into a single file",
			);
			console.log(
				"\nUse 'atomic-codegen typeschema <subcommand> --help' for more information about a subcommand.",
			);
			console.log("\nExamples:");
			console.log(
				"  atomic-codegen typeschema generate hl7.fhir.r4.core@4.0.1 -o schemas.ndjson",
			);
			console.log("  atomic-codegen typeschema validate schemas.ndjson");
			console.log(
				"  atomic-codegen typeschema merge schema1.ndjson schema2.ndjson -o merged.ndjson",
			);
			return;
		}

		// If unknown subcommand provided, show error and available commands
		if (
			argv.subcommand &&
			!["generate", "validate", "merge"].includes(argv.subcommand)
		) {
			console.error(`❌ Unknown typeschema subcommand: ${argv.subcommand}\n`);
			console.log("📋 Available typeschema subcommands:\n");
			console.log("  generate    Generate TypeSchema files from FHIR packages");
			console.log(
				"  validate    Validate TypeSchema files for correctness and consistency",
			);
			console.log(
				"  merge       Merge multiple TypeSchema files into a single file",
			);
			console.log(
				"\nUse 'atomic-codegen typeschema <subcommand> --help' for more information about a subcommand.",
			);
			process.exit(1);
		}
	},
};
