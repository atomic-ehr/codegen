/**
 * Fluent file builder with lifecycle hooks and validation
 *
 * This provides a clean, chainable API for building files with imports,
 * exports, content generation, and lifecycle hooks for customization.
 */

import type { CodegenLogger } from "../../../../utils/codegen-logger";
import { FileOperationError, TemplateError } from "../errors";
import type { FileManager } from "../FileManager";
import type {
	AfterSaveHook,
	BeforeSaveHook,
	ErrorHook,
	FileBuilderOptions,
	FileContext,
	TemplateEngine,
	TypeMapper,
} from "../types";

export interface FileBuilderConfig {
	filename: string;
	fileManager: FileManager;
	templateEngine?: TemplateEngine;
	typeMapper: TypeMapper;
	logger: CodegenLogger;
}

/**
 * Fluent builder for creating files with lifecycle hooks
 *
 * Features:
 * - Fluent API for content building
 * - Template integration
 * - Import/export management
 * - Lifecycle hooks (before/after save, error handling)
 * - Content validation
 * - Automatic import path resolution
 */
export class FileBuilder {
	private readonly config: FileBuilderConfig;
	private content: string = "";
	private readonly imports = new Map<string, string>();
	private readonly exports = new Set<string>();
	private readonly metadata = new Map<string, unknown>();

	// Lifecycle hooks
	private beforeSaveHooks: BeforeSaveHook[] = [];
	private afterSaveHooks: AfterSaveHook[] = [];
	private errorHooks: ErrorHook[] = [];

	// Options
	private options: FileBuilderOptions = {
		template: undefined,
		importStrategy: "auto",
		validation: "strict",
		prettify: true,
		formatting: {
			indentSize: 2,
			useTabs: false,
			maxLineLength: 100,
		},
		encoding: "utf-8",
	};

	constructor(config: FileBuilderConfig) {
		this.config = config;
	}

	// ==========================================
	// Content Building Methods
	// ==========================================

	/**
	 * Set content directly
	 * @param content File content
	 */
	withContent(content: string | (() => string)): FileBuilder {
		this.content = typeof content === "string" ? content : content();
		return this;
	}

	/**
	 * Generate content from template
	 * @param templateName Template to use
	 * @param context Template context
	 */
	withTemplate(
		templateName: string,
		context: Record<string, unknown>,
	): FileBuilder {
		if (!this.config.templateEngine) {
			throw new TemplateError(
				`Template engine is required for template rendering. Template: '${templateName}'`,
				templateName,
				context,
			);
		}

		this.options.template = templateName;

		try {
			this.content = this.config.templateEngine.render(templateName, {
				...context,
				imports: this.imports,
				exports: this.exports,
				filename: this.config.filename,
			});
		} catch (error) {
			throw new TemplateError(
				`Failed to render template '${templateName}'`,
				templateName,
				context,
				{
					availableTemplates:
						this.config.templateEngine.getAvailableTemplates?.() || [],
				},
			);
		}

		return this;
	}

	/**
	 * Append content to existing content
	 * @param content Content to append
	 */
	appendContent(content: string): FileBuilder {
		this.content += content;
		return this;
	}

	/**
	 * Prepend content to existing content
	 * @param content Content to prepend
	 */
	prependContent(content: string): FileBuilder {
		this.content = content + this.content;
		return this;
	}

	// ==========================================
	// Import/Export Management
	// ==========================================

	/**
	 * Set all imports at once
	 * @param imports Map of symbol name to import path
	 */
	withImports(imports: Map<string, string>): FileBuilder {
		this.imports.clear();
		for (const [symbol, path] of imports) {
			this.imports.set(symbol, path);
		}
		return this;
	}

	/**
	 * Add a single import
	 * @param symbol Symbol to import
	 * @param from Import path
	 */
	addImport(symbol: string, from: string): FileBuilder {
		this.imports.set(symbol, from);
		return this;
	}

	/**
	 * Add multiple imports from the same path
	 * @param symbols Symbols to import
	 * @param from Import path
	 */
	addImports(symbols: string[], from: string): FileBuilder {
		for (const symbol of symbols) {
			this.imports.set(symbol, from);
		}
		return this;
	}

	/**
	 * Set all exports at once
	 * @param exports Array of export names
	 */
	withExports(exports: string[]): FileBuilder {
		this.exports.clear();
		for (const exp of exports) {
			this.exports.add(exp);
		}
		return this;
	}

	/**
	 * Add a single export
	 * @param name Export name
	 */
	addExport(name: string): FileBuilder {
		this.exports.add(name);
		return this;
	}

	/**
	 * Add multiple exports
	 * @param names Export names
	 */
	addExports(names: string[]): FileBuilder {
		for (const name of names) {
			this.exports.add(name);
		}
		return this;
	}

	// ==========================================
	// Metadata and Options
	// ==========================================

	/**
	 * Set metadata for the file
	 * @param key Metadata key
	 * @param value Metadata value
	 */
	withMetadata(key: string, value: unknown): FileBuilder {
		this.metadata.set(key, value);
		return this;
	}

	/**
	 * Set file builder options
	 * @param options Options to set
	 */
	withOptions(options: Partial<FileBuilderOptions>): FileBuilder {
		this.options = { ...this.options, ...options };
		return this;
	}

	// ==========================================
	// Lifecycle Hooks
	// ==========================================

	/**
	 * Add hook to run before saving
	 * @param hook Hook function
	 */
	onBeforeSave(hook: BeforeSaveHook): FileBuilder {
		this.beforeSaveHooks.push(hook);
		return this;
	}

	/**
	 * Add hook to run after successful save
	 * @param hook Hook function
	 */
	onAfterSave(hook: AfterSaveHook): FileBuilder {
		this.afterSaveHooks.push(hook);
		return this;
	}

	/**
	 * Add hook to run when error occurs
	 * @param hook Hook function
	 */
	onError(hook: ErrorHook): FileBuilder {
		this.errorHooks.push(hook);
		return this;
	}

	// ==========================================
	// Execution Methods
	// ==========================================

	/**
	 * Build final content without saving
	 * @returns File context with final content
	 */
	build(): FileContext {
		const finalContent = this.buildFinalContent();

		return {
			filename: this.config.filename,
			content: finalContent,
			imports: new Map(this.imports),
			exports: new Set(this.exports),
			metadata: Object.fromEntries(this.metadata),
			templateName: this.options.template,
		};
	}

	/**
	 * Save the file
	 * @returns Promise resolving to file path
	 */
	async save(): Promise<string> {
		const context = this.build();

		try {
			// Run before-save hooks
			for (const hook of this.beforeSaveHooks) {
				await hook(context);
			}

			// Validate content if enabled
			if (this.options.validation !== "none") {
				await this.validateContent(context.content);
			}

			// Write file
			const result = await this.config.fileManager.writeFile(
				this.config.filename,
				context.content,
				{ encoding: this.options.encoding },
			);

			const stats = {
				size: result.size,
				generationTime: 0, // Set by caller if needed
				writeTime: result.writeTime,
			};

			// Run after-save hooks
			for (const hook of this.afterSaveHooks) {
				await hook(result.path, stats);
			}

			this.config.logger.debug(`Saved ${this.config.filename} successfully`);
			return result.path;
		} catch (error) {
			// Run error hooks
			for (const hook of this.errorHooks) {
				try {
					await hook(
						error instanceof Error ? error : new Error(String(error)),
						context,
					);
				} catch (hookError) {
					this.config.logger.warn(
						`Error hook failed: ${hookError instanceof Error ? hookError.message : String(hookError)}`,
					);
				}
			}

			throw error;
		}
	}

	// ==========================================
	// Private Helper Methods
	// ==========================================

	/**
	 * Build final content with imports and exports
	 */
	private buildFinalContent(): string {
		const parts: string[] = [];

		// Add imports
		if (this.imports.size > 0 && this.options.importStrategy !== "none") {
			parts.push(this.generateImportStatements());
			parts.push(""); // Empty line after imports
		}

		// Add main content
		if (this.content) {
			parts.push(this.content);
		}

		// Add exports if not already in content
		if (this.exports.size > 0 && !this.content.includes("export")) {
			parts.push(""); // Empty line before exports
			parts.push(this.generateExportStatements());
		}

		let finalContent = parts.join("\n");

		// Prettify if enabled
		if (this.options.prettify) {
			finalContent = this.prettifyContent(finalContent);
		}

		return finalContent;
	}

	/**
	 * Generate import statements
	 */
	private generateImportStatements(): string {
		const lines: string[] = [];

		// Group imports by path
		const importsByPath = new Map<string, string[]>();
		for (const [symbol, path] of this.imports) {
			const resolvedPath =
				this.options.importStrategy === "auto"
					? this.config.fileManager.getRelativeImportPath(
							this.config.filename,
							path,
						)
					: path;

			if (!importsByPath.has(resolvedPath)) {
				importsByPath.set(resolvedPath, []);
			}
			importsByPath.get(resolvedPath)!.push(symbol);
		}

		// Generate import statements
		for (const [path, symbols] of importsByPath) {
			if (symbols.length === 1) {
				lines.push(`import type { ${symbols[0]} } from '${path}';`);
			} else {
				const sortedSymbols = symbols.sort();
				if (sortedSymbols.length <= 3) {
					lines.push(
						`import type { ${sortedSymbols.join(", ")} } from '${path}';`,
					);
				} else {
					lines.push(`import type {`);
					const indent = "\t";
					sortedSymbols.forEach((symbol, index) => {
						const isLast = index === sortedSymbols.length - 1;
						lines.push(`${indent}${symbol}${isLast ? "" : ","}`);
					});
					lines.push(`} from '${path}';`);
				}
			}
		}

		return lines.join("\n");
	}

	/**
	 * Generate export statements
	 */
	private generateExportStatements(): string {
		const exports = Array.from(this.exports).sort();
		return exports.map((exp) => `export { ${exp} };`).join("\n");
	}

	/**
	 * Prettify content (basic implementation)
	 */
	private prettifyContent(content: string): string {
		// Basic prettification
		return content
			.replace(/\n{3,}/g, "\n\n") // Max 2 consecutive newlines
			.replace(
				/\t/g,
				this.options.formatting?.useTabs
					? "\t"
					: " ".repeat(this.options.formatting?.indentSize || 2),
			)
			.trim();
	}

	/**
	 * Validate generated content
	 */
	private async validateContent(content: string): Promise<void> {
		if (this.options.validation === "none") return;

		// Basic validation - check for syntax errors
		const issues: string[] = [];

		// Check for unmatched braces
		const openBraces = (content.match(/\{/g) || []).length;
		const closeBraces = (content.match(/\}/g) || []).length;
		if (openBraces !== closeBraces) {
			issues.push(`Unmatched braces: ${openBraces} open, ${closeBraces} close`);
		}

		// Check for unmatched parentheses
		const openParens = (content.match(/\(/g) || []).length;
		const closeParens = (content.match(/\)/g) || []).length;
		if (openParens !== closeParens) {
			issues.push(
				`Unmatched parentheses: ${openParens} open, ${closeParens} close`,
			);
		}

		// Check for basic TypeScript syntax issues
		if (
			this.config.filename.endsWith(".ts") ||
			this.config.filename.endsWith(".tsx")
		) {
			if (
				content.includes("interface") &&
				!content.match(/interface\s+\w+\s*\{/)
			) {
				issues.push("Invalid interface syntax detected");
			}
		}

		if (issues.length > 0 && this.options.validation === "strict") {
			throw new FileOperationError(
				`Content validation failed for ${this.config.filename}: ${issues.join(", ")}`,
				"write",
				this.config.filename,
			);
		} else if (issues.length > 0) {
			// Just warn for non-strict validation
			this.config.logger.warn(
				`Validation issues in ${this.config.filename}: ${issues.join(", ")}`,
			);
		}
	}

	/**
	 * Get current content (for testing/debugging)
	 */
	getContent(): string {
		return this.content;
	}

	/**
	 * Get current imports (for testing/debugging)
	 */
	getImports(): Map<string, string> {
		return new Map(this.imports);
	}

	/**
	 * Get current exports (for testing/debugging)
	 */
	getExports(): Set<string> {
		return new Set(this.exports);
	}
}
