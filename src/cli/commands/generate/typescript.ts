/**
 * Generate TypeScript Command
 *
 * Generate TypeScript types from TypeSchema files using the new high-level API
 */

import { APIBuilder } from "../../../api/index.js";
import type { Config } from "../../../config.js";
import { createLogger } from "../../utils/log.js";
import type { CLIArgv } from "../index.js";

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
	const log = createLogger({
		verbose: config.verbose,
		prefix: "TypeScript",
	});

	log.step("Generating TypeScript types using high-level API");

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
		log.info(`Loading TypeSchema from: ${inputPath}`);
		builder.fromFiles(inputPath);
	}

	// Configure TypeScript generation with options from config
	builder.typescript(config.typescript || {});

	// Add progress callback if verbose
	if (config.verbose) {
		builder.onProgress((phase, current, total, message) => {
			const progress = Math.round((current / total) * 100);
			log.progress(`[${phase}] ${progress}% - ${message || "Processing..."}`);
		});
	}

	// Execute the generation
	const result = await builder.generate();

	if (result.success) {
		log.success(
			`Generated ${result.filesGenerated.length} TypeScript files in ${result.duration.toFixed(2)}ms`,
		);
		if (result.warnings.length > 0) {
			log.warn(`${result.warnings.length} warnings found`);
			result.warnings.forEach((warning) => log.dim(`  ${warning}`));
		}
	} else {
		log.error(`TypeScript generation failed: ${result.errors.join(", ")}`);
		throw new Error(
			`TypeScript generation failed: ${result.errors.join(", ")}`,
		);
	}
}
