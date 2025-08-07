/**
 * File Operation Utilities
 *
 * Efficient file reading/writing, directory management, and path operations
 * with streaming support for large files and comprehensive error handling
 */

import {
	basename,
	dirname,
	extname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "path";
import type { FileStat, FileSystem, ProgressReporter } from "../types";

/**
 * File system implementation using Bun APIs
 */
export class BunFileSystem implements FileSystem {
	async readFile(filePath: string): Promise<string> {
		try {
			const file = Bun.file(filePath);
			return await file.text();
		} catch (error) {
			throw new FileSystemError(`Failed to read file: ${filePath}`, {
				operation: "read",
				path: filePath,
				cause: error as Error,
			});
		}
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		try {
			await this.mkdir(dirname(filePath), { recursive: true });
			await Bun.write(filePath, content);
		} catch (error) {
			throw new FileSystemError(`Failed to write file: ${filePath}`, {
				operation: "write",
				path: filePath,
				cause: error as Error,
			});
		}
	}

	async exists(filePath: string): Promise<boolean> {
		try {
			const file = Bun.file(filePath);
			return await file.exists();
		} catch {
			return false;
		}
	}

	async mkdir(
		dirPath: string,
		options?: { recursive?: boolean },
	): Promise<void> {
		try {
			const fs = await import("fs/promises");
			await fs.mkdir(dirPath, { recursive: options?.recursive ?? false });
		} catch (error) {
			if ((error as any).code !== "EEXIST") {
				throw new FileSystemError(`Failed to create directory: ${dirPath}`, {
					operation: "mkdir",
					path: dirPath,
					cause: error as Error,
				});
			}
		}
	}

	async readdir(dirPath: string): Promise<string[]> {
		try {
			const fs = await import("fs/promises");
			return await fs.readdir(dirPath);
		} catch (error) {
			throw new FileSystemError(`Failed to read directory: ${dirPath}`, {
				operation: "readdir",
				path: dirPath,
				cause: error as Error,
			});
		}
	}

	async stat(filePath: string): Promise<FileStat> {
		try {
			const fs = await import("fs/promises");
			const stats = await fs.stat(filePath);

			return {
				isFile: () => stats.isFile(),
				isDirectory: () => stats.isDirectory(),
				size: stats.size,
				mtime: stats.mtime,
				ctime: stats.ctime,
			};
		} catch (error) {
			throw new FileSystemError(`Failed to stat: ${filePath}`, {
				operation: "stat",
				path: filePath,
				cause: error as Error,
			});
		}
	}

	async rm(
		filePath: string,
		options?: { recursive?: boolean; force?: boolean },
	): Promise<void> {
		try {
			const fs = await import("fs/promises");
			await fs.rm(filePath, {
				recursive: options?.recursive ?? false,
				force: options?.force ?? false,
			});
		} catch (error) {
			if (!options?.force || (error as any).code !== "ENOENT") {
				throw new FileSystemError(`Failed to remove: ${filePath}`, {
					operation: "remove",
					path: filePath,
					cause: error as Error,
				});
			}
		}
	}
}

/**
 * File system error
 */
export class FileSystemError extends Error {
	constructor(
		message: string,
		public readonly context: {
			operation: string;
			path: string;
			cause?: Error;
		},
	) {
		super(message);
		this.name = "FileSystemError";
	}
}

/**
 * Default file system instance
 */
export const fs: FileSystem = new BunFileSystem();

/**
 * Path utilities
 */
export const Path = {
	/**
	 * Join path segments
	 */
	join: (...segments: string[]): string => join(...segments),

	/**
	 * Resolve path to absolute
	 */
	resolve: (...segments: string[]): string => resolve(...segments),

	/**
	 * Get directory name
	 */
	dirname: (filePath: string): string => dirname(filePath),

	/**
	 * Get base name
	 */
	basename: (filePath: string, ext?: string): string => basename(filePath, ext),

	/**
	 * Get file extension
	 */
	extname: (filePath: string): string => extname(filePath),

	/**
	 * Get relative path
	 */
	relative: (from: string, to: string): string => relative(from, to),

	/**
	 * Check if path is absolute
	 */
	isAbsolute: (filePath: string): boolean => isAbsolute(filePath),

	/**
	 * Normalize path separators
	 */
	normalize: (filePath: string): string => {
		return filePath.replace(/\\/g, "/");
	},

	/**
	 * Ensure path ends with separator
	 */
	ensureTrailingSlash: (dirPath: string): string => {
		return dirPath.endsWith("/") ? dirPath : dirPath + "/";
	},

	/**
	 * Remove trailing slash
	 */
	removeTrailingSlash: (dirPath: string): string => {
		return dirPath.replace(/\/+$/, "");
	},

	/**
	 * Split path into segments
	 */
	segments: (filePath: string): string[] => {
		return filePath.split("/").filter(Boolean);
	},

	/**
	 * Get file name without extension
	 */
	stem: (filePath: string): string => {
		const base = basename(filePath);
		const ext = extname(base);
		return ext ? base.slice(0, -ext.length) : base;
	},
};

/**
 * File reading utilities
 */
export const FileReader = {
	/**
	 * Read file as text
	 */
	readText: async (
		filePath: string,
		encoding: BufferEncoding = "utf-8",
	): Promise<string> => {
		return await fs.readFile(filePath);
	},

	/**
	 * Read file as JSON
	 */
	readJson: async <T = any>(filePath: string): Promise<T> => {
		const content = await fs.readFile(filePath);
		try {
			return JSON.parse(content);
		} catch (error) {
			throw new FileSystemError(`Invalid JSON in file: ${filePath}`, {
				operation: "parseJson",
				path: filePath,
				cause: error as Error,
			});
		}
	},

	/**
	 * Read file as lines
	 */
	readLines: async (filePath: string): Promise<string[]> => {
		const content = await fs.readFile(filePath);
		return content.split(/\r?\n/);
	},

	/**
	 * Read file in chunks (streaming)
	 */
	readChunks: async function* (
		filePath: string,
		chunkSize = 1024 * 1024,
	): AsyncGenerator<string, void, unknown> {
		const file = Bun.file(filePath);
		const stream = file.stream();
		const reader = stream.getReader();

		try {
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					if (buffer) {
						yield buffer;
					}
					break;
				}

				buffer += new TextDecoder().decode(value, { stream: true });

				while (buffer.length >= chunkSize) {
					yield buffer.slice(0, chunkSize);
					buffer = buffer.slice(chunkSize);
				}
			}
		} finally {
			reader.releaseLock();
		}
	},

	/**
	 * Check if file exists
	 */
	exists: async (filePath: string): Promise<boolean> => {
		return await fs.exists(filePath);
	},

	/**
	 * Get file stats
	 */
	stat: async (filePath: string): Promise<FileStat> => {
		return await fs.stat(filePath);
	},

	/**
	 * Check if path is file
	 */
	isFile: async (filePath: string): Promise<boolean> => {
		try {
			const stat = await fs.stat(filePath);
			return stat.isFile();
		} catch {
			return false;
		}
	},

	/**
	 * Check if path is directory
	 */
	isDirectory: async (filePath: string): Promise<boolean> => {
		try {
			const stat = await fs.stat(filePath);
			return stat.isDirectory();
		} catch {
			return false;
		}
	},

	/**
	 * Get file size
	 */
	size: async (filePath: string): Promise<number> => {
		const stat = await fs.stat(filePath);
		return stat.size;
	},
};

/**
 * File writing utilities
 */
export const FileWriter = {
	/**
	 * Write text to file
	 */
	writeText: async (
		filePath: string,
		content: string,
		options?: {
			encoding?: BufferEncoding;
			overwrite?: boolean;
			backup?: boolean;
		},
	): Promise<void> => {
		const { overwrite = true, backup = false } = options || {};

		// Check if file exists and handle overwrite
		if (!overwrite && (await fs.exists(filePath))) {
			throw new FileSystemError(`File already exists: ${filePath}`, {
				operation: "write",
				path: filePath,
			});
		}

		// Create backup if requested
		if (backup && (await fs.exists(filePath))) {
			await fs.writeFile(`${filePath}.backup`, await fs.readFile(filePath));
		}

		await fs.writeFile(filePath, content);
	},

	/**
	 * Write JSON to file
	 */
	writeJson: async (
		filePath: string,
		data: any,
		options?: {
			indent?: number;
			overwrite?: boolean;
			backup?: boolean;
		},
	): Promise<void> => {
		const { indent = 2 } = options || {};
		const content = JSON.stringify(data, null, indent);
		await FileWriter.writeText(filePath, content, options);
	},

	/**
	 * Append text to file
	 */
	appendText: async (filePath: string, content: string): Promise<void> => {
		let existing = "";
		if (await fs.exists(filePath)) {
			existing = await fs.readFile(filePath);
		}
		await fs.writeFile(filePath, existing + content);
	},

	/**
	 * Write lines to file
	 */
	writeLines: async (filePath: string, lines: string[]): Promise<void> => {
		const content = lines.join("\n");
		await fs.writeFile(filePath, content);
	},

	/**
	 * Write file with atomic operation (write to temp, then rename)
	 */
	writeAtomic: async (filePath: string, content: string): Promise<void> => {
		const tempPath = `${filePath}.tmp.${Date.now()}`;
		try {
			await fs.writeFile(tempPath, content);

			// Rename temp file to final path (atomic on most filesystems)
			const fsSync = await import("fs");
			fsSync.renameSync(tempPath, filePath);
		} catch (error) {
			// Clean up temp file on error
			try {
				await fs.rm(tempPath);
			} catch {
				// Ignore cleanup errors
			}
			throw error;
		}
	},
};

/**
 * Directory utilities
 */
export const Directory = {
	/**
	 * Create directory (recursive by default)
	 */
	create: async (dirPath: string, recursive = true): Promise<void> => {
		await fs.mkdir(dirPath, { recursive });
	},

	/**
	 * List directory contents
	 */
	list: async (dirPath: string): Promise<string[]> => {
		return await fs.readdir(dirPath);
	},

	/**
	 * List directory contents with stats
	 */
	listWithStats: async (
		dirPath: string,
	): Promise<
		Array<{
			name: string;
			path: string;
			stat: FileStat;
		}>
	> => {
		const entries = await fs.readdir(dirPath);
		const results = await Promise.all(
			entries.map(async (name) => {
				const path = Path.join(dirPath, name);
				const stat = await fs.stat(path);
				return { name, path, stat };
			}),
		);
		return results;
	},

	/**
	 * Walk directory tree
	 */
	walk: async function* (
		dirPath: string,
		options?: {
			recursive?: boolean;
			includeFiles?: boolean;
			includeDirs?: boolean;
			pattern?: RegExp;
		},
	): AsyncGenerator<string, void, unknown> {
		const {
			recursive = true,
			includeFiles = true,
			includeDirs = false,
			pattern,
		} = options || {};

		const entries = await Directory.listWithStats(dirPath);

		for (const entry of entries) {
			if (pattern && !pattern.test(entry.name)) {
				continue;
			}

			if (entry.stat.isFile() && includeFiles) {
				yield entry.path;
			} else if (entry.stat.isDirectory()) {
				if (includeDirs) {
					yield entry.path;
				}

				if (recursive) {
					yield* Directory.walk(entry.path, options);
				}
			}
		}
	},

	/**
	 * Find files matching pattern
	 */
	find: async (
		dirPath: string,
		pattern: string | RegExp,
		options?: {
			recursive?: boolean;
			caseSensitive?: boolean;
		},
	): Promise<string[]> => {
		const { recursive = true, caseSensitive = false } = options || {};
		const results: string[] = [];

		const regex =
			typeof pattern === "string"
				? new RegExp(pattern.replace(/\*/g, ".*"), caseSensitive ? "" : "i")
				: pattern;

		for await (const filePath of Directory.walk(dirPath, {
			recursive,
			includeFiles: true,
			includeDirs: false,
		})) {
			if (regex.test(Path.basename(filePath))) {
				results.push(filePath);
			}
		}

		return results;
	},

	/**
	 * Remove directory
	 */
	remove: async (
		dirPath: string,
		options?: { recursive?: boolean },
	): Promise<void> => {
		await fs.rm(dirPath, options);
	},

	/**
	 * Copy directory
	 */
	copy: async (
		srcDir: string,
		destDir: string,
		options?: {
			overwrite?: boolean;
			filter?: (path: string) => boolean;
			progress?: ProgressReporter;
		},
	): Promise<void> => {
		const { overwrite = true, filter, progress } = options || {};

		await Directory.create(destDir);

		const entries = await Directory.listWithStats(srcDir);
		let processed = 0;

		if (progress) {
			progress.start(entries.length, `Copying ${srcDir} to ${destDir}`);
		}

		for (const entry of entries) {
			const srcPath = entry.path;
			const destPath = Path.join(destDir, entry.name);

			if (filter && !filter(srcPath)) {
				continue;
			}

			if (entry.stat.isFile()) {
				if (!overwrite && (await fs.exists(destPath))) {
					continue;
				}
				const content = await fs.readFile(srcPath);
				await fs.writeFile(destPath, content);
			} else if (entry.stat.isDirectory()) {
				await Directory.copy(srcPath, destPath, options);
			}

			processed++;
			if (progress) {
				progress.update(processed);
			}
		}

		if (progress) {
			progress.finish("Copy completed");
		}
	},

	/**
	 * Get directory size
	 */
	size: async (dirPath: string): Promise<number> => {
		let totalSize = 0;

		for await (const filePath of Directory.walk(dirPath, {
			includeFiles: true,
			includeDirs: false,
		})) {
			const stat = await fs.stat(filePath);
			totalSize += stat.size;
		}

		return totalSize;
	},

	/**
	 * Check if directory is empty
	 */
	isEmpty: async (dirPath: string): Promise<boolean> => {
		const entries = await fs.readdir(dirPath);
		return entries.length === 0;
	},
};

/**
 * File watching utilities (basic implementation)
 */
export const FileWatcher = {
	/**
	 * Watch file for changes
	 */
	watchFile: (
		filePath: string,
		callback: (event: "change" | "rename", filename?: string) => void,
	): (() => void) => {
		// This would typically use fs.watch or a proper file watcher
		// For now, we'll return a no-op cleanup function
		console.log(`Watching file: ${filePath}`);
		return () => {
			console.log(`Stopped watching: ${filePath}`);
		};
	},

	/**
	 * Watch directory for changes
	 */
	watchDirectory: (
		dirPath: string,
		callback: (event: "change" | "rename", filename?: string) => void,
	): (() => void) => {
		console.log(`Watching directory: ${dirPath}`);
		return () => {
			console.log(`Stopped watching: ${dirPath}`);
		};
	},
};

/**
 * Batch file operations
 */
export const BatchOperations = {
	/**
	 * Copy multiple files
	 */
	copyFiles: async (
		operations: Array<{ src: string; dest: string }>,
		options?: {
			overwrite?: boolean;
			progress?: ProgressReporter;
		},
	): Promise<void> => {
		const { overwrite = true, progress } = options || {};

		if (progress) {
			progress.start(operations.length, "Copying files");
		}

		for (let i = 0; i < operations.length; i++) {
			const { src, dest } = operations[i];

			if (!overwrite && (await fs.exists(dest))) {
				continue;
			}

			// Ensure destination directory exists
			await Directory.create(Path.dirname(dest));

			// Copy file
			const content = await fs.readFile(src);
			await fs.writeFile(dest, content);

			if (progress) {
				progress.update(i + 1);
			}
		}

		if (progress) {
			progress.finish("Files copied");
		}
	},

	/**
	 * Delete multiple files
	 */
	deleteFiles: async (
		filePaths: string[],
		options?: {
			force?: boolean;
			progress?: ProgressReporter;
		},
	): Promise<void> => {
		const { force = false, progress } = options || {};

		if (progress) {
			progress.start(filePaths.length, "Deleting files");
		}

		for (let i = 0; i < filePaths.length; i++) {
			const filePath = filePaths[i];

			try {
				await fs.rm(filePath, { force });
			} catch (error) {
				if (!force) {
					throw error;
				}
			}

			if (progress) {
				progress.update(i + 1);
			}
		}

		if (progress) {
			progress.finish("Files deleted");
		}
	},
};

/**
 * Temporary file utilities
 */
export const TempFile = {
	/**
	 * Create temporary file
	 */
	create: async (options?: {
		prefix?: string;
		suffix?: string;
		dir?: string;
	}): Promise<{ path: string; cleanup: () => Promise<void> }> => {
		const { prefix = "tmp", suffix = "", dir = "/tmp" } = options || {};
		const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}`;
		const path = Path.join(dir, filename);

		// Ensure temp directory exists
		await Directory.create(dir);

		// Create empty file
		await fs.writeFile(path, "");

		const cleanup = async () => {
			try {
				await fs.rm(path, { force: true });
			} catch {
				// Ignore cleanup errors
			}
		};

		return { path, cleanup };
	},

	/**
	 * Create temporary directory
	 */
	createDir: async (options?: {
		prefix?: string;
		dir?: string;
	}): Promise<{ path: string; cleanup: () => Promise<void> }> => {
		const { prefix = "tmpdir", dir = "/tmp" } = options || {};
		const dirname = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
		const path = Path.join(dir, dirname);

		await Directory.create(path);

		const cleanup = async () => {
			try {
				await Directory.remove(path, { recursive: true });
			} catch {
				// Ignore cleanup errors
			}
		};

		return { path, cleanup };
	},
};

/**
 * File validation utilities
 */
export const FileValidator = {
	/**
	 * Check if file has valid extension
	 */
	hasValidExtension: (filePath: string, validExtensions: string[]): boolean => {
		const ext = Path.extname(filePath).toLowerCase();
		return validExtensions.some((valid) => ext === valid.toLowerCase());
	},

	/**
	 * Check if file size is within limits
	 */
	isWithinSizeLimit: async (
		filePath: string,
		maxSize: number,
	): Promise<boolean> => {
		try {
			const size = await FileReader.size(filePath);
			return size <= maxSize;
		} catch {
			return false;
		}
	},

	/**
	 * Validate JSON file
	 */
	isValidJson: async (filePath: string): Promise<boolean> => {
		try {
			await FileReader.readJson(filePath);
			return true;
		} catch {
			return false;
		}
	},
};
