/**
 * TypeSchema Merge Command
 *
 * Merge multiple TypeSchema files into a single output
 */

import type { CommandModule } from "yargs";
import { resolve } from "path";
import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { join, extname, dirname } from "path";
import type { AnyTypeSchema } from "../../../lib/typeschema/types";

interface MergeCommandArgs {
	input: string[];
	output: string;
	format?: "ndjson" | "json";
	"deduplicate"?: boolean;
	"sort-by"?: "name" | "kind" | "package";
	"filter-kinds"?: string[];
	verbose?: boolean;
}

interface MergeOptions {
	inputPaths: string[];
	outputPath: string;
	format: "ndjson" | "json";
	deduplicate: boolean;
	sortBy?: "name" | "kind" | "package";
	filterKinds?: string[];
	verbose: boolean;
}

interface MergeStats {
	inputFiles: number;
	totalSchemas: number;
	duplicatesRemoved: number;
	schemasFiltered: number;
	outputSchemas: number;
}

/**
 * TypeSchema merge command
 */
export const mergeTypeschemaCommand: CommandModule<{}, MergeCommandArgs> = {
	command: "merge <input..>",
	describe: "Merge multiple TypeSchema files into one",
	builder: {
		input: {
			type: "string",
			array: true,
			description: "TypeSchema files or directories to merge",
			demandOption: true,
		},
		output: {
			alias: "o",
			type: "string",
			description: "Output file path",
			demandOption: true,
		},
		format: {
			alias: "f",
			type: "string",
			choices: ["ndjson", "json"] as const,
			default: "ndjson" as const,
			description: "Output format",
		},
		deduplicate: {
			alias: "d",
			type: "boolean",
			default: true,
			description: "Remove duplicate schemas (same package:name)",
		},
		"sort-by": {
			type: "string",
			choices: ["name", "kind", "package"] as const,
			description: "Sort schemas by field",
		},
		"filter-kinds": {
			type: "array",
			description: "Only include specific schema kinds (e.g., resource, complex-type)",
		},
		verbose: {
			alias: "v",
			type: "boolean",
			default: false,
			description: "Enable verbose output",
		},
	},
	handler: async (argv) => {
		const options: MergeOptions = {
			inputPaths: argv.input,
			outputPath: resolve(argv.output),
			format: argv.format || "ndjson",
			deduplicate: argv.deduplicate ?? true,
			sortBy: argv["sort-by"],
			filterKinds: argv["filter-kinds"] as string[] | undefined,
			verbose: argv.verbose ?? false,
		};

		const stats = await mergeTypeSchema(options);

		if (options.verbose) {
			printMergeStats(stats);
		}

		console.log(`✨ Successfully merged ${stats.outputSchemas} schemas to ${options.outputPath}`);
	},
};

/**
 * Merge TypeSchema files
 */
export async function mergeTypeSchema(options: MergeOptions): Promise<MergeStats> {
	const log = (message: string) => {
		if (options.verbose) {
			console.error(`[MERGE] ${message}`);
		}
	};

	const stats: MergeStats = {
		inputFiles: 0,
		totalSchemas: 0,
		duplicatesRemoved: 0,
		schemasFiltered: 0,
		outputSchemas: 0,
	};

	try {
		log("Loading TypeSchema files...");

		// Load all schemas from input paths
		const allSchemas: AnyTypeSchema[] = [];
		for (const inputPath of options.inputPaths) {
			const resolvedPath = resolve(inputPath);
			const schemas = await loadSchemasFromPath(resolvedPath);
			allSchemas.push(...schemas);

			// Count files processed
			const fileStats = await stat(resolvedPath);
			if (fileStats.isFile()) {
				stats.inputFiles++;
			} else {
				// Count files in directory
				const fileCount = await countFilesInDirectory(resolvedPath);
				stats.inputFiles += fileCount;
			}
		}

		stats.totalSchemas = allSchemas.length;
		log(`Loaded ${stats.totalSchemas} schemas from ${stats.inputFiles} files`);

		if (allSchemas.length === 0) {
			throw new Error("No schemas found in input files");
		}

		// Apply filtering if requested
		let processedSchemas = allSchemas;
		if (options.filterKinds?.length > 0) {
			const beforeCount = processedSchemas.length;
			processedSchemas = processedSchemas.filter(schema =>
				options.filterKinds.includes(schema.identifier.kind)
			);
			stats.schemasFiltered = beforeCount - processedSchemas.length;
			log(`Filtered ${stats.schemasFiltered} schemas, ${processedSchemas.length} remaining`);
		}

		// Apply deduplication if requested
		if (options.deduplicate) {
			const beforeCount = processedSchemas.length;
			processedSchemas = deduplicateSchemas(processedSchemas);
			stats.duplicatesRemoved = beforeCount - processedSchemas.length;
			log(`Removed ${stats.duplicatesRemoved} duplicate schemas`);
		}

		// Apply sorting if requested
		if (options.sortBy) {
			processedSchemas = sortSchemas(processedSchemas, options.sortBy);
			log(`Sorted schemas by ${options.sortBy}`);
		}

		stats.outputSchemas = processedSchemas.length;

		// Write output
		await writeSchemas(processedSchemas, options.outputPath, options.format);
		log(`Wrote ${stats.outputSchemas} schemas to ${options.outputPath}`);

	} catch (error) {
		throw new Error(`Failed to merge TypeSchema: ${error instanceof Error ? error.message : String(error)}`);
	}

	return stats;
}

/**
 * Load schemas from file or directory path
 */
async function loadSchemasFromPath(inputPath: string): Promise<AnyTypeSchema[]> {
	const stats = await stat(inputPath);

	if (stats.isFile()) {
		return await loadSchemasFromFile(inputPath);
	} else if (stats.isDirectory()) {
		return await loadSchemasFromDirectory(inputPath);
	} else {
		throw new Error(`Invalid input path: ${inputPath}`);
	}
}

/**
 * Load schemas from a single file
 */
async function loadSchemasFromFile(filePath: string): Promise<AnyTypeSchema[]> {
	const content = await readFile(filePath, "utf-8");
	const ext = extname(filePath);

	if (ext === ".ndjson") {
		const lines = content.trim().split("\n").filter(line => line.trim());
		return lines.map(line => JSON.parse(line));
	} else if (ext === ".json") {
		const parsed = JSON.parse(content);
		return Array.isArray(parsed) ? parsed : [parsed];
	} else {
		throw new Error(`Unsupported file format: ${ext}. Expected .ndjson or .json`);
	}
}

/**
 * Load schemas from directory
 */
async function loadSchemasFromDirectory(dirPath: string): Promise<AnyTypeSchema[]> {
	const files = await readdir(dirPath, { recursive: true });
	const schemas: AnyTypeSchema[] = [];

	for (const file of files) {
		const filePath = join(dirPath, file);
		const stats = await stat(filePath);

		if (stats.isFile() && (file.endsWith(".json") || file.endsWith(".ndjson"))) {
			try {
				const fileSchemas = await loadSchemasFromFile(filePath);
				schemas.push(...fileSchemas);
			} catch (error) {
				console.warn(`Warning: Failed to load ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	return schemas;
}

/**
 * Count files in directory
 */
async function countFilesInDirectory(dirPath: string): Promise<number> {
	const files = await readdir(dirPath, { recursive: true });
	let count = 0;

	for (const file of files) {
		const filePath = join(dirPath, file);
		const stats = await stat(filePath);

		if (stats.isFile() && (file.endsWith(".json") || file.endsWith(".ndjson"))) {
			count++;
		}
	}

	return count;
}

/**
 * Remove duplicate schemas based on package:name key
 */
function deduplicateSchemas(schemas: AnyTypeSchema[]): AnyTypeSchema[] {
	const seen = new Set<string>();
	const unique: AnyTypeSchema[] = [];

	for (const schema of schemas) {
		const key = `${schema.identifier.package}:${schema.identifier.name}`;
		if (!seen.has(key)) {
			seen.add(key);
			unique.push(schema);
		}
	}

	return unique;
}

/**
 * Sort schemas by specified field
 */
function sortSchemas(schemas: AnyTypeSchema[], sortBy: "name" | "kind" | "package"): AnyTypeSchema[] {
	return [...schemas].sort((a, b) => {
		let aValue: string;
		let bValue: string;

		switch (sortBy) {
			case "name":
				aValue = a.identifier.name;
				bValue = b.identifier.name;
				break;
			case "kind":
				aValue = a.identifier.kind;
				bValue = b.identifier.kind;
				break;
			case "package":
				aValue = a.identifier.package;
				bValue = b.identifier.package;
				break;
		}

		return aValue.localeCompare(bValue);
	});
}

/**
 * Write schemas to output file
 */
async function writeSchemas(schemas: AnyTypeSchema[], outputPath: string, format: "ndjson" | "json"): Promise<void> {
	// Ensure output directory exists
	await mkdir(dirname(outputPath), { recursive: true });

	if (format === "ndjson") {
		const lines = schemas.map(schema => JSON.stringify(schema));
		await writeFile(outputPath, lines.join("\n"));
	} else {
		await writeFile(outputPath, JSON.stringify(schemas, null, 2));
	}
}

/**
 * Print merge statistics
 */
function printMergeStats(stats: MergeStats): void {
	console.log(`\n📊 Merge Statistics:`);
	console.log(`   Input files: ${stats.inputFiles}`);
	console.log(`   Total schemas loaded: ${stats.totalSchemas}`);

	if (stats.schemasFiltered > 0) {
		console.log(`   Schemas filtered out: ${stats.schemasFiltered}`);
	}

	if (stats.duplicatesRemoved > 0) {
		console.log(`   Duplicates removed: ${stats.duplicatesRemoved}`);
	}

	console.log(`   Output schemas: ${stats.outputSchemas}`);
}
