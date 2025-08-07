/**
 * Validate Command
 *
 * Top-level validation command that runs all validation types
 */

import { resolve } from "path";
import type { CommandModule } from "yargs";
import { validateGeneratedCode } from "../../core/validation/generated-code";
import type { CLIArgv } from "./index";
import { validateTypeSchema } from "./typeschema/validate";

interface ValidateCommandArgs extends CLIArgv {
	input?: string[];
	output?: string;
	"typeschema-only"?: boolean;
	"generated-code-only"?: boolean;
	"skip-typeschema"?: boolean;
	"skip-generated-code"?: boolean;
	verbose?: boolean;
	strict?: boolean;
	"output-format"?: "text" | "json";
}

interface ValidationSummary {
	valid: boolean;
	results: {
		typeschema?: any;
		generatedCode?: any;
	};
	errors: ValidationError[];
	warnings: ValidationWarning[];
	stats: ValidationStats;
}

interface ValidationError {
	type: "error";
	source: "typeschema" | "generated-code";
	message: string;
	severity: "critical" | "major" | "minor";
}

interface ValidationWarning {
	type: "warning";
	source: "typeschema" | "generated-code";
	message: string;
}

interface ValidationStats {
	totalValidations: number;
	passedValidations: number;
	failedValidations: number;
	totalErrors: number;
	totalWarnings: number;
}

/**
 * Main validate command
 */
export const validateCommand: CommandModule<{}, ValidateCommandArgs> = {
	command: "validate [input..]",
	describe: "Run comprehensive validation (config, typeschema, generated code)",
	builder: {
		input: {
			type: "string",
			array: true,
			description: "TypeSchema files or directories to validate",
		},
		output: {
			alias: "o",
			type: "string",
			description: "Generated code output directory to validate",
		},
		"typeschema-only": {
			type: "boolean",
			default: false,
			description: "Only validate TypeSchema files",
		},
		"generated-code-only": {
			type: "boolean",
			default: false,
			description: "Only validate generated code",
		},
		"skip-typeschema": {
			type: "boolean",
			default: false,
			description: "Skip TypeSchema validation",
		},
		"skip-generated-code": {
			type: "boolean",
			default: false,
			description: "Skip generated code validation",
		},
		verbose: {
			alias: "v",
			type: "boolean",
			default: false,
			description: "Show detailed validation information",
		},
		strict: {
			type: "boolean",
			default: false,
			description: "Enable strict validation (fail on warnings)",
		},
		"output-format": {
			alias: "f",
			type: "string",
			choices: ["text", "json"] as const,
			default: "text" as const,
			description: "Output format for validation results",
		},
	},
	handler: async (argv) => {
		const result = await runComprehensiveValidation({
			inputPaths: argv.input || [],
			outputDir: argv.output,
			typeschemaOnly: argv["typeschema-only"] || false,
			generatedCodeOnly: argv["generated-code-only"] || false,
			skipTypeschema: argv["skip-typeschema"] || false,
			skipGeneratedCode: argv["skip-generated-code"] || false,
			verbose: argv.verbose || false,
			strict: argv.strict || false,
			outputFormat: argv["output-format"] || "text",
			workingDir: process.cwd(),
		});

		if (argv["output-format"] === "json") {
			console.log(JSON.stringify(result, null, 2));
		} else {
			printValidationSummary(result, argv.verbose || false);
		}

		// Exit with error code if validation failed
		if (!result.valid) {
			process.exit(1);
		}
	},
};

interface ComprehensiveValidationOptions {
	inputPaths: string[];
	outputDir?: string;
	typeschemaOnly: boolean;
	generatedCodeOnly: boolean;
	skipTypeschema: boolean;
	skipGeneratedCode: boolean;
	verbose: boolean;
	strict: boolean;
	outputFormat: "text" | "json";
	workingDir: string;
}

/**
 * Run comprehensive validation
 */
export async function runComprehensiveValidation(
	options: ComprehensiveValidationOptions,
): Promise<ValidationSummary> {
	const summary: ValidationSummary = {
		valid: true,
		results: {},
		errors: [],
		warnings: [],
		stats: {
			totalValidations: 0,
			passedValidations: 0,
			failedValidations: 0,
			totalErrors: 0,
			totalWarnings: 0,
		},
	};

	try {
		// Determine which validations to run
		const runTypeschema =
			!options.skipTypeschema &&
			!options.generatedCodeOnly &&
			options.inputPaths.length > 0;
		const runGeneratedCode =
			!options.skipGeneratedCode &&
			!options.typeschemaOnly &&
			options.outputDir;

		if (options.verbose) {
			console.error(
				`[VALIDATE] Running validations: typeschema=${runTypeschema}, generated-code=${runGeneratedCode}`,
			);
		}

		// Run TypeSchema validation
		if (runTypeschema) {
			summary.stats.totalValidations++;
			try {
				if (options.verbose) {
					console.error("[VALIDATE] Validating TypeSchema files...");
				}

				const typeschemaResult = await validateTypeSchema({
					inputPaths: options.inputPaths,
					verbose: options.verbose,
					strict: options.strict,
					checkDependencies: true,
					outputFormat: "json",
				});

				summary.results.typeschema = typeschemaResult;

				if (typeschemaResult.valid) {
					summary.stats.passedValidations++;
				} else {
					summary.stats.failedValidations++;
					summary.valid = false;
				}

				// Convert typeschema errors to summary format
				for (const error of typeschemaResult.errors) {
					summary.errors.push({
						type: "error",
						source: "typeschema",
						message: error.message,
						severity: error.severity || "major",
					});
				}

				for (const warning of typeschemaResult.warnings) {
					summary.warnings.push({
						type: "warning",
						source: "typeschema",
						message: warning.message,
					});
				}
			} catch (error) {
				summary.stats.failedValidations++;
				summary.valid = false;
				summary.errors.push({
					type: "error",
					source: "typeschema",
					message: `TypeSchema validation failed: ${error instanceof Error ? error.message : String(error)}`,
					severity: "critical",
				});
			}
		}

		// Run generated code validation
		if (runGeneratedCode) {
			summary.stats.totalValidations++;
			try {
				if (options.verbose) {
					console.error("[VALIDATE] Validating generated code...");
				}

				const generatedCodeResult = await validateGeneratedCode({
					outputDir: resolve(options.outputDir!),
					verbose: options.verbose,
					strict: options.strict,
				});

				summary.results.generatedCode = generatedCodeResult;

				if (generatedCodeResult.valid) {
					summary.stats.passedValidations++;
				} else {
					summary.stats.failedValidations++;
					summary.valid = false;
				}

				// Convert generated code errors to summary format
				for (const error of generatedCodeResult.errors) {
					summary.errors.push({
						type: "error",
						source: "generated-code",
						message: error.message,
						severity: error.severity || "major",
					});
				}

				for (const warning of generatedCodeResult.warnings) {
					summary.warnings.push({
						type: "warning",
						source: "generated-code",
						message: warning.message,
					});
				}
			} catch (error) {
				summary.stats.failedValidations++;
				summary.valid = false;
				summary.errors.push({
					type: "error",
					source: "generated-code",
					message: `Generated code validation failed: ${error instanceof Error ? error.message : String(error)}`,
					severity: "critical",
				});
			}
		}

		// Calculate final stats
		summary.stats.totalErrors = summary.errors.length;
		summary.stats.totalWarnings = summary.warnings.length;

		// If strict mode, treat warnings as errors
		if (options.strict && summary.warnings.length > 0) {
			summary.valid = false;
		}

		// If no validations were run, that's an error
		if (summary.stats.totalValidations === 0) {
			summary.valid = false;
			summary.errors.push({
				type: "error",
				source: "typeschema",
				message:
					"No validations were run. Please specify input files or output directory.",
				severity: "critical",
			});
		}
	} catch (error) {
		summary.valid = false;
		summary.errors.push({
			type: "error",
			source: "typeschema",
			message: `Comprehensive validation failed: ${error instanceof Error ? error.message : String(error)}`,
			severity: "critical",
		});
	}

	return summary;
}

/**
 * Print validation summary to console
 */
function printValidationSummary(
	summary: ValidationSummary,
	verbose: boolean,
): void {
	console.log("\n🔍 Comprehensive Validation Summary:");
	console.log(`   Total validations: ${summary.stats.totalValidations}`);
	console.log(`   Passed: ${summary.stats.passedValidations}`);
	console.log(`   Failed: ${summary.stats.failedValidations}`);
	console.log(`   Errors: ${summary.stats.totalErrors}`);
	console.log(`   Warnings: ${summary.stats.totalWarnings}`);

	// Print validation results
	if (verbose) {
		console.log("\n📋 Validation Results:");
		if (summary.results.typeschema) {
			console.log(
				`   TypeSchema: ${summary.results.typeschema.valid ? "✅ Valid" : "❌ Invalid"}`,
			);
		}
		if (summary.results.generatedCode) {
			console.log(
				`   Generated Code: ${summary.results.generatedCode.valid ? "✅ Valid" : "❌ Invalid"}`,
			);
		}
	}

	// Print errors by source
	if (summary.errors.length > 0) {
		console.log("\n❌ Errors:");
		const errorsBySource = summary.errors.reduce(
			(acc, error) => {
				if (!acc[error.source]) acc[error.source] = [];
				acc[error.source].push(error);
				return acc;
			},
			{} as Record<string, ValidationError[]>,
		);

		for (const [source, errors] of Object.entries(errorsBySource)) {
			console.log(`   ${source.toUpperCase()}:`);
			for (const error of errors) {
				console.log(`     ${error.severity.toUpperCase()}: ${error.message}`);
			}
		}
	}

	// Print warnings by source
	if (summary.warnings.length > 0) {
		console.log("\n⚠️  Warnings:");
		const warningsBySource = summary.warnings.reduce(
			(acc, warning) => {
				if (!acc[warning.source]) acc[warning.source] = [];
				acc[warning.source].push(warning);
				return acc;
			},
			{} as Record<string, ValidationWarning[]>,
		);

		for (const [source, warnings] of Object.entries(warningsBySource)) {
			console.log(`   ${source.toUpperCase()}:`);
			for (const warning of warnings) {
				console.log(`     ${warning.message}`);
			}
		}
	}

	// Print final result
	if (summary.valid) {
		console.log("\n✅ All validations passed!");
	} else {
		console.log("\n❌ Validation failed!");
		console.log("   Please fix the errors above and try again.");
	}
}
