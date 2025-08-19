/**
 * Directory builder for batch file operations
 *
 * Provides a fluent API for managing entire directories of files,
 * including subdirectories, index files, and batch operations.
 */

import type { CodegenLogger } from "../../../../utils/codegen-logger";
import type { FileManager } from "../FileManager";
import type { FileBuilder } from "./FileBuilder";
import type { IndexBuilder } from "./IndexBuilder";

export interface DirectoryBuilderConfig {
	path: string;
	fileManager: FileManager;
	logger: CodegenLogger;
}

/**
 * Fluent builder for directory operations
 *
 * Features:
 * - Subdirectory management
 * - Batch file operations
 * - Index file generation
 * - Directory cleaning
 * - File listing for preview
 */
export class DirectoryBuilder {
	private readonly config: DirectoryBuilderConfig;
	private readonly files = new Map<string, FileBuilder>();
	private readonly subdirectories = new Map<string, DirectoryBuilder>();
	private indexBuilder?: IndexBuilder;
	private shouldClean = false;

	constructor(config: DirectoryBuilderConfig) {
		this.config = config;
	}

	/**
	 * Add a subdirectory
	 * @param name Subdirectory name
	 */
	withSubdirectory(name: string): DirectoryBuilder {
		const subdirPath = `${this.config.path}/${name}`;
		const subdir = new DirectoryBuilder({
			path: subdirPath,
			fileManager: this.config.fileManager,
			logger: this.config.logger.child(`Dir:${name}`),
		});

		this.subdirectories.set(name, subdir);
		return subdir;
	}

	/**
	 * Add files to this directory
	 * @param files Map of filename to FileBuilder
	 */
	withFiles(files: Record<string, FileBuilder>): DirectoryBuilder {
		for (const [filename, builder] of Object.entries(files)) {
			this.files.set(filename, builder);
		}
		return this;
	}

	/**
	 * Add a single file
	 * @param filename File name
	 * @param builder File builder
	 */
	withFile(filename: string, builder: FileBuilder): DirectoryBuilder {
		this.files.set(filename, builder);
		return this;
	}

	/**
	 * Set index builder for this directory
	 * @param builder Index builder
	 */
	withIndex(builder: IndexBuilder): DirectoryBuilder {
		this.indexBuilder = builder;
		return this;
	}

	/**
	 * Clean directory before creating files
	 */
	clean(): DirectoryBuilder {
		this.shouldClean = true;
		return this;
	}

	/**
	 * Ensure directory exists
	 */
	async ensure(): Promise<DirectoryBuilder> {
		await this.config.fileManager.ensureDirectory(this.config.path);
		return this;
	}

	/**
	 * Save all files in this directory
	 */
	async save(): Promise<string[]> {
		const savedPaths: string[] = [];

		// Clean directory if requested
		if (this.shouldClean) {
			await this.config.fileManager.cleanDirectory(this.config.path);
		}

		// Ensure directory exists
		await this.ensure();

		// Save all files in parallel for better performance
		const filePromises = Array.from(this.files.entries()).map(
			async ([filename, builder]) => {
				try {
					const path = await builder.save();
					savedPaths.push(path);
					return path;
				} catch (error) {
					this.config.logger.error(
						`Failed to save file ${filename}:`,
						error instanceof Error ? error : undefined,
					);
					throw error;
				}
			},
		);

		await Promise.all(filePromises);

		// Save subdirectories recursively
		for (const [name, subdir] of this.subdirectories) {
			try {
				const subdirPaths = await subdir.save();
				savedPaths.push(...subdirPaths);
			} catch (error) {
				this.config.logger.error(
					`Failed to save subdirectory ${name}:`,
					error instanceof Error ? error : undefined,
				);
				throw error;
			}
		}

		// Generate index if provided
		if (this.indexBuilder) {
			try {
				const indexPath = await this.indexBuilder.save();
				savedPaths.push(indexPath);
			} catch (error) {
				this.config.logger.error(
					"Failed to save index file:",
					error instanceof Error ? error : undefined,
				);
				throw error;
			}
		}

		this.config.logger.info(
			`Saved directory ${this.config.path} with ${savedPaths.length} files`,
		);
		return savedPaths;
	}

	/**
	 * Get all files that would be generated (for preview)
	 */
	getFileList(): string[] {
		const files: string[] = [];

		for (const filename of this.files.keys()) {
			files.push(`${this.config.path}/${filename}`);
		}

		for (const [name, subdir] of this.subdirectories) {
			const subdirFiles = subdir.getFileList();
			files.push(...subdirFiles);
		}

		if (this.indexBuilder) {
			files.push(`${this.config.path}/index.ts`); // Assuming TypeScript
		}

		return files.sort();
	}

	/**
	 * Get statistics about this directory
	 */
	getStats(): {
		fileCount: number;
		subdirectoryCount: number;
		hasIndex: boolean;
		totalFiles: number;
	} {
		let totalFiles = this.files.size;

		for (const subdir of this.subdirectories.values()) {
			totalFiles += subdir.getStats().totalFiles;
		}

		if (this.indexBuilder) {
			totalFiles += 1;
		}

		return {
			fileCount: this.files.size,
			subdirectoryCount: this.subdirectories.size,
			hasIndex: !!this.indexBuilder,
			totalFiles,
		};
	}

	/**
	 * Check if directory would overwrite existing files
	 */
	async wouldOverwrite(): Promise<string[]> {
		const conflicts: string[] = [];

		// Check files in this directory
		for (const filename of this.files.keys()) {
			const filePath = `${this.config.path}/${filename}`;
			if (await this.config.fileManager.wouldOverwrite(filePath)) {
				conflicts.push(filePath);
			}
		}

		// Check subdirectories
		for (const subdir of this.subdirectories.values()) {
			const subdirConflicts = await subdir.wouldOverwrite();
			conflicts.push(...subdirConflicts);
		}

		// Check index file
		if (this.indexBuilder) {
			const indexPath = `${this.config.path}/index.ts`;
			if (await this.config.fileManager.wouldOverwrite(indexPath)) {
				conflicts.push(indexPath);
			}
		}

		return conflicts;
	}

	/**
	 * Get the path of this directory
	 */
	getPath(): string {
		return this.config.path;
	}

	/**
	 * Get all file builders (for testing/debugging)
	 */
	getFiles(): Map<string, FileBuilder> {
		return new Map(this.files);
	}

	/**
	 * Get all subdirectories (for testing/debugging)
	 */
	getSubdirectories(): Map<string, DirectoryBuilder> {
		return new Map(this.subdirectories);
	}

	/**
	 * Get index builder (for testing/debugging)
	 */
	getIndexBuilder(): IndexBuilder | undefined {
		return this.indexBuilder;
	}
}
