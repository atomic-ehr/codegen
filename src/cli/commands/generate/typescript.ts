/**
 * Generate TypeScript Command
 *
 * Generate TypeScript types from TypeSchema files
 */

import { readdir, readFile, stat } from "fs/promises";
import { extname, join, resolve } from "path";
import type { CommandModule } from "yargs";
import { TypeScriptGenerator } from "../../../generators/typescript";
import type {
	GeneratorConfig,
	TypeScriptConfig,
} from "../../../lib/core/config";
import {
	ErrorFactory,
	FileSystemError,
	GenerationError,
	ValidationError,
} from "../../../lib/core/errors";
import { organizeSchemas } from "../../../lib/generators/schema-organizer";
import type { AnyTypeSchema, TypeSchema } from "../../../lib/typeschema";
import type { CLIArgvWithConfig } from "../index";

interface TypeScriptGenerateArgs extends CLIArgvWithConfig {
	input?: string;
	output?: string;
	"include-comments"?: boolean;
	"include-validation"?: boolean;
	"namespace-style"?: "nested" | "flat";
	"file-naming"?: "camelCase" | "kebab-case" | "snake_case" | "PascalCase";
	format?: boolean;
	"file-header"?: string;
	overwrite?: boolean;
	// TypeScript-specific options
	strict?: boolean;
	target?:
		| "ES5"
		| "ES6"
		| "ES2015"
		| "ES2017"
		| "ES2018"
		| "ES2019"
		| "ES2020"
		| "ES2021"
		| "ES2022";
	module?: "CommonJS" | "ES6" | "ES2015" | "ES2020" | "ES2022" | "ESNext";
	declaration?: boolean;
	"base-types-module"?: string;
	"use-enums"?: boolean;
	"prefer-interfaces"?: boolean;
}

/**
 * Generate TypeScript command
 */
export const generateTypescriptCommand: CommandModule<
	{},
	TypeScriptGenerateArgs
> = {
	command: "typescript",
	aliases: ["ts"],
	describe: "Generate TypeScript types from TypeSchema",
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
				"Output directory for generated TypeScript files. Uses config file if not specified.",
			demandOption: false,
		},
		"include-comments": {
			type: "boolean",
			default: true,
			description: "Include JSDoc comments in generated code",
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
			description: "Namespace organization style",
		},
		"file-naming": {
			type: "string",
			choices: ["camelCase", "kebab-case", "snake_case", "PascalCase"] as const,
			default: "PascalCase" as const,
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
		// TypeScript-specific options
		strict: {
			type: "boolean",
			default: true,
			description: "Use TypeScript strict mode",
		},
		target: {
			type: "string",
			choices: [
				"ES5",
				"ES6",
				"ES2015",
				"ES2017",
				"ES2018",
				"ES2019",
				"ES2020",
				"ES2021",
				"ES2022",
			] as const,
			default: "ES2020" as const,
			description: "TypeScript target version",
		},
		module: {
			type: "string",
			choices: [
				"CommonJS",
				"ES6",
				"ES2015",
				"ES2020",
				"ES2022",
				"ESNext",
			] as const,
			default: "ES2020" as const,
			description: "Module system to use",
		},
		declaration: {
			type: "boolean",
			default: true,
			description: "Generate TypeScript declaration files",
		},
		"base-types-module": {
			type: "string",
			description: "Base types module import path",
		},
		"use-enums": {
			type: "boolean",
			default: true,
			description: "Use enums for value sets",
		},
		"prefer-interfaces": {
			type: "boolean",
			default: true,
			description: "Prefer interfaces over type aliases",
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
		const configGenerator = argv._config?.generator || {};
		const configGlobal = argv._config?.global || {};
		const configLanguageTs = argv._config?.languages?.typescript || {};

		const generatorConfig: GeneratorConfig = {
			target: "typescript",
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
				argv["file-naming"] || configGenerator.fileNaming || "PascalCase",
			format: argv.format ?? configGenerator.format ?? true,
			fileHeader: argv["file-header"] || configGenerator.fileHeader,
			overwrite: argv.overwrite ?? configGenerator.overwrite ?? true,
			verbose: argv.verbose ?? configGlobal.verbose ?? false,
			generateProfiles: configGenerator.generateProfiles ?? true,
		};

		const typescriptConfig: TypeScriptConfig = {
			strict: argv.strict ?? configLanguageTs.strict ?? true,
			target: argv.target || configLanguageTs.target || "ES2020",
			module: argv.module || configLanguageTs.module || "ES2020",
			declaration: argv.declaration ?? configLanguageTs.declaration ?? true,
			baseTypesModule:
				argv["base-types-module"] || configLanguageTs.baseTypesModule,
			useEnums: argv["use-enums"] ?? configLanguageTs.useEnums ?? true,
			preferInterfaces:
				argv["prefer-interfaces"] ?? configLanguageTs.preferInterfaces ?? true,
		};

		// Use logger if available from middleware
		const logger = argv._logger;

		await generateTypeScript(
			generatorConfig,
			typescriptConfig,
			argv.input,
			logger,
		);
	},
};

/**
 * Generate TypeScript types from TypeSchema
 */
export async function generateTypeScript(
	config: GeneratorConfig,
	tsConfig: TypeScriptConfig,
	inputPath?: string,
	logger?: ReturnType<
		typeof import("../../core/logger").createLoggerFromConfig
	>,
): Promise<void> {
	// Create child logger for this operation
	const log = logger?.child("TypeScriptGenerator") || {
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
			"Initializing TypeScript generator",
			{
				outputDir: config.outputDir,
				overwrite: config.overwrite,
				format: config.format,
			},
			"initialize",
		);

		// Create generator with merged config
		const generator = new TypeScriptGenerator({
			outputDir: config.outputDir,
			verbose: config.verbose,
			overwrite: config.overwrite,
			format: config.format,
			fileHeader: config.fileHeader,
			generateProfiles: config.generateProfiles,
			// TODO: Apply tsConfig to generator when enhanced generator supports it
		});

		// If input is provided, load schemas from file/directory
		if (inputPath) {
			await log.info(
				"Loading TypeSchema from input",
				{ inputPath },
				"loadSchema",
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
					resources: organizedSchemas.resources?.length || 0,
					profiles: organizedSchemas.profiles?.length || 0,
					valueSets: organizedSchemas.valueSets?.length || 0,
					bindings: organizedSchemas.bindings?.length || 0,
				},
				"organizeSchemas",
			);
		}

		await log.info("Starting TypeScript generation", undefined, "generate");

		// Validate generator configuration
		await generator.validate();

		// Generate types
		await generator.generate();

		await log.info(
			"TypeScript generation completed successfully",
			{
				outputDir: config.outputDir,
			},
			"complete",
		);

		console.log(
			`✨ Successfully generated TypeScript types in ${config.outputDir}`,
		);
	} catch (error) {
		const generationError = new GenerationError(
			`Failed to generate TypeScript types`,
			{
				generator: "typescript",
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
			"TypeScript generation failed",
			generationError,
			undefined,
			"generate",
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
async function loadTypeschemaFromFile(
	filePath: string,
): Promise<AnyTypeSchema[]> {
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
async function loadTypeschemaFromDirectory(
	dirPath: string,
): Promise<AnyTypeSchema[]> {
	const files = await readdir(dirPath, { recursive: true });
	const schemas: AnyTypeSchema[] = [];

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
