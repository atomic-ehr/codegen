/**
 * Generate TypeScript Command
 *
 * Generate TypeScript types from TypeSchema files using the new high-level API
 */

import { APIBuilder } from "../../../api";
import type { Config, TypeScriptGeneratorConfig } from "../../../config";
import { ErrorFactory, GenerationError } from "../../../core/utils/errors";
import type { CLIArgv } from "../index";

interface TypeScriptGenerateArgs extends CLIArgv {
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
 * Generate TypeScript types from TypeSchema using the high-level API
 */
export async function generateTypeScript(
	config: Config,
	inputPath?: string,
): Promise<void> {
	try {
		if (config.verbose) {
			console.log("🚀 Generating TypeScript types using high-level API...");
		}

		// Create API builder with config options
		const builder = new APIBuilder({
			outputDir: config.outputDir,
			verbose: config.verbose,
			overwrite: config.overwrite,
			validate: config.validate,
			cache: config.cache,
		});

		// Load TypeSchema from input path if provided
		if (inputPath) {
			if (config.verbose) {
				console.log(`📁 Loading TypeSchema from: ${inputPath}`);
			}
			builder.fromFiles(inputPath);
		}

		// Configure TypeScript generation with options from config
		builder.typescript(config.typescript || {});
		if (config.restClient) {
			builder.restClient(config.restClient);
		}

		// Add progress callback if verbose
		if (config.verbose) {
			builder.onProgress((phase, current, total, message) => {
				const progress = Math.round((current / total) * 100);
				console.log(`[${phase}] ${progress}% - ${message || "Processing..."}`);
			});
		}

		// Execute the generation
		const result = await builder.generate();

		if (result.success) {
			console.log(
				`✨ Successfully generated ${result.filesGenerated.length} TypeScript files in ${result.duration.toFixed(2)}ms`,
			);
			if (result.warnings.length > 0) {
				console.warn(`⚠️  ${result.warnings.length} warnings:`);
				result.warnings.forEach((warning) => console.warn(`  ${warning}`));
			}
		} else {
			throw new GenerationError(
				`TypeScript generation failed: ${result.errors.join(", ")}`,
				{
					generator: "typescript",
					outputPath: config.outputDir || "./generated",
					context: { inputPath, config },
					suggestions: [
						"Check that the input TypeSchema files are valid",
						"Ensure the output directory is writable",
						"Try running with --verbose for more detailed information",
					],
					recoverable: true,
				},
			);
		}
	} catch (error) {
		if (error instanceof GenerationError) {
			throw error;
		}

		throw new GenerationError(
			`Failed to generate TypeScript types: ${error instanceof Error ? error.message : String(error)}`,
			{
				generator: "typescript",
				outputPath: config.outputDir || "./generated",
				context: { inputPath, config },
				suggestions: [
					"Check that all required dependencies are installed",
					"Verify the configuration is correct",
					"Try running with --debug for more detailed error information",
				],
				recoverable: true,
				cause: error instanceof Error ? error : undefined,
			},
		);
	}
}
