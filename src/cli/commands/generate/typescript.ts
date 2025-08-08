/**
 * Generate TypeScript Command
 *
 * Generate TypeScript types from TypeSchema files using the new high-level API
 */

import { APIBuilder } from "../../../api";
import type { Config } from "../../../config";
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
		throw new Error(
			`TypeScript generation failed: ${result.errors.join(", ")}`,
		);
	}
}
