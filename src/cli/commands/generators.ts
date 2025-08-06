/**
 * Generator Management Commands
 *
 * Commands for listing and managing available generators
 */

import type { CommandModule } from "yargs";
import {
	defaultRegistry,
	ensureInitialized,
	getInitializationStatus,
} from "../../lib/generators";
import type { CLIArgvWithConfig } from "./index";

/**
 * Arguments for generator list command
 */
interface GeneratorListArgs {
	target?: string;
	builtin?: boolean;
	plugin?: boolean;
	verbose?: boolean;
}

/**
 * List generators command
 */
export const listGeneratorsCommand: CommandModule<{}, GeneratorListArgs> = {
	command: "list",
	describe: "List available generators",
	builder: (yargs) => {
		return yargs
			.option("target", {
				alias: "t",
				type: "string",
				describe: "Filter by target language",
			})
			.option("builtin", {
				type: "boolean",
				describe: "Show only built-in generators",
			})
			.option("plugin", {
				type: "boolean",
				describe: "Show only plugin generators",
			})
			.option("verbose", {
				alias: "v",
				type: "boolean",
				describe: "Show detailed information",
				default: false,
			});
	},
	handler: async (argv) => {
		try {
			// Ensure generator system is initialized
			await ensureInitialized();

			let generators = defaultRegistry.list();

			// Apply filters
			if (argv.target) {
				generators = generators.filter((g) => g.target === argv.target);
			}

			if (argv.builtin) {
				generators = generators.filter((g) => g.builtin);
			}

			if (argv.plugin) {
				generators = generators.filter((g) => !g.builtin);
			}

			// Sort by name
			generators.sort((a, b) => a.name.localeCompare(b.name));

			if (generators.length === 0) {
				console.log("No generators found matching the criteria.");
				return;
			}

			console.log(`Found ${generators.length} generator(s):\n`);

			for (const generator of generators) {
				if (argv.verbose) {
					console.log(`${generator.name} (${generator.id})`);
					console.log(`  Target: ${generator.target}`);
					console.log(`  Version: ${generator.version}`);
					console.log(`  Description: ${generator.description}`);
					console.log(`  Type: ${generator.builtin ? "Built-in" : "Plugin"}`);

					if (generator.author) {
						console.log(`  Author: ${generator.author}`);
					}

					if (generator.supportedInputs?.length) {
						console.log(
							`  Supported inputs: ${generator.supportedInputs.join(", ")}`,
						);
					}

					if (generator.supportedOutputs?.length) {
						console.log(
							`  Supported outputs: ${generator.supportedOutputs.join(", ")}`,
						);
					}

					if (generator.modulePath) {
						console.log(`  Module: ${generator.modulePath}`);
					}

					console.log();
				} else {
					const type = generator.builtin ? "[builtin]" : "[plugin]";
					console.log(
						`  ${generator.id.padEnd(15)} ${generator.target.padEnd(12)} ${type.padEnd(10)} ${generator.description}`,
					);
				}
			}

			// Show initialization status if verbose
			if (argv.verbose) {
				const status = getInitializationStatus();
				console.log("Registry Status:");
				console.log(`  Initialized: ${status.initialized}`);
				console.log(`  Total generators: ${status.registeredGenerators}`);
				console.log(`  Built-in generators: ${status.builtinGenerators}`);
				console.log(`  Plugin generators: ${status.pluginGenerators}`);
			}
		} catch (error) {
			console.error(
				"Failed to list generators:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		}
	},
};

/**
 * Generator info command
 */
export const generatorInfoCommand: CommandModule<{}, { id: string }> = {
	command: "info <id>",
	describe: "Show detailed information about a specific generator",
	builder: (yargs) => {
		return yargs.positional("id", {
			type: "string",
			describe: "Generator ID",
			demandOption: true,
		});
	},
	handler: async (argv) => {
		try {
			// Ensure generator system is initialized
			await ensureInitialized();

			const entry = defaultRegistry.get(argv.id);
			if (!entry) {
				console.error(`Generator not found: ${argv.id}`);
				console.log("\nAvailable generators:");
				const generators = defaultRegistry.list();
				for (const gen of generators) {
					console.log(`  ${gen.id} - ${gen.name}`);
				}
				process.exit(1);
			}

			const { metadata } = entry;

			console.log(`Generator: ${metadata.name}`);
			console.log(`ID: ${metadata.id}`);
			console.log(`Target: ${metadata.target}`);
			console.log(`Version: ${metadata.version}`);
			console.log(`Description: ${metadata.description}`);
			console.log(`Type: ${metadata.builtin ? "Built-in" : "Plugin"}`);

			if (metadata.author) {
				console.log(`Author: ${metadata.author}`);
			}

			if (metadata.supportedInputs?.length) {
				console.log(`Supported inputs: ${metadata.supportedInputs.join(", ")}`);
			}

			if (metadata.supportedOutputs?.length) {
				console.log(
					`Supported outputs: ${metadata.supportedOutputs.join(", ")}`,
				);
			}

			if (metadata.modulePath) {
				console.log(`Module path: ${metadata.modulePath}`);
			}

			if (metadata.configSchema) {
				console.log(`Configuration schema: Available`);
			}

			// Test generator creation
			try {
				const testGenerator = await defaultRegistry.create(argv.id, {
					outputDir: "/tmp/test",
				});
				console.log(`Status: ✓ Generator can be created successfully`);
				console.log(`Implementation: ${testGenerator.constructor.name}`);
			} catch (error) {
				console.log(
					`Status: ✗ Generator creation failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		} catch (error) {
			console.error(
				"Failed to get generator info:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		}
	},
};

/**
 * Main generators command
 */
export const generatorsCommand: CommandModule = {
	command: "generators",
	describe: "Manage and list available generators",
	builder: (yargs) => {
		return yargs
			.command(listGeneratorsCommand)
			.command(generatorInfoCommand)
			.demandCommand(1, "You must specify a subcommand")
			.help();
	},
	handler: () => {
		// This handler won't be called due to demandCommand(1)
	},
};
