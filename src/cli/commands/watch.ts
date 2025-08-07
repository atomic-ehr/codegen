/**
 * Watch Command
 *
 * Watch TypeSchema files and regenerate code on changes
 */

import { watch as fsWatch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import chalk from "chalk";
import type { CommandModule } from "yargs";
import { APIBuilder } from "../../api";
import { ValidationError } from "../../core/utils/errors";
import type { ILogger } from "../../core/utils/logger";
import type { AnyTypeSchema } from "../../lib/typeschema";
import type { CLIArgvWithConfig } from "./index";

/**
 * Arguments for watch command
 */
interface WatchArgs extends CLIArgvWithConfig {
	input: string;
	output?: string;
	generator: string;
	debounce?: number;
	clear?: boolean;
	notify?: boolean;
}

/**
 * File watcher state
 */
class WatchState {
	private changeTimer: Timer | null = null;
	private filesChanged = new Set<string>();
	private isGenerating = false;

	constructor(
		private logger: ILogger,
		private debounceMs: number = 500,
	) {}

	/**
	 * Add a changed file and trigger regeneration after debounce
	 */
	addChange(filepath: string, callback: () => Promise<void>): void {
		this.filesChanged.add(filepath);

		// Clear existing timer
		if (this.changeTimer) {
			clearTimeout(this.changeTimer);
		}

		// Set new timer for debounced execution
		this.changeTimer = setTimeout(async () => {
			if (this.isGenerating) {
				await this.logger.debug("Skipping regeneration - already in progress");
				return;
			}

			this.isGenerating = true;
			const _files = Array.from(this.filesChanged);
			this.filesChanged.clear();

			try {
				await callback();
			} finally {
				this.isGenerating = false;
			}
		}, this.debounceMs);
	}

	/**
	 * Stop watching
	 */
	stop(): void {
		if (this.changeTimer) {
			clearTimeout(this.changeTimer);
			this.changeTimer = null;
		}
	}
}

/**
 * Load TypeSchema files from input path
 */
async function loadSchemas(
	inputPath: string,
	logger: ILogger,
): Promise<AnyTypeSchema[]> {
	const resolvedPath = resolve(inputPath);
	const stats = await stat(resolvedPath);
	const schemas: AnyTypeSchema[] = [];

	if (stats.isDirectory()) {
		const files = await readdir(resolvedPath);
		const ndjsonFiles = files.filter((f) => extname(f) === ".ndjson");

		for (const file of ndjsonFiles) {
			const filePath = join(resolvedPath, file);
			try {
				const { readFile } = await import("node:fs/promises");
				const content = await readFile(filePath, "utf-8");
				const lines = content.trim().split("\n").filter(Boolean);

				for (const line of lines) {
					try {
						const schema = JSON.parse(line) as AnyTypeSchema;
						schemas.push(schema);
					} catch (parseError) {
						await logger.warn(`Failed to parse line in ${file}`, {
							error: parseError,
						});
					}
				}
			} catch (error) {
				await logger.error(`Failed to read ${file}`, { error });
			}
		}
	} else {
		// Single file
		const { readFile } = await import("node:fs/promises");
		const content = await readFile(resolvedPath, "utf-8");

		if (extname(resolvedPath) === ".ndjson") {
			const lines = content.trim().split("\n").filter(Boolean);
			for (const line of lines) {
				try {
					const schema = JSON.parse(line) as AnyTypeSchema;
					schemas.push(schema);
				} catch (parseError) {
					await logger.warn(`Failed to parse line`, { error: parseError });
				}
			}
		} else {
			// Try as single JSON
			try {
				const schema = JSON.parse(content) as AnyTypeSchema;
				schemas.push(schema);
			} catch (_error) {
				throw new ValidationError(`Invalid TypeSchema file: ${resolvedPath}`);
			}
		}
	}

	return schemas;
}

/**
 * Generate code using the specified generator with the high-level API
 */
async function generateCode(
	schemas: AnyTypeSchema[],
	generatorId: string,
	outputDir: string,
	logger: ILogger,
): Promise<void> {
	// Create API builder with options
	const builder = new APIBuilder({
		outputDir: resolve(outputDir),
		verbose: logger.level === "debug",
		overwrite: true,
		validate: false, // Skip validation for watch mode performance
		cache: true,
	});

	// Load schemas into the builder
	builder.fromSchemas(schemas);

	// Configure the appropriate generator
	switch (generatorId.toLowerCase()) {
		case "typescript":
		case "ts":
			builder.typescript({
				outputDir: resolve(outputDir),
				moduleFormat: "esm",
				generateIndex: true,
				includeDocuments: true,
				namingConvention: "PascalCase",
			});
			break;
		case "rest-client":
		case "client":
			builder.restClient({
				outputDir: resolve(outputDir),
				language: "typescript",
				httpClient: "fetch",
				generateTypes: true,
				includeValidation: false,
			});
			break;
		default:
			throw new ValidationError(`Unsupported generator: ${generatorId}`, {
				suggestions: [
					`Supported generators: typescript, rest-client`,
					`Check that the generator ID is correct`,
				],
			});
	}

	// Add progress callback for debug logging
	if (logger.level === "debug") {
		builder.onProgress((phase, current, total, message) => {
			const progress = Math.round((current / total) * 100);
			logger.debug(`[${phase}] ${progress}% - ${message || "Processing..."}`);
		});
	}

	// Generate code
	await logger.info(`Generating ${generatorId} code...`);
	const startTime = Date.now();

	const result = await builder.generate();

	if (result.success) {
		const duration = Date.now() - startTime;
		await logger.info(
			`✅ Generated ${result.filesGenerated.length} files in ${duration}ms`,
			{
				files: result.filesGenerated.length,
				duration,
			},
		);

		// Log files generated
		if (logger.level === "debug") {
			for (const file of result.filesGenerated) {
				await logger.debug(`  📄 ${relative(process.cwd(), file)}`);
			}
		}
	} else {
		throw new ValidationError(`Generation failed: ${result.errors.join(", ")}`);
	}
}

/**
 * Watch command implementation
 */
export const watchCommand: CommandModule<{}, WatchArgs> = {
	command: "watch",
	describe: "Watch TypeSchema files and regenerate code on changes",
	builder: (yargs) => {
		return yargs
			.option("input", {
				alias: "i",
				type: "string",
				describe: "Input TypeSchema file or directory to watch",
				demandOption: true,
			})
			.option("output", {
				alias: "o",
				type: "string",
				describe: "Output directory for generated code",
				demandOption: true,
			})
			.option("generator", {
				alias: "g",
				type: "string",
				describe: "Generator to use (e.g., typescript, python)",
				demandOption: true,
			})
			.option("debounce", {
				type: "number",
				describe: "Debounce time in milliseconds",
				default: 500,
			})
			.option("clear", {
				type: "boolean",
				describe: "Clear console on each regeneration",
				default: true,
			})
			.option("notify", {
				type: "boolean",
				describe: "Show desktop notifications on completion",
				default: false,
			})
			.example(
				"$0 watch -i schemas/ -o generated/ -g typescript",
				"Watch schema directory and regenerate TypeScript",
			)
			.example(
				"$0 watch -i types.ndjson -o ./src/types -g typescript --debounce 1000",
				"Watch single file with 1 second debounce",
			);
	},
	handler: async (argv) => {
		const logger = argv._logger!;
		const inputPath = resolve(argv.input);
		const outputPath = resolve(argv.output || "./generated");

		// Initial generation
		console.log(chalk.blue("🔄 Starting watch mode..."));
		console.log(chalk.gray(`  Watching: ${inputPath}`));
		console.log(chalk.gray(`  Output: ${outputPath}`));
		console.log(chalk.gray(`  Generator: ${argv.generator}`));
		console.log("");

		try {
			// Load and generate initially
			const schemas = await loadSchemas(inputPath, logger);
			await generateCode(schemas, argv.generator, outputPath, logger);
			console.log(chalk.green("✅ Initial generation complete"));
		} catch (error) {
			console.error(chalk.red("❌ Initial generation failed:"), error);
		}

		// Setup file watcher
		const watchState = new WatchState(logger, argv.debounce);

		// Watch function
		const watchPath = async (path: string) => {
			fsWatch(path, { recursive: true }, async (eventType, filename) => {
				if (!filename) return;

				// Filter for TypeSchema files
				const ext = extname(filename);
				if (ext !== ".ndjson" && ext !== ".json") return;

				const fullPath = join(path, filename);
				const relativePath = relative(process.cwd(), fullPath);

				console.log(chalk.yellow(`📝 File ${eventType}: ${relativePath}`));

				// Trigger regeneration with debounce
				watchState.addChange(fullPath, async () => {
					if (argv.clear) {
						console.clear();
					}

					console.log(chalk.blue("🔄 Regenerating..."));

					try {
						const schemas = await loadSchemas(inputPath, logger);
						await generateCode(schemas, argv.generator, outputPath, logger);

						if (argv.notify) {
							// In a real implementation, we'd use node-notifier or similar
							console.log(chalk.green("✅ Generation complete"));
						}
					} catch (error) {
						console.error(chalk.red("❌ Generation failed:"), error);
						if (error instanceof Error) {
							console.error(chalk.gray(error.stack));
						}
					}
				});
			});
		};

		// Start watching
		await watchPath(inputPath);

		console.log(
			chalk.blue("\n👀 Watching for changes... (Press Ctrl+C to stop)"),
		);

		// Handle graceful shutdown
		process.on("SIGINT", () => {
			console.log(chalk.yellow("\n\n👋 Stopping watch mode..."));
			watchState.stop();
			process.exit(0);
		});

		// Keep process alive
		await new Promise(() => {});
	},
};
