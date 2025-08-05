/**
 * Generate Commands
 *
 * Commands for generating code from TypeSchema files
 */

import type { CommandModule } from "yargs";
import { generateTypescriptCommand } from "./generate/typescript";

/**
 * Generate command group
 */
export const generateCommand: CommandModule = {
	command: "generate <language>",
	describe: "Generate code from TypeSchema files",
	builder: (yargs) => {
		return yargs
			.command(generateTypescriptCommand)
			.demandCommand(1, "You must specify a target language")
			.help()
			.example("$0 generate typescript -i schemas.ndjson -o ./generated", "Generate TypeScript from TypeSchema")
			.example("$0 generate typescript --input types/ --output ./src/types", "Generate from directory");
	},
	handler: () => {
		// This handler won't be called due to demandCommand(1)
	},
};
