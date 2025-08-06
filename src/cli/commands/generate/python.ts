/**
 * Generate Python Command
 *
 * Generate Python dataclasses and type hints from TypeSchema files
 */

import { readdir, readFile, stat } from "fs/promises";
import { extname, join, resolve } from "path";
import type { CommandModule } from "yargs";
import { PythonGenerator } from "../../../generators/python/generator";
import type { GeneratorConfig } from "../../../lib/core/config";
import {
	ErrorFactory,
	FileSystemError,
	GenerationError,
	ValidationError,
} from "../../../lib/core/errors";
import type { ILogger } from "../../../lib/core/logger";
import { organizeSchemas } from "../../../lib/generators/schema-organizer";
import type { AnyTypeSchema, TypeSchema } from "../../../lib/typeschema";
import type { CLIArgvWithConfig } from "../index";

interface PythonGenerateArgs extends CLIArgvWithConfig {
	input?: string;
	output?: string;
	"include-comments"?: boolean;
	"include-validation"?: boolean;
	"namespace-style"?: "nested" | "flat";
	"file-naming"?: "camelCase" | "kebab-case" | "snake_case" | "PascalCase";
	format?: boolean;
	"file-header"?: string;
	overwrite?: boolean;
	// Python-specific options
	"use-pydantic"?: boolean;
	"generate-init"?: boolean;
	"class-style"?: "dataclass" | "pydantic";
	"type-checking"?: boolean;
	"strict-optional"?: boolean;
}

/**
 * Generate Python command
 */
export const generatePythonCommand: CommandModule<{}, PythonGenerateArgs> = {
	command: "python",
	aliases: ["py"],
	describe: "Generate Python dataclasses and type hints from TypeSchema",
	builder: {
		input: {
			alias: "i",
			type: "string",
			description:
				"Input TypeSchema file or directory (.ndjson, .json, or directory)",
		},
		output: {
			alias: "o",
			type: "string",
			description:
				"Output directory for generated Python files. Uses config file if not specified.",
			demandOption: false,
		},
		"include-comments": {
			type: "boolean",
			default: true,
			description: "Include docstrings in generated code",
		},
		"include-validation": {
			type: "boolean",
			default: false,
			description: "Include validation code in generated types",
		},
		"namespace-style": {
			type: "string",
			choices: ["nested", "flat"] as const,
			default: "nested" as const,
			description: "Package organization style",
		},
		"file-naming": {
			type: "string",
			choices: ["camelCase", "kebab-case", "snake_case", "PascalCase"] as const,
			default: "snake_case" as const,
			description: "File naming convention",
		},
		format: {
			type: "boolean",
			default: true,
			description: "Format generated code",
		},
		"file-header": {
			type: "string",
			description: "Custom file header to add to all generated files",
		},
		overwrite: {
			type: "boolean",
			default: true,
			description: "Overwrite existing files",
		},
		// Python-specific options
		"use-pydantic": {
			type: "boolean",
			default: false,
			description: "Use Pydantic models instead of dataclasses",
		},
		"generate-init": {
			type: "boolean",
			default: true,
			description: "Generate __init__.py files",
		},
		"class-style": {
			type: "string",
			choices: ["dataclass", "pydantic"] as const,
			default: "dataclass" as const,
			description: "Class generation style (alias for use-pydantic)",
		},
		"type-checking": {
			type: "boolean",
			default: true,
			description: "Include type checking imports and annotations",
		},
		"strict-optional": {
			type: "boolean",
			default: true,
			description: "Use strict optional typing (Optional[T] vs T | None)",
		},
		verbose: {
			alias: "v",
			type: "boolean",
			default: false,
			description: "Enable verbose output",
		},
	},
	handler: async (argv) => {
		// Get output directory from CLI args or configuration
		const outputDir = argv.output || argv._config?.generator?.outputDir;
		if (!outputDir) {
			throw ErrorFactory.missingConfig("outputDir", [
				"Use --output flag to specify output directory",
				"Configure outputDir in your .atomic-codegen.json file",
			]);
		}

		// Merge CLI args with configuration
		const configGenerator = argv._config?.generator || {} as Partial<GeneratorConfig>;
		const configGlobal = argv._config?.global || {};
		const configLanguagePy = argv._config?.languages?.python || {};

		const generatorConfig: GeneratorConfig = {
			target: "python",
			outputDir: resolve(outputDir),
			includeComments:
				argv["include-comments"] ?? configGenerator.includeComments ?? true,
			includeValidation:
				argv["include-validation"] ??
				configGenerator.includeValidation ??
				false,
			namespaceStyle:
				argv["namespace-style"] || configGenerator.namespaceStyle || "nested",
			fileNaming:
				argv["file-naming"] || configGenerator.fileNaming || "snake_case",
			format: argv.format ?? configGenerator.format ?? true,
			fileHeader: argv["file-header"] || configGenerator.fileHeader,
			overwrite: argv.overwrite ?? configGenerator.overwrite ?? true,
			verbose: argv.verbose ?? configGlobal.verbose ?? false,
		};

		// Determine if using Pydantic (class-style takes precedence)
		const usePydantic =
			(argv["class-style"] === "pydantic" || argv["use-pydantic"]) ??
			configLanguagePy.usePydantic ??
			false;

		const pythonConfig = {
			usePydantic,
			generateInit:
				argv["generate-init"] ?? configLanguagePy.generateInit ?? true,
			typeChecking:
				argv["type-checking"] ?? configLanguagePy.typeChecking ?? true,
			strictOptional:
				argv["strict-optional"] ?? configLanguagePy.strictOptional ?? true,
		};

		// Use logger if available from middleware
		const logger = argv._logger;

		await generatePython(generatorConfig, pythonConfig, argv.input, logger);
	},
};

/**
 * Generate Python types from TypeSchema
 */
export async function generatePython(
	config: GeneratorConfig,
	pythonConfig: any,
	inputPath?: string,
	logger?: ILogger,
): Promise<void> {
	// Create child logger for this operation
	const log = logger?.child("PythonGenerator") || {
		debug: async (msg: string, ctx?: any) =>
			config.verbose && console.error(`[DEBUG] ${msg}`),
		info: async (msg: string, ctx?: any) =>
			config.verbose && console.error(`[INFO] ${msg}`),
		warn: async (msg: string, ctx?: any) => console.error(`[WARN] ${msg}`),
		error: async (msg: string, err?: any, ctx?: any) =>
			console.error(`[ERROR] ${msg}`),
	};

	try {
		await log.info(
			"Initializing Python generator",
			{
				outputDir: config.outputDir,
				overwrite: config.overwrite,
				format: config.format,
				usePydantic: pythonConfig.usePydantic,
			},
		);

		// Create generator with merged config
		const generator = new PythonGenerator({
			outputDir: config.outputDir,
			verbose: config.verbose,
			overwrite: config.overwrite,
			format: config.format,
			fileHeader: config.fileHeader,
			usePydantic: pythonConfig.usePydantic,
			generateInit: pythonConfig.generateInit,
		});

		// If input is provided, load schemas from file/directory
		if (inputPath) {
			await log.info(
				"Loading TypeSchema from input",
				{ inputPath },
			);
			const schemas = await loadTypeschemaFromPath(inputPath, log);

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

			await log.debug(
				"Schema organization complete",
				{
					primitiveTypes: organizedSchemas.primitiveTypes?.length || 0,
					complexTypes: organizedSchemas.complexTypes?.length || 0,
					resources: Object.keys(organizedSchemas.resources || {}).length,
				},
			);
		}

		await log.info("Starting Python generation");

		// Validate generator configuration
		await generator.validate();

		// Generate types
		await generator.generate();

		await log.info(
			"Python generation completed successfully",
			{
				outputDir: config.outputDir,
			},
		);

		console.log(
			`✨ Successfully generated Python types in ${config.outputDir}`,
		);
	} catch (error) {
		const generationError = new GenerationError(
			`Failed to generate Python types`,
			{
				generator: "python",
				outputPath: config.outputDir,
				context: {
					inputPath,
					config: {
						outputDir: config.outputDir,
						overwrite: config.overwrite,
						format: config.format,
					},
				},
				suggestions: [
					"Check that the input TypeSchema files are valid",
					"Ensure the output directory is writable",
					"Verify that all required dependencies are installed",
					"Try running with --debug for more detailed error information",
				],
				recoverable: true,
				cause: error instanceof Error ? error : undefined,
			},
		);

		await log.error(
			"Python generation failed",
			generationError,
		);
		throw generationError;
	}
}

/**
 * Load TypeSchema from file or directory
 */
async function loadTypeschemaFromPath(
	inputPath: string,
	log?: any,
): Promise<AnyTypeSchema[]> {
	const resolvedPath = resolve(inputPath);

	try {
		const stats = await stat(resolvedPath);

		if (stats.isFile()) {
			await log?.debug(
				"Loading TypeSchema from file",
				{ path: resolvedPath },
				"loadFile",
			);
			return await loadTypeschemaFromFile(resolvedPath);
		} else if (stats.isDirectory()) {
			await log?.debug(
				"Loading TypeSchema from directory",
				{ path: resolvedPath },
				"loadDirectory",
			);
			return await loadTypeschemaFromDirectory(resolvedPath);
		} else {
			throw ErrorFactory.invalidFormat(inputPath, ["file", "directory"]);
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("ENOENT")) {
			throw ErrorFactory.fileNotFound(inputPath, [
				"Check that the path exists and is accessible",
				"Verify file permissions allow reading",
			]);
		}
		throw error;
	}
}

/**
 * Load TypeSchema from a single file
 */
async function loadTypeschemaFromFile(filePath: string): Promise<any[]> {
	const content = await readFile(filePath, "utf-8");
	const ext = extname(filePath);

	if (ext === ".ndjson") {
		// Parse NDJSON format
		const lines = content.trim().split("\n");
		return lines.map((line) => JSON.parse(line));
	} else if (ext === ".json") {
		// Parse regular JSON (array or single object)
		const parsed = JSON.parse(content);
		return Array.isArray(parsed) ? parsed : [parsed];
	} else {
		throw ErrorFactory.invalidFormat(filePath, [".ndjson", ".json"]);
	}
}

/**
 * Load TypeSchema from directory (all .json and .ndjson files)
 */
async function loadTypeschemaFromDirectory(dirPath: string): Promise<any[]> {
	const files = await readdir(dirPath, { recursive: true });
	const schemas: any[] = [];

	for (const file of files) {
		const filePath = join(dirPath, file);
		const stats = await stat(filePath);

		if (
			stats.isFile() &&
			(file.endsWith(".json") || file.endsWith(".ndjson"))
		) {
			const fileSchemas = await loadTypeschemaFromFile(filePath);
			schemas.push(...fileSchemas);
		}
	}

	return schemas;
}
