/**
 * Abstract template engine for code generation
 *
 * Supports multiple template formats:
 * - Handlebars templates (.hbs)
 * - String templates (.template)
 * - Function templates (TypeScript functions)
 * - Inline templates (template literals)
 */

import type { CodegenLogger } from "../../../utils/codegen-logger.js";
import { TemplateError } from "./errors.js";

/**
 * Template context passed to templates
 */
export interface TemplateContext {
	/** The schema being processed */
	schema?: any;

	/** Type mapper for language-specific types */
	typeMapper?: any;

	/** File name being generated */
	filename?: string;

	/** Target language */
	language?: string;

	/** Timestamp for generation */
	timestamp?: string;

	/** Import statements */
	imports?: Map<string, string>;

	/** Export names */
	exports?: Set<string>;

	/** Any additional context */
	[key: string]: unknown;
}

/**
 * Template registration options
 */
export interface TemplateOptions {
	/** Template format */
	format?: "handlebars" | "string" | "function";

	/** Whether to cache compiled templates */
	cache?: boolean;

	/** Custom helpers for the template */
	helpers?: Record<string, Function>;

	/** Template-specific options */
	options?: Record<string, unknown>;
}

/**
 * Template metadata
 */
export interface TemplateInfo {
	name: string;
	format: string;
	path?: string;
	description?: string;
	examples?: Array<{
		context: TemplateContext;
		expected: string;
	}>;
}

/**
 * Abstract template engine
 */
export abstract class TemplateEngine {
	protected readonly logger: CodegenLogger;
	protected readonly templates = new Map<string, any>();
	protected readonly templateCache = new Map<string, any>();
	protected readonly helpers = new Map<string, Function>();

	constructor(options: { logger: CodegenLogger }) {
		this.logger = options.logger;
		this.registerDefaultHelpers();
	}

	// ==========================================
	// Abstract Methods
	// ==========================================

	/**
	 * Render a template with context
	 * @param templateName Name of template to render
	 * @param context Template context
	 */
	abstract render(
		templateName: string,
		context: TemplateContext,
	): Promise<string>;

	/**
	 * Register a template
	 * @param name Template name
	 * @param template Template content or function
	 * @param options Template options
	 */
	abstract registerTemplate(
		name: string,
		template: string | Function,
		options?: TemplateOptions,
	): void;

	/**
	 * Load templates from directory
	 * @param directory Directory containing templates
	 */
	abstract loadTemplatesFromDirectory(directory: string): Promise<void>;

	// ==========================================
	// Concrete Methods
	// ==========================================

	/**
	 * Register a template helper function
	 * @param name Helper name
	 * @param helper Helper function
	 */
	registerHelper(name: string, helper: Function): void {
		this.helpers.set(name, helper);
		this.logger.debug(`Registered template helper: ${name}`);
	}

	/**
	 * Get available template names
	 */
	getAvailableTemplates(): string[] {
		return Array.from(this.templates.keys()).sort();
	}

	/**
	 * Get template information
	 * @param templateName Template name
	 */
	getTemplateInfo(templateName: string): TemplateInfo | undefined {
		const template = this.templates.get(templateName);
		if (!template) return undefined;

		return {
			name: templateName,
			format: template.format || "unknown",
			path: template.path,
			description: template.description,
			examples: template.examples || [],
		};
	}

	/**
	 * Check if template exists
	 * @param templateName Template name
	 */
	hasTemplate(templateName: string): boolean {
		return this.templates.has(templateName);
	}

	/**
	 * Remove a template
	 * @param templateName Template name
	 */
	unregisterTemplate(templateName: string): boolean {
		const removed = this.templates.delete(templateName);
		this.templateCache.delete(templateName);
		if (removed) {
			this.logger.debug(`Unregistered template: ${templateName}`);
		}
		return removed;
	}

	/**
	 * Clear all templates and cache
	 */
	clearTemplates(): void {
		this.templates.clear();
		this.templateCache.clear();
		this.logger.debug("Cleared all templates");
	}

	/**
	 * Validate template context
	 * @param context Template context
	 * @param requiredFields Required context fields
	 */
	protected validateContext(
		context: TemplateContext,
		requiredFields: string[] = [],
	): void {
		for (const field of requiredFields) {
			if (!(field in context)) {
				throw new TemplateError(
					`Missing required context field: ${field}`,
					"unknown",
					context,
					{
						missingVariables: [field],
						availableTemplates: this.getAvailableTemplates(),
					},
				);
			}
		}
	}

	/**
	 * Register default template helpers
	 */
	protected registerDefaultHelpers(): void {
		// String manipulation helpers
		this.registerHelper(
			"capitalize",
			(str: string) => str.charAt(0).toUpperCase() + str.slice(1),
		);

		this.registerHelper("lowercase", (str: string) => str.toLowerCase());
		this.registerHelper("uppercase", (str: string) => str.toUpperCase());

		this.registerHelper("camelCase", (str: string) =>
			str.replace(/[-_\s]+(.)/g, (_, char) => char.toUpperCase()),
		);

		this.registerHelper("pascalCase", (str: string) => {
			const camelCase = str.replace(/[-_\s]+(.)/g, (_, char) =>
				char.toUpperCase(),
			);
			return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
		});

		this.registerHelper("snakeCase", (str: string) =>
			str
				.replace(/([A-Z])/g, "_$1")
				.replace(/[-\s]+/g, "_")
				.toLowerCase()
				.replace(/^_/, ""),
		);

		// Array helpers
		this.registerHelper("join", (arr: any[], separator = ", ") =>
			Array.isArray(arr) ? arr.join(separator) : "",
		);

		this.registerHelper("length", (arr: any[]) =>
			Array.isArray(arr) ? arr.length : 0,
		);

		// Logic helpers
		this.registerHelper("eq", (a: any, b: any) => a === b);
		this.registerHelper("ne", (a: any, b: any) => a !== b);
		this.registerHelper("gt", (a: number, b: number) => a > b);
		this.registerHelper("lt", (a: number, b: number) => a < b);

		// Utility helpers
		this.registerHelper("json", (obj: any) => JSON.stringify(obj, null, 2));

		this.registerHelper("indent", (str: string, spaces = 2) =>
			str
				.split("\n")
				.map((line) => " ".repeat(spaces) + line)
				.join("\n"),
		);

		this.registerHelper("timestamp", () => new Date().toISOString());
	}
}
