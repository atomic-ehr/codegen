/**
 * Generate Commands
 *
 * Commands for generating code from TypeSchema files using the registry system
 */

import { readdir, readFile, stat } from "fs/promises";
import { extname, join, resolve } from "path";
import type { CommandModule } from "yargs";
import type { GeneratorConfig } from "../../lib/core/config";
import {
	ErrorFactory,
	FileSystemError,
	GenerationError,
	ValidationError,
} from "../../lib/core/errors";
import { defaultRegistry, ensureInitialized } from "../../lib/generators";
import { organizeSchemas } from "../../lib/generators/schema-organizer";
import type { AnyTypeSchema } from "../../lib/typeschema";
import { generatePythonCommand } from "./generate/python";
import { generateTypescriptCommand } from "./generate/typescript";
import type { CLIArgvWithConfig } from "./index";

/**
 * Arguments for generate command
 */
interface GenerateArgs extends CLIArgvWithConfig {
	generator: string;
	input: string;
	output?: string;
	verbose?: boolean;
	overwrite?: boolean;
	format?: boolean;
}

/**
 * Generate command using registry system
 */
export const generateCommand: CommandModule<{}, GenerateArgs> = {
	command: "generate <generator>",
	describe: "Generate code from TypeSchema files",
	builder: (yargs) => {
		return yargs
			.positional("generator", {
				type: "string",
				describe: "Generator ID (e.g., 'typescript')",
				demandOption: true,
			})
			.option("input", {
				alias: "i",
				type: "string",
				describe: "Input TypeSchema file or directory",
				demandOption: true,
			})
			.option("output", {
				alias: "o",
				type: "string",
				describe: "Output directory (defaults to config generator.outputDir)",
				demandOption: false,
			})
			.option("verbose", {
				alias: "v",
				type: "boolean",
				describe: "Enable verbose logging",
				default: false,
			})
			.option("overwrite", {
				type: "boolean",
				describe: "Overwrite existing files",
				default: true,
			})
			.option("format", {
				type: "boolean",
				describe: "Format generated code",
				default: true,
			})
			.example(
				"$0 generate typescript -i schemas.ndjson -o ./generated",
				"Generate TypeScript from TypeSchema",
			)
			.example(
				"$0 generate typescript --input types/ --output ./src/types",
				"Generate from directory",
			)
			.example("$0 generators list", "List available generators");
	},
	handler: async (argv) => {
		try {
			// Ensure generator system is initialized
			await ensureInitialized();

			// Check if generator exists
			if (!defaultRegistry.has(argv.generator)) {
				console.error(`Generator not found: ${argv.generator}`);
				console.log("\nAvailable generators:");
				const generators = defaultRegistry.list();
				for (const gen of generators) {
					console.log(`  ${gen.id} - ${gen.name} (${gen.target})`);
				}
				console.log("\nUse 'generators list' for more details.");
				process.exit(1);
			}

			// Determine output directory - use provided argument or config default
			const outputDir = argv.output || argv._config?.generator?.outputDir;
			if (!outputDir) {
				throw new ValidationError(
					"Output directory must be specified either via --output argument or generator.outputDir in config",
				);
			}

			// Create generator instance
			const generator = await defaultRegistry.create(argv.generator, {
				outputDir: resolve(outputDir),
				verbose: argv.verbose,
				overwrite: argv.overwrite,
				format: argv.format,
			});

			// Load input schemas
			const inputPath = resolve(argv.input);
			const schemas = await loadTypeschemaFromPath(inputPath, argv._logger);

			if (schemas.length === 0) {
				throw new ValidationError(
					"No valid TypeSchema files found in input path",
				);
			}

			argv._logger?.info(
				`Loaded ${schemas.length} schema(s) from ${inputPath}`,
			);
			argv._logger?.info(
				`Using generator: ${generator.name} (${generator.target})`,
			);
			argv._logger?.info(`Output directory: ${outputDir}`);

			// Organize and pass schemas to the generator
			const organizedSchemas = organizeSchemas(schemas);
			const generatorAny = generator as any;
			generatorAny.schemas = {
				...organizedSchemas,
				// Legacy format for compatibility
				primitives: organizedSchemas.primitiveTypes,
				complex: organizedSchemas.complexTypes,
				resources: organizedSchemas.resources,
			};

			// Validate generator
			if (generator.validate) {
				await generator.validate();
			}

			// Generate code
			await generator.generate();

			argv._logger?.info("Code generation completed successfully");
		} catch (error) {
			if (error instanceof Error) {
				argv._logger?.error("Generation failed:", error);
			} else {
				argv._logger?.error("Generation failed:", String(error));
			}
			process.exit(1);
		}
	},
};

/**
 * Load TypeSchema from path (file or directory)
 */
async function loadTypeschemaFromPath(
	inputPath: string,
	log?: ReturnType<
		typeof import("../../lib/core/logger").createLoggerFromConfig
	>,
): Promise<AnyTypeSchema[]> {
	try {
		const stats = await stat(inputPath);

		if (stats.isFile()) {
			return await loadTypeschemaFromFile(inputPath);
		} else if (stats.isDirectory()) {
			return await loadTypeschemaFromDirectory(inputPath);
		} else {
			throw new FileSystemError(`Invalid input path: ${inputPath}`);
		}
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			throw new FileSystemError(`Input path not found: ${inputPath}`);
		}
		throw error;
	}
}

/**
 * Load TypeSchema from a single file
 */
async function loadTypeschemaFromFile(
	filePath: string,
): Promise<AnyTypeSchema[]> {
	const content = await readFile(filePath, "utf-8");
	const schemas: AnyTypeSchema[] = [];

	if (extname(filePath) === ".ndjson") {
		// Parse NDJSON format
		const lines = content.split("\n").filter((line) => line.trim());
		for (const line of lines) {
			try {
				schemas.push(JSON.parse(line));
			} catch (error) {
				console.warn(`Failed to parse line in ${filePath}:`, line);
			}
		}
	} else {
		// Parse regular JSON
		try {
			const parsed = JSON.parse(content);
			if (Array.isArray(parsed)) {
				schemas.push(...parsed);
			} else {
				schemas.push(parsed);
			}
		} catch (error) {
			throw new ValidationError(`Invalid JSON in file: ${filePath}`);
		}
	}

	return schemas;
}

/**
 * Load TypeSchema from directory
 */
async function loadTypeschemaFromDirectory(
	dirPath: string,
): Promise<AnyTypeSchema[]> {
	const schemas: AnyTypeSchema[] = [];
	const entries = await readdir(dirPath);

	for (const entry of entries) {
		const entryPath = join(dirPath, entry);
		const stats = await stat(entryPath);

		if (
			stats.isFile() &&
			(entry.endsWith(".json") || entry.endsWith(".ndjson"))
		) {
			try {
				const fileSchemas = await loadTypeschemaFromFile(entryPath);
				schemas.push(...fileSchemas);
			} catch (error) {
				console.warn(`Failed to load schemas from ${entryPath}:`, error);
			}
		}
	}

	return schemas;
}
