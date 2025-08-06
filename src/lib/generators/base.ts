/**
 * Base Generator Class
 *
 * Provides core functionality for code generation including
 * file management, indentation, and code structuring utilities.
 */

import { join } from "path";
import type { LoadedSchemas } from "./loader";
import type { TypeSchema } from "../typeschema";

/**
 * Custom error class for generator-related errors
 */
export class GeneratorError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "GeneratorError";
	}
}

/**
 * Core generator interface that all code generators must implement
 */
export interface Generator {
	/**
	 * The name of the generator (e.g., "typescript", "python")
	 */
	readonly name: string;

	/**
	 * The target language or format this generator produces
	 */
	readonly target: string;

	/**
	 * Generate code from input schemas
	 */
	generate(): Promise<void>;

	/**
	 * Validate that the generator can run with the given options
	 */
	validate?(): Promise<void>;

	/**
	 * Clean up any resources used by the generator
	 */
	cleanup?(): Promise<void>;
}

/**
 * Configuration options for all generators
 */
export interface GeneratorOptions {
	/** Output directory for generated files */
	outputDir: string;

	/** Enable verbose logging */
	verbose?: boolean;

	/** Whether to overwrite existing files */
	overwrite?: boolean;

	/** File encoding to use (default: utf-8) */
	encoding?: BufferEncoding;

	/** Whether to format generated code */
	format?: boolean;

	/** Custom file header to add to all generated files */
	fileHeader?: string;

	/** Whether to generate profiles */
	generateProfiles?: boolean;
}

export interface FileContent {
	path: string;
	content: string;
}

/**
 * Abstract base class for all code generators
 *
 * Provides common functionality for file management, code formatting,
 * and generation utilities. All language-specific generators should extend this class.
 */
export abstract class BaseGenerator implements Generator {
	/** Generator name - must be implemented by subclasses */
	abstract readonly name: string;

	/** Target language/format - must be implemented by subclasses */
	abstract readonly target: string;

	protected options: GeneratorOptions;
	protected currentIndent = 0;
	protected indentSize = 2;
	protected files: FileContent[] = [];
	protected currentFile: FileContent | null = null;
	protected currentContent: string[] = [];
	
	/** Cache for complex type names to avoid repeated extraction */
	private _complexTypeNamesCache: Set<string> | null = null;

	constructor(options: GeneratorOptions) {
		this.options = {
			...options,
			encoding: options.encoding || "utf-8",
			overwrite: options.overwrite ?? true,
			format: options.format ?? true,
		};
	}

	/**
	 * Main generation method to be implemented by subclasses
	 */
	abstract generate(): Promise<void>;

	/**
	 * Validate generator configuration and prerequisites
	 */
	async validate(): Promise<void> {
		if (!this.options.outputDir) {
			throw new GeneratorError(
				"Output directory is required",
				"MISSING_OUTPUT_DIR",
			);
		}

		// Check if output directory exists and is writable
		try {
			await Bun.$`mkdir -p ${this.options.outputDir}`.quiet();
		} catch (error) {
			throw new GeneratorError(
				`Cannot create output directory: ${this.options.outputDir}`,
				"INVALID_OUTPUT_DIR",
				{ cause: error },
			);
		}
	}

	/**
	 * Clean up resources - can be overridden by subclasses
	 */
	async cleanup(): Promise<void> {
		this.files = [];
		this.currentFile = null;
		this.currentContent = [];
		this.currentIndent = 0;
		this._complexTypeNamesCache = null;
	}

	/**
	 * Start a new file
	 */
	protected file(relativePath: string): void {
		if (this.currentFile) {
			this.currentFile.content = this.buildFileContent();
			this.files.push(this.currentFile);
		}

		this.currentFile = {
			path: join(this.options.outputDir, relativePath),
			content: "",
		};
		this.currentContent = [];
		this.currentIndent = 0;

		// Add file header if configured
		if (this.options.fileHeader) {
			this.multiLineComment(this.options.fileHeader);
			this.blank();
		}
	}

	/**
	 * Build the final file content with proper formatting
	 */
	private buildFileContent(): string {
		let content = this.currentContent.join("\n");

		// Add trailing newline if not present
		if (content && !content.endsWith("\n")) {
			content += "\n";
		}

		return content;
	}

	/**
	 * Add a line to the current file
	 */
	protected line(content = ""): void {
		const indent = " ".repeat(this.currentIndent * this.indentSize);
		this.currentContent.push(indent + content);
	}

	/**
	 * Add a blank line
	 */
	protected blank(): void {
		this.currentContent.push("");
	}

	/**
	 * Start a block with curly braces
	 */
	protected curlyBlock(header: string, fn: () => void): void {
		this.line(header + " {");
		this.indent();
		fn();
		this.dedent();
		this.line("}");
	}

	/**
	 * Increase indentation
	 */
	protected indent(): void {
		this.currentIndent++;
	}

	/**
	 * Decrease indentation
	 */
	protected dedent(): void {
		if (this.currentIndent > 0) {
			this.currentIndent--;
		}
	}

	/**
	 * Write a comment
	 */
	protected comment(text: string): void {
		const lines = text.split("\n");
		lines.forEach((line) => {
			this.line(`// ${line}`);
		});
	}

	/**
	 * Write a multi-line comment
	 */
	protected multiLineComment(text: string): void {
		this.line("/**");
		const lines = text.split("\n");
		lines.forEach((line) => {
			this.line(` * ${line}`);
		});
		this.line(" */");
	}

	/**
	 * Get all generated files
	 */
	protected getFiles(): FileContent[] {
		// Finalize current file if any
		if (this.currentFile) {
			this.currentFile.content = this.buildFileContent();
			this.files.push(this.currentFile);
			this.currentFile = null;
			this.currentContent = [];
		}
		return this.files;
	}

	/**
	 * Write all files to disk with proper error handling
	 */
	protected async writeFiles(): Promise<void> {
		const files = this.getFiles();

		if (files.length === 0) {
			this.log("No files to write");
			return;
		}

		this.log(`Writing ${files.length} files...`);

		for (const file of files) {
			try {
				await this.writeFile(file);
			} catch (error) {
				throw new GeneratorError(
					`Failed to write file: ${file.path}`,
					"FILE_WRITE_ERROR",
					{ path: file.path, cause: error },
				);
			}
		}

		this.log(`Successfully wrote ${files.length} files`);
	}

	/**
	 * Write a single file to disk
	 */
	private async writeFile(file: FileContent): Promise<void> {
		const dir = file.path.substring(0, file.path.lastIndexOf("/"));

		// Ensure directory exists
		try {
			await Bun.$`mkdir -p ${dir}`.quiet();
		} catch (error) {
			throw new GeneratorError(
				`Failed to create directory: ${dir}`,
				"DIRECTORY_CREATE_ERROR",
				{ directory: dir, cause: error },
			);
		}

		// Check if file exists and overwrite is disabled
		if (!this.options.overwrite) {
			try {
				const existingFile = Bun.file(file.path);
				if (await existingFile.exists()) {
					throw new GeneratorError(
						`File already exists and overwrite is disabled: ${file.path}`,
						"FILE_EXISTS_ERROR",
						{ path: file.path },
					);
				}
			} catch (error) {
				if (error instanceof GeneratorError) throw error;
				// Ignore other errors (file doesn't exist, etc.)
			}
		}

		// Write file
		await Bun.write(file.path, file.content);

		if (this.options.verbose) {
			console.log(`Generated: ${file.path}`);
		}
	}

	/**
	 * Extract complex type names from loaded schemas with caching
	 * This replaces hardcoded lists of well-known types with dynamic discovery
	 * 
	 * @param schemas - The loaded schemas containing complex types
	 * @returns Set of complex type names available in the schema
	 */
	protected getComplexTypeNames(schemas: LoadedSchemas): Set<string> {
		// Return cached result if available
		if (this._complexTypeNamesCache) {
			return this._complexTypeNamesCache;
		}
		
		const complexTypeNames = new Set<string>();
		
		// Add all complex types from the schema
		for (const complexType of schemas.complexTypes) {
			complexTypeNames.add(complexType.identifier.name);
		}
		
		// Also add resource names as they are complex types
		for (const resource of schemas.resources) {
			complexTypeNames.add(resource.identifier.name);
		}
		
		// Cache the result for future use
		this._complexTypeNamesCache = complexTypeNames;
		return complexTypeNames;
	}

	/**
	 * Check if a type name is a known complex type based on loaded schemas
	 * 
	 * @param typeName - The type name to check
	 * @param schemas - The loaded schemas
	 * @returns true if the type is a known complex type
	 */
	protected isKnownComplexType(typeName: string, schemas: LoadedSchemas): boolean {
		const complexTypes = this.getComplexTypeNames(schemas);
		return complexTypes.has(typeName);
	}

	/**
	 * Log a message if verbose mode is enabled
	 */
	protected log(message: string): void {
		if (this.options.verbose) {
			console.log(message);
		}
	}
}
