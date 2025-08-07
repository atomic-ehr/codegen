/**
 * Template Processing System
 *
 * High-performance template engine with variable substitution, conditionals,
 * loops, filters, and custom functions
 */

import { toCamelCase, toKebabCase, toPascalCase, toSnakeCase } from "./naming";
import { capitalize, slugify, truncate } from "./string";

/**
 * Template context for variable substitution
 */
export interface TemplateContext {
	[key: string]: any;
}

/**
 * Template filter function
 */
export type TemplateFilter = (value: any, ...args: any[]) => any;

/**
 * Template helper function
 */
export type TemplateHelper = (...args: any[]) => any;

/**
 * Template engine options
 */
export interface TemplateOptions {
	/** Enable caching of compiled templates */
	cache?: boolean;

	/** Custom delimiters for template expressions */
	delimiters?: {
		start: string;
		end: string;
	};

	/** Strict mode - throw errors on undefined variables */
	strict?: boolean;

	/** Auto-escape HTML by default */
	autoEscape?: boolean;

	/** Custom filters */
	filters?: Record<string, TemplateFilter>;

	/** Custom helpers */
	helpers?: Record<string, TemplateHelper>;
}

/**
 * Compiled template function
 */
export type CompiledTemplate = (context: TemplateContext) => string;

/**
 * Template engine implementation
 */
export class TemplateEngine {
	private options: Required<TemplateOptions>;
	private templateCache = new Map<string, CompiledTemplate>();
	private filters = new Map<string, TemplateFilter>();
	private helpers = new Map<string, TemplateHelper>();

	constructor(options: TemplateOptions = {}) {
		this.options = {
			cache: true,
			delimiters: { start: "{{", end: "}}" },
			strict: false,
			autoEscape: false,
			filters: {},
			helpers: {},
			...options,
		};

		this.registerBuiltinFilters();
		this.registerBuiltinHelpers();

		// Register custom filters and helpers
		Object.entries(this.options.filters).forEach(([name, filter]) => {
			this.registerFilter(name, filter);
		});

		Object.entries(this.options.helpers).forEach(([name, helper]) => {
			this.registerHelper(name, helper);
		});
	}

	/**
	 * Register a custom filter
	 */
	registerFilter(name: string, filter: TemplateFilter): void {
		this.filters.set(name, filter);
	}

	/**
	 * Register a custom helper
	 */
	registerHelper(name: string, helper: TemplateHelper): void {
		this.helpers.set(name, helper);
	}

	/**
	 * Compile template string into executable function
	 */
	compile(template: string): CompiledTemplate {
		const cacheKey = `${template}_${JSON.stringify(this.options.delimiters)}`;

		if (this.options.cache && this.templateCache.has(cacheKey)) {
			return this.templateCache.get(cacheKey)!;
		}

		const compiled = this.compileTemplate(template);

		if (this.options.cache) {
			this.templateCache.set(cacheKey, compiled);
		}

		return compiled;
	}

	/**
	 * Render template with context
	 */
	render(template: string, context: TemplateContext = {}): string {
		const compiled = this.compile(template);
		return compiled(context);
	}

	/**
	 * Clear template cache
	 */
	clearCache(): void {
		this.templateCache.clear();
	}

	/**
	 * Internal template compilation
	 */
	private compileTemplate(template: string): CompiledTemplate {
		const { start, end } = this.options.delimiters;
		const tokens = this.tokenize(template, start, end);
		const ast = this.parse(tokens);
		return this.generateFunction(ast);
	}

	/**
	 * Tokenize template string
	 */
	private tokenize(template: string, start: string, end: string): Token[] {
		const tokens: Token[] = [];
		const regex = new RegExp(
			`${escapeRegex(start)}(.*?)${escapeRegex(end)}`,
			"g",
		);

		let lastIndex = 0;
		let match;

		while ((match = regex.exec(template)) !== null) {
			// Add text before expression
			if (match.index > lastIndex) {
				tokens.push({
					type: "text",
					value: template.slice(lastIndex, match.index),
				});
			}

			// Add expression
			const expression = match[1].trim();
			tokens.push(this.parseExpression(expression));

			lastIndex = regex.lastIndex;
		}

		// Add remaining text
		if (lastIndex < template.length) {
			tokens.push({
				type: "text",
				value: template.slice(lastIndex),
			});
		}

		return tokens;
	}

	/**
	 * Parse expression into token
	 */
	private parseExpression(expression: string): Token {
		// Handle conditionals
		if (expression.startsWith("if ")) {
			return {
				type: "conditional",
				condition: expression.slice(3).trim(),
				body: [],
				else: [],
			};
		}

		if (expression === "else") {
			return { type: "else" };
		}

		if (expression === "/if") {
			return { type: "endConditional" };
		}

		// Handle loops
		if (expression.startsWith("for ")) {
			const match = expression.match(/^for (\w+) in (.+)$/);
			if (match) {
				return {
					type: "loop",
					variable: match[1],
					iterable: match[2].trim(),
					body: [],
				};
			}
		}

		if (expression === "/for") {
			return { type: "endLoop" };
		}

		// Handle comments
		if (expression.startsWith("!")) {
			return {
				type: "comment",
				value: expression.slice(1).trim(),
			};
		}

		// Regular variable/expression
		return {
			type: "expression",
			value: expression,
		};
	}

	/**
	 * Parse tokens into AST
	 */
	private parse(tokens: Token[]): ASTNode[] {
		const ast: ASTNode[] = [];
		const stack: ASTNode[] = [];
		let current = ast;

		for (const token of tokens) {
			switch (token.type) {
				case "text":
				case "expression":
				case "comment":
					current.push(token);
					break;

				case "conditional":
					stack.push({
						type: "conditional",
						condition: token.condition!,
						body: current,
						else: [],
					});
					current = stack[stack.length - 1].body!;
					break;

				case "else":
					if (
						stack.length > 0 &&
						stack[stack.length - 1].type === "conditional"
					) {
						current = stack[stack.length - 1].else!;
					}
					break;

				case "endConditional":
					if (stack.length > 0) {
						const node = stack.pop()!;
						current = stack.length > 0 ? stack[stack.length - 1].body! : ast;
						current.push(node);
					}
					break;

				case "loop":
					stack.push({
						type: "loop",
						variable: token.variable!,
						iterable: token.iterable!,
						body: [],
					});
					current = stack[stack.length - 1].body!;
					break;

				case "endLoop":
					if (stack.length > 0) {
						const node = stack.pop()!;
						current = stack.length > 0 ? stack[stack.length - 1].body! : ast;
						current.push(node);
					}
					break;
			}
		}

		return ast;
	}

	/**
	 * Generate executable function from AST
	 */
	private generateFunction(ast: ASTNode[]): CompiledTemplate {
		const code = this.generateCode(ast);

		return new Function(
			"context",
			"filters",
			"helpers",
			"options",
			`
      const { strict, autoEscape } = options;
      let result = '';
      
      const getValue = (path, ctx = context) => {
        const keys = path.split('.');
        let value = ctx;
        
        for (const key of keys) {
          if (value == null) {
            if (strict) {
              throw new Error(\`Undefined variable: \${path}\`);
            }
            return '';
          }
          value = value[key];
        }
        
        return value == null ? '' : value;
      };
      
      const escape = (str) => {
        if (!autoEscape || typeof str !== 'string') return str;
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };
      
      const applyFilters = (value, filterChain) => {
        if (!filterChain) return value;
        
        const parts = filterChain.split('|').map(s => s.trim());
        let result = value;
        
        for (const part of parts) {
          if (!part) continue;
          
          const [filterName, ...args] = part.split(':').map(s => s.trim());
          const filter = filters.get(filterName);
          
          if (!filter) {
            if (strict) {
              throw new Error(\`Unknown filter: \${filterName}\`);
            }
            continue;
          }
          
          const parsedArgs = args.map(arg => {
            // Try to parse as JSON, fallback to string
            try {
              return JSON.parse(arg);
            } catch {
              return arg.replace(/['"]/g, '');
            }
          });
          
          result = filter(result, ...parsedArgs);
        }
        
        return result;
      };
      
      ${code}
      
      return result;
    `,
		).bind(null, {}, this.filters, this.helpers, this.options);
	}

	/**
	 * Generate JavaScript code from AST
	 */
	private generateCode(ast: ASTNode[]): string {
		const lines: string[] = [];

		for (const node of ast) {
			switch (node.type) {
				case "text":
					lines.push(`result += ${JSON.stringify(node.value)};`);
					break;

				case "expression": {
					const expr = node.value!;
					const [variable, filters] = expr.includes("|")
						? expr.split("|", 2).map((s) => s.trim())
						: [expr, ""];

					lines.push(`{
            let value = getValue('${variable}');
            value = applyFilters(value, '${filters}');
            result += escape(value);
          }`);
					break;
				}

				case "conditional":
					lines.push(`if (getValue('${node.condition}')) {`);
					lines.push(this.generateCode(node.body!));
					if (node.else?.length > 0) {
						lines.push("} else {");
						lines.push(this.generateCode(node.else!));
					}
					lines.push("}");
					break;

				case "loop": {
					const iterable = node.iterable!;
					const variable = node.variable!;

					lines.push(`{
            const items = getValue('${iterable}');
            if (Array.isArray(items)) {
              for (let i = 0; i < items.length; i++) {
                const ${variable} = items[i];
                const loop = { index: i, first: i === 0, last: i === items.length - 1 };
                const oldContext = context;
                context = { ...context, ${variable}, loop };
          `);
					lines.push(this.generateCode(node.body!));
					lines.push(`
                context = oldContext;
              }
            }
          }`);
					break;
				}

				case "comment":
					// Comments are ignored in output
					break;
			}
		}

		return lines.join("\n");
	}

	/**
	 * Register built-in filters
	 */
	private registerBuiltinFilters(): void {
		// String filters
		this.registerFilter("upper", (value: any) => String(value).toUpperCase());
		this.registerFilter("lower", (value: any) => String(value).toLowerCase());
		this.registerFilter("capitalize", (value: any) =>
			capitalize(String(value)),
		);
		this.registerFilter("title", (value: any) =>
			String(value).replace(
				/\w\S*/g,
				(txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase(),
			),
		);
		this.registerFilter("trim", (value: any) => String(value).trim());
		this.registerFilter(
			"truncate",
			(value: any, length: number = 50, ellipsis: string = "...") =>
				truncate(String(value), length, ellipsis),
		);
		this.registerFilter("slugify", (value: any) => slugify(String(value)));

		// Naming convention filters
		this.registerFilter("camelCase", (value: any) =>
			toCamelCase(String(value)),
		);
		this.registerFilter("pascalCase", (value: any) =>
			toPascalCase(String(value)),
		);
		this.registerFilter("snakeCase", (value: any) =>
			toSnakeCase(String(value)),
		);
		this.registerFilter("kebabCase", (value: any) =>
			toKebabCase(String(value)),
		);

		// Number filters
		this.registerFilter("number", (value: any) => Number(value));
		this.registerFilter("round", (value: any, digits: number = 0) => {
			const num = Number(value);
			return Number(num.toFixed(digits));
		});
		this.registerFilter("abs", (value: any) => Math.abs(Number(value)));

		// Array filters
		this.registerFilter("join", (value: any[], separator: string = ",") =>
			Array.isArray(value) ? value.join(separator) : String(value),
		);
		this.registerFilter("length", (value: any) =>
			Array.isArray(value) || typeof value === "string" ? value.length : 0,
		);
		this.registerFilter("first", (value: any[]) =>
			Array.isArray(value) && value.length > 0 ? value[0] : undefined,
		);
		this.registerFilter("last", (value: any[]) =>
			Array.isArray(value) && value.length > 0
				? value[value.length - 1]
				: undefined,
		);
		this.registerFilter("sort", (value: any[]) =>
			Array.isArray(value) ? [...value].sort() : value,
		);
		this.registerFilter("reverse", (value: any[]) =>
			Array.isArray(value) ? [...value].reverse() : value,
		);
		this.registerFilter("unique", (value: any[]) =>
			Array.isArray(value) ? [...new Set(value)] : value,
		);

		// Date filters
		this.registerFilter("date", (value: any, format: string = "YYYY-MM-DD") => {
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return String(value);

			// Simple date formatting
			return format
				.replace("YYYY", date.getFullYear().toString())
				.replace("MM", String(date.getMonth() + 1).padStart(2, "0"))
				.replace("DD", String(date.getDate()).padStart(2, "0"))
				.replace("HH", String(date.getHours()).padStart(2, "0"))
				.replace("mm", String(date.getMinutes()).padStart(2, "0"))
				.replace("ss", String(date.getSeconds()).padStart(2, "0"));
		});

		// JSON filter
		this.registerFilter("json", (value: any, indent?: number) =>
			JSON.stringify(value, null, indent),
		);

		// Default filter
		this.registerFilter("default", (value: any, defaultValue: any = "") =>
			value == null || value === "" ? defaultValue : value,
		);
	}

	/**
	 * Register built-in helpers
	 */
	private registerBuiltinHelpers(): void {
		this.registerHelper(
			"include",
			(templateName: string, _context: TemplateContext = {}) => {
				// This would require a template loader
				return `<!-- Include: ${templateName} -->`;
			},
		);

		this.registerHelper(
			"range",
			(start: number, end: number, step: number = 1) => {
				const result: number[] = [];
				for (let i = start; i < end; i += step) {
					result.push(i);
				}
				return result;
			},
		);

		this.registerHelper("repeat", (str: string, count: number) =>
			str.repeat(Math.max(0, count)),
		);
	}
}

/**
 * Token types for template parsing
 */
interface Token {
	type:
		| "text"
		| "expression"
		| "conditional"
		| "loop"
		| "else"
		| "endConditional"
		| "endLoop"
		| "comment";
	value?: string;
	condition?: string;
	variable?: string;
	iterable?: string;
	body?: Token[];
	else?: Token[];
}

/**
 * AST node types
 */
interface ASTNode {
	type: "text" | "expression" | "conditional" | "loop" | "comment";
	value?: string;
	condition?: string;
	variable?: string;
	iterable?: string;
	body?: ASTNode[];
	else?: ASTNode[];
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Default template engine instance
 */
export const templateEngine = new TemplateEngine();

/**
 * Quick template rendering function
 */
export function render(
	template: string,
	context: TemplateContext = {},
): string {
	return templateEngine.render(template, context);
}

/**
 * Template literal tag for easy templating
 */
export function template(
	strings: TemplateStringsArray,
	...values: any[]
): CompiledTemplate {
	let templateStr = "";

	for (let i = 0; i < strings.length; i++) {
		templateStr += strings[i];
		if (i < values.length) {
			templateStr += `{{${values[i]}}}`;
		}
	}

	return templateEngine.compile(templateStr);
}

/**
 * Common template patterns
 */
export const TemplatePatterns = {
	/**
	 * TypeScript interface template
	 */
	interface: (
		name: string,
		fields: Array<{
			name: string;
			type: string;
			optional?: boolean;
			description?: string;
		}>,
	) => {
		const fieldLines = fields
			.map((field) => {
				const optional = field.optional ? "?" : "";
				const comment = field.description
					? `  /** ${field.description} */\n`
					: "";
				return `${comment}  ${field.name}${optional}: ${field.type};`;
			})
			.join("\n");

		return `export interface ${name} {
${fieldLines}
}`;
	},

	/**
	 * TypeScript class template
	 */
	class: (
		name: string,
		properties: Array<{ name: string; type: string; access?: string }>,
	) => {
		const propLines = properties
			.map((prop) => {
				const access = prop.access || "public";
				return `  ${access} ${prop.name}: ${prop.type};`;
			})
			.join("\n");

		return `export class ${name} {
${propLines}

  constructor(data: Partial<${name}> = {}) {
    Object.assign(this, data);
  }
}`;
	},

	/**
	 * Function template
	 */
	function: (
		name: string,
		params: Array<{ name: string; type: string }>,
		returnType: string,
		body: string,
	) => {
		const paramList = params.map((p) => `${p.name}: ${p.type}`).join(", ");

		return `export function ${name}(${paramList}): ${returnType} {
  ${body}
}`;
	},

	/**
	 * Import statement template
	 */
	import: (items: string[], from: string, isDefault = false) => {
		if (isDefault) {
			return `import ${items[0]} from '${from}';`;
		} else {
			return `import { ${items.join(", ")} } from '${from}';`;
		}
	},
} as const;

/**
 * Template validation utilities
 */
export const TemplateValidator = {
	/**
	 * Validate template syntax
	 */
	validate: (
		template: string,
		options: TemplateOptions = {},
	): { valid: boolean; errors: string[] } => {
		const errors: string[] = [];

		try {
			const engine = new TemplateEngine(options);
			engine.compile(template);
			return { valid: true, errors: [] };
		} catch (error) {
			errors.push(error instanceof Error ? error.message : String(error));
			return { valid: false, errors };
		}
	},

	/**
	 * Extract variables used in template
	 */
	extractVariables: (template: string): string[] => {
		const variables = new Set<string>();
		const regex = /\{\{([^}]+)\}\}/g;
		let match;

		while ((match = regex.exec(template)) !== null) {
			const expr = match[1].trim();

			// Skip control structures and comments
			if (
				expr.startsWith("if ") ||
				expr.startsWith("for ") ||
				expr.startsWith("!") ||
				expr === "else" ||
				expr === "/if" ||
				expr === "/for"
			) {
				continue;
			}

			// Extract variable name (before filters)
			const variable = expr.split("|")[0].trim();
			variables.add(variable);
		}

		return Array.from(variables);
	},
};
