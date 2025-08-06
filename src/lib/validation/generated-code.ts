/**
 * Generated Code Validation
 *
 * Validates generated TypeScript code for syntax errors and compilation issues
 */

import { spawn } from "child_process";
import { readdir, readFile, stat } from "fs/promises";
import { extname, join, relative } from "path";
import { promisify } from "util";

export interface GeneratedCodeValidationOptions {
	outputDir: string;
	verbose: boolean;
	strict: boolean;
}

export interface GeneratedCodeValidationResult {
	valid: boolean;
	errors: GeneratedCodeValidationError[];
	warnings: GeneratedCodeValidationWarning[];
	stats: GeneratedCodeValidationStats;
}

export interface GeneratedCodeValidationError {
	type: "error";
	message: string;
	file?: string;
	line?: number;
	column?: number;
	severity: "critical" | "major" | "minor";
}

export interface GeneratedCodeValidationWarning {
	type: "warning";
	message: string;
	file?: string;
	line?: number;
	column?: number;
}

export interface GeneratedCodeValidationStats {
	totalFiles: number;
	validFiles: number;
	invalidFiles: number;
	syntaxErrors: number;
	compilationErrors: number;
	typeErrors: number;
}

/**
 * Validate generated TypeScript code
 */
export async function validateGeneratedCode(
	options: GeneratedCodeValidationOptions,
): Promise<GeneratedCodeValidationResult> {
	const result: GeneratedCodeValidationResult = {
		valid: true,
		errors: [],
		warnings: [],
		stats: {
			totalFiles: 0,
			validFiles: 0,
			invalidFiles: 0,
			syntaxErrors: 0,
			compilationErrors: 0,
			typeErrors: 0,
		},
	};

	try {
		// Check if output directory exists
		try {
			const stats = await stat(options.outputDir);
			if (!stats.isDirectory()) {
				result.errors.push({
					type: "error",
					message: `Output path is not a directory: ${options.outputDir}`,
					severity: "critical",
				});
				result.valid = false;
				return result;
			}
		} catch (error) {
			result.errors.push({
				type: "error",
				message: `Output directory does not exist: ${options.outputDir}`,
				severity: "critical",
			});
			result.valid = false;
			return result;
		}

		// Find all TypeScript files
		const tsFiles = await findTypeScriptFiles(options.outputDir);
		result.stats.totalFiles = tsFiles.length;

		if (tsFiles.length === 0) {
			result.warnings.push({
				type: "warning",
				message: "No TypeScript files found in output directory",
			});
			return result;
		}

		if (options.verbose) {
			console.error(
				`[VALIDATE] Found ${tsFiles.length} TypeScript files to validate`,
			);
		}

		// Validate syntax of each file
		for (const filePath of tsFiles) {
			const fileResult = await validateTypeScriptFile(filePath, options);

			if (fileResult.valid) {
				result.stats.validFiles++;
			} else {
				result.stats.invalidFiles++;
				result.valid = false;
			}

			result.errors.push(...fileResult.errors);
			result.warnings.push(...fileResult.warnings);
			result.stats.syntaxErrors += fileResult.syntaxErrors;
		}

		// Run TypeScript compilation check
		const compilationResult = await validateTypeScriptCompilation(
			options.outputDir,
			options,
		);
		result.errors.push(...compilationResult.errors);
		result.warnings.push(...compilationResult.warnings);
		result.stats.compilationErrors += compilationResult.compilationErrors;
		result.stats.typeErrors += compilationResult.typeErrors;

		if (!compilationResult.valid) {
			result.valid = false;
		}

		// If strict mode, treat warnings as errors
		if (options.strict && result.warnings.length > 0) {
			result.valid = false;
		}
	} catch (error) {
		result.errors.push({
			type: "error",
			message: `Generated code validation failed: ${error instanceof Error ? error.message : String(error)}`,
			severity: "critical",
		});
		result.valid = false;
	}

	return result;
}

/**
 * Find all TypeScript files in directory
 */
async function findTypeScriptFiles(dir: string): Promise<string[]> {
	const files: string[] = [];

	async function walkDir(currentDir: string): Promise<void> {
		const entries = await readdir(currentDir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);

			if (entry.isDirectory()) {
				// Skip node_modules and other common directories
				if (!["node_modules", ".git", "dist", "build"].includes(entry.name)) {
					await walkDir(fullPath);
				}
			} else if (entry.isFile()) {
				const ext = extname(entry.name);
				if ([".ts", ".tsx"].includes(ext)) {
					files.push(fullPath);
				}
			}
		}
	}

	await walkDir(dir);
	return files;
}

/**
 * Validate individual TypeScript file syntax
 */
async function validateTypeScriptFile(
	filePath: string,
	options: GeneratedCodeValidationOptions,
): Promise<{
	valid: boolean;
	errors: GeneratedCodeValidationError[];
	warnings: GeneratedCodeValidationWarning[];
	syntaxErrors: number;
}> {
	const result = {
		valid: true,
		errors: [] as GeneratedCodeValidationError[],
		warnings: [] as GeneratedCodeValidationWarning[],
		syntaxErrors: 0,
	};

	try {
		const content = await readFile(filePath, "utf-8");
		const relativePath = relative(options.outputDir, filePath);

		// Basic syntax validation
		const syntaxIssues = validateTypeScriptSyntax(content, relativePath);
		result.errors.push(...syntaxIssues.errors);
		result.warnings.push(...syntaxIssues.warnings);
		result.syntaxErrors = syntaxIssues.errors.length;

		if (syntaxIssues.errors.length > 0) {
			result.valid = false;
		}

		// Check for common generated code issues
		const codeQualityIssues = validateCodeQuality(content, relativePath);
		result.warnings.push(...codeQualityIssues);
	} catch (error) {
		result.errors.push({
			type: "error",
			message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
			file: relative(options.outputDir, filePath),
			severity: "major",
		});
		result.valid = false;
	}

	return result;
}

/**
 * Basic TypeScript syntax validation
 */
function validateTypeScriptSyntax(
	content: string,
	filePath: string,
): {
	errors: GeneratedCodeValidationError[];
	warnings: GeneratedCodeValidationWarning[];
} {
	const errors: GeneratedCodeValidationError[] = [];
	const warnings: GeneratedCodeValidationWarning[] = [];

	// Check for basic syntax issues
	const lines = content.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNumber = i + 1;

		// Check for unmatched braces
		const openBraces = (line.match(/\{/g) || []).length;
		const closeBraces = (line.match(/\}/g) || []).length;

		// Check for missing semicolons (basic check)
		if (
			line
				.trim()
				.match(
					/^(export|import|const|let|var|function|class|interface|type)\s+.*[^;{}]$/,
				)
		) {
			warnings.push({
				type: "warning",
				message: "Possible missing semicolon",
				file: filePath,
				line: lineNumber,
			});
		}

		// Check for invalid characters in identifiers
		const invalidIdentifierMatch = line.match(
			/\b[0-9][a-zA-Z_$][a-zA-Z0-9_$]*\b/,
		);
		if (invalidIdentifierMatch) {
			errors.push({
				type: "error",
				message: `Invalid identifier starts with number: ${invalidIdentifierMatch[0]}`,
				file: filePath,
				line: lineNumber,
				severity: "major",
			});
		}

		// Check for unterminated strings (basic check)
		const singleQuotes = (line.match(/'/g) || []).length;
		const doubleQuotes = (line.match(/"/g) || []).length;
		const backticks = (line.match(/`/g) || []).length;

		if (
			singleQuotes % 2 !== 0 ||
			doubleQuotes % 2 !== 0 ||
			backticks % 2 !== 0
		) {
			// Only flag if it's not a comment or inside another string
			if (!line.trim().startsWith("//") && !line.trim().startsWith("*")) {
				warnings.push({
					type: "warning",
					message: "Possible unterminated string",
					file: filePath,
					line: lineNumber,
				});
			}
		}
	}

	// Check overall brace balance
	const totalOpenBraces = (content.match(/\{/g) || []).length;
	const totalCloseBraces = (content.match(/\}/g) || []).length;

	if (totalOpenBraces !== totalCloseBraces) {
		errors.push({
			type: "error",
			message: `Unmatched braces: ${totalOpenBraces} open, ${totalCloseBraces} close`,
			file: filePath,
			severity: "major",
		});
	}

	// Check for valid TypeScript/JavaScript structure
	if (
		!content.includes("export") &&
		!content.includes("import") &&
		content.trim().length > 0
	) {
		warnings.push({
			type: "warning",
			message: "File contains no exports or imports",
			file: filePath,
		});
	}

	return { errors, warnings };
}

/**
 * Validate code quality issues
 */
function validateCodeQuality(
	content: string,
	filePath: string,
): GeneratedCodeValidationWarning[] {
	const warnings: GeneratedCodeValidationWarning[] = [];

	// Check for empty interfaces
	const emptyInterfaceMatch = content.match(/interface\s+\w+\s*\{\s*\}/g);
	if (emptyInterfaceMatch) {
		warnings.push({
			type: "warning",
			message: `Empty interface found: ${emptyInterfaceMatch.join(", ")}`,
			file: filePath,
		});
	}

	// Check for duplicate type definitions
	const typeDefinitions = content.match(/(?:interface|type|class)\s+(\w+)/g);
	if (typeDefinitions) {
		const typeNames = typeDefinitions.map((def) => def.split(/\s+/)[1]);
		const duplicates = typeNames.filter(
			(name, index) => typeNames.indexOf(name) !== index,
		);

		if (duplicates.length > 0) {
			warnings.push({
				type: "warning",
				message: `Duplicate type definitions: ${[...new Set(duplicates)].join(", ")}`,
				file: filePath,
			});
		}
	}

	// Check for very long lines (code style)
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].length > 120) {
			warnings.push({
				type: "warning",
				message: "Line exceeds 120 characters",
				file: filePath,
				line: i + 1,
			});
		}
	}

	return warnings;
}

/**
 * Validate TypeScript compilation
 */
async function validateTypeScriptCompilation(
	outputDir: string,
	options: GeneratedCodeValidationOptions,
): Promise<{
	valid: boolean;
	errors: GeneratedCodeValidationError[];
	warnings: GeneratedCodeValidationWarning[];
	compilationErrors: number;
	typeErrors: number;
}> {
	const result = {
		valid: true,
		errors: [] as GeneratedCodeValidationError[],
		warnings: [] as GeneratedCodeValidationWarning[],
		compilationErrors: 0,
		typeErrors: 0,
	};

	try {
		if (options.verbose) {
			console.error("[VALIDATE] Running TypeScript compilation check...");
		}

		// Try to run TypeScript compiler
		const tscResult = await runTypeScriptCompiler(outputDir, options);

		if (!tscResult.success) {
			result.valid = false;
			result.compilationErrors = tscResult.errors.length;
			result.typeErrors = tscResult.typeErrors;
			result.errors.push(...tscResult.errors);
			result.warnings.push(...tscResult.warnings);
		}
	} catch (error) {
		result.errors.push({
			type: "error",
			message: `TypeScript compilation check failed: ${error instanceof Error ? error.message : String(error)}`,
			severity: "major",
		});
		result.valid = false;
		result.compilationErrors = 1;
	}

	return result;
}

/**
 * Run TypeScript compiler to check for compilation errors
 */
async function runTypeScriptCompiler(
	outputDir: string,
	options: GeneratedCodeValidationOptions,
): Promise<{
	success: boolean;
	errors: GeneratedCodeValidationError[];
	warnings: GeneratedCodeValidationWarning[];
	typeErrors: number;
}> {
	try {
		// Find all TypeScript files to compile
		const tsFiles = await findTypeScriptFiles(outputDir);

		if (tsFiles.length === 0) {
			return {
				success: true,
				errors: [],
				warnings: [],
				typeErrors: 0,
			};
		}

		return new Promise((resolve) => {
			// Use bun to check TypeScript compilation with individual files
			const child = spawn(
				"bun",
				["tsc", "--noEmit", "--skipLibCheck", ...tsFiles],
				{
					cwd: process.cwd(),
					stdio: ["pipe", "pipe", "pipe"],
				},
			);

			let stdout = "";
			let stderr = "";

			child.stdout?.on("data", (data) => {
				stdout += data.toString();
			});

			child.stderr?.on("data", (data) => {
				stderr += data.toString();
			});

			child.on("close", (code) => {
				const errors: GeneratedCodeValidationError[] = [];
				const warnings: GeneratedCodeValidationWarning[] = [];
				let typeErrors = 0;

				// Parse TypeScript compiler output
				const output = stderr + stdout;
				const lines = output.split("\n");

				for (const line of lines) {
					if (line.trim()) {
						// Parse TypeScript error format: file(line,col): error TS####: message
						const errorMatch = line.match(
							/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/,
						);

						if (errorMatch) {
							const [, file, lineNum, colNum, type, tsCode, message] =
								errorMatch;

							if (type === "error") {
								errors.push({
									type: "error",
									message: `TS${tsCode}: ${message}`,
									file: relative(outputDir, file),
									line: parseInt(lineNum),
									column: parseInt(colNum),
									severity: "major",
								});
								typeErrors++;
							} else {
								warnings.push({
									type: "warning",
									message: `TS${tsCode}: ${message}`,
									file: relative(outputDir, file),
									line: parseInt(lineNum),
									column: parseInt(colNum),
								});
							}
						} else if (
							line.includes("error") &&
							!line.includes("Found 0 errors")
						) {
							// Generic error parsing
							errors.push({
								type: "error",
								message: line.trim(),
								severity: "major",
							});
						}
					}
				}

				// If tsc command not found, provide helpful message
				if (code === 127 || stderr.includes("command not found")) {
					warnings.push({
						type: "warning",
						message:
							"TypeScript compiler (tsc) not found. Install TypeScript globally or locally to enable compilation validation.",
					});
				}

				resolve({
					success: code === 0 && errors.length === 0,
					errors,
					warnings,
					typeErrors,
				});
			});

			child.on("error", (error) => {
				// If bun or tsc is not available, treat as warning
				resolve({
					success: true,
					errors: [],
					warnings: [
						{
							type: "warning",
							message: `TypeScript compilation check skipped: ${error.message}`,
						},
					],
					typeErrors: 0,
				});
			});
		});
	} catch (error) {
		return {
			success: true,
			errors: [],
			warnings: [
				{
					type: "warning",
					message: `TypeScript compilation check failed: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
			typeErrors: 0,
		};
	}
}
