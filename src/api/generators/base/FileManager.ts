/**
 * Core file management system with batching and performance optimizations
 *
 * This replaces scattered writeFile calls with a comprehensive file management
 * system that provides better error handling, performance, and maintainability.
 */

import { access, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { CodegenLogger } from "../../../utils/codegen-logger";
import { FileOperationError } from "./errors";
import type { FileStats } from "./types";

export interface FileManagerOptions {
	outputDir: string;
	logger: CodegenLogger;
	overwrite?: boolean;
	batchSize?: number;
}

export interface WriteFileResult {
	path: string;
	size: number;
	writeTime: number;
}

/**
 * High-performance file manager with batching and error recovery
 *
 * Features:
 * - Automatic directory creation
 * - Batch operations for better performance
 * - Comprehensive error handling with recovery suggestions
 * - Import path resolution
 * - File existence checks
 */
export class FileManager {
	private readonly options: Required<FileManagerOptions>;
	private readonly logger: CodegenLogger;

	constructor(options: FileManagerOptions) {
		this.options = {
			overwrite: true,
			batchSize: 10,
			...options,
		};
		this.logger = options.logger;
	}

	/**
	 * Write a file with automatic directory creation
	 * @param relativePath Path relative to output directory
	 * @param content File content
	 * @param options Write options
	 */
	async writeFile(
		relativePath: string,
		content: string,
		options: { encoding?: BufferEncoding; overwrite?: boolean } = {},
	): Promise<WriteFileResult> {
		const startTime = performance.now();
		const fullPath = join(this.options.outputDir, relativePath);
		const encoding = options.encoding || "utf-8";
		const overwrite = options.overwrite ?? this.options.overwrite;

		try {
			// Check if file exists and overwrite is disabled
			if (!overwrite) {
				try {
					await access(fullPath);
					this.logger.debug(`Skipping existing file: ${relativePath}`);
					const stats = await stat(fullPath);
					return {
						path: fullPath,
						size: stats.size,
						writeTime: 0,
					};
				} catch {
					// File doesn't exist, continue with write
				}
			}

			// Ensure directory exists
			await this.ensureDirectory(dirname(fullPath));

			// Write file
			await writeFile(fullPath, content, encoding);

			const writeTime = performance.now() - startTime;
			const size = Buffer.byteLength(content, encoding);

			this.logger.debug(
				`Written ${relativePath} (${size} bytes, ${writeTime.toFixed(2)}ms)`,
			);

			return {
				path: fullPath,
				size,
				writeTime,
			};
		} catch (error) {
			throw new FileOperationError(
				`Failed to write file '${relativePath}': ${error}`,
				"write",
				fullPath,
				error instanceof Error ? error : undefined,
				{
					canRetry: true,
					alternativePaths: [
						join(process.cwd(), "backup-output", relativePath),
					],
				},
			);
		}
	}

	/**
	 * Write multiple files in batch for better performance
	 * @param files Map of relative path to content
	 */
	async writeBatch(files: Map<string, string>): Promise<WriteFileResult[]> {
		this.logger.debug(`Writing batch of ${files.size} files`);

		const entries = Array.from(files.entries());
		const results: WriteFileResult[] = [];

		// Process in batches to avoid overwhelming the filesystem
		for (let i = 0; i < entries.length; i += this.options.batchSize) {
			const batch = entries.slice(i, i + this.options.batchSize);
			const batchPromises = batch.map(([path, content]) =>
				this.writeFile(path, content),
			);

			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);

			// Small delay between batches to be filesystem-friendly
			if (i + this.options.batchSize < entries.length) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}

		return results;
	}

	/**
	 * Ensure directory exists, creating parent directories as needed
	 * @param dirPath Full directory path
	 */
	async ensureDirectory(dirPath: string): Promise<void> {
		try {
			await mkdir(dirPath, { recursive: true });
		} catch (error) {
			throw new FileOperationError(
				`Failed to create directory '${dirPath}': ${error}`,
				"create",
				dirPath,
				error instanceof Error ? error : undefined,
				{
					canRetry: true,
					permissionFix: `chmod 755 "${dirname(dirPath)}"`,
				},
			);
		}
	}

	/**
	 * Clean directory by removing all contents
	 * @param relativePath Path relative to output directory
	 */
	async cleanDirectory(relativePath: string = "."): Promise<void> {
		const fullPath = join(this.options.outputDir, relativePath);

		try {
			await access(fullPath);
			this.logger.debug(`Cleaning directory: ${relativePath}`);
			await rm(fullPath, { recursive: true, force: true });
		} catch (error) {
			// Directory doesn't exist - that's fine
			if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
				throw new FileOperationError(
					`Failed to clean directory '${relativePath}': ${error}`,
					"delete",
					fullPath,
					error instanceof Error ? error : undefined,
					{
						canRetry: true,
					},
				);
			}
		}
	}

	/**
	 * Get relative import path between two files
	 * @param fromFile Source file path
	 * @param toFile Target file path
	 */
	getRelativeImportPath(fromFile: string, toFile: string): string {
		const from = dirname(join(this.options.outputDir, fromFile));
		const to = join(this.options.outputDir, toFile);

		let relativePath = relative(from, to);

		// Ensure relative imports start with './' or '../'
		if (!relativePath.startsWith(".")) {
			relativePath = `./${relativePath}`;
		}

		// Remove file extension for imports (handle .d.ts files properly)
		return relativePath.replace(/\.(d\.ts|ts|tsx|js|jsx)$/, "");
	}

	/**
	 * Check if a file would be overwritten
	 * @param relativePath Path relative to output directory
	 */
	async wouldOverwrite(relativePath: string): Promise<boolean> {
		const fullPath = join(this.options.outputDir, relativePath);
		try {
			await access(fullPath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get file statistics
	 * @param relativePath Path relative to output directory
	 */
	async getFileStats(relativePath: string): Promise<FileStats | null> {
		const fullPath = join(this.options.outputDir, relativePath);
		try {
			const stats = await stat(fullPath);
			return {
				size: stats.size,
				generationTime: 0, // Will be set by caller
				writeTime: 0, // Will be set by caller
			};
		} catch {
			return null;
		}
	}

	/**
	 * Get output directory
	 */
	getOutputDirectory(): string {
		return this.options.outputDir;
	}

	/**
	 * Set batch size for operations
	 * @param size Batch size
	 */
	setBatchSize(size: number): void {
		this.options.batchSize = Math.max(1, Math.min(50, size));
	}

	/**
	 * Get current batch size
	 */
	getBatchSize(): number {
		return this.options.batchSize;
	}
}
