/**
 * Generate TypeScript Command
 *
 * Generate TypeScript types from TypeSchema files
 */

import type { CommandModule } from "yargs";
import { resolve } from "path";
import { TypeScriptGenerator } from "../../../generators/typescript";
import type { GeneratorConfig, TypeScriptConfig } from "../../../lib/core/config";
import type { CLIArgvWithConfig } from "../index";
import { readFile, readdir, stat } from "fs/promises";
import { join, extname } from "path";

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
	target?: "ES5" | "ES6" | "ES2015" | "ES2017" | "ES2018" | "ES2019" | "ES2020" | "ES2021" | "ES2022";
	module?: "CommonJS" | "ES6" | "ES2015" | "ES2020" | "ES2022" | "ESNext";
	declaration?: boolean;
	"base-types-module"?: string;
	"use-enums"?: boolean;
	"prefer-interfaces"?: boolean;
}

/**
 * Generate TypeScript command
 */
export const generateTypescriptCommand: CommandModule<{}, TypeScriptGenerateArgs> = {
	command: "typescript",
	aliases: ["ts"],
	describe: "Generate TypeScript types from TypeSchema",
	builder: {
		input: {
			alias: "i",
			type: "string",
			description: "Input TypeSchema file or directory (.ndjson, .json, or directory)",
		},
		output: {
			alias: "o",
			type: "string",
			description: "Output directory for generated TypeScript files. Uses config file if not specified.",
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
			choices: ["ES5", "ES6", "ES2015", "ES2017", "ES2018", "ES2019", "ES2020", "ES2021", "ES2022"] as const,
			default: "ES2020" as const,
			description: "TypeScript target version",
		},
		module: {
			type: "string",
			choices: ["CommonJS", "ES6", "ES2015", "ES2020", "ES2022", "ESNext"] as const,
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
			throw new Error("No output directory specified. Either provide --output or configure outputDir in .atomic-codegen.json");
		}

		// Merge CLI args with configuration
		const configGenerator = argv._config?.generator || {};
		const configGlobal = argv._config?.global || {};
		const configLanguageTs = argv._config?.languages?.typescript || {};

		const generatorConfig: GeneratorConfig = {
			target: "typescript",
			outputDir: resolve(outputDir),
			includeComments: argv["include-comments"] ?? configGenerator.includeComments ?? true,
			includeValidation: argv["include-validation"] ?? configGenerator.includeValidation ?? false,
			namespaceStyle: argv["namespace-style"] || configGenerator.namespaceStyle || "nested",
			fileNaming: argv["file-naming"] || configGenerator.fileNaming || "PascalCase",
			format: argv.format ?? configGenerator.format ?? true,
			fileHeader: argv["file-header"] || configGenerator.fileHeader,
			overwrite: argv.overwrite ?? configGenerator.overwrite ?? true,
			verbose: argv.verbose ?? configGlobal.verbose ?? false,
		};

		const typescriptConfig: TypeScriptConfig = {
			strict: argv.strict ?? configLanguageTs.strict ?? true,
			target: argv.target || configLanguageTs.target || "ES2020",
			module: argv.module || configLanguageTs.module || "ES2020",
			declaration: argv.declaration ?? configLanguageTs.declaration ?? true,
			baseTypesModule: argv["base-types-module"] || configLanguageTs.baseTypesModule,
			useEnums: argv["use-enums"] ?? configLanguageTs.useEnums ?? true,
			preferInterfaces: argv["prefer-interfaces"] ?? configLanguageTs.preferInterfaces ?? true,
		};

		await generateTypeScript(generatorConfig, typescriptConfig, argv.input);
	},
};

/**
 * Generate TypeScript types from TypeSchema
 */
export async function generateTypeScript(
	config: GeneratorConfig,
	tsConfig: TypeScriptConfig,
	inputPath?: string
): Promise<void> {
	const log = (message: string) => {
		if (config.verbose) {
			console.error(`[GENERATE] ${message}`);
		}
	};

	try {
		log("Initializing TypeScript generator...");

		// Create generator with merged config
		const generator = new TypeScriptGenerator({
			outputDir: config.outputDir,
			verbose: config.verbose,
			overwrite: config.overwrite,
			format: config.format,
			fileHeader: config.fileHeader,
			// TODO: Apply tsConfig to generator when enhanced generator supports it
		});

		// If input is provided, load schemas from file/directory
		if (inputPath) {
			log(`Loading TypeSchema from: ${inputPath}`);
			const schemas = await loadTypeschemaFromPath(inputPath);
			
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
		}

		log("Generating TypeScript types...");
		
		// Validate generator configuration
		await generator.validate();
		
		// Generate types
		await generator.generate();

		console.log(`✨ Successfully generated TypeScript types in ${config.outputDir}`);

	} catch (error) {
		throw new Error(`Failed to generate TypeScript: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Load TypeSchema from file or directory
 */
async function loadTypeschemaFromPath(inputPath: string): Promise<any[]> {
	const resolvedPath = resolve(inputPath);
	const stats = await stat(resolvedPath);

	if (stats.isFile()) {
		return await loadTypeschemaFromFile(resolvedPath);
	} else if (stats.isDirectory()) {
		return await loadTypeschemaFromDirectory(resolvedPath);
	} else {
		throw new Error(`Invalid input path: ${inputPath}`);
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
		return lines.map(line => JSON.parse(line));
	} else if (ext === ".json") {
		// Parse regular JSON (array or single object)
		const parsed = JSON.parse(content);
		return Array.isArray(parsed) ? parsed : [parsed];
	} else {
		throw new Error(`Unsupported file format: ${ext}. Expected .ndjson or .json`);
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
		
		if (stats.isFile() && (file.endsWith(".json") || file.endsWith(".ndjson"))) {
			const fileSchemas = await loadTypeschemaFromFile(filePath);
			schemas.push(...fileSchemas);
		}
	}

	return schemas;
}

/**
 * Organize schemas by type for the generator
 */
function organizeSchemas(schemas: any[]): {
	primitiveTypes: any[];
	complexTypes: any[];
	resources: any[];
	valueSets: any[];
	bindings: any[];
} {
	const primitiveTypes: any[] = [];
	const complexTypes: any[] = [];
	const resources: any[] = [];
	const valueSets: any[] = [];
	const bindings: any[] = [];

	for (const schema of schemas) {
		const kind = schema.identifier?.kind;
		const name = schema.identifier?.name;
		const url = schema.identifier?.url;
		
		// Skip SearchParameters for now
		if (name === "SearchParameter" || (url && url.includes("/SearchParameter/"))) {
			continue;
		}
		
		switch (kind) {
			case "primitive-type":
				primitiveTypes.push(schema);
				break;
			case "complex-type":
				complexTypes.push(schema);
				break;
			case "resource":
				resources.push(schema);
				break;
			case "value-set":
				valueSets.push(schema);
				break;
			case "binding":
				bindings.push(schema);
				break;
			// Skip other kinds for now
		}
	}

	return { primitiveTypes, complexTypes, resources, valueSets, bindings };
}